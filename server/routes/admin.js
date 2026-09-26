/* ==========================================================================
   ADMIN ROUTES
   --------------------------------------------------------------------------
   Renders the templates Antigravity builds in server/views/admin/ (task
   T-001). The variable names passed here ARE the contract written in the
   coordination TASKS.md — change one side, change the other.

   Every content write ends the same way: bump the content revision, refresh
   the in-memory copy, write the activity trail. The public site then shows
   the change on the next request here, and within one poll everywhere else.
   ========================================================================== */
"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");

const auth = require("../lib/auth");
const snapshots = require("../lib/snapshots");

// Compared against when a username does not exist, so a wrong name costs the
// same bcrypt work as a wrong password and timing reveals nothing.
const DUMMY_HASH = bcrypt.hashSync("never-a-real-password", 12);

const CONTENT_ROLES = ["superadmin", "admin", "editor"];

/** A validation problem the user should read — never an internal error. */
class FormError extends Error {}

/** How a ticked checkbox arrives. One definition, used for saving AND for
    refilling the form after an error — the two used to disagree, and a
    rejected save silently unticked Published and Featured. */
const on = (v) => v === "on" || v === "1" || v === "true" || v === true;

module.exports = function createAdminRouter({ db, content }) {
  const router = express.Router();

  router.use("/admin", (req, res, next) => {
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });
  router.use("/admin", express.urlencoded({ extended: false, limit: "64kb" }));
  router.use("/admin", auth.sessionMiddleware(db));
  router.use("/admin", auth.csrf);

  /* -------------------------------------------------------------- helpers */

  async function logActivity(req, action, entityType, entityId, summary) {
    try {
      await db("activity_log").insert({
        admin_user_id: req.admin ? req.admin.id : null,
        admin_name: req.admin ? (req.admin.name || req.admin.username) : null,
        action: String(action).slice(0, 50),
        entity_type: entityType || null,
        entity_id: entityId == null ? null : String(entityId).slice(0, 100),
        summary: summary ? String(summary).slice(0, 500) : null,
      });
    } catch (err) {
      console.error("activity:", err.message); // never fail the action over its log line
    }
  }

  /** After any content write: every worker and the public pages catch up. */
  async function contentChanged() {
    await content.bumpRev();
    await content.refresh();
  }

  function view(req, active, extra) {
    return {
      active,
      notice: typeof req.query.notice === "string" ? req.query.notice.slice(0, 200) : null,
      error: typeof req.query.error === "string" ? req.query.error.slice(0, 200) : null,
      ...extra,
    };
  }

  /* ----------------------------------------------------------- sign in/out */

  router.get("/admin/login", (req, res) => {
    if (req.session.adminUserId) return res.redirect(auth.safeReturn(req.query.return));
    res.render("admin/login.njk", { error: null, username: "", lockedMinutes: 0 });
  });

  router.post("/admin/login", async (req, res, next) => {
    try {
      const ip = req.ip;
      const username = String(req.body.username || "").trim().slice(0, 64);
      const password = String(req.body.password || "");
      const locked = auth.lockedFor(ip);
      if (locked) {
        return res.status(429).render("admin/login.njk", {
          error: "Too many failed attempts.", username, lockedMinutes: Math.ceil(locked / 60000),
        });
      }

      const user = username ? await db("admin_users").where({ username }).first() : null;
      // Always pay the bcrypt cost, whether or not the user exists.
      const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

      if (!user || !ok || !user.active || !password) {
        auth.noteFailure(ip);
        await logActivity(req, "auth.failed", "user", null, "sign-in failed for '" + username + "'");
        const lockedNow = auth.lockedFor(ip);
        return res.status(lockedNow ? 429 : 401).render("admin/login.njk", {
          error: lockedNow ? "Too many failed attempts." : "Incorrect username or password.",
          username, lockedMinutes: lockedNow ? Math.ceil(lockedNow / 60000) : 0,
        });
      }

      auth.clearFailures(ip);
      const returnTo = auth.safeReturn(req.query.return);
      // New session id on sign-in: a session id handed out before login can
      // never become an authenticated one (session fixation).
      req.session.regenerate(async (err) => {
        if (err) return next(err);
        req.session.adminUserId = user.id;
        req.session.signedInAt = Date.now();
        req.admin = user;
        await db("admin_users").where({ id: user.id }).update({ last_login_at: db.fn.now() });
        await logActivity(req, "auth.signin", "user", user.id, user.username + " signed in");
        // The store is async: save before redirecting or the next request can
        // arrive before the session exists.
        req.session.save((err2) => (err2 ? next(err2) : res.redirect(returnTo)));
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/logout", async (req, res) => {
    if (req.session.adminUserId) {
      const u = await db("admin_users").where({ id: req.session.adminUserId }).first("id", "username", "name");
      if (u) { req.admin = u; await logActivity(req, "auth.logout", "user", u.id, u.username + " signed out"); }
    }
    req.session.destroy(() => {
      res.clearCookie("bs_admin", { path: "/admin" });
      res.redirect("/admin/login");
    });
  });

  /* ------------------------------------------------- everything else: auth */

  router.use("/admin", auth.requireAdmin(db));

  // Before a content change, keep a restorable copy (at most one per half hour).
  router.use(["/admin/products", "/admin/content", "/admin/categories"], (req, res, next) =>
    (req.method === "POST" ? snapshots.auto(db, req.admin).then(() => next(), next) : next()));

  router.get("/admin", async (req, res, next) => {
    try {
      const count = async (q) => Number((await q.count({ n: "*" }))[0].n);
      const [products, categories, faqs, leadsNew, leadsTotal, recentActivity] = await Promise.all([
        count(db("products")),
        count(db("categories")),
        count(db("faqs")),
        count(db("leads").where({ status: "new" })),
        count(db("leads")),
        db("activity_log").orderBy("id", "desc").limit(12)
          .select("created_at", "admin_name", "action", "summary"),
      ]);
      const views = require("../lib/counter").read();
      const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      const distinct = async (q) => Number(((await q.countDistinct({ n: "visitor_hash" }))[0] || {}).n || 0);
      const [visitorsToday, visitorsWeek, chatsOpen, noSeo] = await Promise.all([
        distinct(db("page_views").where("day", day(0))),
        distinct(db("page_views").where("day", ">=", day(6))),
        count(db("chat_sessions").where({ status: "open" })),
        count(db("products").where("published", true).whereNull("meta_description")),
      ]);
      res.render("admin/dashboard.njk", view(req, "dashboard", {
        stats: { products, categories, faqs, leadsNew, leadsTotal, views, visitorsToday, visitorsWeek, chatsOpen, noSeo },
        recentActivity,
      }));
    } catch (err) {
      next(err);
    }
  });

  /* --------------------------------------------------------------- products */

  require("./admin-products")(router, {
    db, auth, logActivity, contentChanged, view, on, FormError, contentRoles: CONTENT_ROLES,
  });

  /* ------------------------------------------------------------- messages */

  // Before /admin/leads/:id, so /admin/leads/new and /bulk are not read as ids.
  require("./admin-sales")(router, { db, auth, logActivity, view, FormError });

  const STATUSES = ["new", "contacted", "quoted", "won", "lost"];
  const LEAD_LIST_CAP = 500;

  /** The inbox filters, shared by the page and the CSV export. */
  function leadFilters(query) {
    const status = STATUSES.includes(query.status) ? query.status : "all";
    const kind = query.kind === "quote" || query.kind === "contact" ? query.kind : "all";
    const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
    return { status, kind, q };
  }

  function applyLeadFilters(qb, { status, kind, q }) {
    if (status !== "all") qb.where("status", status);
    if (kind !== "all") qb.where("kind", kind);
    if (q) {
      const like = "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
      qb.where((b) => {
        for (const col of ["name", "phone", "email", "company", "model_code", "message", "destination"]) {
          b.orWhere(col, "like", like);
        }
      });
    }
    return qb;
  }

  router.get("/admin/leads", async (req, res, next) => {
    try {
      const f = leadFilters(req.query);
      const [leads, byStatus] = await Promise.all([
        applyLeadFilters(db("leads"), f).orderBy("created_at", "desc").orderBy("id", "desc").limit(LEAD_LIST_CAP)
          .select("id", "kind", "status", "name", "phone", "email", "company", "model_code", "destination", "source", "created_at"),
        db("leads").select("status").count({ n: "*" }).groupBy("status"),
      ]);
      const counts = { all: 0, new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
      for (const r of byStatus) { counts[r.status] = Number(r.n); counts.all += Number(r.n); }
      res.render("admin/leads/list.njk", view(req, "leads", {
        leads, statuses: STATUSES, counts, total: leads.length, ...f,
      }));
    } catch (err) {
      next(err);
    }
  });

  /* A cell a spreadsheet would read as a formula (=, +, -, @, tab, CR) is
     prefixed with an apostrophe. Leads are typed by the public, and a name like
     =HYPERLINK("http://evil","click") would otherwise run in Excel. */
  function csvCell(v) {
    let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  router.get("/admin/leads.csv", async (req, res, next) => {
    try {
      const f = leadFilters(req.query);
      const rows = await applyLeadFilters(db("leads"), f).orderBy("created_at", "desc").orderBy("id", "desc");
      const cols = ["id", "public_id", "created_at", "kind", "status", "name", "phone", "email", "company",
        "model_code", "destination", "currency", "standard", "dimensions", "message", "note", "source"];
      const lines = [cols.join(",")].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")));
      await logActivity(req, "lead.export", "lead", null, "exported " + rows.length + " message(s) as CSV");
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", 'attachment; filename="bongshai-messages-' + new Date().toISOString().slice(0, 10) + '.csv"');
      // BOM so Excel reads the Bangla correctly.
      res.send("﻿" + lines.join("\r\n") + "\r\n");
    } catch (err) {
      next(err);
    }
  });

  async function findLead(id) {
    const n = parseInt(id, 10);
    return n ? db("leads").where({ id: n }).first() : null;
  }

  router.get("/admin/leads/:id", async (req, res, next) => {
    try {
      const lead = await findLead(req.params.id);
      if (!lead) return next();
      res.render("admin/leads/detail.njk", view(req, "leads", { lead, statuses: STATUSES }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/leads/:id", async (req, res, next) => {
    try {
      const lead = await findLead(req.params.id);
      if (!lead) return next();
      const status = String(req.body.status || "");
      if (!STATUSES.includes(status)) {
        return res.redirect("/admin/leads/" + lead.id + "?error=" + encodeURIComponent("Unknown status."));
      }
      const note = String(req.body.note == null ? "" : req.body.note).slice(0, 2000);
      await db("leads").where({ id: lead.id }).update({ status, note: note || null, updated_at: db.fn.now() });
      await logActivity(req, "lead.update", "lead", lead.id,
        lead.name + ": " + lead.status + (status !== lead.status ? " → " + status : "") + (note !== (lead.note || "") ? ", note edited" : ""));
      res.redirect("/admin/leads/" + lead.id + "?notice=" + encodeURIComponent("Saved."));
    } catch (err) {
      next(err);
    }
  });

  // Deleting a customer's message is for owners, not the sales desk.
  router.post("/admin/leads/:id/delete", auth.requireRole("superadmin", "admin"), async (req, res, next) => {
    try {
      const lead = await findLead(req.params.id);
      if (!lead) return next();
      await db("leads").where({ id: lead.id }).del();
      await logActivity(req, "lead.delete", "lead", lead.id, "deleted the message from " + lead.name);
      res.redirect("/admin/leads?notice=" + encodeURIComponent("Deleted the message from " + lead.name + "."));
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- activity */

  const ACTIVITY_PAGE = 50;

  router.get("/admin/activity", async (req, res, next) => {
    try {
      const actions = await db("activity_log").distinct("action").orderBy("action").pluck("action");
      const action = actions.includes(req.query.action) ? req.query.action : "all";
      const scoped = () => (action === "all" ? db("activity_log") : db("activity_log").where({ action }));
      const total = Number((await scoped().count({ n: "*" }))[0].n);
      const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE));
      const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
      const activity = await scoped().orderBy("id", "desc").limit(ACTIVITY_PAGE).offset((page - 1) * ACTIVITY_PAGE)
        .select("created_at", "admin_name", "action", "entity_type", "entity_id", "summary");
      res.render("admin/activity.njk", view(req, "activity", { activity, actions, action, page, pages, total }));
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- content */

  // Its own module — this file is not going the way of Housing's 4620 lines.
  require("./admin-content")(router, {
    db, auth, logActivity, contentChanged, view, on, FormError, roles: CONTENT_ROLES,
  });
  require("./admin-users")(router, {
    db, auth, logActivity, contentChanged, view, on, FormError, contentRoles: CONTENT_ROLES,
  });
  require("./admin-media")(router, {
    db, auth, logActivity, contentChanged, view, contentRoles: CONTENT_ROLES,
  });
  require("./admin-insights")(router, {
    db, auth, logActivity, contentChanged, view, contentRoles: CONTENT_ROLES,
  });
  require("./admin-projects")(router, {
    db, auth, logActivity, view, on, FormError, contentRoles: CONTENT_ROLES,
  });

  return router;
};
