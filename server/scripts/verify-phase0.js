/* ==========================================================================
   PHASE 0 EQUIVALENCE CHECK
   --------------------------------------------------------------------------
   The promise of Phase 0 is "identical output". This checks it in a real
   browser, two ways, for two content states:

   1. CMS fingerprint. Every [data-cms*] value, every generated container, the
      section visibility and the <head> SEO tags — read from
        A) the static index.html after apply.js has run in the browser, and
        B) the Node server's raw response, parsed but with no script executed.
      A == B means the server applied the content exactly as the browser did.

   2. Structure. The static file and the Node response, both parsed and with
      the CMS-owned regions blanked, must be the same document. This catches
      anything the server changed that it had no business touching.

   Needs: headless Chrome with --remote-debugging-port (DBG) and a file-mode
   Node app (NODE_URL). The untouched page is served by a static server this
   script starts itself: server/views/site/index.html at "/", the site files
   around it (or set STATIC_URL to use another one).

     DBG=http://127.0.0.1:9224 node scripts/verify-phase0.js
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../lib/paths");

const DBG = process.env.DBG || "http://127.0.0.1:9222";
let STATIC_URL = process.env.STATIC_URL || null;
const NODE_URL = process.env.NODE_URL || "http://127.0.0.1:3100/";
const LIVE = path.join(ROOT, "data", "content.json");
const SEED = path.join(ROOT, "data", "content.default.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Runs inside the page. Builds a comparable snapshot of everything the CMS owns. */
const FINGERPRINT = `(function (doc) {
  var ws = function (s) { return String(s == null ? "" : s).replace(/\\s+/g, " ").trim(); };
  var out = {};
  var meta = function (sel, attr) { var e = doc.querySelector(sel); return e ? e.getAttribute(attr) : null; };
  out.title = ws(doc.title);
  out.head = {
    description: meta('meta[name="description"]', "content"),
    keywords: meta('meta[name="keywords"]', "content"),
    canonical: meta('link[rel="canonical"]', "href"),
    ogTitle: meta('meta[property="og:title"]', "content"),
    ogDescription: meta('meta[property="og:description"]', "content"),
    ogImage: meta('meta[property="og:image"]', "content"),
    ogUrl: meta('meta[property="og:url"]', "content"),
    twTitle: meta('meta[name="twitter:title"]', "content"),
    twDescription: meta('meta[name="twitter:description"]', "content"),
    twImage: meta('meta[name="twitter:image"]', "content")
  };
  var each = function (sel, fn) { Array.prototype.forEach.call(doc.querySelectorAll(sel), fn); };
  out.text = []; each("[data-cms]", function (e) { out.text.push([e.getAttribute("data-cms"), ws(e.textContent)]); });
  out.set = []; each("[data-cms-set]", function (e) { out.set.push([e.getAttribute("data-cms-set"), ws(e.textContent)]); });
  out.html = []; each("[data-cms-html]", function (e) { out.html.push([e.getAttribute("data-cms-html"), ws(e.innerHTML)]); });
  out.img = []; each("[data-cms-img]", function (e) { out.img.push([e.getAttribute("data-cms-img"), e.getAttribute("src"), e.getAttribute("srcset")]); });
  out.wa = []; each("[data-cms-wa]", function (e) { out.wa.push(e.getAttribute("href")); });
  out.containers = {};
  ["statsContainer", "trustBarContainer", "servicesGrid", "safetyPoints", "faqList", "footerSister",
   "testimonialsList", "teamList", "serviceAreasList",
   "navProductsMenu", "mobileProductsMenu", "catalogFilterChips", "footerProductLinks"].forEach(function (id) {
    var e = doc.getElementById(id); out.containers[id] = e ? ws(e.innerHTML) : null;
  });
  out.visible = {};
  ["testimonialsSection", "teamSection", "serviceAreasBlock"].forEach(function (id) {
    var e = doc.getElementById(id); out.visible[id] = e ? e.style.display !== "none" : null;
  });
  return JSON.stringify(out);
})`;

/* Runs inside the page: parse raw HTML, blank what the CMS owns, return the rest. */
const SKELETON = `(function (html) {
  var doc = new DOMParser().parseFromString(html, "text/html");
  var q = function (s) { return doc.querySelectorAll(s); };
  var blank = function (s) { Array.prototype.forEach.call(q(s), function (e) { e.innerHTML = ""; }); };
  blank("[data-cms], [data-cms-set], [data-cms-html], title");
  ["statsContainer", "trustBarContainer", "servicesGrid", "safetyPoints", "faqList", "footerSister",
   "testimonialsList", "teamList", "serviceAreasList",
   "navProductsMenu", "mobileProductsMenu", "catalogFilterChips", "footerProductLinks"].forEach(function (id) {
    var e = doc.getElementById(id); if (e) e.innerHTML = "";
  });
  ["testimonialsSection", "teamSection", "serviceAreasBlock"].forEach(function (id) {
    // Re-serialise both sides the same way: the browser rewrites a style
    // attribute only when removeProperty actually removes something.
    var e = doc.getElementById(id); if (e) { e.style.removeProperty("display"); e.setAttribute("style", e.style.cssText); }
  });
  Array.prototype.forEach.call(q("[data-cms-img]"), function (e) {
    e.removeAttribute("src"); e.removeAttribute("srcset"); e.removeAttribute("sizes");
  });
  Array.prototype.forEach.call(q("[data-cms-wa]"), function (e) { e.removeAttribute("href"); });
  Array.prototype.forEach.call(q('meta[name="description"], meta[name="keywords"], meta[property^="og:"], meta[name^="twitter:"]'),
    function (e) { e.removeAttribute("content"); });
  Array.prototype.forEach.call(q('link[rel="canonical"]'), function (e) { e.removeAttribute("href"); });
  return doc.documentElement.outerHTML.replace(/\\s+/g, " ");
})`;

async function connect() {
  const list = await (await fetch(DBG + "/json/list")).json();
  const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) throw new Error("no debuggable Chrome page at " + DBG);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { res, rej } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => { waiting.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expression.slice(0, 60));
    return r.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  return { ws, send, evaluate };
}

function diff(a, b, where, out) {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    out.push(where + ": " + JSON.stringify(a).slice(0, 140) + "  !=  " + JSON.stringify(b).slice(0, 140));
    return;
  }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diff(a[k], b[k], where + "." + k, out);
    return;
  }
  if (a !== b) out.push(where + ": " + JSON.stringify(a).slice(0, 140) + "  !=  " + JSON.stringify(b).slice(0, 140));
}

/* A content state that exercises every renderer, not just the seed's defaults. */
function richContent(seed) {
  const c = JSON.parse(JSON.stringify(seed));
  c.text["nav.home"] = "Home · হোম";
  c.text["hero.title"] = "Steel <b>& Co</b> “quoted”";   // escaping must match
  c.seo.title = "Rich title — Bongshai";
  c.seo.ogTitle = "Share & title";
  c.seo.canonical = "https://example.test/rich";
  c.settings.whatsappNumber = "8801999000111";
  c.settings.sisterLinks = [
    { label: "Housing", url: "https://noormdgolam.github.io/bongshaihousing/" },
    { label: "Bad", url: "javascript:alert(1)" },
    { label: "Engineering & Co", url: "https://noormdgolam.github.io/Bongshaiengineering/" },
  ];
  c.sections.stats = [{ value: "1,200+", label: "Buildings <erected>" }];
  c.sections.testimonials = [
    { quote: "Ahead of schedule & on budget.", author: "Nasir", role: "MD" },
    { quote: "", author: "Skipped — no quote" },
  ];
  c.sections.team = [{ name: "Eng. Noor", role: "Design", bio: "AISC", photo: "images/logo-icon-192.webp" }];
  c.sections.serviceAreas = [{ name: "Dhaka", note: "HQ" }, "Gazipur", { name: "" }];
  return c;
}

async function main() {
  // This check swaps data/content.json between states, so the Node app must
  // read that file. In db mode it would keep serving the database and the
  // second state would "fail" for no real reason. File mode answers /admin
  // with 503; db mode does not.
  const admin = await fetch(new URL("admin/login", NODE_URL), { redirect: "manual" });
  if (admin.status !== 503) {
    console.error("NODE_URL (" + NODE_URL + ") is running with CONTENT_SOURCE=db.\n" +
      "Start a file-mode instance and point at it:\n" +
      "  CONTENT_SOURCE=file PORT=3101 node server.js\n" +
      "  NODE_URL=http://127.0.0.1:3101/ node scripts/verify-phase0.js\n" +
      "(db mode is covered by scripts/verify-db-mode.js.)");
    process.exit(2);
  }

  let staticServer = null;
  if (!STATIC_URL) {
    const express = require("express");
    const TEMPLATE = path.join(__dirname, "..", "views", "site", "index.html");
    const app = express();
    app.get(["/", "/index.html"], (req, res) => res.type("html").sendFile(TEMPLATE));
    app.use(express.static(ROOT, { index: false }));
    staticServer = app.listen(0);
    STATIC_URL = "http://127.0.0.1:" + staticServer.address().port + "/";
  }

  const seed = JSON.parse(fs.readFileSync(SEED, "utf8"));
  const hadLive = fs.existsSync(LIVE);
  const backup = hadLive ? fs.readFileSync(LIVE) : null;

  const { ws, send, evaluate } = await connect();
  let failures = 0;

  const states = [
    ["seed content", seed],
    ["rich content", richContent(seed)],
  ];

  try {
    for (const [label, content] of states) {
      fs.writeFileSync(LIVE, JSON.stringify(content, null, 2));
      await sleep(300);

      // A: static file, apply.js running in the browser
      await send("Page.navigate", { url: STATIC_URL + "?v=" + Date.now() });
      await sleep(1500);
      await evaluate("(window.__cmsReady || Promise.resolve()).then(function () { return true; })");
      await sleep(300);
      const a = JSON.parse(await evaluate(FINGERPRINT + "(document)"));

      // B: Node's raw response, parsed, no script executed
      const nodeHtml = await (await fetch(NODE_URL + "?v=" + Date.now())).text();
      const b = JSON.parse(await evaluate(FINGERPRINT + "(new DOMParser().parseFromString(" +
        JSON.stringify(nodeHtml) + ", 'text/html'))"));

      const out = [];
      diff(a, b, "cms", out);
      console.log((out.length ? "FAIL" : "PASS") + "  fingerprint — " + label +
        "  (" + a.text.length + " text, " + a.set.length + " settings, " +
        Object.keys(a.containers).length + " containers)");
      out.slice(0, 12).forEach((l) => console.log("        " + l));
      if (out.length) failures++;

      // Structure: static raw vs node raw, CMS regions blanked
      const staticHtml = await (await fetch(STATIC_URL + "index.html?v=" + Date.now())).text();
      const s1 = await evaluate(SKELETON + "(" + JSON.stringify(staticHtml) + ")");
      const s2 = await evaluate(SKELETON + "(" + JSON.stringify(nodeHtml) + ")");
      if (s1 === s2) {
        console.log("PASS  structure   — " + label + "  (" + s1.length + " chars outside the CMS regions)");
      } else {
        failures++;
        let i = 0;
        while (i < s1.length && s1[i] === s2[i]) i++;
        console.log("FAIL  structure   — " + label + "  first difference at char " + i);
        console.log("        static: …" + s1.slice(Math.max(0, i - 80), i + 80));
        console.log("        node  : …" + s2.slice(Math.max(0, i - 80), i + 80));
      }
    }
  } finally {
    if (hadLive) fs.writeFileSync(LIVE, backup);
    else fs.rmSync(LIVE, { force: true });
    ws.close();
  }

  console.log(failures ? "\nRESULT: " + failures + " FAILED" : "\nRESULT: Phase 0 output is equivalent");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
