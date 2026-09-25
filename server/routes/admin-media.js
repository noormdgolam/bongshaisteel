/* ==========================================================================
   ADMIN — MEDIA LIBRARY AND CONTENT BACKUPS
   --------------------------------------------------------------------------
   Registered on the admin router after its session, CSRF and sign-in gates.
   Templates: T-005 (admin/media/list.njk, admin/backups/list.njk).

   Media: upload (re-encoded to WebP with -400w/-700w variants, see
   lib/images.js), list with where each file is used, delete when unused.
   Backups: list, take now, download, restore (see lib/snapshots.js).
   ========================================================================== */
"use strict";

const multer = require("multer");
const images = require("../lib/images");
const snapshots = require("../lib/snapshots");

module.exports = function registerMediaRoutes(router, deps) {
  const { db, auth, logActivity, contentChanged, view, contentRoles } = deps;

  /* =============================================================== media */

  router.use("/admin/media", auth.requireRole(...contentRoles));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: images.MAX_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 7 },
  }).single("file");

  const wantsJson = (req) => /application\/json/.test(req.get("accept") || "");

  /** path -> ["Product BH-IS-1001", ...] for every image reference in the content tables. */
  async function usage() {
    const [products, cats, team, site] = await Promise.all([
      db("products").whereNotNull("image").select("model_code", "image"),
      db("categories").whereNotNull("image").select("name", "image"),
      db("team_members").whereNotNull("photo").select("name", "photo"),
      db("site_content").whereNot("section", "_rev").select("section", "data"),
    ]);
    const map = {};
    const add = (p, label) => { if (p) (map[p] = map[p] || []).push(label); };
    for (const p of products) add(p.image, "Product " + p.model_code);
    for (const c of cats) add(c.image, "Category " + c.name);
    for (const m of team) add(m.photo, "Team " + m.name);
    // Site copy and settings: any string value that is exactly an image path.
    for (const r of site) {
      if (r.section === "media") continue;
      let d; try { d = JSON.parse(r.data); } catch { continue; }
      for (const [k, v] of Object.entries(d || {})) {
        if (typeof v === "string" && /^images\//.test(v)) add(v, "Site " + r.section + "." + k);
      }
    }
    return map;
  }

  async function mediaMap() {
    const row = await db("site_content").where({ section: "media" }).first("data");
    try { return (row && JSON.parse(row.data)) || {}; } catch { return {}; }
  }
  async function saveMediaMap(map) {
    await db.raw(
      "INSERT INTO site_content (section, data, updated_at) VALUES ('media', ?, UTC_TIMESTAMP()) " +
      "ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)", [JSON.stringify(map)]);
  }

  router.get("/admin/media", async (req, res, next) => {
    try {
      const used = await usage();
      const items = images.listUploads().map((f) => ({ ...f, usedBy: used[f.path] || [] }));
      res.render("admin/media/list.njk", view(req, "media", {
        items,
        uploaded: typeof req.query.uploaded === "string" ? req.query.uploaded.slice(0, 200) : null,
        maxMB: Math.round(images.MAX_BYTES / 1048576),
        available: images.available(),
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/media", (req, res, next) => {
    upload(req, res, (err) => {
      const fail = (status, msg) => (wantsJson(req)
        ? res.status(status).json({ error: msg })
        : res.redirect(303, "/admin/media?error=" + encodeURIComponent(msg)));
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "That file is larger than " + Math.round(images.MAX_BYTES / 1048576) + " MB."
          : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? "Upload one image at a time, in the field named file."
            : "The upload could not be read.";
        // The token was not checked yet, so say nothing more than that it failed.
        return fail(400, msg);
      }
      auth.csrfAfterUpload(req, res, async () => {
        try {
          if (!req.file) return fail(400, "Choose an image to upload.");
          const out = await images.storeUpload(req.file.buffer, req.file.originalname);
          const map = await mediaMap();
          map[out.path] = { widths: out.widths };
          await saveMediaMap(map);
          await contentChanged();
          await logActivity(req, "media.upload", "media", out.path,
            "uploaded " + out.path + " (" + out.width + "x" + out.height + ", variants " + (out.widths.join("/") || "none") + ")");
          if (wantsJson(req)) return res.json(out);
          res.redirect(303, "/admin/media?uploaded=" + encodeURIComponent(out.path));
        } catch (e) {
          if (e instanceof images.ImageError) return fail(422, e.message);
          next(e);
        }
      });
    });
  });

  router.post("/admin/media/delete", async (req, res, next) => {
    try {
      const p = String(req.body.path || "");
      const used = (await usage())[p];
      if (used && used.length) {
        return res.redirect(303, "/admin/media?error=" + encodeURIComponent("Still used by " + used.join(", ") + " — change those first."));
      }
      images.removeUpload(p);
      const map = await mediaMap();
      if (map[p]) { delete map[p]; await saveMediaMap(map); await contentChanged(); }
      await logActivity(req, "media.delete", "media", p, "deleted " + p);
      res.redirect(303, "/admin/media?notice=" + encodeURIComponent("Deleted " + p));
    } catch (err) {
      if (err instanceof images.ImageError) return res.redirect(303, "/admin/media?error=" + encodeURIComponent(err.message));
      next(err);
    }
  });

  /* ============================================================= backups */

  router.use("/admin/backups", auth.requireRole("superadmin", "admin"));

  const idParam = (req) => (/^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : null);

  router.get("/admin/backups", async (req, res, next) => {
    try {
      res.render("admin/backups/list.njk", view(req, "backups", {
        snapshots: await snapshots.list(db),
        keep: snapshots.KEEP,
        autoGapMinutes: Math.round(snapshots.AUTO_GAP_MS / 60000),
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/backups", async (req, res, next) => {
    try {
      const note = String(req.body.note || "").trim().slice(0, 255) || null;
      const id = await snapshots.take(db, { admin: req.admin, reason: "manual", note });
      await logActivity(req, "backup.take", "snapshot", id, "took snapshot #" + id + (note ? " — " + note : ""));
      res.redirect(303, "/admin/backups?notice=" + encodeURIComponent("Snapshot #" + id + " taken."));
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/backups/:id/download", async (req, res, next) => {
    try {
      const id = idParam(req);
      const row = id && await db("content_snapshots").where({ id }).first("id", "created_at", "data");
      if (!row) return res.status(404).type("text").send("No such snapshot.");
      const stamp = new Date(row.created_at).toISOString().slice(0, 16).replace(/[-:T]/g, "");
      res.set("Content-Disposition", 'attachment; filename="bongshai-steel-content-' + row.id + "-" + stamp + '.json"');
      res.type("application/json").send(row.data);
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/backups/:id/restore", async (req, res, next) => {
    try {
      const id = idParam(req);
      if (!id) return res.status(404).type("text").send("No such snapshot.");
      const r = await snapshots.restore(db, id, req.admin);
      await contentChanged();
      await logActivity(req, "backup.restore", "snapshot", id,
        "restored snapshot #" + id + " (" + r.counts.products + " products); previous state saved as #" + r.safety);
      res.redirect(303, "/admin/backups?notice=" + encodeURIComponent(
        "Restored #" + id + ". The state before it was saved as #" + r.safety + " — restore that to undo."));
    } catch (err) {
      if (err instanceof snapshots.SnapshotError) return res.redirect(303, "/admin/backups?error=" + encodeURIComponent(err.message));
      next(err);
    }
  });
};
