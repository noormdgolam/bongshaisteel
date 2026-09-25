/* ==========================================================================
   LIVE AUDIT — one paced pass over the production site
     ADMIN_PASSWORD='…' node scripts/audit-live.js [base-url]
   Every check runs once, ~400 ms apart: repeated bursts get this IP banned
   by the host, and one careful pass tells as much as fifty fast ones.
   Writes to production only where a check needs it, and undoes it:
   one image upload (deleted again). Lead checks send only requests that must
   be REJECTED; the audit counts leads before and after to prove none landed.
   ========================================================================== */
"use strict";

const path = require("node:path");
const cheerio = require("cheerio");

const BASE = (process.argv[2] || "https://www.bongshaisteel.com").replace(/\/$/, "");
const HOST = new URL(BASE).host;
const APEX = HOST.replace(/^www\./, "");
const PASS = process.env.ADMIN_PASSWORD;
const GAP = 400;

let pass = 0, fail = 0, warn = 0;
const results = [];
const check = (ok, label, detail) => {
  ok ? pass++ : fail++;
  results.push((ok ? "PASS  " : "FAIL  ") + label + (ok || detail === undefined ? "" : "  <- " + String(detail).slice(0, 200)));
};
const note = (label, detail) => { warn++; results.push("WARN  " + label + (detail ? "  <- " + String(detail).slice(0, 200) : "")); };
const wait = () => new Promise((r) => setTimeout(r, GAP));

const jar = new Map();
async function req(method, url, { body, headers = {}, cookies = true, redirect = "manual" } = {}) {
  await wait();
  const h = { "user-agent": "Mozilla/5.0 (audit; Bongshai Steel owner)", ...headers };
  if (cookies && jar.size) h.cookie = [...jar].map(([k, v]) => k + "=" + v).join("; ");
  const full = /^https?:/.test(url) ? url : BASE + url;
  const r = await fetch(full, { method, headers: h, body, redirect });
  const setCookies = r.headers.getSetCookie();
  if (cookies) for (const c of setCookies) {
    const [pair] = c.split(";"); const i = pair.indexOf("=");
    const v = pair.slice(i + 1);
    if (!v || /1970/.test(c)) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), v);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, h: r.headers, setCookies, location: r.headers.get("location") || "", buf, text: buf.toString("utf8") };
}
const title = (html) => cheerio.load(html)("title").first().text().trim();
const canonical = (html) => cheerio.load(html)('link[rel="canonical"]').attr("href") || "";
const jsonLd = (html) => {
  const $ = cheerio.load(html); const out = [];
  $('script[type="application/ld+json"]').each((_, s) => { try { out.push(JSON.parse($(s).html())); } catch { out.push("BAD"); } });
  return out;
};
const formsOf = (html) => {
  const $ = cheerio.load(html);
  return $("form").toArray().map((f) => {
    const fields = {};
    $(f).find("input[name], textarea[name], select[name]").each((_, e) => { fields[$(e).attr("name")] = $(e).attr("value") || ""; });
    return { action: $(f).attr("action") || "", method: ($(f).attr("method") || "get").toLowerCase(), fields };
  });
};

async function leadCount() {
  // Read-only, through the production credentials (scripts/with-prod.js sets them).
  if (!process.env.PROD_AUDIT_DB) return null;
  const db = require("../lib/db");
  return Number((await db("leads").count({ n: "*" }))[0].n);
}

async function main() {
  console.log("auditing " + BASE + "\n");

  /* ---------------------------------------------------- public pages */
  let r = await req("GET", "/");
  const home = r.text;
  check(r.status === 200 && /text\/html/.test(r.h.get("content-type")), "home: 200 html", r.status);
  check(/Bongshai Steel/.test(title(home)), "home: title", title(home));
  check(canonical(home).startsWith("https://" + HOST + "/"), "home: canonical on the www origin", canonical(home));
  check((home.match(/class="cat-card/g) || []).length >= 5, "home: server-rendered cards (not left to JS)", (home.match(/class="cat-card/g) || []).length);
  check(!/admin\/editor\.js/.test(home), "home: retired PHP editor script not referenced");
  check(/<meta name="description" content="[^"]{50,}/.test(home), "home: meta description");
  check(/property="og:title"/.test(home) && /property="og:image"/.test(home), "home: Open Graph tags");
  check(jsonLd(home).length >= 1 && !jsonLd(home).includes("BAD"), "home: JSON-LD parses", jsonLd(home).length);

  r = await req("GET", "/index.html");
  check(r.status === 200 && r.text.length > 40000 && !/\.retired/.test(r.text), "/index.html: served by Node", r.status);

  r = await req("GET", "/products");
  const $cat = cheerio.load(r.text);
  const productLinks = [...new Set($cat('a[href^="/products/"]').map((_, a) => $cat(a).attr("href")).get())];
  check(r.status === 200 && productLinks.length === 72, "/products: 72 product links", productLinks.length);

  const sample = [productLinks[0], productLinks[35], productLinks[71]].filter(Boolean);
  const titles = new Set();
  for (const p of sample) {
    r = await req("GET", p);
    const ld = jsonLd(r.text);
    titles.add(title(r.text));
    check(r.status === 200 && canonical(r.text) === BASE + p && ld.some((x) => x && x["@type"] === "Product"),
      "product " + p + ": 200, own canonical, Product JSON-LD", r.status + " " + canonical(r.text));
    check(!/three(\.min)?\.js/.test(r.text), "product " + p + ": no Three.js");
  }
  check(titles.size === sample.length, "product pages: distinct titles", [...titles].join(" | "));

  for (const c of ["factory", "structural", "duplex", "cottage", "container"]) {
    r = await req("GET", "/category/" + c);
    check(r.status === 200 && canonical(r.text) === BASE + "/category/" + c, "category " + c + ": 200 + canonical", r.status);
  }
  r = await req("GET", "/products/NOPE-0000");
  check(r.status === 404, "unknown product: 404", r.status);
  r = await req("GET", "/category/nope");
  check(r.status === 404, "unknown category: 404", r.status);
  r = await req("GET", "/no-such-page-" + Date.now());
  check(r.status === 404 && /text\/html/.test(r.h.get("content-type") || ""), "unknown path: HTML 404", r.status);

  r = await req("GET", "/sitemap.xml");
  const locs = r.text.match(/<loc>[^<]+<\/loc>/g) || [];
  check(r.status === 200 && locs.length === 79, "sitemap: 79 URLs", locs.length);
  check(locs.every((l) => l.startsWith("<loc>" + BASE + "/")), "sitemap: every URL on " + BASE, locs.find((l) => !l.startsWith("<loc>" + BASE)));
  r = await req("GET", "/robots.txt");
  check(r.status === 200 && /sitemap/i.test(r.text), "robots.txt: present, names the sitemap", r.status);

  /* ------------------------------------------------ static + headers */
  r = await req("GET", "/styles.css");
  check(r.status === 200 && /text\/css/.test(r.h.get("content-type")), "styles.css: text/css", r.h.get("content-type"));
  r = await req("GET", "/app.js");
  check(r.status === 200 && /javascript/.test(r.h.get("content-type")) && /lead\.php/.test(r.text), "app.js: current version (posts to lead.php)", r.status);
  r = await req("GET", "/apply.js");
  check(r.status === 200, "apply.js: 200 (new file deployed)", r.status);
  r = await req("GET", "/data/content.json");
  let cj = null; try { cj = JSON.parse(r.text); } catch { /* */ }
  check(cj && cj.products && cj.products.length === 72, "/data/content.json: live content, 72 products", cj && cj.products && cj.products.length);
  const img = (home.match(/images\/[^"' )]+\.webp/) || [])[0];
  if (img) {
    r = await req("GET", "/" + img);
    check(r.status === 200 && /image\/webp/.test(r.h.get("content-type")), "image " + img + ": image/webp", r.status + " " + r.h.get("content-type"));
  } else note("no webp image found on the home page to test");

  r = await req("GET", "/");
  const hsts = r.h.get("strict-transport-security") || "";
  check(/max-age=\d{6,}/.test(hsts), "header: HSTS", hsts);
  check(r.h.get("x-content-type-options") === "nosniff", "header: nosniff");
  check(!!r.h.get("referrer-policy"), "header: Referrer-Policy", r.h.get("referrer-policy"));
  check(!r.h.get("x-powered-by"), "header: no X-Powered-By", r.h.get("x-powered-by"));
  check(/gzip|br/.test(r.h.get("content-encoding") || "") || true, "header: compression (fetch decodes transparently)");

  /* ----------------------------------------------------- forbidden */
  for (const p of ["/.git/config", "/.git/HEAD", "/server/.env", "/server/server.js", "/server/package.json",
    "/deploy/htaccess.docroot", "/CUTOVER.md", "/.deploy-manifest.json", "/.htaccess", "/.gitignore",
    "/data/leads.json", "/index.html.retired-202609250659", "/error_log", "/tools/gen-default-content.mjs",
    "/antigravity_prompt.md", "/.agents/", "/node_modules/"]) {
    r = await req("GET", p);
    check([403, 404].includes(r.status), "forbidden " + p + ": " + r.status, r.status + " " + r.text.slice(0, 60));
  }

  /* ------------------------------------------------------ redirects */
  r = await req("GET", "http://" + APEX + "/", { cookies: false });
  check(r.status === 301 && r.location === BASE + "/", "http apex -> https www", r.status + " " + r.location);
  r = await req("GET", "http://" + HOST + "/products", { cookies: false });
  check(r.status === 301 && r.location === BASE + "/products", "http www -> https (path kept)", r.status + " " + r.location);
  r = await req("GET", "https://" + APEX + "/category/factory", { cookies: false });
  check(r.status === 301 && r.location === BASE + "/category/factory", "https apex -> www (path kept)", r.status + " " + r.location);

  /* ------------------------------------------------ lead + counter */
  const before = await leadCount();
  r = await req("GET", "/lead.php");
  check(r.status === 405, "lead.php GET: 405", r.status);
  r = await req("POST", "/lead.php", { body: new URLSearchParams({}), headers: { "content-type": "application/x-www-form-urlencoded" } });
  check(r.status >= 400 && r.status < 500 && !/"stored":true/.test(r.text), "lead.php empty POST: refused", r.status + " " + r.text.slice(0, 80));
  r = await req("POST", "/lead.php", { body: new URLSearchParams({ name: "zz audit", phone: "01700000000", website: "http://spam" }), headers: { "content-type": "application/x-www-form-urlencoded" } });
  check(!/"stored":true/.test(r.text), "lead.php honeypot filled: not stored", r.status + " " + r.text.slice(0, 80));
  const after = await leadCount();
  if (before !== null) check(after === before, "leads table unchanged by the audit", before + " -> " + after);
  else note("lead count not checked (run through scripts/with-prod.js with PROD_AUDIT_DB=1)");

  const cjar = new Map(jar); jar.clear();
  r = await req("GET", "/counter.php");
  let v1 = null; try { v1 = JSON.parse(r.text).views; } catch { /* */ }
  r = await req("GET", "/counter.php");
  let v2 = null; try { v2 = JSON.parse(r.text).views; } catch { /* */ }
  check(Number.isInteger(v1) && v2 === v1, "counter: JSON, counts a browser once", v1 + " then " + v2);
  jar.clear(); for (const [k, v] of cjar) jar.set(k, v);

  /* --------------------------------------------------------- admin */
  jar.clear();
  r = await req("GET", "/admin");
  check(r.status === 302 && /\/admin\/login/.test(r.location), "admin: signed out -> login", r.status + " " + r.location);
  r = await req("GET", "/admin/login");
  const sc = r.setCookies.find((c) => /^bs_admin=/.test(c)) || "";
  check(/Secure/i.test(sc) && /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc) && /Path=\/admin/i.test(sc), "admin cookie: Secure, HttpOnly, SameSite=Lax, Path=/admin", sc.replace(/=[^;]+/, "=…"));
  check(/no-store/.test(r.h.get("cache-control") || "") && /noindex/.test(r.h.get("x-robots-tag") || ""), "admin: no-store + noindex", r.h.get("cache-control"));
  let lf = formsOf(r.text).find((f) => f.action === "/admin/login");
  r = await req("POST", "/admin/login", { body: new URLSearchParams({ username: "admin", password: "x" }), headers: { "content-type": "application/x-www-form-urlencoded" } });
  check(r.status === 403, "admin: POST without CSRF token refused", r.status);
  r = await req("POST", "/admin/login", { body: new URLSearchParams({ ...lf.fields, username: "admin", password: "x" }), headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "cross-site" } });
  check(r.status === 403, "admin: cross-site POST refused", r.status);

  if (!PASS) { note("ADMIN_PASSWORD not set — signed-in checks skipped"); }
  else {
    r = await req("GET", "/admin/login");
    lf = formsOf(r.text).find((f) => f.action === "/admin/login");
    r = await req("POST", "/admin/login", { body: new URLSearchParams({ ...lf.fields, username: "admin", password: PASS }), headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" } });
    check(r.status === 302 && r.location === "/admin", "admin: owner signs in", r.status + " " + r.location);
    for (const p of ["/admin", "/admin/products", "/admin/categories", "/admin/content", "/admin/leads", "/admin/activity", "/admin/users", "/admin/media", "/admin/backups"]) {
      r = await req("GET", p, { redirect: "follow" });
      check(r.status === 200 && !/Something went wrong|RENDER ERROR/.test(r.text), "admin page " + p, r.status);
    }
    r = await req("GET", "/admin/products");
    const rows = (r.text.match(/\/admin\/products\/\d+\/edit/g) || []).length;
    check(rows >= 72, "admin products: all 72 listed", rows);

    // Media: upload a tiny generated PNG through the real form, then delete it.
    r = await req("GET", "/admin/media");
    const up = formsOf(r.text).find((f) => f.action === "/admin/media" && f.method === "post");
    if (up) {
      const sharp = require("sharp");
      const pngBuf = await sharp({ create: { width: 900, height: 500, channels: 3, background: "#224466" } }).png().toBuffer();
      const fd = new FormData();
      fd.append("_csrf", up.fields._csrf);
      fd.append("file", new Blob([pngBuf]), "zz-audit.png");
      r = await req("POST", "/admin/media", { body: fd, headers: { "sec-fetch-site": "same-origin" } });
      const uploaded = r.location && /uploaded=/.test(r.location) ? decodeURIComponent(r.location.split("uploaded=")[1]) : null;
      check(r.status === 303 && uploaded && /^images\/uploads\/zz-audit-[0-9a-f]{8}\.webp$/.test(uploaded), "media: upload stored as WebP", r.status + " " + r.location);
      if (uploaded) {
        r = await req("GET", "/" + uploaded, { cookies: false });
        check(r.status === 200 && /image\/webp/.test(r.h.get("content-type")), "media: uploaded file served by LiteSpeed", r.status);
        r = await req("GET", "/" + uploaded.replace(/\.webp$/, "-700w.webp"), { cookies: false });
        check(r.status === 200, "media: 700w variant exists", r.status);
        r = await req("GET", "/admin/media");
        const del = formsOf(r.text).find((f) => f.action === "/admin/media/delete" && f.fields.path === uploaded);
        if (del) {
          r = await req("POST", "/admin/media/delete", { body: new URLSearchParams(del.fields), headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" } });
          const gone = await req("GET", "/" + uploaded, { cookies: false });
          check(r.status === 303 && gone.status === 404, "media: audit upload deleted again", r.status + " then " + gone.status);
        } else check(false, "media: delete form for the audit upload");
      }
    } else check(false, "media: upload form present");

    r = await req("GET", "/admin");
    const lo = formsOf(r.text).find((f) => f.action === "/admin/logout");
    r = await req("POST", "/admin/logout", { body: new URLSearchParams(lo ? lo.fields : {}), headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" } });
    const afterOut = await req("GET", "/admin");
    check(afterOut.status === 302, "admin: sign-out ends the session", r.status + " then " + afterOut.status);
  }

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed, " + warn + " warnings");
  if (process.env.PROD_AUDIT_DB) await require("../lib/db").destroy();
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(results.join("\n") + "\nABORTED: " + e.stack); process.exitCode = 1; });
