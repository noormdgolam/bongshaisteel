/* ==========================================================================
   ADMIN — SALES DESK: lead shortcuts and support chats
   --------------------------------------------------------------------------
   Messages (leads): quick status change from the list, bulk status/delete,
   and a lead typed in by hand (a phone call, a walk-in, Facebook…).
   Support chats: every AI-chat conversation, read in full, with a status and
   a note, and one click to turn it into a lead.
   Registered BEFORE the generic /admin/leads/:id routes in admin.js.
   ========================================================================== */
"use strict";

const crypto = require("node:crypto");

const STATUSES = ["new", "contacted", "quoted", "won", "lost"];
const CHAT_STATUSES = ["open", "followed-up", "closed"];
const SOURCES = ["phone call", "whatsapp", "facebook", "walk-in", "referral", "email", "other"];
const OWNERS = ["superadmin", "admin"];

module.exports = function registerSalesRoutes(router, deps) {
  const { db, auth, logActivity, view, FormError } = deps;

  const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(String);
  const safeBack = (back, fallback) => (/^\/admin\/(leads|chats)(\?[^\r\n]*)?$/.test(String(back || "")) ? back : fallback);
  const withMsg = (url, kind, msg) => url + (url.includes("?") ? "&" : "?") + kind + "=" + encodeURIComponent(msg);

  /* ================================================================ leads */

  router.get("/admin/leads/new", async (req, res, next) => {
    try {
      let lead = { kind: "quote", status: "new", source: "phone call" };
      // From a support chat: carry over what the chat already knows.
      const chat = req.query.chat ? await db("chat_sessions").where({ id: parseInt(req.query.chat, 10) || 0 }).first() : null;
      if (chat) {
        let msgs = [];
        try { msgs = JSON.parse(chat.messages) || []; } catch { /* empty */ }
        lead = {
          ...lead, source: "ai chat", chat_id: chat.id,
          message: msgs.map((m) => (m.role === "user" ? "Customer: " : "Assistant: ") + m.content).join("\n").slice(0, 3900),
        };
      }
      res.render("admin/leads/new.njk", view(req, "leads", { lead, statuses: STATUSES, sources: SOURCES, error: null }));
    } catch (err) {
      next(err);
    }
  });

  function leadFields(body) {
    const t = (v, max, label, required) => {
      const s = String(v == null ? "" : v).trim();
      if (required && !s) throw new FormError(label + " is required.");
      if (s.length > max) throw new FormError(label + " is too long (" + max + " characters at most).");
      return s || null;
    };
    const name = t(body.name, 120, "Name", true);
    const phone = t(body.phone, 60, "Phone", true);
    if (!/\d{5,}/.test(String(phone).replace(/\D/g, ""))) throw new FormError("Phone: at least 5 digits.");
    const email = t(body.email, 160, "Email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError("Email does not look right.");
    const source = SOURCES.includes(body.source) || body.source === "ai chat" ? body.source : "other";
    return {
      kind: body.kind === "contact" ? "contact" : "quote",
      status: STATUSES.includes(body.status) ? body.status : "new",
      name, phone, email,
      company: t(body.company, 160, "Company"),
      model_code: t(body.model_code, 60, "Model"),
      destination: t(body.destination, 200, "Location"),
      dimensions: t(body.dimensions, 200, "Size"),
      message: t(body.message, 4000, "Message"),
      note: t(body.note, 2000, "Note"),
      source: "admin: " + source,
    };
  }

  router.post("/admin/leads/new", async (req, res, next) => {
    try {
      const fields = leadFields(req.body);
      const public_id = new Date().toISOString().replace(/\D/g, "").slice(0, 14) + "-" + crypto.randomBytes(3).toString("hex");
      const [id] = await db("leads").insert({ ...fields, public_id });
      const chatId = parseInt(req.body.chat_id, 10);
      if (chatId) await db("chat_sessions").where({ id: chatId }).whereNull("lead_id").update({ lead_id: id, status: "followed-up" });
      await logActivity(req, "lead.create", "lead", id, "added " + fields.name + " by hand (" + fields.source + ")");
      res.redirect("/admin/leads/" + id + "?notice=" + encodeURIComponent("Added."));
    } catch (err) {
      if (!(err instanceof FormError)) return next(err);
      res.status(422).render("admin/leads/new.njk", view(req, "leads", {
        lead: { ...req.body, _csrf: undefined }, statuses: STATUSES, sources: SOURCES, error: err.message,
      }));
    }
  });

  router.post("/admin/leads/bulk", async (req, res, next) => {
    try {
      const back = safeBack(req.body.back, "/admin/leads");
      const ids = [...new Set(list(req.body.ids).map((x) => parseInt(x, 10)).filter((n) => n > 0))].slice(0, 500);
      const action = String(req.body.action || "");
      if (!ids.length) return res.redirect(withMsg(back, "error", "Tick at least one message."));
      if (action === "delete") {
        if (!OWNERS.includes(req.admin.role)) return res.redirect(withMsg(back, "error", "Only an admin can delete messages."));
        const n = await db("leads").whereIn("id", ids).del();
        await logActivity(req, "lead.bulk-delete", "lead", null, "deleted " + n + " message(s)");
        return res.redirect(withMsg(back, "notice", "Deleted " + n + " message(s)."));
      }
      const status = action.replace(/^status:/, "");
      if (!action.startsWith("status:") || !STATUSES.includes(status)) return res.redirect(withMsg(back, "error", "Pick an action."));
      const n = await db("leads").whereIn("id", ids).update({ status, updated_at: db.fn.now() });
      await logActivity(req, "lead.bulk-status", "lead", null, "marked " + n + " message(s) " + status);
      res.redirect(withMsg(back, "notice", n + " message(s) marked " + status + "."));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/leads/:id/quick-status", async (req, res, next) => {
    try {
      const lead = await db("leads").where({ id: parseInt(req.params.id, 10) || 0 }).first("id", "name", "status");
      if (!lead) return next();
      const status = String(req.body.status || "");
      const back = safeBack(req.body.back, "/admin/leads");
      if (!STATUSES.includes(status)) return res.redirect(withMsg(back, "error", "Unknown status."));
      if (status !== lead.status) {
        await db("leads").where({ id: lead.id }).update({ status, updated_at: db.fn.now() });
        await logActivity(req, "lead.update", "lead", lead.id, lead.name + ": " + lead.status + " → " + status);
      }
      res.redirect(withMsg(back, "notice", lead.name + ": " + status + "."));
    } catch (err) {
      next(err);
    }
  });

  /* ================================================================ chats */

  router.use("/admin/chats", auth.requireRole("superadmin", "admin", "editor", "sales"));

  const parse = (s) => { try { return JSON.parse(s) || []; } catch { return []; } };

  router.get("/admin/chats", async (req, res, next) => {
    try {
      const status = CHAT_STATUSES.includes(req.query.status) ? req.query.status : "all";
      const withLead = req.query.lead === "yes" || req.query.lead === "no" ? req.query.lead : "all";
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
      const query = db("chat_sessions").orderBy("updated_at", "desc").limit(300);
      if (status !== "all") query.where({ status });
      if (withLead === "yes") query.whereNotNull("lead_id");
      if (withLead === "no") query.whereNull("lead_id");
      if (q) query.where("messages", "like", "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%");
      const rows = await query.select("id", "status", "message_count", "messages", "first_page", "last_page", "lead_id", "created_at", "updated_at");
      const chats = rows.map(({ messages, ...r }) => {
        const msgs = parse(messages);
        const firstUser = msgs.find((m) => m.role === "user");
        return { ...r, preview: firstUser ? firstUser.content.slice(0, 140) : "" };
      });
      const byStatus = await db("chat_sessions").select("status").count({ n: "*" }).groupBy("status");
      const counts = { all: 0 };
      for (const r of byStatus) { counts[r.status] = Number(r.n); counts.all += Number(r.n); }
      res.render("admin/chats/list.njk", view(req, "chats", { chats, counts, status, withLead, q, statuses: CHAT_STATUSES }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/chats/:id", async (req, res, next) => {
    try {
      const chat = await db("chat_sessions").where({ id: parseInt(req.params.id, 10) || 0 }).first();
      if (!chat) return next();
      const lead = chat.lead_id ? await db("leads").where({ id: chat.lead_id }).first("id", "name", "phone", "status") : null;
      res.render("admin/chats/detail.njk", view(req, "chats", { chat, messages: parse(chat.messages), lead, statuses: CHAT_STATUSES }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/chats/:id", async (req, res, next) => {
    try {
      const chat = await db("chat_sessions").where({ id: parseInt(req.params.id, 10) || 0 }).first("id", "status");
      if (!chat) return next();
      const status = CHAT_STATUSES.includes(req.body.status) ? req.body.status : chat.status;
      const note = String(req.body.note == null ? "" : req.body.note).slice(0, 2000) || null;
      await db("chat_sessions").where({ id: chat.id }).update({ status, note, updated_at: db.fn.now() });
      await logActivity(req, "chat.update", "chat", chat.id, "chat #" + chat.id + ": " + status);
      res.redirect("/admin/chats/" + chat.id + "?notice=" + encodeURIComponent("Saved."));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/chats/:id/delete", auth.requireRole(...OWNERS), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10) || 0;
      const n = await db("chat_sessions").where({ id }).del();
      if (!n) return next();
      await logActivity(req, "chat.delete", "chat", id, "deleted chat #" + id);
      res.redirect("/admin/chats?notice=" + encodeURIComponent("Deleted chat #" + id + "."));
    } catch (err) {
      next(err);
    }
  });
};
