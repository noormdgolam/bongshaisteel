/* ==========================================================================
   ADMIN EDIT AUDIT — every kind of edit, end to end, on the live site
     ADMIN_PASSWORD='…' node scripts/audit-admin-edits.js [base-url]
   Signs in as the owner and, for each editor: opens the real form, changes
   one field (marked ZZAUDIT), saves, checks the PUBLIC page shows the change,
   then puts the original back and checks it is gone again. Things it creates
   (a FAQ, a user, a lead, an image) it deletes. A content snapshot is taken
   first, so Admin → Backups can undo everything if a step fails midway.
   One paced pass (the host bans bursts).
   ========================================================================== */
"use strict";

const cheerio = require("cheerio");

const BASE = (process.argv[2] || "https://www.bongshaisteel.com").replace(/\/$/, "");
const PASS = process.env.ADMIN_PASSWORD;
const MARK = "ZZAUDIT" + Date.now().toString(36).toUpperCase();
const GAP = 450;

let pass = 0, fail = 0;
const out = [];
const check = (ok, label, detail) => { ok ? pass++ : fail++; out.push((ok ? "PASS  " : "FAIL  ") + label + (ok || detail === undefined ? "" : "  <- " + String(detail).slice(0, 220))); };
const wait = () => new Promise((r) => setTimeout(r, GAP));

const jar = new Map();
async function req(method, url, body, headers = {}) {
  await wait();
  const h = { "user-agent": "Mozilla/5.0 (owner edit audit)", "sec-fetch-site": "same-origin", ...headers };
  if (jar.size) h.cookie = [...jar].map(([k, v]) => k + "=" + v).join("; ");
  if (body && !(body instanceof FormData)) {
    // A field that repeats (spec rows) is an array: one pair per value, in order.
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, x == null ? "" : x);
    body = qs.toString(); h["content-type"] = "application/x-www-form-urlencoded";
  }
  const r = await fetch(BASE + url, { method, headers: h, body, redirect: "manual" });
  for (const c of r.headers.getSetCookie()) {
    const [pair] = c.split(";"); const i = pair.indexOf("=");
    const v = pair.slice(i + 1);
    if (!v || /1970/.test(c)) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), v);
  }
  return { status: r.status, location: r.headers.get("location") || "", html: await r.text() };
}
const pub = async (url) => { await wait(); const r = await fetch(BASE + url + (url.includes("?") ? "&" : "?") + "v=" + Date.now()); return r.text(); };

function forms(html) {
  const $ = cheerio.load(html);
  return $("form").toArray().filter((f) => ($(f).attr("method") || "get").toLowerCase() === "post").map((f) => {
    const fields = {};
    // spec_label / spec_value repeat: those names always collect into arrays.
    const put = (name, v) => {
      if (/^spec_/.test(name)) (fields[name] = fields[name] || []).push(v);
      else fields[name] = v;
    };
    $(f).find("input, textarea, select").each((_, el) => {
      const e = $(el), name = e.attr("name");
      if (!name || e.attr("disabled") !== undefined || (e.attr("type") || "") === "file") return;
      if (e.closest("template").length) return;
      const type = (e.attr("type") || "").toLowerCase();
      if (type === "submit" || type === "button") return;
      if (type === "checkbox" || type === "radio") { if (e.attr("checked") !== undefined) put(name, e.attr("value") ?? "on"); return; }
      if (el.tagName === "select") { put(name, e.find("option[selected]").attr("value") ?? e.find("option").first().attr("value") ?? ""); return; }
      put(name, el.tagName === "textarea" ? e.text() : (e.attr("value") ?? ""));
    });
    return { action: $(f).attr("action") || "", fields };
  });
}
const formAt = (html, action) => forms(html).find((f) => f.action === action);
const firstLink = (html, re) => { const m = html.match(re); return m ? m[0] : null; };

/** Change one field through its form, check a public page, restore, check again. */
async function editRoundTrip(label, formUrl, action, field, publicUrl) {
  let r = await req("GET", formUrl);
  const f = formAt(r.html, action);
  if (!f || !(field in f.fields)) return check(false, label + ": form and field found", formUrl + " " + field);
  const original = f.fields[field];
  r = await req("POST", action, { ...f.fields, [field]: (original ? original + " " : "") + MARK });
  const saved = r.status === 302 || r.status === 303;
  const shown = saved && (await pub(publicUrl)).includes(MARK);
  check(saved && shown, label + ": edit saved and shown on " + publicUrl, r.status + " " + r.location);
  r = await req("GET", formUrl);
  const f2 = formAt(r.html, action) || f;
  r = await req("POST", action, { ...f2.fields, [field]: original });
  const gone = !(await pub(publicUrl)).includes(MARK);
  check((r.status === 302 || r.status === 303) && gone, label + ": original restored", r.status);
}

/** Specs, price, SEO, history restore, duplicate, bulk publish, delete and bring back. */
async function productDetails(pEdit, pid, code) {
  const action = "/admin/products/" + pid;
  const pubUrl = "/products/" + encodeURIComponent(code);
  let r = await req("GET", pEdit);
  const f = formAt(r.html, action);
  if (!f) return check(false, "product details: form found");
  const orig = { ...f.fields };
  const labels = [...(orig.spec_label || []), "Audit span " + MARK];
  const values = [...(orig.spec_value || []), "42 ft"];
  r = await req("POST", action, {
    ...orig, spec_label: labels, spec_value: values,
    price_from: "1234", price_unit: "sqft", price_currency: "BDT",
    meta_title: "Audit title " + MARK, meta_description: "Audit description " + MARK, image_alt: "Audit alt " + MARK,
  });
  const page = await pub(pubUrl);
  check(r.status === 302 && page.includes("Audit span " + MARK) && page.includes("42 ft"), "product specs: a new row shows in the spec table", r.status);
  check(/Tk 1,234 per sq ft/.test(page), "product price: shown as Tk 1,234 per sq ft");
  check(page.includes("<title>Audit title " + MARK), "product SEO title: used as the page title");
  check(page.includes("Audit description " + MARK) && page.includes('alt="Audit alt ' + MARK), "product SEO description and image alt: on the page");

  // History: the version before the audit edit is the newest entry; restoring it undoes the edit.
  r = await req("GET", pEdit);
  const rev = firstLink(r.html, /\/admin\/products\/revisions\/\d+\/restore/);
  const rf = rev && formAt(r.html, rev);
  r = rf ? await req("POST", rev, rf.fields) : { status: 0 };
  const back = await pub(pubUrl);
  check(r.status === 302 && !back.includes(MARK), "edit history: restore puts the previous version back", r.status + " " + rev);
  // And the form is exactly what it was.
  const now = formAt((await req("GET", pEdit)).html, action);
  const same = now && JSON.stringify([now.fields.spec_label, now.fields.spec_value, now.fields.meta_title, now.fields.price_from])
    === JSON.stringify([orig.spec_label, orig.spec_value, orig.meta_title, orig.price_from]);
  check(!!same, "edit history: specs, price and SEO fields match the original");

  // Duplicate -> draft copy (not public) -> bulk publish -> public -> delete -> recently deleted -> forget.
  r = await req("GET", pEdit);
  const dupAction = action + "/duplicate";
  const df = formAt(r.html, dupAction);
  r = df ? await req("POST", dupAction, df.fields) : { status: 0, location: "" };
  const copyId = (/\/admin\/products\/(\d+)\/edit/.exec(r.location) || [])[1];
  const copyForm = copyId && formAt((await req("GET", "/admin/products/" + copyId + "/edit")).html, "/admin/products/" + copyId);
  const copyCode = copyForm && copyForm.fields.model_code;
  const status = async (u) => { await wait(); return (await fetch(BASE + u, { redirect: "manual" })).status; };
  check(!!copyCode && (await status("/products/" + encodeURIComponent(copyCode))) === 404, "duplicate: the copy is a draft, not public", r.status + " " + copyCode);
  if (copyId) {
    const bulk = formAt((await req("GET", "/admin/products")).html, "/admin/products/bulk");
    r = await req("POST", "/admin/products/bulk", { ...(bulk ? bulk.fields : {}), action: "publish", ids: [copyId] });
    check(r.status === 302 && (await status("/products/" + encodeURIComponent(copyCode))) === 200, "bulk publish: the copy goes live", r.status);
    r = await req("POST", "/admin/products/bulk", { ...(bulk ? bulk.fields : {}), action: "delete", ids: [copyId] });
    check(r.status === 302 && (await status("/products/" + encodeURIComponent(copyCode))) === 404, "bulk delete: the copy is gone", r.status);
    const del = await req("GET", "/admin/products/deleted");
    const forget = formAt(del.html, "/admin/products/deleted/" + copyId + "/forget");
    check(del.html.includes(copyCode) && !!forget, "recently deleted: lists the copy with Bring back");
    if (forget) {
      r = await req("POST", "/admin/products/deleted/" + copyId + "/forget", forget.fields);
      check(!(await req("GET", "/admin/products/deleted")).html.includes(copyCode), "recently deleted: forget removes it", r.status);
    }
  }
}

async function main() {
  if (!PASS) throw new Error("set ADMIN_PASSWORD");
  let r = await req("GET", "/admin/login");
  r = await req("POST", "/admin/login", { ...formAt(r.html, "/admin/login").fields, username: process.env.ADMIN_USER || "admin", password: PASS });
  check(r.status === 302, "owner signs in", r.status);

  // Safety net first.
  r = await req("GET", "/admin/backups");
  r = await req("POST", "/admin/backups", { ...formAt(r.html, "/admin/backups").fields, note: "before admin edit audit " + MARK });
  check(r.status === 303 || r.status === 302, "a snapshot is taken before any edit", r.status);

  r = await req("GET", "/admin");
  check(r.status === 200 && /Dashboard|dashboard/.test(r.html), "dashboard opens", r.status);

  // 1. Site copy: a text field that appears on the home page.
  r = await req("GET", "/admin/content/site");
  const site = formAt(r.html, "/admin/content/site");
  const home = await pub("/");
  const textField = site && Object.keys(site.fields).find((k) => /^text\./.test(k) && site.fields[k].length > 12 && !/[<&]/.test(site.fields[k]) && home.includes(site.fields[k]));
  if (textField) await editRoundTrip("site copy (" + textField + ")", "/admin/content/site", "/admin/content/site", textField, "/");
  else check(false, "site copy: a home-page text field to edit");

  // 2. Product description.
  r = await req("GET", "/admin/products");
  const pEdit = firstLink(r.html, /\/admin\/products\/\d+\/edit/);
  if (pEdit) {
    const pr = await req("GET", pEdit);
    const pid = pEdit.match(/\d+/)[0];
    const code = (formAt(pr.html, "/admin/products/" + pid) || { fields: {} }).fields.model_code;
    await editRoundTrip("product " + code, pEdit, "/admin/products/" + pid, "description", "/products/" + encodeURIComponent(code));
    await productDetails(pEdit, pid, code);
  } else check(false, "products: an edit link");

  // 3. Category blurb (factory).
  r = await req("GET", "/admin/categories");
  const $c = cheerio.load(r.html);
  let catEdit = null;
  $c("a[href$='/edit']").each((_, a) => { const row = $c(a).closest("tr, .category-card, div"); if (!catEdit && /factory/.test(row.text())) catEdit = $c(a).attr("href"); });
  catEdit = catEdit || firstLink(r.html, /\/admin\/categories\/\d+\/edit/);
  if (catEdit) {
    const cid = catEdit.match(/\d+/)[0];
    const cf = formAt((await req("GET", catEdit)).html, "/admin/categories/" + cid);
    await editRoundTrip("category " + (cf && cf.fields.key), catEdit, "/admin/categories/" + cid, "blurb", "/category/" + (cf && cf.fields.key));
  } else check(false, "categories: an edit link");

  // 4. FAQ: create, see it, delete it.
  r = await req("GET", "/admin/content/faqs/new");
  const nf = formAt(r.html, "/admin/content/faqs");
  r = await req("POST", "/admin/content/faqs", { ...(nf ? nf.fields : {}), question: MARK + " question?", answer: MARK + " answer.", published: "1" });
  check((r.status === 302 || r.status === 303) && (await pub("/")).includes(MARK + " question?"), "FAQ: a new item appears on the home page", r.status);
  r = await req("GET", "/admin/content/faqs");
  const $f = cheerio.load(r.html);
  let faqEdit = null;
  $f("a[href*='/admin/content/faqs/']").each((_, a) => { if (!faqEdit && $f(a).closest("tr, li, div").text().includes(MARK)) faqEdit = $f(a).attr("href"); });
  if (faqEdit) {
    const fid = faqEdit.match(/faqs\/(\d+)/)[1];
    const del = formAt((await req("GET", faqEdit)).html, "/admin/content/faqs/" + fid + "/delete");
    r = await req("POST", "/admin/content/faqs/" + fid + "/delete", del ? del.fields : {});
    check(!(await pub("/")).includes(MARK), "FAQ: deleted again, gone from the home page", r.status);
  } else check(false, "FAQ: edit link for the new item");

  // 5. Project summary.
  r = await req("GET", "/admin/projects");
  const prEdit = firstLink(r.html, /\/admin\/projects\/\d+\/edit/);
  if (prEdit) await editRoundTrip("project", prEdit, "/admin/projects/" + prEdit.match(/\d+/)[0], "summary", "/projects");
  else check(false, "projects: an edit link");

  // 6. User: create a sales account, then delete it.
  r = await req("GET", "/admin/users/new");
  const uf = formAt(r.html, "/admin/users");
  const uname = "zz_audit_" + Date.now().toString(36);
  r = await req("POST", "/admin/users", { ...(uf ? uf.fields : {}), username: uname, name: "Audit user", role: "sales", active: "1", password: "Audit-pass-" + Date.now(), password2: "" });
  // password2 must match: resubmit correctly if the first try was refused
  if (r.status === 422) {
    const pw = "Audit-pass-" + Date.now();
    r = await req("POST", "/admin/users", { ...(uf ? uf.fields : {}), username: uname, name: "Audit user", role: "sales", active: "1", password: pw, password2: pw });
  }
  const listed = (await req("GET", "/admin/users")).html;
  const uEdit = (() => { const $u = cheerio.load(listed); let h = null; $u("a[href$='/edit']").each((_, a) => { if (!h && $u(a).closest("tr, div").text().includes(uname)) h = $u(a).attr("href"); }); return h; })();
  check(r.status === 302 && !!uEdit, "users: a new account is created", r.status);
  if (uEdit) {
    const uid = uEdit.match(/\d+/)[0];
    const del = formAt((await req("GET", uEdit)).html, "/admin/users/" + uid + "/delete");
    r = await req("POST", "/admin/users/" + uid + "/delete", del ? del.fields : {});
    check(!(await req("GET", "/admin/users")).html.includes(uname), "users: and deleted again", r.status);
  }

  // 7. Lead: arrives from the site, status changed in the admin, deleted.
  await wait();
  const lr = await fetch(BASE + "/lead.php", { method: "POST", body: new URLSearchParams({ name: MARK + " Lead", phone: "01700000009", message: "admin edit audit — please ignore", kind: "quote" }) }).then((x) => x.json()).catch(() => ({}));
  r = await req("GET", "/admin/leads");
  const leadLink = (() => { const $l = cheerio.load(r.html); let h = null; $l("a[href^='/admin/leads/']").each((_, a) => { if (!h && $l(a).closest("tr, div").text().includes(MARK)) h = $l(a).attr("href"); }); return h; })();
  check(lr.stored === true && !!leadLink, "leads: a website enquiry reaches Messages", JSON.stringify(lr));
  if (leadLink) {
    const id = leadLink.match(/leads\/(\d+)/)[1];
    const lf = formAt((await req("GET", leadLink)).html, "/admin/leads/" + id);
    r = await req("POST", "/admin/leads/" + id, { ...(lf ? lf.fields : {}), status: "contacted", note: MARK });
    const after = (await req("GET", leadLink)).html;
    check((r.status === 302 || r.status === 303) && after.includes(MARK), "leads: status and note saved", r.status);
    const del = formAt(after, "/admin/leads/" + id + "/delete");
    r = await req("POST", "/admin/leads/" + id + "/delete", del ? del.fields : {});
    check(!(await req("GET", "/admin/leads")).html.includes(MARK), "leads: deleted again", r.status);
  }

  // 8. Media: upload through the form, then delete.
  r = await req("GET", "/admin/media");
  const mf = formAt(r.html, "/admin/media");
  if (mf) {
    const sharp = require("sharp");
    const png = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#1d4e89" } }).png().toBuffer();
    const fd = new FormData(); fd.append("_csrf", mf.fields._csrf); fd.append("file", new Blob([png]), "zz-audit.png");
    r = await req("POST", "/admin/media", fd);
    const up = /uploaded=([^&]+)/.exec(r.location);
    const path = up ? decodeURIComponent(up[1]) : null;
    check(!!path && (await fetch(BASE + "/" + path)).status === 200, "media: a photo uploads and is served", r.status + " " + r.location);
    if (path) {
      const df = forms((await req("GET", "/admin/media")).html).find((f) => f.action === "/admin/media/delete" && f.fields.path === path);
      r = await req("POST", "/admin/media/delete", df ? df.fields : {});
      check((await fetch(BASE + "/" + path)).status === 404, "media: and deletes", r.status);
    }
  } else check(false, "media: upload form");

  r = await req("GET", "/admin/activity");
  check(r.status === 200 && (r.html.match(/<tr/g) || []).length > 5, "activity log records the edits", r.status);

  r = await req("GET", "/admin");
  const lo = formAt(r.html, "/admin/logout");
  await req("POST", "/admin/logout", lo ? lo.fields : {});

  console.log(out.join("\n") + "\n\n" + pass + " passed, " + fail + " failed  (marker " + MARK + ")");
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(out.join("\n") + "\nABORTED: " + e.stack); process.exitCode = 1; });
