/* ==========================================================================
   ADMIN ROUTES
   --------------------------------------------------------------------------
   Renders the templates Antigravity builds in server/views/admin/ (task
   T-001). The variable names passed here ARE the contract written in the
   coordination TASKS.md — change one side, change the other.

   Every content write ends the same way: bump the content revision, refresh
   the in-memory copy, write the activity trail. The public site then shows
   the change on the next request here, and within one poll everywhere else.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const bcrypt = require("bcryptjs");

const auth = require("../lib/auth");
const { ROOT } = require("../lib/paths");

// Compared against when a username does not exist, so a wrong name costs the
// same bcrypt work as a wrong password and timing reveals nothing.
const DUMMY_HASH = bcrypt.hashSync("never-a-real-password", 12);

const CONTENT_ROLES = ["superadmin", "admin", "editor"];

/** A validation problem the user should read — never an internal error. */
class FormError extends Error {}

/** How a ticked checkbox arrives. One definition, used for saving AND for
    refilling the form after an error — the two used to disagree, and a
    rejected save silently unticked Published and Featured. */
const on = (v) => v === "on" || v === "1" || v === "true" || v === true;

module.exports = function createAdminRouter({ db, content }) {
  const router = express.Router();

  // The public home page loads admin/editor.js and editor.css. Those must not
  // touch the session machinery below, or every visitor would get a session
  // row and a cookie. Skip this whole router for them.
  router.use("/admin", (req, res, next) =>
    (/^\/editor\.(?:js|css)$/.test(req.path) ? next("router") : next()));

  router.use("/admin", (req, res, next) => {
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });
  router.use("/admin", express.urlencoded({ extended: false, limit: "64kb" }));
  router.use("/admin", auth.sessionMiddleware(db));
  router.use("/admin", auth.csrf);

  /* -------------------------------------------------------------- helpers */

  async function logActivity(req, action, entityType, entityId, summary) {
    try {
      await db("activity_log").insert({
        admin_user_id: req.admin ? req.admin.id : null,
        admin_name: req.admin ? (req.admin.name || req.admin.username) : null,
        action: String(action).slice(0, 50),
        entity_type: entityType || null,
        entity_id: entityId == null ? null : String(entityId).slice(0, 100),
        summary: summary ? String(summary).slice(0, 500) : null,
      });
    } catch (err) {
      console.error("activity:", err.message); // never fail the action over its log line
    }
  }

  /** After any content write: every worker and the public pages catch up. */
  async function contentChanged() {
    await content.bumpRev();
    await content.refresh();
  }

  function view(req, active, extra) {
    return {
      active,
      notice: typeof req.query.notice === "string" ? req.query.notice.slice(0, 200) : null,
      error: typeof req.query.error === "string" ? req.query.error.slice(0, 200) : null,
      ...extra,
    };
  }

  /* ----------------------------------------------------------- sign in/out */

  router.get("/admin/login", (req, res) => {
    if (req.session.adminUserId) return res.redirect(auth.safeReturn(req.query.return));
    res.render("admin/login.njk", { error: null, username: "", lockedMinutes: 0 });
  });

  router.post("/admin/login", async (req, res, next) => {
    try {
      const ip = req.ip;
      const username = String(req.body.username || "").trim().slice(0, 64);
      const password = String(req.body.password || "");
      const locked = auth.lockedFor(ip);
      if (locked) {
        return res.status(429).render("admin/login.njk", {
          error: "Too many failed attempts.", username, lockedMinutes: Math.ceil(locked / 60000),
        });
      }

      const user = username ? await db("admin_users").where({ username }).first() : null;
      // Always pay the bcrypt cost, whether or not the user exists.
      const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

      if (!user || !ok || !user.active || !password) {
        auth.noteFailure(ip);
        await logActivity(req, "auth.failed", "user", null, "sign-in failed for '" + username + "'");
        const lockedNow = auth.lockedFor(ip);
        return res.status(lockedNow ? 429 : 401).render("admin/login.njk", {
          error: lockedNow ? "Too many failed attempts." : "Incorrect username or password.",
          username, lockedMinutes: lockedNow ? Math.ceil(lockedNow / 60000) : 0,
        });
      }

      auth.clearFailures(ip);
      const returnTo = auth.safeReturn(req.query.return);
      // New session id on sign-in: a session id handed out before login can
      // never become an authenticated one (session fixation).
      req.session.regenerate(async (err) => {
        if (err) return next(err);
        req.session.adminUserId = user.id;
        req.session.signedInAt = Date.now();
        req.admin = user;
        await db("admin_users").where({ id: user.id }).update({ last_login_at: db.fn.now() });
        await logActivity(req, "auth.signin", "user", user.id, user.username + " signed in");
        // The store is async: save before redirecting or the next request can
        // arrive before the session exists.
        req.session.save((err2) => (err2 ? next(err2) : res.redirect(returnTo)));
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/logout", async (req, res) => {
    if (req.session.adminUserId) {
      const u = await db("admin_users").where({ id: req.session.adminUserId }).first("id", "username", "name");
      if (u) { req.admin = u; await logActivity(req, "auth.logout", "user", u.id, u.username + " signed out"); }
    }
    req.session.destroy(() => {
      res.clearCookie("bs_admin", { path: "/admin" });
      res.redirect("/admin/login");
    });
  });

  /* ------------------------------------------------- everything else: auth */

  router.use("/admin", auth.requireAdmin(db));

  router.get("/admin", async (req, res, next) => {
    try {
      const count = async (q) => Number((await q.count({ n: "*" }))[0].n);
      const [products, categories, faqs, leadsNew, leadsTotal, recentActivity] = await Promise.all([
        count(db("products")),
        count(db("categories")),
        count(db("faqs")),
        count(db("leads").where({ status: "new" })),
        count(db("leads")),
        db("activity_log").orderBy("id", "desc").limit(12)
          .select("created_at", "admin_name", "action", "summary"),
      ]);
      let views = null;
      try { views = parseInt(fs.readFileSync(path.join(ROOT, "counter.txt"), "utf8"), 10) || 0; } catch { /* no counter yet */ }
      res.render("admin/dashboard.njk", view(req, "dashboard", {
        stats: { products, categories, faqs, leadsNew, leadsTotal, views },
        recentActivity,
      }));
    } catch (err) {
      next(err);
    }
  });

  /* --------------------------------------------------------------- products */

  router.use("/admin/products", auth.requireRole(...CONTENT_ROLES));

  async function categoryList() {
    return db("categories").orderBy("sort_order").orderBy("id").select("id", "key", "name");
  }

  router.get("/admin/products", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
      const category = typeof req.query.category === "string" && req.query.category ? req.query.category : "all";
      const query = db("products as p").join("categories as c", "c.id", "p.category_id")
        .orderBy("c.sort_order").orderBy("p.sort_order").orderBy("p.id")
        .select("p.id", "p.model_code", "p.name", "p.image", "p.featured", "p.published", "p.sort_order",
          "c.name as category_name");
      if (category !== "all") query.where("c.key", category);
      if (q) {
        const like = "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
        query.where((b) => b.where("p.name", "like", like).orWhere("p.model_code", "like", like));
      }
      const products = await query;
      res.render("admin/products/list.njk", view(req, "products", {
        products, categories: await categoryList(), q, category, total: products.length,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/products/new", async (req, res, next) => {
    try {
      res.render("admin/products/form.njk", view(req, "products", {
        product: {}, categories: await categoryList(), error: null,
      }));
    } catch (err) {
      next(err);
    }
  });

  /** Validates a submitted form into a row. Throws a user-facing message. */
  async function productFields(body) {
    const model_code = String(body.model_code || "").trim();
    if (!/^[A-Za-z0-9._-]{2,60}$/.test(model_code)) {
      throw new FormError("Model code: 2-60 letters, digits, dot, dash or underscore — it becomes the page URL.");
    }
    const name = String(body.name || "").trim();
    if (!name) throw new FormError("Name is required.");
    if (name.length > 255) throw new FormError("Name is too long (255 characters at most).");

    const category_id = parseInt(body.category_id, 10);
    if (!category_id || !(await db("categories").where({ id: category_id }).first("id"))) {
      throw new FormError("Pick a category.");
    }

    const image = String(body.image || "").trim();
    // A site-relative path under images/ — never a URL, never a way out of the site.
    // Spaces are allowed: every existing product photo is named like
    // "Model No-BH-IS-1001.webp", so refusing them made every product unsavable.
    if (image && (!/^images\/[^?#\\\x00-\x1f]+\.(?:webp|jpe?g|png|gif)$/i.test(image) || image.includes(".."))) {
      throw new FormError("Image must be a path like images/products/name.webp.");
    }

    const slugIn = String(body.slug || "").trim();
    const slug = slugIn || model_code.toLowerCase();
    if (!/^[a-z0-9._-]{2,100}$/.test(slug)) throw new FormError("Slug: lower-case letters, digits, dot, dash or underscore.");

    const sort = parseInt(body.sort_order, 10);

    return {
      model_code, slug, name,
      description: String(body.description || "").trim().slice(0, 10000) || null,
      image: image || null,
      category_id,
      featured: on(body.featured),
      published: on(body.published),
      sort_order: Number.isFinite(sort) ? sort : 0,
    };
  }

  function duplicateMessage(err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      // Match the key name in the driver's own message: knex prefixes
      // err.message with the whole SQL, which names every column.
      return /for key '[^']*slug/i.test(err.sqlMessage || "")
        ? "Another product already uses that slug."
        : "Another product already uses that model code.";
    }
    return null;
  }

  async function featuredOrder(trx, featured, current) {
    if (!featured) return null;
    if (current != null) return current;
    const [{ m }] = await trx("products").max({ m: "featured_order" });
    return m == null ? 0 : m + 1;
  }

  router.post("/admin/products", async (req, res, next) => {
    let fields;
    try {
      fields = await productFields(req.body);
      fields.featured_order = await featuredOrder(db, fields.featured, null);
      const [id] = await db("products").insert(fields);
      await contentChanged();
      await logActivity(req, "product.create", "product", id, "created " + fields.model_code + " — " + fields.name);
      res.redirect("/admin/products?notice=" + encodeURIComponent("Created " + fields.model_code + "."));
    } catch (err) {
      const msg = duplicateMessage(err) || (err instanceof FormError ? err.message : null);
      if (!msg) return next(err);
      res.status(422).render("admin/products/form.njk", view(req, "products", {
        product: { ...req.body, featured: on(req.body.featured), published: on(req.body.published) },
        categories: await categoryList(), error: msg,
      }));
    }
  });

  async function findProduct(id) {
    const n = parseInt(id, 10);
    return n ? db("products").where({ id: n }).first() : null;
  }

  router.get("/admin/products/:id/edit", async (req, res, next) => {
    try {
      const product = await findProduct(req.params.id);
      if (!product) return next();   // the app's 404
      res.render("admin/products/form.njk", view(req, "products", {
        product, categories: await categoryList(), error: null,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/products/:id", async (req, res, next) => {
    const existing = await findProduct(req.params.id).catch(() => null);
    if (!existing) return next();
    try {
      const fields = await productFields(req.body);
      fields.featured_order = await featuredOrder(db, fields.featured, existing.featured ? existing.featured_order : null);
      fields.updated_at = db.fn.now();
      await db("products").where({ id: existing.id }).update(fields);
      await contentChanged();
      await logActivity(req, "product.update", "product", existing.id, "updated " + fields.model_code);
      res.redirect("/admin/products?notice=" + encodeURIComponent("Saved " + fields.model_code + "."));
    } catch (err) {
      const msg = duplicateMessage(err) || (err instanceof FormError ? err.message : null);
      if (!msg) return next(err);
      res.status(422).render("admin/products/form.njk", view(req, "products", {
        product: { ...req.body, id: existing.id, featured: on(req.body.featured), published: on(req.body.published) },
        categories: await categoryList(), error: msg,
      }));
    }
  });

  router.post("/admin/products/:id/delete", async (req, res, next) => {
    try {
      const existing = await findProduct(req.params.id);
      if (!existing) return next();
      await db("products").where({ id: existing.id }).del();
      await contentChanged();
      await logActivity(req, "product.delete", "product", existing.id, "deleted " + existing.model_code + " — " + existing.name);
      res.redirect("/admin/products?notice=" + encodeURIComponent("Deleted " + existing.model_code + "."));
    } catch (err) {
      next(err);
    }
  });

  return router;
};
