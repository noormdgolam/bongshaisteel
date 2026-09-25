/* ==========================================================================
   AI CHAT — the real route and lead intake against a local stand-in for Groq
     node test/chat.test.js
   No Groq key or quota is used. Leads land in the dev database under the
   name "zz chat …" and are removed at the end.
   ========================================================================== */
"use strict";

process.env.CONTENT_SOURCE = "db";
const http = require("node:http");
const express = require("express");

let calls = [];
let script = [];   // queued fake responses: { status, body } or a text reply
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", () => {
    calls.push({ auth: req.headers.authorization, payload: JSON.parse(body) });
    const next = script.length ? script.shift() : "ok";
    if (typeof next === "string") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: next } }] }));
    } else {
      res.writeHead(next.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "fake " + next.status } }));
    }
  });
});

let pass = 0, fail = 0;
const check = (ok, label, detail) => {
  ok ? pass++ : fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label + (ok || detail === undefined ? "" : "\n        " + String(detail).slice(0, 260)));
};

async function main() {
  await new Promise((r) => fake.listen(0, r));
  process.env.GROQ_API_URL = "http://127.0.0.1:" + fake.address().port + "/v1/chat/completions";
  process.env.GROQ_API_KEYS = "key-one,key-two";   // fake keys; GROQ_API_KEYS wins over any GROQ_API_KEY

  const db = require("../lib/db");
  const content = require("../lib/content");
  const leads = require("../lib/leads");
  const createChatRouter = require("../routes/chat");
  await content.refresh();
  await db("leads").where("name", "like", "zz chat%").del();

  const app = express();
  app.set("trust proxy", 1);
  app.use(createChatRouter({ content, leads,
    getProjects: () => db("projects").where({ published: true }).orderBy("sort_order") }));
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const post = (body, headers = {}) => fetch(base + "/api/chat", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
  const say = (text, extra = {}) => ({ chat: "testchat" + Date.now().toString(36), page: { path: "/products/BH-IS-1001", title: "Heavy Industrial Factory Shed" },
    messages: [{ role: "user", content: text }], ...extra });

  try {
    let r = await post({ messages: [] });
    check(r.status === 400, "no message: 400", r.status);
    r = await post(say("hello"), { "sec-fetch-site": "cross-site" });
    check(r.status === 403 && calls.length === 0, "a cross-site request is refused before any model call", r.status);
    r = await post(say("hello"), { origin: "https://evil.example" });
    check(r.status === 403 && calls.length === 0, "a foreign Origin is refused", r.status);

    script = ["Hello! What would you like to build?"];
    r = await post(say("Hi, I need a factory shed"));
    const sys = calls.length ? calls[calls.length - 1].payload.messages[0].content : "";
    check(r.status === 200 && r.data.ok && r.data.reply === "Hello! What would you like to build?", "a normal message gets the model's reply", JSON.stringify(r.data));
    check(/BH-IS-1001/.test(sys) && /NEVER state a price/.test(sys) && /only in clear, natural English/.test(sys),
      "  the model is given the live models, the no-price rule and English only");
    check(/Bongshai Engineering & Construction \(sister company\)/.test(sys) && /Heavy Industrial Factory Shed/.test(sys),
      "  and the projects, attributed, and the page the customer is on");
    check(calls[calls.length - 1].payload.model === (process.env.GROQ_MODEL || "openai/gpt-oss-120b"), "  using the configured model");

    // 20 short turns plus one over-long message: well inside the 24 KB body limit.
    const long = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "m" + i + "x".repeat(500) }));
    long.push({ role: "user", content: "y".repeat(2500) });
    script = ["ok"];
    r = await post({ chat: "longchat1", messages: long });
    const sent = calls[calls.length - 1].payload.messages.slice(1);
    check(r.status === 200 && sent.length === 14 && sent.every((m) => m.content.length <= 1500), "history is cut to 14 messages of 1500 characters", sent.length);

    // Lead line: stripped from the reply, recorded once per chat.
    const chat = "leadchat" + Date.now().toString(36);
    script = ["Thanks Rahim, our engineer will call you.\nLEAD|zz chat Rahim|01711223344|Gazipur|40x60 ft factory shed"];
    r = await post({ chat, messages: [{ role: "user", content: "I am Rahim, 01711223344, Gazipur, 40x60 shed" }] });
    const row = await db("leads").where({ name: "zz chat Rahim" }).first();
    check(r.status === 200 && !/LEAD\|/.test(r.data.reply) && /our engineer will call/.test(r.data.reply), "the LEAD line never reaches the customer", JSON.stringify(r.data));
    check(row && row.phone === "01711223344" && row.source === "ai chat" && row.kind === "quote" && row.destination === "Gazipur" && /— chat —/.test(row.message),
      "  it becomes a quote lead with the conversation attached", JSON.stringify(row && { p: row.phone, s: row.source, k: row.kind, d: row.destination }));
    script = ["Noted.\nLEAD|zz chat Rahim|01711223344|Gazipur|again"];
    r = await post({ chat, messages: [{ role: "user", content: "any update?" }] });
    const n = Number((await db("leads").where({ name: "zz chat Rahim" }).count({ n: "*" }))[0].n);
    check(n === 1, "  and only once per chat", n);

    // Key rotation: the first key is rate-limited, the second answers.
    calls = [];
    script = [{ status: 429 }, "from the second key"];
    r = await post(say("hi"));
    check(r.data && r.data.reply === "from the second key" && calls.length === 2 && calls[0].auth !== calls[1].auth,
      "a rate-limited key rolls over to the next", JSON.stringify(r.data) + " " + calls.length);
    script = [{ status: 500 }];
    r = await post(say("hi"));
    check(r.status === 503 && /call/i.test(r.data.message) && /\+?880/.test(r.data.message), "a model failure answers 503 with the hotline", JSON.stringify(r.data));

    // Per-IP limit: 12 a minute.
    createChatRouter._reset();
    let last;
    for (let i = 0; i < 13; i++) { script = ["ok"]; last = await post(say("msg " + i)); }
    check(last.status === 429, "the 13th message in a minute is refused", last.status);
    createChatRouter._reset();

    const keys = process.env.GROQ_API_KEYS, one = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEYS; delete process.env.GROQ_API_KEY;
    const before = calls.length;
    r = await post(say("hi"));
    check(r.status === 503 && calls.length === before, "no key configured: 503 without calling anything", r.status);
    process.env.GROQ_API_KEYS = keys; if (one !== undefined) process.env.GROQ_API_KEY = one;
  } finally {
    server.close(); fake.close();
    await db("activity_log").where("summary", "like", "%zz chat%").del();
    await db("leads").where("name", "like", "zz chat%").del();
    await db.destroy();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 1; process.exit(1); });
