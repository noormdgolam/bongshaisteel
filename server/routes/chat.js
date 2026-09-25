/* ==========================================================================
   PUBLIC AI CHAT — POST /api/chat
   --------------------------------------------------------------------------
   Body (JSON): { chat, page: { path, title },
                  messages: [{ role: "user"|"assistant", content }] }
   Reply: { ok, reply } or { ok:false, error, message }.

   Guards, because every message costs model quota:
   - same-origin only (Sec-Fetch-Site / Origin), JSON only, 24 KB body;
   - per IP: 12 messages a minute, 80 a day (in memory; one worker);
   - last 14 messages kept, 1 500 characters each, the last from the user.
   A phone number given in the chat becomes one lead per chat id (source
   "ai chat"), with the conversation attached, through the same lead intake
   the forms use.
   ========================================================================== */
"use strict";

const express = require("express");
const assistant = require("../lib/ai-assistant");

const PER_MIN = 12, PER_DAY = 80;
const hits = new Map();          // ip -> { min: [t...], day: [t...] }
const leadChats = new Map();     // chat id -> time recorded

function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { min: [], day: [] };
  h.min = h.min.filter((t) => now - t < 60e3);
  h.day = h.day.filter((t) => now - t < 864e5);
  if (h.min.length >= PER_MIN || h.day.length >= PER_DAY) { hits.set(ip, h); return true; }
  h.min.push(now); h.day.push(now);
  hits.set(ip, h);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.day.length || now - v.day[v.day.length - 1] > 864e5) hits.delete(k);
  return false;
}

module.exports = function createChatRouter({ content, leads, getProjects }) {
  const router = express.Router();

  router.post("/api/chat", express.json({ limit: "24kb" }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const fail = (status, error, message) => res.status(status).json({ ok: false, error, message });

    const site = String(req.get("sec-fetch-site") || "").toLowerCase();
    if (site && site !== "same-origin") return fail(403, "origin", "Not allowed.");
    const origin = req.get("origin");
    if (origin) { try { if (new URL(origin).host !== req.get("host")) return fail(403, "origin", "Not allowed."); } catch { return fail(403, "origin", "Not allowed."); } }

    const b = req.body && typeof req.body === "object" ? req.body : {};
    const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-14)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") return fail(400, "input", "Type a message first.");
    if (limited(req.ip)) return fail(429, "busy", "That is a lot of messages in a short time — please wait a minute, or call/WhatsApp us.");

    const page = b.page && typeof b.page === "object" ? b.page : {};
    const chatId = /^[a-z0-9]{8,40}$/i.test(String(b.chat || "")) ? String(b.chat) : null;

    try {
      const projects = getProjects ? await getProjects().catch(() => []) : [];
      const out = await assistant.reply(messages, {
        content: content.load(), projects,
        ctx: { pagePath: String(page.path || "/").slice(0, 200), pageTitle: String(page.title || "").slice(0, 200) },
      });

      if (out.lead && chatId && !leadChats.has(chatId)) {
        leadChats.set(chatId, Date.now());
        if (leadChats.size > 5000) leadChats.delete(leadChats.keys().next().value);
        const transcript = messages.map((m) => (m.role === "user" ? "Customer: " : "Assistant: ") + m.content).join("\n");
        try {
          await leads.record({
            kind: "quote",
            name: out.lead.name || "Chat visitor",
            phone: out.lead.phone,
            destination: out.lead.location || "",
            source: "ai chat",
            message: ((out.lead.summary ? out.lead.summary + "\n\n" : "") + "— chat —\n" + transcript).slice(0, 3900),
          }, { ip: req.ip, agent: req.get("user-agent") });
        } catch (err) {
          console.error("chat lead:", err.message); // a failed lead must not break the reply
          leadChats.delete(chatId);
        }
      }
      res.json({ ok: true, reply: out.reply || "Sorry — could you say that again?" });
    } catch (err) {
      console.error("chat:", err.code || err.message);
      const s = (content.load().settings) || {};
      fail(503, "unavailable", "The chat cannot answer right now. Please call " + (s.hotline || "+8801789-949060") + " or message us on WhatsApp.");
    }
  });

  return router;
};

module.exports._reset = () => { hits.clear(); leadChats.clear(); };
