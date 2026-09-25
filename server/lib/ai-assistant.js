/* ==========================================================================
   AI SALES ASSISTANT — Groq (OpenAI-compatible), like bongshaihousing's
   --------------------------------------------------------------------------
   The knowledge comes from the live site content on every call (company
   settings, services, FAQ, the published models, completed projects), so an
   edit in the admin is what the assistant knows next. Nothing about prices
   or delivery times is invented: Bongshai Steel quotes per project.

   When the customer gives a phone number, the model appends one line
       LEAD|<name>|<phone>|<location>|<what they want>
   which the route strips from the reply and records as a lead (once per chat).

   English only (owner decision: the Steel site is for export buyers).
   Lessons kept from Housing: several keys round-robin, rotating on
   429/401/403; the response body decoded once at the end (per-chunk decoding
   corrupts multi-byte characters at chunk boundaries); never log a key.
   ========================================================================== */
"use strict";

const https = require("node:https");
const http = require("node:http");

// GROQ_API_URL exists for tests (a local stand-in); production uses Groq.
const groqUrl = () => process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";
const model = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";

function groqKeys() {
  const many = String(process.env.GROQ_API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
  if (many.length) return many;
  const one = String(process.env.GROQ_API_KEY || "").trim();
  return one ? [one] : [];
}
let keyCursor = 0;

const clip = (s, n) => { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const strip = (s) => String(s == null ? "" : s).replace(/<[^>]*>/g, " ");

/** The facts the assistant may use, from the live content and projects. */
function knowledge(content, projects) {
  const c = content || {};
  const s = c.settings || {};
  const sec = c.sections || {};
  const lines = [];
  lines.push("COMPANY");
  lines.push("- Name: " + (s.companyName || "Bongshai Steel") + " (part of the Bongshai Group). Pre-engineered steel buildings: design, fabrication and erection.");
  if (s.address) lines.push("- Office: " + clip(strip(s.address), 160));
  if (s.hotline) lines.push("- Hotline: " + s.hotline);
  if (s.whatsappNumber) lines.push("- WhatsApp: https://wa.me/" + String(s.whatsappNumber).replace(/\D/g, ""));
  if (s.email) lines.push("- Email: " + s.email);
  lines.push("- Engineering standards used on the site: AISC 360, Eurocode 3, BNBC 2020; welding AWS D1.1.");
  lines.push("- Exports steel buildings; the site lists the UAE, Saudi Arabia and Kenya among destinations.");

  if (Array.isArray(sec.services) && sec.services.length) {
    lines.push("\nSERVICES");
    for (const x of sec.services) lines.push("- " + clip(x.title, 80) + ": " + clip(strip(x.desc), 200));
  }
  if (Array.isArray(sec.faq) && sec.faq.length) {
    lines.push("\nFAQ (answers the company has published — reuse them, do not contradict them)");
    for (const f of sec.faq) lines.push("Q: " + clip(strip(f.q), 160) + "\nA: " + clip(strip(f.a), 420));
  }

  const cats = Array.isArray(c.categories) ? c.categories : [];
  const products = Array.isArray(c.products) ? c.products : [];
  if (products.length) {
    lines.push("\nPUBLISHED MODELS (" + products.length + "). Link a model as /products/<model code>.");
    for (const cat of cats) {
      const items = products.filter((p) => p.category === cat.key);
      if (!items.length) continue;
      lines.push(cat.name + " (/category/" + cat.key + "):");
      for (const p of items) lines.push("  " + p.modelCode + " — " + clip(p.name, 70) + ": " + clip(p.desc, 110));
    }
  }

  const done = (projects || []).filter((p) => p.published !== 0 && p.published !== false);
  if (done.length) {
    lines.push("\nCOMPLETED PROJECTS (see /projects)");
    for (const p of done.filter((x) => x.delivered_by === "steel")) lines.push("- Bongshai Steel: " + p.title + ", " + (p.location || ""));
    for (const p of done.filter((x) => x.delivered_by === "engineering")) {
      lines.push("- Bongshai Engineering & Construction (sister company): " + p.title + (p.year_label ? " (" + p.year_label + ")" : "") + (p.client ? ", client " + p.client : "") + (p.location ? ", " + p.location : ""));
    }
  }
  return lines.join("\n");
}

function systemPrompt(content, projects, ctx) {
  const lang = "Respond only in clear, natural English, whatever language the message is in.";
  return knowledge(content, projects) + `

PAGE THE CUSTOMER IS ON: ${clip(ctx.pageTitle || "", 120)} (${clip(ctx.pagePath || "/", 120)})

YOU ARE BONGSHAI STEEL'S SALES ASSISTANT on the website chat.
${lang}

HOW TO TALK
- Warm, competent, brief: two to four sentences. Customers read on phones.
- React to what they said before asking anything. Then at most ONE question,
  and it should follow from their last message (building type, size, site
  location, use, or timeline) — never a checklist.
- Remember what they already told you; never ask for it again.

FACTS — STRICT
- Use only the facts above. If something is not there, say you will have an
  engineer confirm it; never guess.
- NEVER state a price, a price per square foot, a cost range, a delivery time or
  a construction duration. Bongshai Steel quotes every building individually
  after the engineering team sees the requirements. Say so plainly and offer to
  prepare a quote.
- Only recommend models from the list, with their exact model code, and link
  them as /products/<model code>. Mention /projects when experience or
  references come up.
- Do not criticise or compare with other companies. Stay on steel buildings;
  politely steer anything unrelated back.

GETTING A QUOTE STARTED
- When the customer wants a price or a quote, ask for their name and phone
  (or WhatsApp) number, and the site location, so the team can call them. Ask
  once; if they would rather not, give the hotline and WhatsApp link instead.
- When — and only when — the customer has given a phone number in this chat,
  end your reply with ONE extra final line in exactly this form (it is removed
  before they see it):
  LEAD|<their name or ->|<phone as they wrote it>|<location or ->|<one-line summary of what they want>
  Write it only once per conversation, the first time the number appears.`;
}

function send(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const url = groqUrl();
    const req = (url.startsWith("http:") ? http : https).request(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            resolve((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "");
          } catch (e) { reject(new Error("unreadable Groq response")); }
        } else {
          const err = new Error("Groq " + res.statusCode + ": " + body.slice(0, 200));
          err.status = res.statusCode;
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Groq timed out")); });
    req.write(payload);
    req.end();
  });
}

/** messages: [{ role: "user"|"assistant", content }]. Returns { reply, lead|null }. */
async function reply(messages, { content, projects, ctx }) {
  const keys = groqKeys();
  if (!keys.length) { const e = new Error("no Groq key configured"); e.code = "NO_KEY"; throw e; }
  const payload = JSON.stringify({
    model: model(),
    messages: [{ role: "system", content: systemPrompt(content, projects, ctx || {}) }, ...messages],
    temperature: 0.5,
    max_tokens: 700,
  });
  const errors = [];
  for (let i = 0; i < keys.length; i++) {
    const idx = (keyCursor + i) % keys.length;
    try {
      const raw = await send(keys[idx], payload);
      keyCursor = (idx + 1) % keys.length;
      return parse(raw);
    } catch (err) {
      errors.push("key " + (idx + 1) + ": " + err.message);
      if (![429, 401, 403].includes(err.status)) throw err;
    }
  }
  throw new Error("all Groq keys failed — " + errors.join(" | "));
}

/** Split the model's text into the visible reply and the optional LEAD line. */
function parse(raw) {
  let lead = null;
  const kept = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    const m = /^\s*LEAD\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/.exec(line);
    if (m && !lead) {
      const v = (x) => { x = x.trim(); return x && x !== "-" ? x : ""; };
      lead = { name: v(m[1]), phone: v(m[2]), location: v(m[3]), summary: v(m[4]) };
      continue;
    }
    kept.push(line);
  }
  return { reply: kept.join("\n").trim(), lead: lead && lead.phone ? lead : null };
}

module.exports = { reply, parse, knowledge, groqKeys };
