/* ==========================================================================
   BONGSHAI STEEL — NODE APP
   --------------------------------------------------------------------------
   Single boot file, as on Bongshai Housing: Passenger's PassengerStartupFile
   points straight here. Middleware order follows that app deliberately —
   several of its steps encode fixes that were expensive to find.

   Phase 0: serve the current site with identical output. Nothing a visitor or
   crawler sees changes yet.
   ========================================================================== */
"use strict";

require("dotenv").config({ path: require("node:path").join(__dirname, ".env") });

const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");

const { ROOT } = require("./lib/paths");
const content = require("./lib/content");
const render = require("./lib/render");
const leads = require("./lib/leads");
const createCatalogRouter = require("./catalog");
const catalogSitemap = require("./catalog/sitemap");

const PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3000;

/* cPanel's stderr.log carries no timestamps of its own. */
for (const level of ["error", "warn"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => orig("[" + new Date().toISOString() + "]", ...args);
}

/* Log, never crash: one bad promise must not take the whole site down. */
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

const app = express();
app.disable("x-powered-by");

/* LiteSpeed terminates TLS in front of us. Without this req.secure is false and
   a secure session cookie is silently never set (Housing lost a day to it). */
app.set("trust proxy", 1);

/* Canonical host + https, production only (locally it would redirect-loop). */
if (PROD && process.env.CANONICAL_HOST) {
  app.use((req, res, next) => {
    const host = process.env.CANONICAL_HOST;
    if (req.hostname !== host || !req.secure) {
      return res.redirect(301, "https://" + host + req.originalUrl);
    }
    next();
  });
}

/* CSP is report-only for now: the page carries inline handlers and loads
   Three.js from cdnjs. Tighten once Phase 3 has moved logic out of inline
   attributes. The other helmet headers are enforced. */
app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"],
      // Meaningless in a report-only policy; Chrome logs a warning for it.
      upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false,
  // helmet's default is no-referrer, which strips referral data to the sister
  // sites and makes Chrome send Origin: null on form navigations — the bug
  // that locked the PHP login out earlier.
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // No includeSubDomains: one plain-HTTP subdomain would stop loading.
  hsts: { maxAge: 15552000, includeSubDomains: false },
}));
app.use(compression());

/* ---------------------------------------------------------------- routes */

/* The home page, rendered with the CMS content already applied. */
function sendHome(req, res, next) {
  try {
    res.set("Cache-Control", "no-cache");
    res.type("html").send(render.home());
  } catch (err) {
    next(err);
  }
}
app.get("/", sendHome);
app.get("/index.html", sendHome);

/* In database mode the static data/content.json on disk is stale, yet
   apply.js in the browser re-applies whatever that URL returns — it would
   paint the old file over the server-rendered database content. Serve the
   live content object at the same URL instead. */
if (content.SOURCE === "db") {
  app.get("/data/content.json", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(content.load());
  });
}

/* Ported PHP handlers, kept at their old URLs so no markup has to change. */
const leadBody = [
  express.urlencoded({ extended: false, limit: "16kb" }),
  express.json({ limit: "16kb" }),
];
app.post("/lead.php", leadBody, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const out = await leads.record(req.body, { ip: req.ip, agent: req.get("user-agent") });
    res.json({ ok: true, stored: out.stored });
  } catch (err) {
    if (err instanceof leads.LeadError) {
      return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
    }
    console.error("lead.php:", err);
    res.status(500).json({ ok: false, error: "server", message: "Could not save that just now." });
  }
});
app.all("/lead.php", (req, res) =>
  res.status(405).json({ ok: false, error: "method", message: "POST required." }));

/* Page-view counter. The PHP version counted one hit per PHP session; a
   session cookie gives the same "once per browser visit" behaviour. */
const COUNTER_FILE = path.join(ROOT, "counter.txt");
app.get("/counter.php", (req, res) => {
  res.set("Cache-Control", "no-store");
  let count = 0;
  try { count = parseInt(fs.readFileSync(COUNTER_FILE, "utf8"), 10) || 0; } catch { /* first hit */ }
  if (!/(?:^|;\s*)bs_seen=1/.test(req.get("cookie") || "")) {
    count += 1;
    try { fs.writeFileSync(COUNTER_FILE, String(count)); } catch (err) { console.error("counter:", err); }
    res.cookie("bs_seen", "1", { httpOnly: true, sameSite: "lax", secure: req.secure });
  }
  res.json({ views: count });
});

/* Server-rendered catalogue: /products, /products/:modelCode, /category/:key.
   Built in server/catalog/ (Antigravity's lane). Unknown slugs call next(),
   so they fall through to the HTML 404 below. */
app.use(createCatalogRouter({ getContent: content.load }));

/* Sitemap: the home page plus every catalogue URL, generated from the same
   content the pages render from, so it can never list a page that 404s.
   On the host the static sitemap.xml on disk answers first — it has to be
   removed at cutover for this route to take over. */
function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
app.get("/sitemap.xml", (req, res, next) => {
  try {
    const data = content.load();
    let origin = "https://www.bongshaisteel.com";
    try { origin = new URL(data.seo && data.seo.canonical).origin; } catch { /* keep default */ }
    const today = new Date().toISOString().slice(0, 10);
    const homeMod = typeof data.updated === "string" ? data.updated.slice(0, 10) : today;

    const entries = [
      { loc: origin + "/", lastmod: homeMod, changefreq: "weekly", priority: "1.0" },
      ...catalogSitemap({ baseUrl: origin, getContent: () => data }),
    ];
    const body = entries.map((e) =>
      "  <url>\n" +
      "    <loc>" + xmlEscape(e.loc) + "</loc>\n" +
      (e.lastmod ? "    <lastmod>" + xmlEscape(e.lastmod) + "</lastmod>\n" : "") +
      (e.changefreq ? "    <changefreq>" + e.changefreq + "</changefreq>\n" : "") +
      (e.priority ? "    <priority>" + e.priority + "</priority>\n" : "") +
      "  </url>").join("\n");

    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + "\n</urlset>\n");
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------- static */

/* Node does not execute PHP: without this, the CMS source and its config
   would be handed out as plain text. Also keeps build/tooling dirs private. */
/* The public page itself loads the dormant visual editor, so those two files
   are the only part of /admin that is public. */
const PUBLIC_ADMIN = /^\/admin\/editor\.(?:js|css)$/i;
const PRIVATE = [
  /^\/admin(?:\/|$)/i,
  /^\/server(?:\/|$)/i,
  /^\/tools(?:\/|$)/i,
  /^\/node_modules(?:\/|$)/i,
  /^\/data\/leads\.json$/i,
  /\.php$/i,
  /(?:^|\/)\./,          // dotfiles and dot-directories (.git, .env, .htaccess)
];
app.use((req, res, next) => {
  let p;
  try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
  if (!PUBLIC_ADMIN.test(p) && PRIVATE.some((re) => re.test(p))) return notFound(req, res);
  next();
});

const LONG = /\.(?:webp|png|jpe?g|gif|svg|ico|woff2?|ttf|otf)$/i;
app.use(express.static(ROOT, {
  index: false,
  dotfiles: "ignore",
  setHeaders(res, file) {
    // Images and fonts are safe to cache; js/css/json/html are not versioned
    // yet, so they revalidate on every load (ETag keeps that cheap).
    res.set("Cache-Control", LONG.test(file) ? "public, max-age=604800" : "no-cache");
  },
}));

/* ---------------------------------------------------------------- errors */

/* An HTML 404, not JSON: cPanel's availability probe trips on a content-type
   mismatch. Serve the site's own 404 page when there is one. */
const PAGE_404 = path.join(ROOT, "404.html");
function notFound(req, res) {
  res.status(404);
  if (fs.existsSync(PAGE_404)) return res.sendFile(PAGE_404);
  res.type("html").send("<!doctype html><title>Not found</title><h1>Page not found</h1>");
}
app.use(notFound);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Body-parser refusals are the client's fault, not ours: answer them with
  // their own status, in the JSON shape lead.php has always used.
  if (err && (err.type === "entity.too.large" || err.type === "entity.parse.failed")) {
    const big = err.type === "entity.too.large";
    return res.status(big ? 413 : 400).json({
      ok: false,
      error: big ? "too_big" : "bad_body",
      message: big ? "That message is too long." : "That request could not be read.",
    });
  }
  console.error("error:", err);
  res.status(500).type("html").send("<!doctype html><title>Error</title><h1>Something went wrong</h1>");
});

if (require.main === module) {
  // Load the content before taking traffic. init() resolves even when the
  // database is down (it falls back to the file), so this never blocks boot.
  content.init().then((info) => {
    app.listen(PORT, () => console.log("Bongshai Steel listening on " + PORT + ", content from " + info.source));
  });
}

module.exports = app;
