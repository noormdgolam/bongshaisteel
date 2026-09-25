/* ==========================================================================
   ADMIN — COMPLETED PROJECTS
   --------------------------------------------------------------------------
   Registered on the admin router after its session, CSRF and sign-in gates.
   Templates: T-006 (admin/projects/list.njk, admin/projects/form.njk).

   The public /projects page reads this table directly, so a save shows at
   once — no content cache to refresh. Each project's photo is a site path;
   the form offers the uploaded images (Admin → Media) to pick from.
   ========================================================================== */
"use strict";

const images = require("../lib/images");

const GROUPS = [
  { value: "steel", label: "Bongshai Steel — steel building" },
  { value: "engineering", label: "Bongshai Engineering & Construction — group project" },
];
const IMAGE_PATH = /^images\/[^?#\\\x00-\x1f]+\.(?:webp|jpe?g|png|gif)$/i;
const LIMITS = { title: 255, category: 60, year_label: 20, client: 255, principal_contractor: 255, location: 255, scope: 500, summary: 5000 };

module.exports = function registerProjectRoutes(router, deps) {
  const { db, auth, logActivity, view, on, FormError, contentRoles } = deps;

  router.use("/admin/projects", auth.requireRole(...contentRoles));

  const mediaPaths = () => images.listUploads().map((f) => f.path);

  router.get("/admin/projects", async (req, res, next) => {
    try {
      const rows = await db("projects").orderBy("sort_order").orderBy("id")
        .select("id", "delivered_by", "title", "category", "year_label", "client", "location", "image", "published", "sort_order");
      res.render("admin/projects/list.njk", view(req, "projects", {
        groups: GROUPS.map((g) => ({ ...g, projects: rows.filter((p) => p.delivered_by === g.value) })),
        total: rows.length,
      }));
    } catch (err) {
      next(err);
    }
  });

  function slugify(s) {
    return String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "project";
  }

  function projectFields(body) {
    const out = {};
    for (const [k, max] of Object.entries(LIMITS)) {
      const v = String(body[k] || "").trim();
      if (v.length > max) throw new FormError(k.replace("_", " ") + " is too long (" + max + " characters at most).");
      out[k] = v || null;
    }
    if (!out.title) throw new FormError("Title is required.");
    if (!GROUPS.some((g) => g.value === body.delivered_by)) throw new FormError("Pick who delivered the project.");
    out.delivered_by = body.delivered_by;
    const image = String(body.image || "").trim();
    if (image && (!IMAGE_PATH.test(image) || image.includes(".."))) {
      throw new FormError("Photo must be a site path like images/uploads/name.webp — pick one from the list.");
    }
    out.image = image || null;
    out.published = on(body.published);
    return out;
  }

  const form = (req, project, body, error) => view(req, "projects", {
    project: { ...(project || {}), ...(body ? { ...body, _csrf: undefined, published: on(body.published) } : {}), id: project && project.id },
    groups: GROUPS, mediaPaths: mediaPaths(), error,
  });

  router.get("/admin/projects/new", (req, res) => {
    res.render("admin/projects/form.njk", form(req, { delivered_by: "steel", published: true }, null, null));
  });

  router.post("/admin/projects", async (req, res, next) => {
    try {
      const fields = projectFields(req.body);
      let slug = slugify(fields.title);
      for (let i = 2; await db("projects").where({ slug }).first("id"); i++) slug = slugify(fields.title) + "-" + i;
      const [{ m }] = await db("projects").max({ m: "sort_order" });
      const [id] = await db("projects").insert({ ...fields, slug, sort_order: m == null ? 0 : m + 1 });
      await logActivity(req, "project.create", "project", id, "created " + fields.title);
      res.redirect("/admin/projects?notice=" + encodeURIComponent("Created " + fields.title + "."));
    } catch (err) {
      if (!(err instanceof FormError)) return next(err);
      res.status(422).render("admin/projects/form.njk", form(req, null, req.body, err.message));
    }
  });

  const find = (id) => { const n = parseInt(id, 10); return n ? db("projects").where({ id: n }).first() : null; };

  router.get("/admin/projects/:id/edit", async (req, res, next) => {
    try {
      const project = await find(req.params.id);
      if (!project) return next();
      res.render("admin/projects/form.njk", form(req, project, null, null));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/projects/:id", async (req, res, next) => {
    const existing = await Promise.resolve(find(req.params.id)).catch(() => null);
    if (!existing) return next();
    try {
      const fields = projectFields(req.body);
      await db("projects").where({ id: existing.id }).update({ ...fields, updated_at: db.fn.now() });
      await logActivity(req, "project.update", "project", existing.id, "edited " + fields.title);
      res.redirect("/admin/projects?notice=" + encodeURIComponent("Saved " + fields.title + "."));
    } catch (err) {
      if (!(err instanceof FormError)) return next(err);
      res.status(422).render("admin/projects/form.njk", form(req, existing, req.body, err.message));
    }
  });

  router.post("/admin/projects/:id/delete", async (req, res, next) => {
    try {
      const existing = await find(req.params.id);
      if (!existing) return next();
      await db("projects").where({ id: existing.id }).del();
      await logActivity(req, "project.delete", "project", existing.id, "deleted " + existing.title);
      res.redirect("/admin/projects?notice=" + encodeURIComponent("Deleted " + existing.title + "."));
    } catch (err) {
      next(err);
    }
  });

  // Move within its own group (the page lists the two groups separately).
  router.post("/admin/projects/:id/move", async (req, res, next) => {
    try {
      const dir = req.body.direction === "up" ? -1 : req.body.direction === "down" ? 1 : 0;
      const me = await find(req.params.id);
      if (!me) return next();
      if (dir) {
        await db.transaction(async (trx) => {
          const rows = await trx("projects").where({ delivered_by: me.delivered_by }).orderBy("sort_order").orderBy("id").select("id", "sort_order");
          const base = rows.length ? Math.min(...rows.map((r) => r.sort_order)) : 0;
          const i = rows.findIndex((r) => r.id === me.id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= rows.length) return;
          [rows[i], rows[j]] = [rows[j], rows[i]];
          for (const [pos, r] of rows.entries()) await trx("projects").where({ id: r.id }).update({ sort_order: base + pos });
        });
      }
      res.redirect("/admin/projects");
    } catch (err) {
      next(err);
    }
  });
};
