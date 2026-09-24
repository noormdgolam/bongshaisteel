/* ==========================================================================
   ADMIN — CONTENT EDITOR
   --------------------------------------------------------------------------
   Two editors behind one sub-navigation:
     /admin/content/site          the flat copy: text.*, html.*, settings.*,
                                  seo.*, safety.intro — one form, one save
     /admin/content/:section      the repeatable blocks, from the schemas in
                                  lib/content-sections.js — list, create, edit,
                                  delete, reorder
   Registered on the admin router, after its session, CSRF and sign-in gates.
   Templates: T-003 (admin/content/site.njk, admin/sections/{list,form}.njk).
   ========================================================================== */
"use strict";

const { SECTIONS, BY_KEY, publicSchema } = require("../lib/content-sections");
const { sanitizeHtml } = require("../lib/sanitize-html");

const LONG_TEXT = 20000;
const IMAGE_PATH = /^images\/[^?#\\\x00-\x1f]+\.(?:webp|jpe?g|png|gif)$/i;
const SITE_SECTIONS = ["text", "html", "settings", "seo", "safety"];

/** "hero.btnPrimary" -> "Hero · Btn primary" */
function labelOf(key) {
  return key.split(".").map((p) => {
    const words = p.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }).join(" · ");
}

module.exports = function registerContentRoutes(router, deps) {
  const { db, auth, logActivity, contentChanged, view, on, FormError, roles } = deps;

  router.use("/admin/content", auth.requireRole(...roles));

  /* ------------------------------------------------------------- sub-nav */

  async function subnav() {
    const counts = await Promise.all(SECTIONS.map((s) => db(s.table).count({ n: "*" }).then((r) => Number(r[0].n))));
    return [{ key: "site", title: "Site copy & SEO", count: null }]
      .concat(SECTIONS.map((s, i) => ({ key: s.key, title: s.title, count: counts[i] })));
  }

  router.get("/admin/content", (req, res) => res.redirect("/admin/content/site"));

  /* ----------------------------------------------------------- site copy */

  async function loadSite() {
    const rows = await db("site_content").whereIn("section", SITE_SECTIONS).select("section", "data");
    const site = {};
    for (const r of rows) {
      try { site[r.section] = JSON.parse(r.data); } catch { site[r.section] = {}; }
    }
    for (const s of SITE_SECTIONS) if (!site[s] || typeof site[s] !== "object") site[s] = {};
    return site;
  }

  function typeFor(section, key, value) {
    if (section === "html") return "html";
    if (/description|intro|body|blurb|keywords/i.test(key) || String(value || "").length > 90) return "textarea";
    return "text";
  }

  /** Groups for the form. `values` overrides (a rejected submission is shown back as typed). */
  function siteGroups(site, values) {
    const groups = [];
    const byPrefix = new Map();
    for (const key of Object.keys(site.text).sort()) {
      const prefix = key.includes(".") ? key.split(".")[0] : "general";
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push(key);
    }
    const field = (section, key) => {
      const name = section + "." + key;
      const value = values && name in values ? values[name] : site[section][key];
      return { name, label: labelOf(key), type: typeFor(section, key, value), value: value == null ? "" : String(value), help: null };
    };
    for (const [prefix, keys] of byPrefix) {
      groups.push({ key: "text-" + prefix, title: labelOf(prefix), fields: keys.map((k) => field("text", k)) });
    }
    if (Object.keys(site.html).length) {
      groups.push({
        key: "html", title: "Formatted blocks",
        fields: Object.keys(site.html).sort().map((k) => ({ ...field("html", k), help: "Basic HTML is allowed: <strong>, <a href>, <br>." })),
      });
    }
    groups.push({ key: "safety", title: "Health and safety", fields: [{ ...field("safety", "intro"), label: "Intro paragraph", type: "textarea" }] });
    groups.push({
      key: "settings", title: "Company and contact",
      fields: Object.keys(site.settings).filter((k) => typeof site.settings[k] === "string").sort().map((k) => field("settings", k)),
    });
    groups.push({
      key: "seo", title: "Search and sharing",
      fields: Object.keys(site.seo).sort().map((k) => field("seo", k)),
    });
    return groups;
  }

  router.get("/admin/content/site", async (req, res, next) => {
    try {
      const [site, sections] = await Promise.all([loadSite(), subnav()]);
      res.render("admin/content/site.njk", view(req, "content", { groups: siteGroups(site), sections, error: null }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/content/site", async (req, res, next) => {
    let site;
    try {
      site = await loadSite();
      const changed = [];
      const next_ = JSON.parse(JSON.stringify(site));

      for (const [name, raw] of Object.entries(req.body)) {
        const m = /^(text|html|settings|seo|safety)\.(.+)$/.exec(name);
        if (!m) continue;
        const [, section, key] = m;
        // Only keys that already exist can be edited — the form cannot add new
        // ones, and non-string settings (sisterLinks) are never touched here.
        if (section === "safety" ? key !== "intro" : !(key in site[section])) continue;
        if (section === "settings" && typeof site.settings[key] !== "string") continue;

        let value = String(raw == null ? "" : raw).trim();
        if (value.length > LONG_TEXT) throw new FormError(labelOf(key) + " is too long.");
        if (section === "html") value = sanitizeHtml(value);
        if (section === "seo" && key === "canonical" && value && !/^https:\/\/[^\s/]+(\/\S*)?$/.test(value)) {
          throw new FormError("Canonical URL must be a full https:// address.");
        }
        if (section === "settings" && key === "whatsappNumber" && value && !/^\d{8,15}$/.test(value)) {
          throw new FormError("WhatsApp number: digits only, with the country code, e.g. 8801789949060.");
        }
        if (section === "settings" && key === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new FormError("That email address does not look right.");
        }
        if ((next_[section][key] ?? "") !== value) {
          next_[section][key] = value;
          changed.push(name);
        }
      }

      if (changed.length) {
        const sectionsTouched = [...new Set(changed.map((n) => n.split(".")[0]))];
        await db.transaction(async (trx) => {
          for (const s of sectionsTouched) {
            await trx("site_content").where({ section: s })
              .update({ data: JSON.stringify(next_[s]), updated_at: trx.fn.now() });
          }
        });
        await contentChanged();
        await logActivity(req, "content.site", "site", null,
          changed.length + " field(s): " + changed.slice(0, 6).join(", ") + (changed.length > 6 ? ", …" : ""));
      }
      res.redirect("/admin/content/site?notice=" + encodeURIComponent(changed.length ? "Saved " + changed.length + " change(s)." : "Nothing had changed."));
    } catch (err) {
      if (!(err instanceof FormError)) return next(err);
      res.status(422).render("admin/content/site.njk", view(req, "content", {
        groups: siteGroups(site || await loadSite(), req.body), sections: await subnav(), error: err.message,
      }));
    }
  });

  /* ---------------------------------------------------------- sections */

  function sectionOf(req) {
    return BY_KEY.get(req.params.section) || null;
  }

  /** Validates a submitted row against the schema. Throws FormError. */
  function rowFrom(section, body) {
    const row = {};
    for (const f of section.fields) {
      const raw = body[f.name];
      if (f.type === "checkbox") { row[f.name] = on(raw); continue; }
      let v = String(raw == null ? "" : raw).trim();
      if (f.required && !v) throw new FormError(f.label + " is required.");
      if (f.type === "number") {
        if (!v) { row[f.name] = null; continue; }
        if (!/^-?\d+$/.test(v)) throw new FormError(f.label + " must be a whole number.");
        row[f.name] = parseInt(v, 10);
        continue;
      }
      const max = f.max || LONG_TEXT;
      if (v.length > max) throw new FormError(f.label + " is too long (" + max + " characters at most).");
      if (f.type === "html") v = sanitizeHtml(v);
      if (f.type === "image" && v && (!IMAGE_PATH.test(v) || v.includes(".."))) {
        throw new FormError(f.label + " must be a path like images/team/name.webp.");
      }
      row[f.name] = v || null;
    }
    return row;
  }

  function summary(section, row) {
    const first = section.fields.find((f) => f.type !== "checkbox");
    return String((first && row[first.name]) || "").replace(/<[^>]*>/g, "").slice(0, 80);
  }

  async function ordered(section) {
    return db(section.table).orderBy("sort_order").orderBy("id");
  }

  router.get("/admin/content/:section", async (req, res, next) => {
    try {
      const section = sectionOf(req);
      if (!section) return next();
      const [rows, sections] = await Promise.all([ordered(section), subnav()]);
      res.render("admin/sections/list.njk", view(req, "content", { section: publicSchema(section), sections, rows }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/content/:section/new", async (req, res, next) => {
    try {
      const section = sectionOf(req);
      if (!section) return next();
      res.render("admin/sections/form.njk", view(req, "content", {
        section: publicSchema(section), sections: await subnav(), row: {}, error: null,
      }));
    } catch (err) {
      next(err);
    }
  });

  async function findRow(section, id) {
    const n = parseInt(id, 10);
    return n ? db(section.table).where({ id: n }).first() : null;
  }

  async function reject(req, res, section, row, err) {
    res.status(422).render("admin/sections/form.njk", view(req, "content", {
      section: publicSchema(section), sections: await subnav(), row, error: err.message,
    }));
  }

  router.post("/admin/content/:section", async (req, res, next) => {
    const section = sectionOf(req);
    if (!section) return next();
    try {
      const row = rowFrom(section, req.body);
      const [{ m }] = await db(section.table).max({ m: "sort_order" });
      const [id] = await db(section.table).insert({ ...row, sort_order: m == null ? 0 : m + 1 });
      await contentChanged();
      await logActivity(req, "content.create", section.key, id, section.title + ": added “" + summary(section, row) + "”");
      res.redirect("/admin/content/" + section.key + "?notice=" + encodeURIComponent("Added."));
    } catch (err) {
      if (!(err instanceof FormError)) return next(err);
      await reject(req, res, section, { ...req.body }, err);
    }
  });

  router.get("/admin/content/:section/:id/edit", async (req, res, next) => {
    try {
      const section = sectionOf(req);
      if (!section) return next();
      const row = await findRow(section, req.params.id);
      if (!row) return next();
      res.render("admin/sections/form.njk", view(req, "content", {
        section: publicSchema(section), sections: await subnav(), row, error: null,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/content/:section/:id", async (req, res, next) => {
    const section = sectionOf(req);
    if (!section) return next();
    const existing = await findRow(section, req.params.id).catch(() => null);
    if (!existing) return next();
    try {
      const row = rowFrom(section, req.body);
      await db(section.table).where({ id: existing.id }).update({ ...row, updated_at: db.fn.now() });
      await contentChanged();
      await logActivity(req, "content.update", section.key, existing.id, section.title + ": edited “" + summary(section, row) + "”");
      res.redirect("/admin/content/" + section.key + "?notice=" + encodeURIComponent("Saved."));
    } catch (err) {
      if (!(err instanceof FormError)) return next(err);
      await reject(req, res, section, { ...req.body, id: existing.id }, err);
    }
  });

  router.post("/admin/content/:section/:id/delete", async (req, res, next) => {
    try {
      const section = sectionOf(req);
      if (!section) return next();
      const existing = await findRow(section, req.params.id);
      if (!existing) return next();
      await db(section.table).where({ id: existing.id }).del();
      await contentChanged();
      await logActivity(req, "content.delete", section.key, existing.id, section.title + ": deleted “" + summary(section, existing) + "”");
      res.redirect("/admin/content/" + section.key + "?notice=" + encodeURIComponent("Deleted."));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/content/:section/:id/move", async (req, res, next) => {
    try {
      const section = sectionOf(req);
      if (!section || !section.orderable) return next();
      const dir = req.body.direction === "up" ? -1 : req.body.direction === "down" ? 1 : 0;
      if (!dir) return res.redirect("/admin/content/" + section.key);
      await db.transaction(async (trx) => {
        const rows = await trx(section.table).orderBy("sort_order").orderBy("id").select("id");
        const i = rows.findIndex((r) => r.id === parseInt(req.params.id, 10));
        const j = i + dir;
        if (i < 0 || j < 0 || j >= rows.length) return;
        [rows[i], rows[j]] = [rows[j], rows[i]];
        // Renumber the whole list: repairs any duplicate sort_order on the way.
        for (const [pos, r] of rows.entries()) await trx(section.table).where({ id: r.id }).update({ sort_order: pos });
      });
      await contentChanged();
      res.redirect("/admin/content/" + section.key);
    } catch (err) {
      next(err);
    }
  });
};
