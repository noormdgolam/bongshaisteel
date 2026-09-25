/* ==========================================================================
   USERS & CATEGORIES — real templates x real routes x real database
     ADMIN_VIEWS=<views dir> node test/admin-users.test.js
   The account rules are checked by submitting what a form would NOT offer
   (a disabled role select, a superadmin role) — the server must hold them.
   Only zz_test_* accounts and a zz-test-* category are created, and removed
   at the end. The owner's own account is never touched.
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
const PASS = "Test-Password-123";
const U = { sup: "zz_test_super", adm: "zz_test_adm", ed: "zz_test_ed", new: "zz_test_created" };
const CAT = "zz-test-cat";
const XSS = '"><img src=x onerror=alert(1)></textarea><script>alert(1)</script>';

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
      const fields = {}, disabled = [];
      $(f).find("input, textarea, select").each((_, el) => {
        const e = $(el), name = e.attr("name");
        if (!name) return;
        if (e.attr("disabled") !== undefined) { disabled.push(name); return; }
        const type = (e.attr("type") || "").toLowerCase();
        if (type === "checkbox" || type === "radio") { if (e.attr("checked") !== undefined) fields[name] = e.attr("value") ?? "on"; return; }
        if (el.tagName === "select") { fields[name] = e.find("option[selected]").attr("value") ?? e.find("option").first().attr("value") ?? ""; return; }
        fields[name] = el.tagName === "textarea" ? e.text() : (e.attr("value") ?? "");
      });
      const options = {};
      $(f).find("select").each((_, s) => { options[$(s).attr("name")] = $(s).find("option").map((__, o) => $(o).attr("value")).get(); });
      return { action: $(f).attr("action") || "", fields, disabled, options, csrfCount: $(f).find('input[name="_csrf"]').length };
    });
}

const injected = (html) => { const $ = cheerio.load(html); return $("img[onerror]").length > 0 || $("script").toArray().some((s) => ($(s).html() || "").includes("alert(1)")); };

async function signIn(go, username) {
  const f = forms((await go("GET", "/admin/login")).html).find((x) => x.action === "/admin/login");
  return go("POST", f.action, { ...f.fields, username, password: PASS });
}

async function cleanup() {
  const ids = await db("admin_users").where("username", "like", "zz_test_%").pluck("id");
  if (ids.length) {
    await db("activity_log").whereIn("admin_user_id", ids).del();
    for (const id of ids) await db("sessions").where("sess", "like", '%"adminUserId":' + id + ",%").del();
  }
  await db("admin_users").where("username", "like", "zz_test_%").del();
  await db("activity_log").where("summary", "like", "%zz_test_%").orWhere("summary", "like", "%" + CAT + "%").del();
  await db("categories").where("key", "like", CAT + "%").del();
  await content.bumpRev(); await content.refresh();
}

async function main() {
  await cleanup();
  const hash = await bcrypt.hash(PASS, 10);
  await db("admin_users").insert([
    { username: U.sup, password_hash: hash, role: "superadmin", name: "Test Super" },
    { username: U.adm, password_hash: hash, role: "admin", name: "Test Admin " + XSS },
    { username: U.ed, password_hash: hash, role: "editor", name: "Test Editor" },
  ]);
  const id = async (u) => (await db("admin_users").where({ username: u }).first("id")).id;
  const ID = { sup: await id(U.sup), adm: await id(U.adm), ed: await id(U.ed) };
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

  try {
    const sup = client(base), adm = client(base), ed = client(base);
    await signIn(sup, U.sup); await signIn(adm, U.adm); await signIn(ed, U.ed);

    /* ------------------------------------------------------------ users */
    let r = await ed("GET", "/admin/users");
    check(r.status === 403, "an editor cannot open Users", r.status);

    r = await adm("GET", "/admin/users");
    check(r.status === 200 && !/RENDER ERROR/.test(r.html) && !injected(r.html), "an admin sees the user list, names escaped", r.status + " " + r.html.slice(0, 120));

    r = await adm("GET", "/admin/users/new");
    let f = forms(r.html).find((x) => x.action === "/admin/users");
    check(f && f.csrfCount === 1 && ["username", "password", "password2"].every((k) => k in f.fields), "new-user form: fields and one _csrf", f && Object.keys(f.fields).join(","));
    check(f && !f.options.role.includes("superadmin"), "an admin is not offered the superadmin role", f && f.options.role);
    r = await adm("POST", f.action, { ...f.fields, username: U.new, role: "superadmin", password: "Long-enough-1", password2: "Long-enough-1" });
    check(r.status === 422 && !(await db("admin_users").where({ username: U.new }).first()), "  and posting it anyway is refused", r.status);
    r = await adm("POST", f.action, { ...f.fields, username: U.new, role: "editor", password: "short", password2: "short" });
    check(r.status === 422 && /at least 8/.test(r.html), "a short password is refused", r.status);
    r = await adm("POST", f.action, { ...f.fields, username: U.new, role: "editor", password: "Long-enough-1", password2: "Different-1" });
    check(r.status === 422 && /do not match/.test(r.html) && !r.html.includes("Long-enough-1") && !r.html.includes("Different-1"),
      "mismatched passwords are refused, and neither is echoed into the page", r.status);
    r = await adm("POST", f.action, { ...f.fields, username: U.new, name: XSS, role: "sales", password: "Long-enough-1", password2: "Long-enough-1" });
    const created = await db("admin_users").where({ username: U.new }).first();
    check(r.status === 302 && created && created.role === "sales" && created.password_hash.startsWith("$2") && await bcrypt.compare("Long-enough-1", created.password_hash),
      "a valid user is created with a bcrypt hash", r.status);
    r = await adm("POST", f.action, { ...f.fields, username: U.new.toUpperCase(), role: "sales", password: "Long-enough-1", password2: "Long-enough-1" });
    check(r.status === 422 && /taken/.test(r.html), "a username differing only in case is taken", r.status);

    r = await adm("GET", "/admin/users/" + ID.sup + "/edit");
    check(r.status === 403, "an admin cannot open a superadmin's account", r.status);

    // Own account: the form disables role/active and has no delete — and the server holds that too.
    r = await adm("GET", "/admin/users/" + ID.adm + "/edit");
    let fs_ = forms(r.html);
    const self = fs_.find((x) => x.action === "/admin/users/" + ID.adm);
    check(self && self.disabled.includes("role") && self.disabled.includes("active"), "own account: role and active are disabled in the form", self && self.disabled.join(","));
    check(!fs_.some((x) => x.action.endsWith("/delete")), "  and there is no delete form");
    r = await adm("POST", self.action, { ...self.fields, role: "sales", active: "" });
    const me = await db("admin_users").where({ username: U.adm }).first();
    check(r.status === 302 && me.role === "admin" && me.active === 1, "  posting a lower role and active=off for yourself changes neither", JSON.stringify({ role: me.role, active: me.active }));
    r = await adm("POST", "/admin/users/" + me.id + "/delete", { _csrf: self.fields._csrf });
    check(await db("admin_users").where({ id: me.id }).first(), "  and a hand-made delete request for yourself is refused");

    // Disabling someone ends their open session at once.
    const victim = client(base);
    await signIn(victim, U.ed);
    check((await victim("GET", "/admin")).status === 200, "the editor has a working session");
    r = await sup("GET", "/admin/users/" + ID.ed + "/edit");
    f = forms(r.html).find((x) => x.action === "/admin/users/" + ID.ed);
    check(f && !f.disabled.length && f.options.role.includes("superadmin"), "a superadmin editing someone else gets every field and every role", f && JSON.stringify({ d: f.disabled, r: f.options.role }));
    const { active, ...off } = f.fields;
    r = await sup("POST", f.action, off);
    check(r.status === 302 && (await db("admin_users").where({ username: U.ed }).first()).active === 0, "the superadmin disables the editor", r.status);
    r = await victim("GET", "/admin");
    check(r.status === 302 && /login/.test(r.location), "  and the editor's open session ends at once", r.status);

    // Password change ends the other sessions too, and the new password works.
    await db("admin_users").where({ username: U.ed }).update({ active: true });
    const v2 = client(base); await signIn(v2, U.ed);
    r = await sup("GET", "/admin/users/" + ID.ed + "/edit");
    f = forms(r.html).find((x) => x.action === "/admin/users/" + ID.ed);
    r = await sup("POST", f.action, { ...f.fields, password: "New-password-9", password2: "New-password-9" });
    check(r.status === 302 && (await v2("GET", "/admin")).status === 302, "a password change signs the user out everywhere", r.status);
    const v3 = client(base);
    const lf = forms((await v3("GET", "/admin/login")).html).find((x) => x.action === "/admin/login");
    r = await v3("POST", lf.action, { ...lf.fields, username: U.ed, password: "New-password-9" });
    check(r.status === 302 && r.location === "/admin", "  and the new password signs in", r.status);

    // Delete through the rendered delete form.
    r = await sup("GET", "/admin/users/" + created.id + "/edit");
    const del = forms(r.html).find((x) => x.action === "/admin/users/" + created.id + "/delete");
    check(del && del.csrfCount === 1, "another user's edit page has a delete form with _csrf");
    r = await sup("POST", del.action, del.fields);
    check(r.status === 302 && !(await db("admin_users").where({ id: created.id }).first()), "  and it deletes", r.status);

    /* ------------------------------------------------------- categories */
    r = await v3("GET", "/admin/categories");
    check(r.status === 200 && !/RENDER ERROR/.test(r.html), "an editor opens Categories", r.status + " " + r.html.slice(0, 120));
    const factory = await db("categories").where({ key: "factory" }).first();
    r = await v3("GET", "/admin/categories/" + factory.id + "/edit");
    fs_ = forms(r.html);
    check(!fs_.some((x) => x.action.endsWith("/delete")) && /still has \d+ products/.test(r.html), "a category with products has no delete form, and says why", fs_.map((x) => x.action).join(","));
    r = await v3("POST", "/admin/categories/" + factory.id + "/delete", { _csrf: fs_[0].fields._csrf });
    check(await db("categories").where({ id: factory.id }).first(), "  and a hand-made delete request is refused");
    const ff = fs_.find((x) => x.action === "/admin/categories/" + factory.id);
    r = await v3("POST", ff.action, { ...ff.fields, key: "factory-renamed" });
    check(r.status === 422 && (await db("categories").where({ id: factory.id }).first()).key === "factory", "an existing category's key cannot change (it is in live links)", r.status);
    r = await v3("POST", ff.action, ff.fields);
    check(r.status === 302, "saving a category form unchanged works", r.status + " " + (r.html.match(/error[^<]{0,120}/i) || [""])[0]);

    r = await v3("GET", "/admin/categories/new");
    f = forms(r.html).find((x) => x.action === "/admin/categories");
    check(f && f.csrfCount === 1 && ["key", "name", "icon", "blurb", "image", "main_category_id"].every((k) => k in f.fields), "new-category form carries every contract field", f && Object.keys(f.fields).join(","));
    r = await v3("POST", f.action, { ...f.fields, key: "Bad Key!", name: "x" });
    check(r.status === 422, "an invalid key is refused", r.status);
    r = await v3("POST", f.action, { ...f.fields, key: CAT, name: "Test " + XSS, blurb: XSS, image: "images/products/Model No-BH-IS-1001.webp" });
    const cat = await db("categories").where({ key: CAT }).first();
    check(r.status === 302 && cat && !content.load().categories.some((c) => c.key === CAT),
      "a category is created, and stays out of the public menu while it has no products", r.status);
    r = await v3("GET", "/admin/categories");
    check(!injected(r.html), "  the list shows its hostile name escaped");
    const moves = forms(r.html).filter((x) => x.action === "/admin/categories/" + cat.id + "/move");
    check(moves.length >= 1 && moves.every((x) => x.fields.direction === "up"), "  as the last category it has move-up and no move-down", moves.map((x) => x.fields.direction).join(","));
    const pos = async () => (await db("categories").orderBy("sort_order").orderBy("id").pluck("id")).indexOf(cat.id);
    const p0 = await pos();
    await v3("POST", moves[0].action, moves[0].fields);
    check(await pos() === p0 - 1, "  and moving it up works", p0 + " -> " + await pos());
    r = await v3("GET", "/admin/categories/" + cat.id + "/edit");
    const cdel = forms(r.html).find((x) => x.action.endsWith("/delete"));
    check(cdel && !injected(r.html), "an empty category's edit page has a delete form, escaped");
    r = await v3("POST", cdel.action, cdel.fields);
    check(r.status === 302 && !(await db("categories").where({ id: cat.id }).first()), "  and it deletes", r.status);

    /* --- the Categories link */
    r = await v3("GET", "/admin");
    check(r.html.includes('href="/admin/categories"'), "the editor sees the Categories link");
    await db("admin_users").insert({ username: "zz_test_sales", password_hash: hash, role: "sales" });
    const sl = client(base); await signIn(sl, "zz_test_sales");
    r = await sl("GET", "/admin");
    check(!r.html.includes('href="/admin/categories"') && (await sl("GET", "/admin/categories")).status === 403, "sales neither sees nor opens Categories");
  } finally {
    server.close();
    await cleanup();
    auth._resetThrottle();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => db.destroy());
