/* ==========================================================================
   ADMIN ROUTES — end to end against the development database
     node test/admin.test.js
   Uses stub templates that print the variables each route passes, so it tests
   the routes and the template contract without depending on the real views.
   Creates throwaway users (zz_test_*) and a product (ZZ-TEST-001) and removes
   them — and their activity rows — at the end, pass or fail.
   ========================================================================== */
"use strict";

process.env.CONTENT_SOURCE = "db";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const bcrypt = require("bcryptjs");

const db = require("../lib/db");                 // loads server/.env
const content = require("../lib/content");
const auth = require("../lib/auth");
const createAdminRouter = require("../routes/admin");

const PASS = "Test-Password-123";
const USERS = { admin: "zz_test_admin", sales: "zz_test_sales" };
const CODE = "ZZ-TEST-001";

let pass = 0, fail = 0;
function check(ok, label, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label + (ok || detail === undefined ? "" : "\n        " + String(detail).slice(0, 240)));
}

/* ---------------------------------------------------------- stub templates */
const VIEWS = fs.mkdtempSync(path.join(os.tmpdir(), "bs-admin-views-"));
for (const v of ["admin/login.njk", "admin/dashboard.njk", "admin/products/list.njk", "admin/products/form.njk"]) {
  fs.mkdirSync(path.join(VIEWS, path.dirname(v)), { recursive: true });
  fs.writeFileSync(path.join(VIEWS, v), "");
}
const KEYS = ["active", "notice", "error", "csrfToken", "adminName", "adminRole", "stats", "q", "category",
  "total", "username", "lockedMinutes"];
function stubEngine(file, opts, cb) {
  const out = { view: path.relative(VIEWS, file).replace(/\\/g, "/") };
  for (const k of KEYS) if (opts[k] !== undefined) out[k] = opts[k];
  if (opts.products) out.products = opts.products.map((p) => p.model_code);
  if (opts.categories) out.categories = opts.categories.length;
  if (opts.recentActivity) out.recentActivity = opts.recentActivity.length;
  if (opts.product) out.product = opts.product;
  cb(null, "<pre>" + JSON.stringify(out) + "</pre>");
}

/* ------------------------------------------------------------- tiny client */
function client(base) {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => k + "=" + v).join("; ");
  return {
    jar,
    async req(method, url, { form, headers = {} } = {}) {
      const h = { ...headers };
      if (jar.size) h.cookie = cookie();
      let body;
      if (form) { body = new URLSearchParams(form).toString(); h["content-type"] = "application/x-www-form-urlencoded"; }
      const r = await fetch(base + url, { method, headers: h, body, redirect: "manual" });
      for (const c of r.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        const k = pair.slice(0, i), v = pair.slice(i + 1);
        if (/expires=Thu, 01 Jan 1970/i.test(c) || v === "") jar.delete(k); else jar.set(k, v);
      }
      const text = await r.text();
      let data = null;
      const m = text.match(/^<pre>([\s\S]*)<\/pre>$/);
      if (m) try { data = JSON.parse(m[1]); } catch { /* not a stub page */ }
      return { status: r.status, location: r.headers.get("location"), text, data, setCookie: r.headers.getSetCookie() };
    },
  };
}

async function setupUsers() {
  const hash = await bcrypt.hash(PASS, 10);
  for (const [role, username] of Object.entries(USERS)) {
    await db("admin_users").where({ username }).del();
    await db("admin_users").insert({ username, password_hash: hash, role, name: "Test " + role });
  }
}

async function cleanup() {
  const ids = await db("admin_users").whereIn("username", Object.values(USERS)).pluck("id");
  if (ids.length) await db("activity_log").whereIn("admin_user_id", ids).del();
  await db("activity_log").where("summary", "like", "%zz_test_%").orWhere("summary", "like", "%" + CODE + "%").del();
  await db("products").where({ model_code: CODE }).del();
  await db("admin_users").whereIn("username", Object.values(USERS)).del();
  await content.bumpRev();
  await content.refresh();
}

async function main() {
  await setupUsers();
  await content.refresh();

  const app = express();
  app.set("trust proxy", 1);
  app.engine("njk", stubEngine);
  app.set("views", VIEWS);
  app.set("view engine", "njk");
  app.use(createAdminRouter({ db, content }));
  app.use((req, res) => res.status(404).send("SITE 404"));
  app.use((err, req, res, next) => { console.error(err); res.status(500).send("ERR " + err.message); });
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;

  try {
    const a = client(base);

    /* --- signed out */
    let r = await a.req("GET", "/admin");
    check(r.status === 302 && r.location === "/admin/login?return=%2Fadmin", "signed out: /admin redirects to the login page", r.status + " " + r.location);
    r = await a.req("GET", "/admin/products");
    check(r.status === 302 && /\/admin\/login/.test(r.location), "signed out: /admin/products redirects too", r.status);

    r = await a.req("GET", "/admin/editor.js");
    check(!r.setCookie.length, "public editor.js creates no session cookie", r.setCookie.join(" | "));

    r = await a.req("GET", "/admin/login");
    check(r.status === 200 && r.data && r.data.view === "admin/login.njk" && /^[0-9a-f]{48}$/.test(r.data.csrfToken || ""),
      "login page renders with a CSRF token", JSON.stringify(r.data));
    const firstSid = a.jar.get("bs_admin");
    let csrf = r.data.csrfToken;

    /* --- CSRF */
    r = await a.req("POST", "/admin/login", { form: { username: USERS.admin, password: PASS } });
    check(r.status === 403, "POST without the CSRF token is refused", r.status);
    r = await a.req("POST", "/admin/login", { form: { username: USERS.admin, password: PASS, _csrf: "0".repeat(48) } });
    check(r.status === 403, "POST with a wrong token is refused", r.status);
    r = await a.req("POST", "/admin/login", { form: { username: USERS.admin, password: PASS, _csrf: csrf }, headers: { "sec-fetch-site": "cross-site" } });
    check(r.status === 403, "a cross-site POST is refused even with the right token", r.status);

    /* --- credentials */
    r = await a.req("POST", "/admin/login", { form: { username: USERS.admin, password: "wrong", _csrf: csrf } });
    check(r.status === 401 && r.data.error === "Incorrect username or password.", "wrong password: 401, vague error", r.status + " " + (r.data && r.data.error));
    check(r.data.username === USERS.admin, "  and the username is refilled", r.data && r.data.username);
    r = await a.req("POST", "/admin/login", { form: { username: "nobody_here", password: PASS, _csrf: csrf } });
    check(r.status === 401 && r.data.error === "Incorrect username or password.", "unknown user: the same 401 and the same error", r.status);
    auth._resetThrottle();

    r = await a.req("POST", "/admin/login?return=" + encodeURIComponent("https://evil.example/x"), { form: { username: USERS.admin, password: PASS, _csrf: csrf } });
    check(r.status === 302 && r.location === "/admin", "right password signs in; an off-site return is ignored", r.status + " " + r.location);
    check(a.jar.get("bs_admin") && a.jar.get("bs_admin") !== firstSid, "the session id changes at sign-in (no fixation)");

    /* --- dashboard */
    r = await a.req("GET", "/admin");
    check(r.status === 200 && r.data.view === "admin/dashboard.njk" && r.data.active === "dashboard", "dashboard renders", r.status + " " + JSON.stringify(r.data).slice(0, 120));
    const st = (r.data && r.data.stats) || {};
    check(st.products >= 72 && st.categories === 5 && st.faqs === 9 && typeof st.leadsNew === "number",
      "  with the contract's stats", JSON.stringify(st));
    check(r.data.adminRole === "admin" && r.data.adminName === "Test admin", "  and adminName/adminRole", r.data.adminName + "/" + r.data.adminRole);
    csrf = r.data.csrfToken;

    /* --- product list */
    r = await a.req("GET", "/admin/products");
    check(r.status === 200 && r.data.total >= 72 && r.data.categories === 5 && r.data.category === "all", "product list: all products, 5 categories", JSON.stringify({ t: r.data.total, c: r.data.categories }));
    r = await a.req("GET", "/admin/products?q=BH-IS-100");
    check(r.data.total === 9 && r.data.q === "BH-IS-100", "search by model code", r.data.total);
    r = await a.req("GET", "/admin/products?category=cottage");
    check(r.data.total > 0 && r.data.total < 72 && r.data.category === "cottage", "filter by category", r.data.total);
    r = await a.req("GET", "/admin/products?q=%25");
    check(r.data.total === 0, "a literal % in the search is not a wildcard", r.data.total);

    /* --- create */
    const catId = (await db("categories").where({ key: "factory" }).first("id")).id;
    const good = { model_code: CODE, name: "Test Shed <b>", description: "d", image: "images/products/Model No-BH-IS-1001.webp",
      category_id: String(catId), sort_order: "999", published: "on", featured: "on", _csrf: csrf };

    r = await a.req("POST", "/admin/products", { form: { ...good, model_code: "bad code!" } });
    check(r.status === 422 && /Model code/.test(r.data.error), "invalid model code: 422 with a message", r.status + " " + (r.data && r.data.error));
    check(r.data.product && r.data.product.name === "Test Shed <b>", "  and the form keeps what was typed", r.data && JSON.stringify(r.data.product).slice(0, 80));
    r = await a.req("POST", "/admin/products", { form: { ...good, image: "images/../admin/config.php" } });
    check(r.status === 422 && /Image/.test(r.data.error), "a path-traversal image path is refused", r.status);
    r = await a.req("POST", "/admin/products", { form: { ...good, image: "https://evil.example/x.webp" } });
    check(r.status === 422, "an off-site image URL is refused", r.status);
    r = await a.req("POST", "/admin/products", { form: { ...good, category_id: "99999" } });
    check(r.status === 422 && /category/i.test(r.data.error), "an unknown category is refused", r.status);

    r = await a.req("POST", "/admin/products", { form: good });
    check(r.status === 302 && /notice=/.test(r.location), "a valid product is created", r.status + " " + r.location);
    const row = await db("products").where({ model_code: CODE }).first();
    check(row && row.slug === "zz-test-001" && row.featured === 1 && row.featured_order != null && row.published === 1,
      "  stored with a derived slug, featured with an order", JSON.stringify(row && { slug: row.slug, f: row.featured, fo: row.featured_order }));
    check(content.load().products.some((p) => p.modelCode === CODE), "  and the live content has it immediately");
    check(content.load().featuredIds.includes("zz-test-001"), "  and it is in the featured list");

    r = await a.req("POST", "/admin/products", { form: { ...good, slug: "another-slug" } });
    check(r.status === 422 && /model code/.test(r.data.error), "a duplicate model code is refused, not a 500", r.status + " " + (r.data && r.data.error));

    /* --- edit */
    r = await a.req("GET", "/admin/products/" + row.id + "/edit");
    check(r.status === 200 && r.data.product && r.data.product.model_code === CODE, "edit form loads the product", r.status);
    r = await a.req("GET", "/admin/products/99999999/edit");
    check(r.status === 404, "editing a missing product is a 404", r.status);
    r = await a.req("POST", "/admin/products/" + row.id, { form: { ...good, name: "Renamed Test Shed", featured: "", published: "" } });
    check(r.status === 302, "update saves", r.status);
    const after = await db("products").where({ id: row.id }).first();
    check(after.name === "Renamed Test Shed" && after.featured === 0 && after.featured_order === null && after.published === 0,
      "  name changed, unfeatured (order cleared), unpublished", JSON.stringify({ n: after.name, f: after.featured, fo: after.featured_order, p: after.published }));
    check(!content.load().products.some((p) => p.modelCode === CODE), "  an unpublished product leaves the live content");

    /* --- roles */
    const s = client(base);
    let t = (await s.req("GET", "/admin/login")).data.csrfToken;
    await s.req("POST", "/admin/login", { form: { username: USERS.sales, password: PASS, _csrf: t } });
    r = await s.req("GET", "/admin");
    check(r.status === 200 && r.data.adminRole === "sales", "a sales user reaches the dashboard", r.status);
    r = await s.req("GET", "/admin/products");
    check(r.status === 403, "a sales user cannot open products", r.status);
    t = r.status === 403 ? (await s.req("GET", "/admin")).data.csrfToken : t;
    r = await s.req("POST", "/admin/products/" + row.id + "/delete", { form: { _csrf: t } });
    check(r.status === 403 && (await db("products").where({ id: row.id }).first()), "a sales user cannot delete a product", r.status);

    /* --- deactivation takes effect mid-session */
    await db("admin_users").where({ username: USERS.sales }).update({ active: false });
    r = await s.req("GET", "/admin");
    check(r.status === 302 && /\/admin\/login/.test(r.location), "a deactivated user is signed out on the next request", r.status);

    /* --- delete */
    r = await a.req("POST", "/admin/products/" + row.id + "/delete", { form: { _csrf: csrf } });
    check(r.status === 302 && !(await db("products").where({ id: row.id }).first()), "delete removes the product", r.status);

    /* --- activity trail */
    const acts = await db("activity_log").where("summary", "like", "%" + CODE + "%").pluck("action");
    check(["product.create", "product.update", "product.delete"].every((x) => acts.includes(x)), "create/update/delete are all in the activity log", acts.join(","));

    /* --- sign out */
    r = await a.req("POST", "/admin/logout", { form: { _csrf: csrf } });
    check(r.status === 302 && r.location === "/admin/login", "sign-out redirects to the login page", r.status);
    r = await a.req("GET", "/admin");
    check(r.status === 302, "  and the session is gone", r.status);

    /* --- lockout */
    auth._resetThrottle();
    const l = client(base);
    const lt = (await l.req("GET", "/admin/login")).data.csrfToken;
    for (let i = 0; i < 5; i++) await l.req("POST", "/admin/login", { form: { username: USERS.admin, password: "x" + i, _csrf: lt } });
    r = await l.req("POST", "/admin/login", { form: { username: USERS.admin, password: PASS, _csrf: lt } });
    check(r.status === 429 && r.data.lockedMinutes > 0, "after 5 failures even the right password is locked out", r.status + " " + (r.data && r.data.lockedMinutes));
    auth._resetThrottle();
  } finally {
    server.close();
    await cleanup().catch((e) => console.error("cleanup:", e.message));
    fs.rmSync(VIEWS, { recursive: true, force: true });
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => db.destroy());
