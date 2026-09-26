/* ==========================================================================
   ADMIN — PRODUCTS
   --------------------------------------------------------------------------
   List (search, filter, bulk actions), create, edit, duplicate, delete, and
   a per-model edit history that can be restored — the parts of the Housing
   product editor that fit a steel catalogue.

   Each model carries: SEO title/description, image alt text, an optional
   "from" price (total or per sq ft, BDT or USD) and label/value spec rows.
   A new model starts with its category's spec template.

   Every change keeps the state BEFORE it in product_revisions, so a bad save
   is one click from undone even between content snapshots.
   ========================================================================== */
"use strict";

const IMAGE_PATH = /^images\/[^?#\\\x00-\x1f]+\.(?:webp|jpe?g|png|gif)$/i;
const PRICE_UNITS = ["total", "sqft"];
const CURRENCIES = ["BDT", "USD"];
const MAX_SPECS = 40;
const KEEP_REVISIONS = 30;
const BULK_ACTIONS = ["publish", "unpublish", "feature", "unfeature", "move", "delete"];

module.exports = function registerProductRoutes(router, deps) {
  const { db, auth, logActivity, contentChanged, view, on, FormError, contentRoles } = deps;

  router.use("/admin/products", auth.requireRole(...contentRoles));

  const categoryList = () => db("categories").orderBy("sort_order").orderBy("id")
    .select("id", "key", "name", "spec_template");

  const templateOf = (cat) => String((cat && cat.spec_template) || "").split("\n")
    .map((l) => l.trim()).filter(Boolean).map((label) => ({ label, value: "" }));

  async function findProduct(id) {
    const n = parseInt(id, 10);
    return n ? db("products").where({ id: n }).first() : null;
  }

  const specsOf = (q, productId) => q("product_specs").where({ product_id: productId })
    .orderBy("sort_order").orderBy("id").select("label", "value");

  /* ------------------------------------------------------------ revisions */

  async function keepRevision(q, req, product, action) {
    const specs = await specsOf(q, product.id);
    await q("product_revisions").insert({
      product_id: product.id,
      model_code: product.model_code,
      action,
      admin_name: req.admin ? (req.admin.name || req.admin.username) : null,
      data: JSON.stringify({ product, specs }),
    });
    const keep = await q("product_revisions").where({ product_id: product.id })
      .orderBy("id", "desc").limit(KEEP_REVISIONS).pluck("id");
    if (keep.length === KEEP_REVISIONS) {
      await q("product_revisions").where({ product_id: product.id }).whereNotIn("id", keep).del();
    }
  }

  /* --------------------------------------------------------- validation */

  const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => String(x));

  function specRows(body) {
    const labels = list(body.spec_label);
    const values = list(body.spec_value);
    const rows = [];
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i].trim();
      const value = String(values[i] == null ? "" : values[i]).trim();
      if (!label && !value) continue;
      if (!label) throw new FormError("Spec row " + (i + 1) + " has a value but no label.");
      if (label.length > 100) throw new FormError("Spec label \"" + label.slice(0, 30) + "…\" is longer than 100 characters.");
      if (value.length > 255) throw new FormError("The value for \"" + label + "\" is longer than 255 characters.");
      rows.push({ label, value });
    }
    if (rows.length > MAX_SPECS) throw new FormError("At most " + MAX_SPECS + " spec rows.");
    return rows;
  }

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
    if (image && (!IMAGE_PATH.test(image) || image.includes(".."))) {
      throw new FormError("Image must be a path like images/products/name.webp — or upload one.");
    }

    const slugIn = String(body.slug || "").trim();
    const slug = slugIn || model_code.toLowerCase();
    if (!/^[a-z0-9._-]{2,100}$/.test(slug)) throw new FormError("Slug: lower-case letters, digits, dot, dash or underscore.");

    const text = (v, max, label) => {
      const s = String(v || "").trim();
      if (s.length > max) throw new FormError(label + " is too long (" + max + " characters at most).");
      return s || null;
    };

    let price_from = null;
    const priceIn = String(body.price_from || "").replace(/[,\s]/g, "");
    if (priceIn) {
      price_from = Number(priceIn);
      if (!Number.isFinite(price_from) || price_from <= 0 || price_from >= 1e12) {
        throw new FormError("Price: a number above zero, or leave it blank for \"price on request\".");
      }
      price_from = Math.round(price_from * 100) / 100;
    }
    const price_unit = PRICE_UNITS.includes(body.price_unit) ? body.price_unit : "total";
    const price_currency = CURRENCIES.includes(body.price_currency) ? body.price_currency : "BDT";

    const sort = parseInt(body.sort_order, 10);

    return {
      model_code, slug, name,
      description: text(body.description, 10000, "Description"),
      image: image || null,
      image_alt: text(body.image_alt, 255, "Image alt text"),
      meta_title: text(body.meta_title, 255, "SEO title"),
      meta_description: text(body.meta_description, 500, "SEO description"),
      price_from,
      price_unit: price_from == null ? null : price_unit,
      price_currency: price_from == null ? null : price_currency,
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

  async function featuredOrder(q, featured, current) {
    if (!featured) return null;
    if (current != null) return current;
    const [{ m }] = await q("products").max({ m: "featured_order" });
    return m == null ? 0 : m + 1;
  }

  async function saveSpecs(q, productId, rows) {
    await q("product_specs").where({ product_id: productId }).del();
    if (rows.length) {
      await q("product_specs").insert(rows.map((r, i) => ({ product_id: productId, label: r.label, value: r.value, sort_order: i })));
    }
  }

  /* --------------------------------------------------------------- views */

  async function formView(req, product, specs, error, extra) {
    const categories = await categoryList();
    const revisions = product.id
      ? await db("product_revisions").where({ product_id: product.id }).orderBy("id", "desc").limit(KEEP_REVISIONS)
        .select("id", "action", "admin_name", "created_at")
      : [];
    return view(req, "products", {
      product, specs, categories, error, revisions,
      // Category id -> template labels, for the "load template" button.
      templates: Object.fromEntries(categories.map((c) => [c.id, templateOf(c).map((t) => t.label)])),
      currencies: CURRENCIES,
      ...extra,
    });
  }

  /** The submitted form, refilled after an error. */
  function echo(body, id) {
    const labels = list(body.spec_label);
    const values = list(body.spec_value);
    return {
      product: {
        ...body, _csrf: undefined, id,
        category_id: parseInt(body.category_id, 10) || null,
        featured: on(body.featured), published: on(body.published),
      },
      specs: labels.map((label, i) => ({ label, value: values[i] || "" })),
    };
  }

  /* ---------------------------------------------------------------- list */

  router.get("/admin/products", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
      const category = typeof req.query.category === "string" && req.query.category ? req.query.category : "all";
      const status = ["published", "draft", "featured", "no-image", "no-seo"].includes(req.query.status) ? req.query.status : "all";
      const query = db("products as p").join("categories as c", "c.id", "p.category_id")
        .orderBy("c.sort_order").orderBy("p.sort_order").orderBy("p.id")
        .select("p.id", "p.model_code", "p.name", "p.image", "p.featured", "p.published", "p.sort_order",
          "p.price_from", "p.price_unit", "p.price_currency", "p.meta_description",
          "c.name as category_name");
      if (category !== "all") query.where("c.key", category);
      if (status === "published") query.where("p.published", true);
      if (status === "draft") query.where("p.published", false);
      if (status === "featured") query.where("p.featured", true);
      if (status === "no-image") query.where((b) => b.whereNull("p.image").orWhere("p.image", ""));
      if (status === "no-seo") query.whereNull("p.meta_description");
      if (q) {
        const like = "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
        query.where((b) => b.where("p.name", "like", like).orWhere("p.model_code", "like", like));
      }
      const products = await query;
      res.render("admin/products/list.njk", view(req, "products", {
        products, categories: await categoryList(), q, category, status, total: products.length,
      }));
    } catch (err) {
      next(err);
    }
  });

  /* -------------------------------------------------------------- create */

  router.get("/admin/products/new", async (req, res, next) => {
    try {
      const cats = await categoryList();
      const wanted = cats.find((c) => c.key === req.query.category);
      res.render("admin/products/form.njk", await formView(req,
        { published: true, category_id: wanted ? wanted.id : null },
        wanted ? templateOf(wanted) : [], null));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/products", async (req, res, next) => {
    try {
      const fields = await productFields(req.body);
      const specs = specRows(req.body);
      let id;
      await db.transaction(async (trx) => {
        fields.featured_order = await featuredOrder(trx, fields.featured, null);
        [id] = await trx("products").insert(fields);
        await saveSpecs(trx, id, specs);
      });
      await contentChanged();
      await logActivity(req, "product.create", "product", id, "created " + fields.model_code + " — " + fields.name);
      res.redirect("/admin/products/" + id + "/edit?notice=" + encodeURIComponent("Created " + fields.model_code + "."));
    } catch (err) {
      const msg = duplicateMessage(err) || (err instanceof FormError ? err.message : null);
      if (!msg) return next(err);
      const e = echo(req.body, undefined);
      res.status(422).render("admin/products/form.njk", await formView(req, e.product, e.specs, msg));
    }
  });

  /* ---------------------------------------------------------------- edit */

  router.get("/admin/products/:id/edit", async (req, res, next) => {
    try {
      const product = await findProduct(req.params.id);
      if (!product) return next();   // the app's 404
      const specs = await specsOf(db, product.id);
      res.render("admin/products/form.njk", await formView(req, product, specs, null));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/products/:id", async (req, res, next) => {
    const existing = await findProduct(req.params.id).catch(() => null);
    if (!existing) return next();
    try {
      const fields = await productFields(req.body);
      const specs = specRows(req.body);
      await db.transaction(async (trx) => {
        await keepRevision(trx, req, existing, "update");
        fields.featured_order = await featuredOrder(trx, fields.featured, existing.featured ? existing.featured_order : null);
        fields.updated_at = trx.fn.now();
        await trx("products").where({ id: existing.id }).update(fields);
        await saveSpecs(trx, existing.id, specs);
      });
      await contentChanged();
      await logActivity(req, "product.update", "product", existing.id, "updated " + fields.model_code);
      const back = req.body.after === "list" ? "/admin/products?notice=" : "/admin/products/" + existing.id + "/edit?notice=";
      res.redirect(back + encodeURIComponent("Saved " + fields.model_code + "."));
    } catch (err) {
      const msg = duplicateMessage(err) || (err instanceof FormError ? err.message : null);
      if (!msg) return next(err);
      const e = echo(req.body, existing.id);
      res.status(422).render("admin/products/form.njk", await formView(req, e.product, e.specs, msg));
    }
  });

  /* ----------------------------------------------------------- duplicate */

  /** A free model code for a copy: BH-IS-1001-COPY, -COPY2, … */
  async function freeCode(base) {
    const stem = base.slice(0, 52);
    for (let n = 1; n < 100; n++) {
      const code = stem + "-COPY" + (n === 1 ? "" : n);
      const taken = await db("products").where("model_code", code).orWhere("slug", code.toLowerCase()).first("id");
      if (!taken) return code;
    }
    throw new FormError("Could not find a free model code for the copy.");
  }

  router.post("/admin/products/:id/duplicate", async (req, res, next) => {
    try {
      const src = await findProduct(req.params.id);
      if (!src) return next();
      const code = await freeCode(src.model_code);
      const { id: _id, created_at: _c, updated_at: _u, ...row } = src;
      let id;
      await db.transaction(async (trx) => {
        [id] = await trx("products").insert({
          ...row, model_code: code, slug: code.toLowerCase(), name: src.name + " (copy)",
          published: false, featured: false, featured_order: null,
        });
        await saveSpecs(trx, id, await specsOf(trx, src.id));
      });
      await contentChanged();
      await logActivity(req, "product.duplicate", "product", id, "copied " + src.model_code + " as " + code);
      res.redirect("/admin/products/" + id + "/edit?notice=" +
        encodeURIComponent("Copied as " + code + " — a draft. Change the model code and name, then publish."));
    } catch (err) {
      if (err instanceof FormError) return res.redirect("/admin/products?error=" + encodeURIComponent(err.message));
      next(err);
    }
  });

  /* -------------------------------------------------------------- delete */

  router.post("/admin/products/:id/delete", async (req, res, next) => {
    try {
      const existing = await findProduct(req.params.id);
      if (!existing) return next();
      await db.transaction(async (trx) => {
        await keepRevision(trx, req, existing, "delete");
        await trx("products").where({ id: existing.id }).del();
      });
      await contentChanged();
      await logActivity(req, "product.delete", "product", existing.id, "deleted " + existing.model_code + " — " + existing.name);
      res.redirect("/admin/products?notice=" + encodeURIComponent(
        "Deleted " + existing.model_code + ". It can be brought back from Recently deleted, below."));
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- bulk */

  router.post("/admin/products/bulk", async (req, res, next) => {
    try {
      const action = String(req.body.action || "");
      const ids = [...new Set(list(req.body.ids).map((x) => parseInt(x, 10)).filter((n) => n > 0))].slice(0, 500);
      const back = String(req.body.back || "");
      const listUrl = /^\/admin\/products(\?[^\r\n]*)?$/.test(back) ? back : "/admin/products";
      const go = (kind, msg) => res.redirect(listUrl + (listUrl.includes("?") ? "&" : "?") + kind + "=" + encodeURIComponent(msg));
      if (!BULK_ACTIONS.includes(action)) return go("error", "Pick an action.");
      if (!ids.length) return go("error", "Tick at least one product.");
      if (action === "delete" && !["superadmin", "admin"].includes(req.admin.role)) {
        return go("error", "Only an admin can delete products.");
      }
      let targetCat = null;
      if (action === "move") {
        targetCat = await db("categories").where({ id: parseInt(req.body.category_id, 10) || 0 }).first("id", "name");
        if (!targetCat) return go("error", "Pick the category to move them to.");
      }

      const rows = await db("products").whereIn("id", ids);
      await db.transaction(async (trx) => {
        for (const p of rows) await keepRevision(trx, req, p, action === "delete" ? "delete" : "bulk");
        const ofThese = () => trx("products").whereIn("id", rows.map((r) => r.id));
        if (action === "publish") await ofThese().update({ published: true, updated_at: trx.fn.now() });
        if (action === "unpublish") await ofThese().update({ published: false, updated_at: trx.fn.now() });
        if (action === "unfeature") await ofThese().update({ featured: false, featured_order: null, updated_at: trx.fn.now() });
        if (action === "move") await ofThese().update({ category_id: targetCat.id, updated_at: trx.fn.now() });
        if (action === "delete") await ofThese().del();
        if (action === "feature") {
          for (const p of rows) {
            if (p.featured) continue;
            await trx("products").where({ id: p.id })
              .update({ featured: true, featured_order: await featuredOrder(trx, true, null), updated_at: trx.fn.now() });
          }
        }
      });
      await contentChanged();
      const codes = rows.map((r) => r.model_code);
      const verb = { publish: "published", unpublish: "unpublished", feature: "featured", unfeature: "unfeatured",
        move: "moved to " + (targetCat && targetCat.name), delete: "deleted" }[action];
      await logActivity(req, "product.bulk", "product", null,
        verb + " " + codes.length + ": " + codes.join(", ").slice(0, 400));
      go("notice", codes.length + " product(s) " + verb + ".");
    } catch (err) {
      next(err);
    }
  });

  /* ------------------------------------------------------------- history */

  router.get("/admin/products/deleted", async (req, res, next) => {
    try {
      const live = await db("products").pluck("id");
      const rows = await db("product_revisions").where({ action: "delete" }).whereNotIn("product_id", live.length ? live : [0])
        .orderBy("id", "desc").limit(100).select("id", "product_id", "model_code", "admin_name", "created_at");
      // Newest deletion per product only.
      const seen = new Set();
      const deleted = rows.filter((r) => (seen.has(r.product_id) ? false : seen.add(r.product_id)));
      res.render("admin/products/deleted.njk", view(req, "products", { deleted }));
    } catch (err) {
      next(err);
    }
  });

  /** Drops a deleted product's history for good (it no longer shows under Recently deleted). */
  router.post("/admin/products/deleted/:pid/forget", auth.requireRole("superadmin", "admin"), async (req, res, next) => {
    try {
      const pid = parseInt(req.params.pid, 10) || 0;
      if (await findProduct(pid)) return res.redirect("/admin/products/deleted?error=" + encodeURIComponent("That product exists — nothing to forget."));
      const code = await db("product_revisions").where({ product_id: pid }).orderBy("id", "desc").first("model_code");
      const n = await db("product_revisions").where({ product_id: pid }).del();
      await logActivity(req, "product.forget", "product", pid, "removed the history of deleted " + ((code && code.model_code) || "#" + pid));
      res.redirect("/admin/products/deleted?notice=" + encodeURIComponent("Removed " + n + " history entr" + (n === 1 ? "y" : "ies") + "."));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/products/revisions/:rev/restore", async (req, res, next) => {
    try {
      const rev = await db("product_revisions").where({ id: parseInt(req.params.rev, 10) || 0 }).first();
      if (!rev) return next();
      let data;
      try { data = JSON.parse(rev.data); } catch { data = null; }
      if (!data || !data.product) {
        return res.redirect("/admin/products?error=" + encodeURIComponent("That history entry is unreadable."));
      }
      const { id: _id, created_at: _c, updated_at: _u, ...row } = data.product;
      for (const k of Object.keys(row)) {
        if (typeof row[k] === "string" && /^\d{4}-\d\d-\d\dT/.test(row[k])) delete row[k];  // stray dates
      }
      if (!(await db("categories").where({ id: row.category_id }).first("id"))) {
        return res.redirect("/admin/products?error=" + encodeURIComponent("Its category no longer exists — create it first."));
      }
      const current = await findProduct(rev.product_id);
      try {
        await db.transaction(async (trx) => {
          if (current) {
            await keepRevision(trx, req, current, "restore");
            await trx("products").where({ id: current.id }).update({ ...row, updated_at: trx.fn.now() });
          } else {
            await trx("products").insert({ id: rev.product_id, ...row });
          }
          await saveSpecs(trx, rev.product_id, Array.isArray(data.specs) ? data.specs : []);
        });
      } catch (err) {
        const msg = duplicateMessage(err);
        if (!msg) throw err;
        return res.redirect("/admin/products?error=" + encodeURIComponent(msg + " Rename that one first."));
      }
      await contentChanged();
      await logActivity(req, "product.restore", "product", rev.product_id,
        (current ? "restored an earlier version of " : "brought back deleted ") + (row.model_code || rev.model_code) + " (history #" + rev.id + ")");
      res.redirect("/admin/products/" + rev.product_id + "/edit?notice=" + encodeURIComponent(
        current ? "Restored the version from history #" + rev.id + ". The version before it is in the history too."
          : "Brought back " + row.model_code + "."));
    } catch (err) {
      next(err);
    }
  });
};
