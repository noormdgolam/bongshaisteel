/* ==========================================================================
   PROJECTS — real templates x real routes x real database
     ADMIN_VIEWS=<views dir> node test/admin-projects.test.js
   Creates zz-test projects only and removes them at the end. Also checks the
   public /projects page picks the changes up and escapes what it shows.
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
const createAdminRouter = require("../routes/admin");
const createCatalogRouter = require("../catalog");

const VIEWS = process.env.ADMIN_VIEWS || path.join(__dirname, "..", "views");
const PASS = "Test-Password-123";
const U = { ed: "zz_test_ed", sales: "zz_test_sales" };
const XSS = '"><img src=x onerror=alert(1)><script>alert(1)</script>';

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
      const radios = {};
      $(f).find('input[type="radio"]').each((_, el) => { const n = $(el).attr("name"); (radios[n] = radios[n] || []).push($(el).attr("value")); });
      const selects = {};
      $(f).find("select").each((_, el) => { selects[$(el).attr("name")] = $(el).find("option").map((__, o) => $(o).attr("value")).get(); });
      return { action: $(f).attr("action") || "", fields, radios, selects, csrfCount: $(f).find('input[name="_csrf"]').length };
    });
}
const injected = (html) => { const $ = cheerio.load(html); return $("img[onerror]").length > 0 || $("script").toArray().some((s) => ($(s).html() || "").includes("alert(1)")); };

async function signIn(go, username) {
  const f = forms((await go("GET", "/admin/login")).html).find((x) => x.action === "/admin/login");
  return go("POST", f.action, { ...f.fields, username, password: PASS });
}

async function cleanup() {
  await db("projects").where("title", "like", "zz test%").del();
  const ids = await db("admin_users").where("username", "like", "zz_test_%").pluck("id");
  if (ids.length) {
    await db("activity_log").whereIn("admin_user_id", ids).del();
    for (const id of ids) await db("sessions").where("sess", "like", '%"adminUserId":' + id + ",%").del();
  }
  await db("admin_users").where("username", "like", "zz_test_%").del();
}

async function main() {
  await cleanup();
  const hash = await bcrypt.hash(PASS, 10);
  await db("admin_users").insert([
    { username: U.ed, password_hash: hash, role: "editor", name: "Test Editor" },
    { username: U.sales, password_hash: hash, role: "sales", name: "Test Sales" },
  ]);
  await content.refresh();

  const app = express();
  app.set("trust proxy", 1);
  require("../lib/view-filters").register(nunjucks.configure(VIEWS, { autoescape: true, express: app, noCache: true }));
  app.set("view engine", "njk");
  app.use(createAdminRouter({ db, content }));
  app.use(createCatalogRouter({
    getContent: content.load,
    getProjects: () => db("projects").where({ published: true }).orderBy("sort_order").orderBy("id"),
  }));
  app.use((req, res) => res.status(404).send("SITE 404"));
  app.use((err, req, res, next) => res.status(500).send("RENDER ERROR: " + err.message));
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;

  try {
    const ed = client(base), sales = client(base), anon = client(base);
    await signIn(ed, U.ed); await signIn(sales, U.sales);

    let r = await sales("GET", "/admin/projects");
    check(r.status === 403, "sales cannot open Projects", r.status);

    r = await ed("GET", "/admin/projects");
    const total = Number((await db("projects").count({ n: "*" }))[0].n);
    check(r.status === 200 && !/RENDER ERROR/.test(r.html), "an editor opens Projects", r.status + " " + r.html.slice(0, 140));
    check(r.html.includes("Bongshai Steel") && r.html.includes("Bongshai Engineering"), "  both groups are shown");
    const editLinks = (r.html.match(/\/admin\/projects\/\d+\/edit/g) || []).length;
    check(editLinks >= total, "  every project has an edit link", editLinks + " of " + total);

    r = await ed("GET", "/admin/projects/new");
    let f = forms(r.html).find((x) => x.action === "/admin/projects");
    check(f && f.csrfCount === 1, "new-project form with one _csrf", f && JSON.stringify(f.fields).slice(0, 150));
    const groupsOffered = f ? (f.radios.delivered_by || f.selects.delivered_by || []) : [];
    check(groupsOffered.includes("steel") && groupsOffered.includes("engineering"), "  who-delivered choices come from the routes", groupsOffered.join(","));

    r = await ed("POST", "/admin/projects", { ...f.fields, title: "", delivered_by: "steel" });
    check(r.status === 422, "a project without a title is refused", r.status);
    r = await ed("POST", "/admin/projects", { ...f.fields, title: "zz test bad group", delivered_by: "nasa" });
    check(r.status === 422, "an unknown group is refused", r.status);
    r = await ed("POST", "/admin/projects", { ...f.fields, title: "zz test bad image", delivered_by: "steel", image: "../server/.env" });
    check(r.status === 422 && !(await db("projects").where({ title: "zz test bad image" }).first()), "a photo path outside images/ is refused", r.status);

    r = await ed("POST", "/admin/projects", { ...f.fields, title: "zz test " + XSS, delivered_by: "steel", location: "Dhaka " + XSS,
      summary: XSS, image: "images/products/Model No-BH-IS-1001.webp", published: "1" });
    const created = await db("projects").where("title", "like", "zz test %").whereNot("title", "like", "zz test bad%").first();
    check(r.status === 302 && created && created.slug && created.published, "a valid project is created", r.status);

    r = await anon("GET", "/projects");
    check(r.status === 200 && r.html.includes("Model%20No-BH-IS-1001") && !injected(r.html), "  it appears on the public page with its photo, escaped", r.status);

    r = await ed("GET", "/admin/projects/" + created.id + "/edit");
    f = forms(r.html).find((x) => x.action === "/admin/projects/" + created.id);
    check(f && f.csrfCount === 1 && !injected(r.html), "the edit form escapes what it shows", r.status);
    r = await ed("POST", f.action, { ...f.fields, published: "" });
    check(r.status === 302 && !(await db("projects").where({ id: created.id }).first()).published, "  unticking Published hides it", r.status);
    r = await anon("GET", "/projects");
    check(!r.html.includes("zz test"), "  and the public page no longer shows it");

    // Move: the first steel project cannot move up; the new one can.
    const steel = await db("projects").where({ delivered_by: "steel" }).orderBy("sort_order").orderBy("id").pluck("id");
    r = await ed("GET", "/admin/projects");
    const moves = forms(r.html).filter((x) => /\/move$/.test(x.action));
    check(!moves.some((m) => m.action === "/admin/projects/" + steel[0] + "/move" && m.fields.direction === "up"), "no move-up on a group's first project");
    const lastBefore = steel[steel.length - 1];
    const up = moves.find((m) => m.action === "/admin/projects/" + lastBefore + "/move" && m.fields.direction === "up");
    if (up) {
      r = await ed("POST", up.action, up.fields);
      const after = await db("projects").where({ delivered_by: "steel" }).orderBy("sort_order").orderBy("id").pluck("id");
      check(r.status === 302 && after[after.length - 2] === lastBefore, "moving up works within the group", after.slice(-3).join(","));
      const eng = await db("projects").where({ delivered_by: "engineering" }).orderBy("sort_order").orderBy("id").pluck("id");
      check(eng.length === 15, "  and leaves the other group alone", eng.length);
    } else check(false, "a move-up form on the last steel project");

    r = await ed("GET", "/admin/projects/" + created.id + "/edit");
    const del = forms(r.html).find((x) => x.action === "/admin/projects/" + created.id + "/delete");
    check(del && del.csrfCount === 1, "the edit page has a delete form with _csrf");
    if (del) {
      r = await ed("POST", del.action, del.fields);
      check(r.status === 302 && !(await db("projects").where({ id: created.id }).first()), "  and it deletes", r.status);
    }
  } finally {
    server.close();
    await cleanup();
    // Put the steel order back the way the migration left it (the test moved one).
    const rows = await db("projects").where({ delivered_by: "steel" }).orderBy("id").pluck("id");
    for (const [i, id] of rows.entries()) await db("projects").where({ id }).update({ sort_order: i });
    await db.destroy();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
}

main().catch(async (e) => { console.error(e); process.exitCode = 1; try { await cleanup(); await db.destroy(); } catch { /* */ } });
