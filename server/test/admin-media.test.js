/* ==========================================================================
   MEDIA & BACKUPS — real routes x real database x real files
     ADMIN_VIEWS=<views dir> node test/admin-media.test.js
   Uploads are real (sharp writes into images/uploads) and are removed at the
   end. Restores are real too: the test takes its own snapshot first, changes
   one FAQ, restores, and checks the change is gone — so the content ends
   exactly as it started. Only zz_test_* accounts are created.
   ========================================================================== */
"use strict";

process.env.CONTENT_SOURCE = "db";

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const nunjucks = require("nunjucks");
const cheerio = require("cheerio");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
sharp.cache(false); // the libvips file cache holds files open, and Windows then refuses to delete them

const db = require("../lib/db");
const content = require("../lib/content");
const images = require("../lib/images");
const createAdminRouter = require("../routes/admin");

const VIEWS = process.env.ADMIN_VIEWS || path.join(__dirname, "..", "views");
const PASS = "Test-Password-123";
const U = { sup: "zz_test_super", ed: "zz_test_ed", sales: "zz_test_sales" };
const XSS = '"><img src=x onerror=alert(1)><script>alert(1)</script>';

let pass = 0, fail = 0;
const check = (ok, label, detail) => {
  ok ? pass++ : fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label + (ok || detail === undefined ? "" : "\n        " + String(detail).slice(0, 260)));
};

function client(base) {
  const jar = new Map();
  return async (method, url, form, extra = {}) => {
    const headers = { ...extra };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => k + "=" + v).join("; ");
    let body;
    if (form instanceof FormData) body = form;
    else if (form) { body = new URLSearchParams(form).toString(); headers["content-type"] = "application/x-www-form-urlencoded"; }
    const r = await fetch(base + url, { method, headers, body, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";"); const i = pair.indexOf("=");
      const v = pair.slice(i + 1);
      if (!v || /1970/.test(c)) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), v);
    }
    return { status: r.status, location: r.headers.get("location"), type: r.headers.get("content-type") || "",
      disposition: r.headers.get("content-disposition") || "", html: await r.text() };
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
        if (!name || (e.attr("type") || "") === "file") return;
        fields[name] = el.tagName === "textarea" ? e.text() : (e.attr("value") ?? "");
      });
      return {
        action: $(f).attr("action") || "", enctype: $(f).attr("enctype") || "", fields,
        onsubmit: $(f).attr("onsubmit") || "", fileInputs: $(f).find('input[type="file"]').map((_, x) => $(x).attr("name")).get(),
        csrfCount: $(f).find('input[name="_csrf"]').length,
      };
    });
}

const injected = (html) => { const $ = cheerio.load(html); return $("img[onerror]").length > 0 || $("script").toArray().some((s) => ($(s).html() || "").includes("alert(1)")); };

async function signIn(go, username) {
  const f = forms((await go("GET", "/admin/login")).html).find((x) => x.action === "/admin/login");
  return go("POST", f.action, { ...f.fields, username, password: PASS });
}
async function tokenOf(go) {
  const f = forms((await go("GET", "/admin")).html).find((x) => x.fields._csrf);
  return f.fields._csrf;
}

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } }).png().toBuffer();
function formData(buf, name, token) {
  const fd = new FormData();
  if (token !== undefined) fd.append("_csrf", token);
  fd.append("file", new Blob([buf]), name);
  return fd;
}
const uploadsNow = () => { try { return fs.readdirSync(images.UPLOAD_DIR).sort().join(","); } catch { return ""; } };
const JSON_ACCEPT = { accept: "application/json" };

let startSnapshot = 0;
const uploaded = [];

async function cleanup() {
  for (const p of uploaded) { try { images.removeUpload(p); } catch { /* gone */ } }
  const media = await db("site_content").where({ section: "media" }).first("data");
  if (media) {
    const map = JSON.parse(media.data);
    for (const p of uploaded) delete map[p];
    await db("site_content").where({ section: "media" }).update({ data: JSON.stringify(map) });
  }
  await db("team_members").where("name", "like", "zz_test_%").del();
  const ids = await db("admin_users").where("username", "like", "zz_test_%").pluck("id");
  if (ids.length) {
    await db("activity_log").whereIn("admin_user_id", ids).del();
    for (const id of ids) await db("sessions").where("sess", "like", '%"adminUserId":' + id + ",%").del();
  }
  if (startSnapshot) await db("content_snapshots").where("id", ">", startSnapshot).del();
  await db("admin_users").where("username", "like", "zz_test_%").del();
  await content.bumpRev(); await content.refresh();
}

async function main() {
  await db("admin_users").where("username", "like", "zz_test_%").del();
  const hash = await bcrypt.hash(PASS, 10);
  await db("admin_users").insert([
    { username: U.sup, password_hash: hash, role: "superadmin", name: "Test Super " + XSS },
    { username: U.ed, password_hash: hash, role: "editor", name: "Test Editor" },
    { username: U.sales, password_hash: hash, role: "sales", name: "Test Sales" },
  ]);
  startSnapshot = Number((await db("content_snapshots").max({ m: "id" }))[0].m || 0);
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
    const sup = client(base), ed = client(base), sales = client(base);
    await signIn(sup, U.sup); await signIn(ed, U.ed); await signIn(sales, U.sales);
    const edToken = await tokenOf(ed);

    /* ----------------------------------------------------------- upload */
    let r = await sales("GET", "/admin/media");
    check(r.status === 403, "sales cannot open Media", r.status);

    const before = uploadsNow();
    r = await ed("POST", "/admin/media", formData(await png(1200, 800), "Hero Shot!.png"));
    check(r.status === 403 && uploadsNow() === before, "an upload without _csrf is refused and stores nothing", r.status);
    r = await ed("POST", "/admin/media", formData(await png(1200, 800), "a.png", "wrong-token"));
    check(r.status === 403 && uploadsNow() === before, "an upload with a wrong _csrf is refused and stores nothing", r.status);
    r = await ed("POST", "/admin/leads/999999/delete", formData(Buffer.from("x"), "x.txt"));
    check(r.status === 403, "multipart to any other route has no way past CSRF", r.status);

    r = await ed("POST", "/admin/media", formData(await png(1200, 800), "Hero Shot!.png", edToken), JSON_ACCEPT);
    let out = {}; try { out = JSON.parse(r.html); } catch { /* checked below */ }
    if (out.path) uploaded.push(out.path);
    const stem = out.path ? path.basename(out.path, ".webp") : "";
    const onDisk = (f) => fs.existsSync(path.join(images.UPLOAD_DIR, f));
    check(r.status === 200 && /^images\/uploads\/hero-shot-[0-9a-f]{8}\.webp$/.test(out.path || ""),
      "a PNG upload is stored as WebP under a clean name", r.status + " " + r.html);
    check(JSON.stringify(out.widths) === "[400,700]" && onDisk(stem + ".webp") && onDisk(stem + "-400w.webp") && onDisk(stem + "-700w.webp"),
      "  with 400w and 700w variants on disk", JSON.stringify(out));
    const meta = out.path ? await sharp(path.join(images.UPLOAD_DIR, stem + ".webp")).metadata() : {};
    check(meta.format === "webp" && meta.width === 1200, "  the full file is really WebP at its own width", JSON.stringify(meta).slice(0, 80));
    check(content.load().media[out.path] && JSON.stringify(content.load().media[out.path].widths) === "[400,700]",
      "  and its widths reach the live content (srcset)", JSON.stringify(content.load().media[out.path]));

    r = await ed("POST", "/admin/media", formData(await png(300, 200), "small.png", edToken), JSON_ACCEPT);
    out = {}; try { out = JSON.parse(r.html); } catch { /* */ }
    if (out.path) uploaded.push(out.path);
    check(r.status === 200 && JSON.stringify(out.widths) === "[]" && !onDisk(path.basename(out.path || "x", ".webp") + "-400w.webp"),
      "a 300px image gets no variants (no srcset candidate that would 404)", r.html);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    let n = uploadsNow();
    r = await ed("POST", "/admin/media", formData(svg, "logo.png", edToken), JSON_ACCEPT);
    check(r.status === 422 && uploadsNow() === n, "an SVG named .png is refused and nothing is stored", r.status + " " + r.html);
    r = await ed("POST", "/admin/media", formData(Buffer.from("GIF89a not really an image"), "x.gif", edToken), JSON_ACCEPT);
    check(r.status === 422 && uploadsNow() === n, "a damaged image is refused and nothing is stored", r.status + " " + r.html);
    r = await ed("POST", "/admin/media", formData(Buffer.alloc(images.MAX_BYTES + 10, 1), "big.jpg", edToken), JSON_ACCEPT);
    check(r.status === 400 && /larger than/.test(r.html) && uploadsNow() === n, "a file over the limit is refused", r.status + " " + r.html);
    r = await ed("POST", "/admin/media", formData(await png(20, 20), "x.png", edToken));
    check(r.status === 303 && /^\/admin\/media\?uploaded=images%2Fuploads%2Fx-/.test(r.location || ""), "a plain form upload redirects back to the library", r.status + " " + r.location);
    if (r.location) uploaded.push(decodeURIComponent(r.location.split("uploaded=")[1]));

    /* ----------------------------------------------------------- delete */
    const main = uploaded[0];
    await db("team_members").insert({ name: "zz_test_member", photo: main, sort_order: 999 });
    r = await ed("POST", "/admin/media/delete", { _csrf: edToken, path: main });
    check(r.status === 303 && /Still%20used%20by%20Team%20zz_test_member/.test(r.location || "") && onDisk(stem + ".webp"),
      "a file still in use cannot be deleted, and the reason names the user", r.location);
    await db("team_members").where({ name: "zz_test_member" }).del();
    r = await ed("POST", "/admin/media/delete", { _csrf: edToken, path: main });
    await content.refresh();
    check(r.status === 303 && !onDisk(stem + ".webp") && !onDisk(stem + "-400w.webp") && !onDisk(stem + "-700w.webp") && !content.load().media[main],
      "  once unused it deletes, with its variants and its media entry", r.location + " disk=" + [".webp", "-400w.webp", "-700w.webp"].map((s) => onDisk(stem + s)) + " media=" + JSON.stringify(content.load().media[main]));

    const envFile = path.join(__dirname, "..", ".env");
    for (const evil of ["images/uploads/../../server/.env", "server/.env", "images/uploads/..%2F..%2Findex.html", "images/products/Model No-BH-IS-1001.webp"]) {
      r = await ed("POST", "/admin/media/delete", { _csrf: edToken, path: evil });
      check(r.status === 303 && /error=/.test(r.location || ""), "delete refuses " + evil, r.location);
    }
    check(fs.existsSync(envFile) && fs.existsSync(path.join(__dirname, "..", "..", "images", "products", "Model No-BH-IS-1001.webp")),
      "  and those files are all still there");

    /* ---------------------------------------------------------- backups */
    r = await ed("GET", "/admin/backups");
    check(r.status === 403, "an editor cannot open Backups", r.status);
    r = await ed("POST", "/admin/backups/1/restore", { _csrf: edToken });
    check(r.status === 403, "  nor restore one", r.status);

    const supToken = await tokenOf(sup);
    r = await sup("POST", "/admin/backups", { _csrf: supToken, note: "zz test " + XSS });
    const mine = await db("content_snapshots").orderBy("id", "desc").first();
    check(r.status === 303 && mine && mine.reason === "manual" && mine.id > startSnapshot && JSON.parse(mine.summary).products > 0,
      "a manual snapshot is taken, with its counts", r.status + " " + JSON.stringify(mine && { ...mine, data: undefined }));

    r = await sup("GET", "/admin/backups/" + mine.id + "/download");
    let dl = null; try { dl = JSON.parse(r.html); } catch { /* */ }
    check(r.status === 200 && /attachment/.test(r.disposition) && dl && dl.format === "bongshai-steel/content-snapshot@1" && dl.tables.products.length > 0,
      "it downloads as a JSON attachment", r.status + " " + r.disposition);

    const faq = await db("faqs").orderBy("id").first();
    await db("faqs").where({ id: faq.id }).update({ question: "zz_test changed question" });
    await db("categories").where("id", (await db("categories").orderBy("id").first()).id).update({ sort_order: 777 });
    r = await sup("POST", "/admin/backups/" + mine.id + "/restore", { _csrf: supToken });
    const after = await db("faqs").where({ id: faq.id }).first();
    const safety = await db("content_snapshots").orderBy("id", "desc").first();
    check(r.status === 303 && after && after.question === faq.question && !(await db("categories").where({ sort_order: 777 }).first()),
      "restore puts the content back exactly, ids included", r.status + " " + r.location);
    check(safety.reason === "before-restore" && safety.data.includes("zz_test changed question"),
      "  and the state it replaced was saved first, so it can be undone");
    check(content.load().sections.faq.some((f) => f.q === faq.question) && !content.load().sections.faq.some((f) => /zz_test/.test(f.q)),
      "  and the live content follows");

    const [emptyId] = await db("content_snapshots").insert({
      reason: "manual", bytes: 10, summary: null,
      data: JSON.stringify({ format: "bongshai-steel/content-snapshot@1", tables: Object.fromEntries(require("../lib/snapshots").TABLES.map((t) => [t, []])) }),
    });
    const productsBefore = Number((await db("products").count({ n: "*" }))[0].n);
    r = await sup("POST", "/admin/backups/" + emptyId + "/restore", { _csrf: supToken });
    check(r.status === 303 && /error=/.test(r.location || "") && Number((await db("products").count({ n: "*" }))[0].n) === productsBefore,
      "a snapshot with no products is refused and nothing changes", r.location);
    r = await sup("POST", "/admin/backups/99999999/restore", { _csrf: supToken });
    check(r.status === 303 && /does%20not%20exist/.test(r.location || ""), "restoring a missing snapshot says so", r.location);
    r = await sup("POST", "/admin/backups/1%20or%201/restore", { _csrf: supToken });
    check(r.status === 404, "a non-numeric id is a 404", r.status);

    /* -------------------------------------------------------- templates */
    r = await ed("GET", "/admin/media");
    check(r.status === 200 && !/RENDER ERROR/.test(r.html), "the media library renders", r.status + " " + r.html.slice(0, 160));
    const up = forms(r.html).find((f) => f.action === "/admin/media");
    check(up && /multipart\/form-data/i.test(up.enctype) && up.fileInputs.join() === "file" && up.csrfCount === 1,
      "  its upload form is multipart, one file field, one _csrf", JSON.stringify(up));
    const dels = forms(r.html).filter((f) => f.action === "/admin/media/delete");
    const perPath = {}; for (const d of dels) perPath[d.fields.path] = (perPath[d.fields.path] || 0) + 1;
    check(Object.values(perPath).every((c) => c === 1) && dels.every((d) => d.csrfCount === 1), "  each file has at most one delete form", JSON.stringify(perPath));
    if (up) {
      const fd = formData(await png(900, 600), "via form.png", up.fields._csrf);
      r = await ed("POST", "/admin/media", fd);
      if (r.location && /uploaded=/.test(r.location)) uploaded.push(decodeURIComponent(r.location.split("uploaded=")[1]));
      const page = await ed("GET", r.location || "/admin/media");
      check(r.status === 303 && page.status === 200 && page.html.includes(uploaded[uploaded.length - 1]), "  uploading through the rendered form works and the page shows the new path", r.status + " " + r.location);
    }

    r = await sup("GET", "/admin/backups");
    check(r.status === 200 && !/RENDER ERROR/.test(r.html) && !injected(r.html), "the backups page renders, names and notes escaped", r.status + " " + r.html.slice(0, 160));
    const restores = forms(r.html).filter((f) => /^\/admin\/backups\/\d+\/restore$/.test(f.action));
    check(restores.length >= 2 && restores.every((f) => f.csrfCount === 1), "  a restore form per snapshot, each with _csrf", restores.length);
    const take = forms(r.html).find((f) => f.action === "/admin/backups");
    check(take && take.csrfCount === 1 && "note" in take.fields, "  and a take-snapshot form with a note field", JSON.stringify(take));
  } finally {
    server.close();
    await cleanup();
    await db.destroy();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
}

main().catch(async (e) => { console.error(e); process.exitCode = 1; try { await cleanup(); await db.destroy(); } catch { /* */ } });
