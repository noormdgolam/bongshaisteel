/* ==========================================================================
   ADMIN — USER ACCOUNTS AND PRODUCT CATEGORIES
   --------------------------------------------------------------------------
   Registered on the admin router after its session, CSRF and sign-in gates.
   Templates: T-004 (admin/users/*, admin/categories/*).

   Account rules are enforced here, whatever a form submits:
   - nobody changes their own role, disables themselves or deletes themselves;
   - the last active superadmin cannot be demoted, disabled or deleted;
   - an admin can neither grant superadmin nor touch a superadmin's account;
   - disabling a user or changing their password ends their open sessions.
   ========================================================================== */
"use strict";

const bcrypt = require("bcryptjs");

const ROLE_INFO = [
  { value: "superadmin", label: "Super admin", help: "Everything, including other admins." },
  { value: "admin", label: "Admin", help: "Everything except superadmin accounts." },
  { value: "editor", label: "Editor", help: "Products, categories and site content. No users." },
  { value: "sales", label: "Sales", help: "Messages and the dashboard only." },
];
const IMAGE_PATH = /^images\/[^?#\\\x00-\x1f]+\.(?:webp|jpe?g|png|gif)$/i;

module.exports = function registerUserRoutes(router, deps) {
  const { db, auth, logActivity, contentChanged, view, on, FormError, contentRoles } = deps;

  /* =============================================================== users */

  router.use("/admin/users", auth.requireRole("superadmin", "admin"));

  const assignable = (actor) => (actor.role === "superadmin" ? ROLE_INFO : ROLE_INFO.filter((r) => r.value !== "superadmin"));

  async function activeSuperadmins(except) {
    const q = db("admin_users").where({ role: "superadmin", active: true });
    if (except) q.whereNot({ id: except });
    return Number((await q.count({ n: "*" }))[0].n);
  }

  /** End every session belonging to a user (except the one making the change). */
  async function endSessions(userId, keepSid) {
    const q = db("sessions").where("sess", "like", '%"adminUserId":' + Number(userId) + ",%")
      .orWhere("sess", "like", '%"adminUserId":' + Number(userId) + "}%");
    const rows = await q.select("sid");
    const ids = rows.map((r) => r.sid).filter((sid) => sid !== keepSid);
    if (ids.length) await db("sessions").whereIn("sid", ids).del();
    return ids.length;
  }

  router.get("/admin/users", async (req, res, next) => {
    try {
      const users = await db("admin_users").orderBy("active", "desc").orderBy("username")
        .select("id", "username", "name", "email", "role", "active", "last_login_at", "created_at");
      res.render("admin/users/list.njk", view(req, "users", { users, currentUserId: req.admin.id }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/users/new", (req, res) => {
    res.render("admin/users/form.njk", view(req, "users", {
      user: {}, roles: assignable(req.admin), isSelf: false, error: null,
    }));
  });

  /** Validate a submitted account. `existing` is the row being edited, or null. */
  async function accountFields(req, existing) {
    const b = req.body;
    const actor = req.admin;
    const isSelf = existing && existing.id === actor.id;

    const username = String(b.username || "").trim();
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
      throw new FormError("Username: 3-64 letters, digits, dot, dash or underscore.");
    }
    const name = String(b.name || "").trim().slice(0, 255) || null;
    const email = String(b.email || "").trim() || null;
    if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new FormError("That email address does not look right.");
    }

    // Role and active: your own cannot change, whatever the form says.
    let role = isSelf ? existing.role : String(b.role || "");
    let active = isSelf ? !!existing.active : on(b.active);
    if (!isSelf && !assignable(actor).some((r) => r.value === role)) {
      throw new FormError("Choose a role from the list.");
    }

    // Never leave the panel without an active superadmin.
    if (existing && existing.role === "superadmin" && existing.active && (role !== "superadmin" || !active)) {
      if ((await activeSuperadmins(existing.id)) === 0) {
        throw new FormError("This is the last active super admin — make someone else super admin first.");
      }
    }

    const pw = String(b.password || "");
    const pw2 = String(b.password2 || "");
    let password_hash;
    if (!existing || pw || pw2) {
      if (pw.length < 8) throw new FormError("Password: at least 8 characters.");
      if (pw.length > 200) throw new FormError("Password is too long.");
      if (pw !== pw2) throw new FormError("The two passwords do not match.");
      password_hash = await bcrypt.hash(pw, 12);
    }
    return { username, name, email, role, active, ...(password_hash ? { password_hash } : {}) };
  }

  function formFor(req, existing, body, error) {
    // Never echo a password back into the page.
    const { password, password2, _csrf, ...safe } = body || {};
    return view(req, "users", {
      user: existing ? { ...existing, ...safe, id: existing.id, active: safe.active !== undefined ? on(safe.active) : existing.active } : { ...safe, active: on(safe.active) },
      roles: assignable(req.admin),
      isSelf: !!existing && existing.id === req.admin.id,
      error,
    });
  }

  function dupUser(err) {
    return err && err.code === "ER_DUP_ENTRY" ? "That username is already taken." : null;
  }

  router.post("/admin/users", async (req, res, next) => {
    try {
      const fields = await accountFields(req, null);
      const [id] = await db("admin_users").insert(fields);
      await logActivity(req, "user.create", "user", id, "created " + fields.username + " (" + fields.role + ")");
      res.redirect("/admin/users?notice=" + encodeURIComponent("Created " + fields.username + "."));
    } catch (err) {
      const msg = dupUser(err) || (err instanceof FormError ? err.message : null);
      if (!msg) return next(err);
      res.status(422).render("admin/users/form.njk", formFor(req, null, req.body, msg));
    }
  });

  async function findUser(req, res) {
    const id = parseInt(req.params.id, 10);
    const user = id ? await db("admin_users").where({ id }).first("id", "username", "name", "email", "role", "active") : null;
    if (!user) return null;
    // An admin may not open, change or delete a superadmin's account.
    if (user.role === "superadmin" && req.admin.role !== "superadmin") {
      res.status(403).type("text").send("Only a super admin can change a super admin's account.");
      return false;
    }
    return user;
  }

  router.get("/admin/users/:id/edit", async (req, res, next) => {
    try {
      const user = await findUser(req, res);
      if (user === false) return;
      if (!user) return next();
      res.render("admin/users/form.njk", formFor(req, user, null, null));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/users/:id", async (req, res, next) => {
    let user;
    try {
      user = await findUser(req, res);
      if (user === false) return;
      if (!user) return next();
      const fields = await accountFields(req, user);
      await db("admin_users").where({ id: user.id }).update({ ...fields, updated_at: db.fn.now() });
      let ended = 0;
      if (fields.password_hash || (user.active && !fields.active)) ended = await endSessions(user.id, req.sessionID);
      const what = [
        fields.role !== user.role ? "role " + user.role + " → " + fields.role : null,
        !!user.active !== fields.active ? (fields.active ? "enabled" : "disabled") : null,
        fields.password_hash ? "password changed" : null,
      ].filter(Boolean).join(", ") || "details edited";
      await logActivity(req, "user.update", "user", user.id, fields.username + ": " + what + (ended ? " (" + ended + " session(s) ended)" : ""));
      res.redirect("/admin/users?notice=" + encodeURIComponent("Saved " + fields.username + "."));
    } catch (err) {
      const msg = dupUser(err) || (err instanceof FormError ? err.message : null);
      if (!msg || !user) return next(err);
      res.status(422).render("admin/users/form.njk", formFor(req, user, req.body, msg));
    }
  });

  router.post("/admin/users/:id/delete", async (req, res, next) => {
    try {
      const user = await findUser(req, res);
      if (user === false) return;
      if (!user) return next();
      if (user.id === req.admin.id) {
        return res.redirect("/admin/users?error=" + encodeURIComponent("You cannot delete your own account."));
      }
      if (user.role === "superadmin" && user.active && (await activeSuperadmins(user.id)) === 0) {
        return res.redirect("/admin/users?error=" + encodeURIComponent("That is the last active super admin."));
      }
      await endSessions(user.id, null);
      await db("admin_users").where({ id: user.id }).del();   // activity_log keeps the name snapshot
      await logActivity(req, "user.delete", "user", user.id, "deleted " + user.username);
      res.redirect("/admin/users?notice=" + encodeURIComponent("Deleted " + user.username + "."));
    } catch (err) {
      next(err);
    }
  });

  /* ========================================================== categories */

  router.use("/admin/categories", auth.requireRole(...contentRoles));

  async function categoryRows() {
    return db("categories as c")
      .leftJoin("main_categories as m", "m.id", "c.main_category_id")
      .leftJoin("products as p", "p.category_id", "c.id")
      .groupBy("c.id", "m.name")
      .orderBy("c.sort_order").orderBy("c.id")
      .select("c.id", "c.key", "c.name", "c.icon", "c.blurb", "c.image", "c.sort_order", "m.name as main_category_name")
      .count({ product_count: "p.id" });
  }

  const mainList = () => db("main_categories").orderBy("sort_order").orderBy("id").select("id", "key", "name");

  router.get("/admin/categories", async (req, res, next) => {
    try {
      const categories = (await categoryRows()).map((c) => ({ ...c, product_count: Number(c.product_count) }));
      res.render("admin/categories/list.njk", view(req, "categories", { categories }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/categories/new", async (req, res, next) => {
    try {
      res.render("admin/categories/form.njk", view(req, "categories", {
        category: {}, mainCategories: await mainList(), productCount: 0, error: null,
      }));
    } catch (err) {
      next(err);
    }
  });

  async function categoryFields(body, existing) {
    const key = String(body.key || "").trim();
    if (!existing) {
      if (!/^[a-z0-9-]{2,50}$/.test(key)) throw new FormError("Key: 2-50 lower-case letters, digits or dashes.");
    } else if (key !== existing.key) {
      // The key is in the public nav and in /category/<key> links already out there.
      throw new FormError("The key of an existing category cannot change — it is part of links already in use. Create a new category instead.");
    }
    const name = String(body.name || "").trim();
    if (!name) throw new FormError("Name is required.");
    if (name.length > 255) throw new FormError("Name is too long (255 characters at most).");
    const icon = String(body.icon || "").trim();
    if (icon.length > 32) throw new FormError("Icon: one emoji.");
    const blurb = String(body.blurb || "").trim();
    if (blurb.length > 5000) throw new FormError("Description is too long.");
    const image = String(body.image || "").trim();
    if (image && (!IMAGE_PATH.test(image) || image.includes(".."))) {
      throw new FormError("Image must be a path like images/products/name.webp.");
    }
    let main_category_id = null;
    if (body.main_category_id) {
      main_category_id = parseInt(body.main_category_id, 10);
      if (!main_category_id || !(await db("main_categories").where({ id: main_category_id }).first("id"))) {
        throw new FormError("Pick a main category from the list.");
      }
    }
    const spec_template = String(body.spec_template || "").split(/\r?\n/)
      .map((l) => l.trim()).filter(Boolean).slice(0, 40);
    if (spec_template.some((l) => l.length > 100)) throw new FormError("Spec labels: 100 characters at most each.");
    const meta_title = String(body.meta_title || "").trim();
    if (meta_title.length > 255) throw new FormError("SEO title is too long (255 characters at most).");
    const meta_description = String(body.meta_description || "").trim();
    if (meta_description.length > 500) throw new FormError("SEO description is too long (500 characters at most).");
    return {
      ...(existing ? {} : { key }), name, icon: icon || null, blurb: blurb || null, image: image || null, main_category_id,
      spec_template: spec_template.join("\n") || null, meta_title: meta_title || null, meta_description: meta_description || null,
    };
  }

  async function categoryForm(req, category, body, error) {
    const productCount = category && category.id
      ? Number((await db("products").where({ category_id: category.id }).count({ n: "*" }))[0].n) : 0;
    return view(req, "categories", {
      category: { ...(category || {}), ...(body ? { ...body, _csrf: undefined } : {}), id: category && category.id },
      mainCategories: await mainList(), productCount, error,
    });
  }

  router.post("/admin/categories", async (req, res, next) => {
    try {
      const fields = await categoryFields(req.body, null);
      const [{ m }] = await db("categories").max({ m: "sort_order" });
      const [id] = await db("categories").insert({ ...fields, sort_order: m == null ? 0 : m + 1 });
      await contentChanged();
      await logActivity(req, "category.create", "category", id, "created " + fields.key + " — " + fields.name);
      res.redirect("/admin/categories?notice=" + encodeURIComponent("Created " + fields.name + "."));
    } catch (err) {
      const msg = err && err.code === "ER_DUP_ENTRY" ? "Another category already uses that key." : (err instanceof FormError ? err.message : null);
      if (!msg) return next(err);
      res.status(422).render("admin/categories/form.njk", await categoryForm(req, null, req.body, msg));
    }
  });

  async function findCategory(id) {
    const n = parseInt(id, 10);
    return n ? db("categories").where({ id: n }).first() : null;
  }

  router.get("/admin/categories/:id/edit", async (req, res, next) => {
    try {
      const category = await findCategory(req.params.id);
      if (!category) return next();
      res.render("admin/categories/form.njk", await categoryForm(req, category, null, null));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/categories/:id", async (req, res, next) => {
    const existing = await findCategory(req.params.id).catch(() => null);
    if (!existing) return next();
    try {
      const fields = await categoryFields(req.body, existing);
      await db("categories").where({ id: existing.id }).update({ ...fields, updated_at: db.fn.now() });
      await contentChanged();
      await logActivity(req, "category.update", "category", existing.id, "edited " + existing.key);
      res.redirect("/admin/categories?notice=" + encodeURIComponent("Saved " + fields.name + "."));
    } catch (err) {
      if (!(err instanceof FormError)) return next(err);
      res.status(422).render("admin/categories/form.njk", await categoryForm(req, existing, req.body, err.message));
    }
  });

  router.post("/admin/categories/:id/delete", async (req, res, next) => {
    try {
      const existing = await findCategory(req.params.id);
      if (!existing) return next();
      const n = Number((await db("products").where({ category_id: existing.id }).count({ n: "*" }))[0].n);
      if (n > 0) {
        return res.redirect("/admin/categories/" + existing.id + "/edit?error=" +
          encodeURIComponent("This category still has " + n + " products — move them to another category first."));
      }
      await db("categories").where({ id: existing.id }).del();
      await contentChanged();
      await logActivity(req, "category.delete", "category", existing.id, "deleted " + existing.key + " — " + existing.name);
      res.redirect("/admin/categories?notice=" + encodeURIComponent("Deleted " + existing.name + "."));
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------ menu lines (main categories)
     The four columns of the Products menu. Their keys are fixed (links use
     them); name, icon, blurb and order are editable. */

  router.use("/admin/menu-lines", auth.requireRole(...contentRoles));

  router.get("/admin/menu-lines", async (req, res, next) => {
    try {
      const lines = await db("main_categories as m").leftJoin("categories as c", "c.main_category_id", "m.id")
        .groupBy("m.id").orderBy("m.sort_order").orderBy("m.id")
        .select("m.id", "m.key", "m.name", "m.icon", "m.blurb", "m.sort_order").count({ types: "c.id" });
      res.render("admin/categories/lines.njk", view(req, "categories", { lines }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/menu-lines/:id", async (req, res, next) => {
    try {
      const line = await db("main_categories").where({ id: parseInt(req.params.id, 10) || 0 }).first("id", "key");
      if (!line) return next();
      const name = String(req.body.name || "").trim();
      const icon = String(req.body.icon || "").trim();
      const blurb = String(req.body.blurb || "").trim();
      const bad = !name ? "Name is required." : name.length > 255 ? "Name is too long." : icon.length > 32 ? "Icon: one emoji." : blurb.length > 5000 ? "Description is too long." : null;
      if (bad) return res.redirect("/admin/menu-lines?error=" + encodeURIComponent(bad));
      await db("main_categories").where({ id: line.id }).update({ name, icon: icon || null, blurb: blurb || null, updated_at: db.fn.now() });
      await contentChanged();
      await logActivity(req, "menu.update", "main_category", line.id, "edited menu line " + line.key);
      res.redirect("/admin/menu-lines?notice=" + encodeURIComponent("Saved " + name + "."));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/menu-lines/:id/move", async (req, res, next) => {
    try {
      const dir = req.body.direction === "up" ? -1 : req.body.direction === "down" ? 1 : 0;
      if (dir) {
        await db.transaction(async (trx) => {
          const rows = await trx("main_categories").orderBy("sort_order").orderBy("id").select("id");
          const i = rows.findIndex((r) => r.id === parseInt(req.params.id, 10));
          const j = i + dir;
          if (i < 0 || j < 0 || j >= rows.length) return;
          [rows[i], rows[j]] = [rows[j], rows[i]];
          for (const [pos, r] of rows.entries()) await trx("main_categories").where({ id: r.id }).update({ sort_order: pos });
        });
        await contentChanged();
        await logActivity(req, "menu.move", "main_category", req.params.id, "moved a menu line " + (dir < 0 ? "up" : "down"));
      }
      res.redirect("/admin/menu-lines");
    } catch (err) {
      next(err);
    }
  });

  /* Adds every template label a product in this category does not have yet,
     with an empty value to fill in. Existing rows are never touched. */
  router.post("/admin/categories/:id/sync-specs", async (req, res, next) => {
    try {
      const existing = await findCategory(req.params.id);
      if (!existing) return next();
      const labels = String(existing.spec_template || "").split("\n").map((l) => l.trim()).filter(Boolean);
      if (!labels.length) {
        return res.redirect("/admin/categories/" + existing.id + "/edit?error=" + encodeURIComponent("Save a spec template first."));
      }
      let added = 0;
      const ids = await db("products").where({ category_id: existing.id }).pluck("id");
      await db.transaction(async (trx) => {
        for (const id of ids) {
          const have = new Set((await trx("product_specs").where({ product_id: id }).pluck("label")).map((l) => l.toLowerCase()));
          const [{ m }] = await trx("product_specs").where({ product_id: id }).max({ m: "sort_order" });
          let order = m == null ? 0 : m + 1;
          const rows = labels.filter((l) => !have.has(l.toLowerCase()))
            .map((label) => ({ product_id: id, label, value: "", sort_order: order++ }));
          if (rows.length) { await trx("product_specs").insert(rows); added += rows.length; }
        }
      });
      await contentChanged();
      await logActivity(req, "category.sync-specs", "category", existing.id,
        "added " + added + " empty spec row(s) to " + ids.length + " product(s) in " + existing.key);
      res.redirect("/admin/categories/" + existing.id + "/edit?notice=" +
        encodeURIComponent("Added " + added + " spec row(s) across " + ids.length + " product(s). Empty rows stay hidden on the site until filled."));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/categories/:id/move", async (req, res, next) => {
    try {
      const dir = req.body.direction === "up" ? -1 : req.body.direction === "down" ? 1 : 0;
      if (dir) {
        await db.transaction(async (trx) => {
          const rows = await trx("categories").orderBy("sort_order").orderBy("id").select("id");
          const i = rows.findIndex((r) => r.id === parseInt(req.params.id, 10));
          const j = i + dir;
          if (i < 0 || j < 0 || j >= rows.length) return;
          [rows[i], rows[j]] = [rows[j], rows[i]];
          for (const [pos, r] of rows.entries()) await trx("categories").where({ id: r.id }).update({ sort_order: pos });
        });
        await contentChanged();
      }
      res.redirect("/admin/categories");
    } catch (err) {
      next(err);
    }
  });
};

module.exports.ROLE_INFO = ROLE_INFO;
