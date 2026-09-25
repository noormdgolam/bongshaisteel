/* ==========================================================================
   CONTENT EDITOR — real templates x real routes x real database
     node test/admin-content.test.js
   Forms are parsed out of the rendered pages and submitted as a browser
   would. The site-copy snapshot and every row this test creates are restored
   or removed at the end, pass or fail.
   ========================================================================== */
"use strict";

process.env.CONTENT_SOURCE = "db";

const path = require("node:path");
const express = require("express");
const nunjucks = require("nunjucks");
const cheerio = require("cheerio");
const bcrypt = require("bcryptjs");

const db = require("../lib/db");
const content = require("../lib/content");
const auth = require("../lib/auth");
const createAdminRouter = require("../routes/admin");
const { SECTIONS } = require("../lib/content-sections");

const VIEWS = process.env.ADMIN_VIEWS || path.join(__dirname, "..", "views");
const USERS = { admin: "zz_test_content", sales: "zz_test_content_sales" };
const PASS = "Test-Password-123";
const TAG = "ZZ-CONTENT-TEST";
const XSS = '</textarea><script>alert(1)</script><img src=x onerror=alert(2)>';

let pass = 0, fail = 0;
const check = (ok, label, detail) => {
  ok ? pass++ : fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label + (ok || detail === undefined ? "" : "\n        " + String(detail).slice(0, 260)));
};

function client(base) {
  const jar = new Map();
  return async (method, url, form) => {
    const headers = {};
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => k + "=" + v).join("; ");
    let body;
    if (form) { body = new URLSearchParams(form).toString(); headers["content-type"] = "application/x-www-form-urlencoded"; }
    const r = await fetch(base + url, { method, headers, body, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";"); const i = pair.indexOf("=");
      const v = pair.slice(i + 1);
      if (!v || /1970/.test(c)) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), v);
    }
    return { status: r.status, location: r.headers.get("location"), html: await r.text() };
  };
}

function forms(html) {
  const $ = cheerio.load(html);
  return $("form").toArray()
    .filter((f) => ($(f).attr("method") || "get").toLowerCase() === "post")
    .map((f) => {
      const fields = {};
      $(f).find("input, textarea, select").each((_, el) => {
        const e = $(el), name = e.attr("name");
        if (!name || e.attr("disabled") !== undefined) return;
        const type = (e.attr("type") || "").toLowerCase();
        if (type === "checkbox" || type === "radio") { if (e.attr("checked") !== undefined) fields[name] = e.attr("value") ?? "on"; return; }
        if (el.tagName === "select") { fields[name] = e.find("option[selected]").attr("value") ?? e.find("option").first().attr("value") ?? ""; return; }
        fields[name] = el.tagName === "textarea" ? e.text() : (e.attr("value") ?? "");
      });
      return { action: $(f).attr("action") || "", fields, csrfCount: $(f).find('input[name="_csrf"]').length };
    });
}

function injected(html) {
  const $ = cheerio.load(html);
  return $("script").toArray().some((s) => ($(s).html() || "").includes("alert(1)")) || $("img[onerror]").length > 0;
}

async function signIn(go, username) {
  const f = forms((await go("GET", "/admin/login")).html).find((x) => x.action === "/admin/login");
  return go("POST", f.action, { ...f.fields, username, password: PASS });
}

async function main() {
  const snapshot = await db("site_content").select("section", "data");
  const hash = await bcrypt.hash(PASS, 10);
  for (const [role, username] of Object.entries(USERS)) {
    await db("admin_users").where({ username }).del();
    await db("admin_users").insert({ username, password_hash: hash, role, name: "Content " + role });
  }
  await content.refresh();

  const app = express();
  app.set("trust proxy", 1);
  require("../lib/view-filters").register(nunjucks.configure(VIEWS, { autoescape: true, express: app, noCache: true }));
  app.set("view engine", "njk");
  app.use(createAdminRouter({ db, content }));
  app.use((req, res) => res.status(404).send("SITE 404"));
  app.use((err, req, res, next) => res.status(500).send("RENDER ERROR: " + err.message));
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const go = client(base);

  try {
    await signIn(go, USERS.admin);

    /* ---------------------------------------------------- site copy */
    let r = await go("GET", "/admin/content");
    check(r.status === 302 && r.location === "/admin/content/site", "/admin/content goes to the site copy page", r.status + " " + r.location);

    r = await go("GET", "/admin/content/site");
    check(r.status === 200 && !/RENDER ERROR/.test(r.html), "site copy page renders", r.status + " " + r.html.slice(0, 160));
    const siteForms = forms(r.html).filter((x) => x.action === "/admin/content/site");
    check(siteForms.length === 1 && siteForms[0].csrfCount === 1, "exactly one site form, with one _csrf", siteForms.length);
    const site = siteForms[0];
    const names = Object.keys(site.fields);
    check(["text.hero.title", "html.hero.byline", "settings.hotline", "settings.whatsappNumber", "seo.title", "seo.canonical", "safety.intro"]
      .every((n) => names.includes(n)), "field names keep their dots, every group present", names.slice(0, 8).join(", "));
    check(!names.some((n) => /sisterLinks/.test(n)), "the sister-links list is not flattened into a text field");

    // The strictest round trip: submit the form untouched — any value the template
    // altered (whitespace, entities, a lost newline) would show up as a change.
    r = await go("POST", site.action, site.fields);
    check(r.status === 302 && /Nothing(%20| )had(%20| )changed/.test(r.location), "submitting the site form untouched changes nothing", r.location);

    const origTitle = site.fields["text.hero.title"];
    r = await go("POST", site.action, { ...site.fields, "text.hero.title": TAG + " " + XSS, "text.evil.newkey": "x", "html.hero.byline": "ok <b>b</b>" + XSS });
    check(r.status === 302 && /Saved/.test(r.location), "a changed title saves", r.location);
    let c = content.load();
    check(c.text["hero.title"] === TAG + " " + XSS, "  and the live content has it at once, as typed (it is escaped on render)");
    check(!("evil.newkey" in c.text), "  a field the form never offered is ignored, not created");
    check(c.html["hero.byline"] === "ok <b>b</b>" && !/script|onerror/.test(c.html["hero.byline"]), "  an html field is sanitised on save", c.html["hero.byline"]);
    r = await go("GET", "/admin/content/site");
    check(!injected(r.html), "  and the page showing it back stays escaped");

    r = await go("POST", site.action, { ...site.fields, "seo.canonical": "javascript:alert(1)" });
    check(r.status === 422 && /Canonical/.test(r.html), "a non-https canonical is refused", r.status);
    const kept = forms(r.html).find((x) => x.action === "/admin/content/site");
    check(kept && kept.fields["seo.canonical"] === "javascript:alert(1)", "  and the form shows what was typed", kept && kept.fields["seo.canonical"]);
    check(content.load().seo.canonical !== "javascript:alert(1)", "  and nothing was saved");

    await go("POST", site.action, { ...site.fields, "text.hero.title": origTitle });

    /* ------------------------------------------------------ sections */
    for (const s of SECTIONS) {
      r = await go("GET", "/admin/content/" + s.key);
      check(r.status === 200 && !/RENDER ERROR/.test(r.html), "section list renders: " + s.key, r.status + " " + r.html.slice(0, 120));
    }
    r = await go("GET", "/admin/content/nonsense");
    check(r.status === 404, "an unknown section is a 404", r.status);

    // FAQ: create through the rendered form, with hostile HTML in the answer
    r = await go("GET", "/admin/content/faqs/new");
    let f = forms(r.html).find((x) => x.action === "/admin/content/faqs");
    check(f && "question" in f.fields && "answer" in f.fields && f.csrfCount === 1, "FAQ form carries the schema's fields and a _csrf", f && Object.keys(f.fields).join(","));
    check(f && ["1", "on", "true"].includes(f.fields.published), "  published is ticked by default", f && f.fields.published);
    r = await go("POST", f.action, { ...f.fields, question: TAG + " Q " + XSS, answer: "Yes. <strong>Really</strong>" + XSS });
    check(r.status === 302, "a FAQ is added through it", r.status + " " + r.html.slice(0, 160));
    const faq = await db("faqs").where("question", "like", TAG + "%").first();
    check(faq && faq.answer === "Yes. <strong>Really</strong>" && faq.question === TAG + " Q " + XSS, "  the answer is sanitised, the question stored as typed", faq && faq.answer);
    check(content.load().sections.faq.some((x) => x.q.startsWith(TAG)), "  and the public FAQ has it immediately");

    r = await go("GET", "/admin/content/faqs");
    check(!injected(r.html), "the FAQ list shows it escaped");
    const moves = forms(r.html).filter((x) => /\/move$/.test(x.action));
    const ids = [...new Set(moves.map((x) => x.action.split("/")[4]))];
    check(moves.every((x) => x.csrfCount === 1), "every move form has a _csrf", moves.length);
    const firstId = ids[0], lastId = ids[ids.length - 1];
    check(!moves.some((x) => x.action.includes("/" + firstId + "/") && x.fields.direction === "up"), "no move-up on the first row");
    check(!moves.some((x) => x.action.includes("/" + lastId + "/") && x.fields.direction === "down"), "no move-down on the last row");

    const up = moves.find((x) => x.action === "/admin/content/faqs/" + faq.id + "/move" && x.fields.direction === "up");
    const before = (await db("faqs").orderBy("sort_order").orderBy("id").pluck("id")).indexOf(faq.id);
    r = await go("POST", up.action, up.fields);
    const after = (await db("faqs").orderBy("sort_order").orderBy("id").pluck("id")).indexOf(faq.id);
    check(r.status === 302 && after === before - 1, "move-up moves it one place", before + " -> " + after);

    r = await go("GET", "/admin/content/faqs/" + faq.id + "/edit");
    f = forms(r.html).find((x) => x.action === "/admin/content/faqs/" + faq.id);
    check(f && f.fields.question === TAG + " Q " + XSS && f.fields.answer === "Yes. <strong>Really</strong>" && !injected(r.html),
      "edit form round-trips the stored values, escaped", f && JSON.stringify({ q: f.fields.question.slice(0, 40), a: f.fields.answer }));
    const { published, ...unticked } = f.fields;
    r = await go("POST", f.action, unticked);
    check(r.status === 302 && !(await db("faqs").where({ id: faq.id }).first()).published, "unticking Published saves as unpublished", r.status);
    check(!content.load().sections.faq.some((x) => x.q.startsWith(TAG)), "  and it leaves the public FAQ");

    r = await go("POST", f.action, { ...f.fields, question: "" });
    check(r.status === 422 && /Question is required/.test(r.html), "a required field left empty is refused with its label", r.status);

    const del = forms((await go("GET", "/admin/content/faqs/" + faq.id + "/edit")).html).find((x) => x.action.endsWith("/delete"));
    r = await go("POST", del.action, del.fields);
    check(r.status === 302 && !(await db("faqs").where({ id: faq.id }).first()), "the delete form deletes", r.status);

    // Team: the image field
    r = await go("GET", "/admin/content/team/new");
    f = forms(r.html).find((x) => x.action === "/admin/content/team");
    r = await go("POST", f.action, { ...f.fields, name: TAG + " Person", photo: "images/../admin/config.php" });
    check(r.status === 422 && /Photo/.test(r.html), "a path-traversal photo path is refused", r.status);
    r = await go("POST", f.action, { ...f.fields, name: TAG + " Person", role: "Engineer", photo: "images/products/Model No-BH-IS-1001.webp" });
    check(r.status === 302 && content.load().sections.team.some((m) => m.name === TAG + " Person"), "a team member with a photo path containing spaces saves and goes live", r.status);

    // stats: text beyond the column width is refused, not cut
    r = await go("GET", "/admin/content/stats/new");
    f = forms(r.html).find((x) => x.action === "/admin/content/stats");
    r = await go("POST", f.action, { ...f.fields, value: "x".repeat(101), label: TAG });
    check(r.status === 422 && /too long/.test(r.html), "text over the column width is refused, not silently cut", r.status);

    /* ------------------------------------------------------- roles */
    const s = client(base);
    await signIn(s, USERS.sales);
    r = await s("GET", "/admin/content/site");
    check(r.status === 403, "a sales user cannot open the content editor", r.status);
    r = await s("GET", "/admin");
    check(!r.html.includes('href="/admin/content"'), "  and does not see the Content link");
    r = await go("GET", "/admin");
    check(r.html.includes('href="/admin/content"'), "an admin does see it");
  } finally {
    server.close();
    // Put the site copy back exactly as it was, and remove every test row.
    await db.transaction(async (trx) => {
      for (const row of snapshot) await trx("site_content").where({ section: row.section }).update({ data: row.data });
    });
    await db("faqs").where("question", "like", TAG + "%").del();
    await db("team_members").where("name", "like", TAG + "%").del();
    await db("stats").where("label", TAG).del();
    const ids = await db("admin_users").whereIn("username", Object.values(USERS)).pluck("id");
    if (ids.length) await db("activity_log").whereIn("admin_user_id", ids).del();
    await db("admin_users").whereIn("username", Object.values(USERS)).del();
    await content.bumpRev(); await content.refresh();
    auth._resetThrottle();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => db.destroy());
