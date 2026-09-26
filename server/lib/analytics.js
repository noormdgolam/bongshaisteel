/* ==========================================================================
   VISITOR ANALYTICS AND CHAT LOG
   --------------------------------------------------------------------------
   page views: one row per public HTML page view, written after the response
   is sent (never slows a page). Bots, admin pages, assets, prefetches and
   the owner's excluded IPs are not counted. A visitor is a hash of IP +
   user agent + a salt that changes every day, so the same person counts once
   a day and no IP is ever stored.

   chat log: the whole AI-chat conversation per chat id, upserted after each
   reply, for Admin → Support Chats.
   ========================================================================== */
"use strict";

const crypto = require("node:crypto");

const KEEP_DAYS = 180;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|node-fetch|axios|headless|lighthouse|pingdom|uptime/i;
const SKIP_PATH = /^\/(admin|api|images|css|js|fonts?|data|server|deploy)\b|\.(?:css|js|mjs|map|json|xml|txt|ico|png|jpe?g|gif|webp|svg|avif|woff2?|ttf|pdf|php|webmanifest)$/i;

const SECRET = process.env.SESSION_SECRET || process.env.APP_SECRET || "bongshai-steel-analytics";

const today = () => new Date().toISOString().slice(0, 10);

function visitorHash(ip, agent, day) {
  return crypto.createHash("sha256")
    .update(SECRET + "|" + (day || today()) + "|" + (ip || "") + "|" + String(agent || "").slice(0, 200))
    .digest("hex").slice(0, 24);
}

function device(agent) {
  const a = String(agent || "");
  if (/ipad|tablet/i.test(a)) return "tablet";
  if (/mobi|android|iphone/i.test(a)) return "mobile";
  return "desktop";
}

function refHost(referrer, ownHost) {
  try {
    const h = new URL(referrer).hostname.replace(/^www\./, "");
    return h && h !== String(ownHost || "").replace(/^www\./, "").split(":")[0] ? h.slice(0, 120) : null;
  } catch {
    return null;
  }
}

/** Excluded IPs, cached for a minute. */
let excluded = { at: 0, set: new Set() };
async function excludedIps(db) {
  if (Date.now() - excluded.at < 60e3) return excluded.set;
  try {
    excluded = { at: Date.now(), set: new Set(await db("analytics_excluded_ips").pluck("ip")) };
  } catch {
    excluded = { at: Date.now(), set: excluded.set };
  }
  return excluded.set;
}
function forgetExcluded() { excluded.at = 0; }

let lastPrune = 0;

/** Express middleware: counts the view once the page has been sent. */
function tracker(db) {
  return (req, res, next) => {
    if (req.method !== "GET" || SKIP_PATH.test(req.path)) return next();
    const agent = req.get("user-agent") || "";
    const purpose = String(req.get("sec-purpose") || req.get("purpose") || "");
    // Scripts (Node's fetch sends "node") and bots are not visitors.
    if (!agent || agent === "node" || BOT.test(agent) || /prefetch/i.test(purpose)) return next();
    res.on("finish", () => {
      if (res.statusCode !== 200 || !/html/.test(String(res.get("content-type") || ""))) return;
      record(db, req, agent).catch((err) => console.error("analytics:", err.message));
    });
    next();
  };
}

async function record(db, req, agent) {
  if ((await excludedIps(db)).has(req.ip)) return;
  await db("page_views").insert({
    day: today(),
    path: req.path.slice(0, 255),
    referrer_host: refHost(req.get("referer"), req.get("host")),
    device: device(agent),
    visitor_hash: visitorHash(req.ip, agent),
  });
  if (Date.now() - lastPrune > 6 * 3600e3) {
    lastPrune = Date.now();
    const cut = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
    await db("page_views").where("day", "<", cut).del();
  }
}

/** Length of the longest suffix of `old` that equals a prefix of `next`. */
function overlap(old, next) {
  const same = (a, b) => a.role === b.role && a.content === b.content;
  for (let k = Math.min(old.length, next.length); k > 0; k--) {
    let ok = true;
    for (let i = 0; i < k && ok; i++) ok = same(old[old.length - k + i], next[i]);
    if (ok) return k;
  }
  return 0;
}

/** Upserts one chat conversation. Never throws. */
async function saveChat(db, { chatId, messages, reply, page, ip, agent, leadId }) {
  if (!db || !chatId) return;
  try {
    const now = new Date().toISOString();
    const all = messages.map((m) => ({ role: m.role, content: m.content }));
    if (reply) all.push({ role: "assistant", content: reply, at: now });
    const existing = await db("chat_sessions").where({ chat_id: chatId }).first("id", "lead_id", "messages");
    // The browser sends only its last 14 messages: append what is new after
    // the longest overlap between the stored tail and the incoming head.
    let kept = all;
    if (existing) {
      let old = [];
      try { old = JSON.parse(existing.messages) || []; } catch { /* start again */ }
      kept = old.concat(all.slice(overlap(old, all)));
    }
    kept = kept.slice(-200);
    const row = {
      messages: JSON.stringify(kept),
      message_count: kept.length,
      last_page: String((page && page.path) || "").slice(0, 200) || null,
      updated_at: db.fn.now(),
    };
    if (existing) {
      await db("chat_sessions").where({ id: existing.id })
        .update({ ...row, ...(leadId && !existing.lead_id ? { lead_id: leadId } : {}) });
    } else {
      await db("chat_sessions").insert({
        ...row, chat_id: chatId, status: "open",
        first_page: row.last_page, visitor_hash: visitorHash(ip, agent),
        user_agent: String(agent || "").slice(0, 200) || null, lead_id: leadId || null,
      });
    }
  } catch (err) {
    console.error("chat log:", err.message); // the reply matters more than the log
  }
}

module.exports = { tracker, record, saveChat, overlap, visitorHash, device, refHost, forgetExcluded, BOT, SKIP_PATH, KEEP_DAYS };
