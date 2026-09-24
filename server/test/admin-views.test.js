/* ==========================================================================
   ADMIN TEMPLATES x REAL ROUTES x REAL DATABASE
     ADMIN_VIEWS=<dir containing admin/> node test/admin-views.test.js
   (defaults to server/views)

   test/admin.test.js checks the routes with stub templates; the templates
   carry their own fixture-based verify.js. This checks the join: the real
   templates rendered by the real routes over the real database, with the
   forms parsed out of the rendered HTML and submitted as a browser would —
   so every field name and action URL in the contract is exercised for real.
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

const VIEWS = process.env.ADMIN_VIEWS || path.join(__dirname, "..", "views");
const USER = "zz_test_views";
const PASS = "Test-Password-123";
const CODE = "ZZ-VIEW-001";
const HOSTILE = '</script><script>alert(1)</script>"><img src=x onerror=alert(2)>';

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

/** Every POST form on a page: action, and the fields a browser would submit. */
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
        if (type === "checkbox" || type === "radio") { if (e.attr("checked") !== undefined) fields[name] = e.attr("value") || "on"; return; }
        if (el.tagName === "select") { fields[name] = e.find("option[selected]").attr("value") ?? e.find("option").first().attr("value") ?? ""; return; }
        fields[name] = el.tagName === "textarea" ? e.text() : (e.attr("value") ?? "");
      });
      return { action: $(f).attr("action") || "", fields, csrfCount: $(f).find('input[name="_csrf"]').length };
    });
}

/** The payload must never survive as live markup. */
function injected(html) {
  const $ = cheerio.load(html);
  const scripts = $("script").toArray().map((s) => $(s).html() || "");
  return scripts.some((s) => s.includes("alert(1)")) || $("img[onerror]").length > 0 || /<img src=x onerror/i.test(html);
}

async function main() {
  await db("admin_users").where({ username: USER }).del();
  await db("admin_users").insert({ username: USER, password_hash: await bcrypt.hash(PASS, 10), role: "admin", name: "View <b>Tester</b>" });
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
    /* sign in through the rendered login form */
    let r = await go("GET", "/admin/login");
    check(r.status === 200, "login page renders", r.status + " " + r.html.slice(0, 120));
    let f = forms(r.html).find((x) => x.action === "/admin/login");
    check(f && f.csrfCount === 1 && "username" in f.fields && "password" in f.fields, "login form: action, fields and one _csrf", JSON.stringify(f));
    r = await go("POST", f.action, { ...f.fields, username: USER, password: PASS });
    check(r.status === 302 && r.location === "/admin", "signing in through that form works", r.status + " " + r.location);

    /* every page renders, and every POST form on it carries the live token */
    for (const url of ["/admin", "/admin/products", "/admin/products?q=BH-IS&category=factory", "/admin/products/new"]) {
      r = await go("GET", url);
      const fs_ = forms(r.html);
      check(r.status === 200 && !/RENDER ERROR/.test(r.html) && fs_.length && fs_.every((x) => x.csrfCount === 1 && x.fields._csrf && x.fields._csrf.length === 48),
        "renders with a live _csrf on every POST form: " + url, r.status + " " + r.html.slice(0, 160));
    }

    r = await go("GET", "/admin");
    check(r.html.includes("View &lt;b&gt;Tester&lt;/b&gt;") && !r.html.includes("View <b>Tester</b>"), "the admin's display name is escaped", r.html.match(/View[^<]{0,40}/));
    check(r.html.includes('href="/admin/users"'), "an admin sees the Users link");

    /* create a product through the rendered form, with hostile text */
    r = await go("GET", "/admin/products/new");
    f = forms(r.html).find((x) => x.action === "/admin/products");
    check(f && ["model_code", "name", "slug", "category_id", "description", "image", "sort_order"].every((k) => k in f.fields),
      "new-product form carries every contract field", f && Object.keys(f.fields).join(","));
    check(f && ["on","1","true"].includes(f.fields.published) && !f.fields.featured, "  published is ticked by default, featured is not", f && JSON.stringify({ p: f.fields.published, fe: f.fields.featured }));
    const catId = String((await db("categories").where({ key: "factory" }).first("id")).id);
    r = await go("POST", f.action, { ...f.fields, model_code: CODE, name: HOSTILE, description: HOSTILE,
      category_id: catId, image: "images/products/Model No-BH-IS-1001.webp", sort_order: "998" });
    check(r.status === 302, "submitting it creates the product", r.status + " " + r.html.slice(0, 200));
    const row = await db("products").where({ model_code: CODE }).first();
    check(row && row.name === HOSTILE, "  stored exactly as typed");

    /* the hostile text never becomes markup, anywhere it is shown */
    r = await go("GET", "/admin/products?q=" + CODE);
    check(r.html.includes(CODE) && !injected(r.html), "product list shows it, escaped", injected(r.html) ? "INJECTED" : "not listed");
    const thumb = cheerio.load(r.html)("img").filter((_, e) => /BH-IS-1001/.test(cheerio.load(r.html)(e).attr("src") || "")).first().attr("src");
    check(!thumb || thumb === "/images/products/Model%20No-BH-IS-1001.webp", "  thumbnail path is URL-encoded", thumb);

    r = await go("GET", "/admin/products/" + row.id + "/edit");
    check(r.status === 200 && !injected(r.html), "edit form shows it, escaped", r.status);
    const ef = forms(r.html);
    const edit = ef.find((x) => x.action === "/admin/products/" + row.id);
    const del = ef.find((x) => x.action === "/admin/products/" + row.id + "/delete");
    check(edit && edit.fields.name === HOSTILE && edit.fields.model_code === CODE && edit.fields.category_id === catId,
      "  and the form round-trips every value exactly", edit && JSON.stringify({ n: edit.fields.name.slice(0, 30), c: edit.fields.category_id }));
    check(edit && edit.fields.image === "images/products/Model No-BH-IS-1001.webp", "  including an image path with spaces", edit && edit.fields.image);
    check(del && del.csrfCount === 1, "  and a separate delete form with its own _csrf", JSON.stringify(del));

    /* resubmit the edit form unchanged: must succeed (the image-with-spaces trap) */
    r = await go("POST", edit.action, edit.fields);
    check(r.status === 302, "saving the edit form unchanged succeeds", r.status + " " + (r.html.match(/error[^<]{0,120}/i) || [""])[0]);

    /* a validation error re-renders the form with the message, escaped */
    r = await go("POST", edit.action, { ...edit.fields, model_code: "bad code <b>" });
    check(r.status === 422 && /Model code/.test(r.html) && !r.html.includes("bad code <b>"), "a validation error shows, with the bad input escaped", r.status);
    const refill = forms(r.html).find((x) => x.action === edit.action);
    check(refill && refill.fields.published === edit.fields.published && refill.fields.featured === edit.fields.featured,
      "  and the refilled form keeps Published/Featured as they were", refill && JSON.stringify({ p: refill.fields.published, f: refill.fields.featured }));

    r = await go("GET", "/admin");
    check(!injected(r.html), "dashboard activity feed stays escaped", "INJECTED");

    /* delete through the rendered delete form */
    r = await go("POST", del.action, del.fields);
    check(r.status === 302 && !(await db("products").where({ id: row.id }).first()), "the delete form deletes", r.status);

    /* messages inbox, detail and activity (T-002) */
    const [leadId] = await db("leads").insert({
      public_id: "zz-view-lead", kind: "quote", status: "new", name: HOSTILE, company: HOSTILE,
      phone: "javascript:alert(1)//+880 1711-000000", message: "first line\n" + HOSTILE + "\nlast line",
      model_code: "BH-IS-1001",
    });
    r = await go("GET", "/admin/leads?q=" + encodeURIComponent("javascript:alert"));
    const $l = cheerio.load(r.html);
    check(r.status === 200 && !/RENDER ERROR/.test(r.html) && !injected(r.html), "inbox renders the hostile lead escaped", r.status + " " + r.html.slice(0, 120));
    const was = $l('a[href*="wa.me"]').map((_, e) => $l(e).attr("href")).get();
    check(was.length > 0 && was.every((h) => /^https:\/\/wa\.me\/\d+$/.test(h)), "  WhatsApp links carry digits only", was.join(" | "));
    check($l('a[href^="javascript:"]').length === 0, "  and no javascript: link exists anywhere");
    r = await go("GET", "/admin/leads?status=new&kind=quote&q=" + encodeURIComponent("a&b c"));
    const csvHref = cheerio.load(r.html)('a[href^="/admin/leads.csv"]').attr("href") || "";
    const cu = new URL(csvHref, "http://x");
    check(cu.searchParams.get("status") === "new" && cu.searchParams.get("kind") === "quote" && cu.searchParams.get("q") === "a&b c",
      "  the CSV link carries the current filters, encoded", csvHref);

    r = await go("GET", "/admin/leads/" + leadId);
    check(r.status === 200 && !injected(r.html), "message detail renders the hostile lead escaped", r.status);
    check(/pre-wrap/.test(r.html), "  the message keeps its line breaks (pre-wrap)");
    let lf = forms(r.html);
    const upd = lf.find((x) => x.action === "/admin/leads/" + leadId);
    const ldel = lf.find((x) => x.action === "/admin/leads/" + leadId + "/delete");
    check(upd && upd.csrfCount === 1 && upd.fields.status === "new" && "note" in upd.fields, "  update form: current status selected, note field, one _csrf", JSON.stringify(upd));
    check(ldel && ldel.csrfCount === 1, "  an admin gets the delete form");
    r = await go("POST", upd.action, { ...upd.fields, status: "quoted", note: "rang " + HOSTILE });
    const lrow = await db("leads").where({ id: leadId }).first();
    check(r.status === 302 && lrow.status === "quoted" && lrow.note === "rang " + HOSTILE, "submitting it saves status and note", r.status + " " + lrow.status);
    r = await go("GET", "/admin/leads/" + leadId);
    check(!injected(r.html) && forms(r.html).find((x) => x.action === upd.action).fields.status === "quoted", "  the saved note shows escaped and the new status is selected");

    r = await go("GET", "/admin/activity");
    check(r.status === 200 && !/RENDER ERROR/.test(r.html) && !injected(r.html), "activity log renders, the hostile name in summaries escaped", r.status);
    r = await go("GET", "/admin/activity?page=1&action=lead.update");
    check(r.status === 200 && !cheerio.load(r.html)('a[href*="page=0"]').length, "  no link to a page before the first");

    r = await go("POST", ldel.action, ldel.fields);
    check(r.status === 302 && !(await db("leads").where({ id: leadId }).first()), "the delete form deletes the message", r.status);

    /* sign out through the rendered sign-out form */
    r = await go("GET", "/admin");
    const out = forms(r.html).find((x) => x.action === "/admin/logout");
    check(out && out.csrfCount === 1, "the layout's sign-out is a POST form with _csrf", JSON.stringify(out));
    r = await go("POST", out.action, out.fields);
    check(r.status === 302 && r.location === "/admin/login", "and it signs out", r.status + " " + r.location);
  } finally {
    server.close();
    await db("products").where({ model_code: CODE }).del();
    await db("leads").where({ public_id: "zz-view-lead" }).del();
    const ids = await db("admin_users").where({ username: USER }).pluck("id");
    if (ids.length) await db("activity_log").whereIn("admin_user_id", ids).del();
    await db("activity_log").where("summary", "like", "%" + CODE + "%").del();
    await db("admin_users").where({ username: USER }).del();
    await content.bumpRev(); await content.refresh();
    auth._resetThrottle();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => db.destroy());
