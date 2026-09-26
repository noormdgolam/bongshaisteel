/* ==========================================================================
   ADMIN — ANALYTICS AND SEO
   --------------------------------------------------------------------------
   Analytics: page views and daily visitors from page_views (lib/analytics),
   top pages, where visitors came from, devices, and the owner's own IPs to
   leave out.
   SEO: an audit of every published model and building type — missing or
   badly sized titles and descriptions, missing images and alt text,
   duplicates, models without specs — each with a link to fix it, plus a
   one-click fill for blank SEO descriptions.
   ========================================================================== */
"use strict";

const analytics = require("../lib/analytics");

const RANGES = [7, 30, 90];

module.exports = function registerInsightRoutes(router, deps) {
  const { db, auth, logActivity, contentChanged, view, contentRoles } = deps;

  /* ============================================================ analytics */

  router.use("/admin/analytics", auth.requireRole("superadmin", "admin", "editor", "sales"));

  const isoDay = (d) => d.toISOString().slice(0, 10);
  const dayOf = (v) => (v instanceof Date ? isoDay(v) : String(v).slice(0, 10));

  router.get("/admin/analytics", async (req, res, next) => {
    try {
      const days = RANGES.includes(parseInt(req.query.days, 10)) ? parseInt(req.query.days, 10) : 30;
      const from = isoDay(new Date(Date.now() - (days - 1) * 864e5));
      const inRange = () => db("page_views").where("day", ">=", from);

      const [daily, pages, refs, devices, totals, leadsDaily, excluded] = await Promise.all([
        inRange().select("day").count({ views: "*" }).countDistinct({ visitors: "visitor_hash" }).groupBy("day").orderBy("day"),
        inRange().select("path").count({ views: "*" }).countDistinct({ visitors: "visitor_hash" }).groupBy("path").orderBy("views", "desc").limit(20),
        inRange().whereNotNull("referrer_host").select("referrer_host").count({ views: "*" }).groupBy("referrer_host").orderBy("views", "desc").limit(12),
        inRange().select("device").countDistinct({ visitors: "visitor_hash" }).groupBy("device"),
        inRange().count({ views: "*" }).countDistinct({ visitors: "visitor_hash" }).first(),
        db("leads").where("created_at", ">=", from).select(db.raw("DATE(created_at) as day")).count({ n: "*" }).groupBy(db.raw("DATE(created_at)")),
        db("analytics_excluded_ips").orderBy("id"),
      ]);

      // Every day in the range, zero when nothing was recorded.
      const byDay = new Map(daily.map((d) => [dayOf(d.day), d]));
      const leadsByDay = new Map(leadsDaily.map((d) => [dayOf(d.day), Number(d.n)]));
      const series = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = isoDay(new Date(Date.now() - i * 864e5));
        const row = byDay.get(d);
        series.push({ day: d, views: row ? Number(row.views) : 0, visitors: row ? Number(row.visitors) : 0, leads: leadsByDay.get(d) || 0 });
      }
      const max = Math.max(1, ...series.map((s) => s.views));
      const leadTotal = series.reduce((n, s) => n + s.leads, 0);
      const visitors = Number((totals && totals.visitors) || 0);
      const deviceTotal = devices.reduce((n, d) => n + Number(d.visitors), 0) || 1;

      res.render("admin/analytics.njk", view(req, "analytics", {
        days, ranges: RANGES, series, max,
        totals: {
          views: Number((totals && totals.views) || 0), visitors, leads: leadTotal,
          conversion: visitors ? Math.round((leadTotal / visitors) * 1000) / 10 : 0,
        },
        today: series[series.length - 1],
        pages: pages.map((p) => ({ ...p, views: Number(p.views), visitors: Number(p.visitors) })),
        refs: refs.map((r) => ({ ...r, views: Number(r.views) })),
        devices: devices.map((d) => ({ device: d.device || "unknown", visitors: Number(d.visitors), pct: Math.round((Number(d.visitors) / deviceTotal) * 100) })),
        excluded, myIp: req.ip, keepDays: analytics.KEEP_DAYS,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/analytics/exclude-ip", auth.requireRole("superadmin", "admin"), async (req, res, next) => {
    try {
      const ip = String(req.body.ip || "").trim().slice(0, 64);
      if (!/^[0-9a-f:.]{3,64}$/i.test(ip)) return res.redirect("/admin/analytics?error=" + encodeURIComponent("That is not an IP address."));
      const note = String(req.body.note || "").trim().slice(0, 120) || null;
      await db.raw("INSERT IGNORE INTO analytics_excluded_ips (ip, note, created_at) VALUES (?, ?, UTC_TIMESTAMP())", [ip, note]);
      analytics.forgetExcluded();
      await logActivity(req, "analytics.exclude", "ip", null, "stopped counting visits from " + ip);
      res.redirect("/admin/analytics?notice=" + encodeURIComponent("Visits from " + ip + " are no longer counted."));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/analytics/exclude-ip/:id/delete", auth.requireRole("superadmin", "admin"), async (req, res, next) => {
    try {
      await db("analytics_excluded_ips").where({ id: parseInt(req.params.id, 10) || 0 }).del();
      analytics.forgetExcluded();
      res.redirect("/admin/analytics?notice=" + encodeURIComponent("Removed."));
    } catch (err) {
      next(err);
    }
  });

  /* ================================================================== seo */

  router.use("/admin/seo", auth.requireRole(...contentRoles));

  const TITLE_MAX = 60;
  const DESC_MIN = 70;
  const DESC_MAX = 160;

  /** A description built from what the model already has — the owner can edit it afterwards. */
  function draftDescription(p, specs) {
    const facts = specs.filter((s) => s.value).slice(0, 3).map((s) => s.label.toLowerCase() + " " + s.value).join(", ");
    const lead = p.name + " (" + p.model_code + ")" + (p.category_name ? ", a " + p.category_name.toLowerCase() : "") + " by Bongshai Steel";
    let d = lead + (facts ? " — " + facts : "") + ". Designed to AISC/BNBC, made in Bangladesh. Get a quote.";
    if (d.length > DESC_MAX) d = lead + ". Designed to AISC/BNBC, made in Bangladesh. Get a quote.";
    return d.slice(0, DESC_MAX);
  }

  async function auditRows() {
    const [products, specs, cats] = await Promise.all([
      db("products as p").join("categories as c", "c.id", "p.category_id").where("p.published", true)
        .orderBy("c.sort_order").orderBy("p.sort_order").orderBy("p.id")
        .select("p.id", "p.model_code", "p.name", "p.description", "p.image", "p.image_alt", "p.meta_title", "p.meta_description", "c.name as category_name"),
      db("product_specs").where("value", "<>", "").select("product_id").count({ n: "*" }).groupBy("product_id"),
      db("categories as c").leftJoin("products as p", function () { this.on("p.category_id", "c.id").andOnVal("p.published", "=", 1); })
        .whereNotNull("c.main_category_id").groupBy("c.id")
        .select("c.id", "c.key", "c.name", "c.blurb", "c.image", "c.meta_title", "c.meta_description").count({ models: "p.id" }),
    ]);
    const specCount = new Map(specs.map((s) => [s.product_id, Number(s.n)]));
    const items = [];

    const titles = new Map();
    const descs = new Map();
    for (const p of products) {
      const title = p.meta_title || p.name + " (" + p.model_code + ") | Bongshai Steel";
      const desc = p.meta_description || "";
      titles.set(title, (titles.get(title) || 0) + 1);
      if (desc) descs.set(desc, (descs.get(desc) || 0) + 1);
    }

    for (const p of products) {
      const issues = [];
      const title = p.meta_title || p.name + " (" + p.model_code + ") | Bongshai Steel";
      if (!p.meta_description) issues.push({ level: "warn", text: "No SEO description (a generic one is used)" });
      else if (p.meta_description.length < DESC_MIN) issues.push({ level: "warn", text: "SEO description is short (" + p.meta_description.length + " characters)" });
      else if (p.meta_description.length > DESC_MAX) issues.push({ level: "info", text: "SEO description may be cut off (" + p.meta_description.length + " characters)" });
      if (title.length > TITLE_MAX) issues.push({ level: "info", text: "Title is " + title.length + " characters — Google shows about " + TITLE_MAX });
      if (titles.get(title) > 1) issues.push({ level: "error", text: "Same title as another model" });
      if (p.meta_description && descs.get(p.meta_description) > 1) issues.push({ level: "error", text: "Same SEO description as another model" });
      if (!p.image) issues.push({ level: "error", text: "No image" });
      else if (!p.image_alt) issues.push({ level: "info", text: "No image alt text (name and code are used)" });
      if (!p.description || p.description.length < 60) issues.push({ level: "warn", text: "Description is thin" });
      if (!specCount.get(p.id)) issues.push({ level: "warn", text: "No specifications filled in" });
      items.push({ type: "Model", name: p.model_code + " — " + p.name, url: "/products/" + encodeURIComponent(p.model_code), edit: "/admin/products/" + p.id + "/edit", issues });
    }

    for (const c of cats) {
      const issues = [];
      if (!Number(c.models)) issues.push({ level: "info", text: "No published models — kept out of Google (noindex) until it has some" });
      if (!c.meta_description && !c.blurb) issues.push({ level: "warn", text: "No description or SEO description" });
      else if (!c.meta_description) issues.push({ level: "info", text: "No SEO description (built from the blurb)" });
      if (!c.image && Number(c.models)) issues.push({ level: "info", text: "No category image" });
      items.push({ type: "Building type", name: c.name, url: "/category/" + encodeURIComponent(c.key), edit: "/admin/categories/" + c.id + "/edit", issues });
    }
    return items;
  }

  router.get("/admin/seo", async (req, res, next) => {
    try {
      const items = await auditRows();
      const show = ["error", "warn", "info", "ok"].includes(req.query.show) ? req.query.show : "problems";
      const worst = (it) => (it.issues.some((i) => i.level === "error") ? "error" : it.issues.some((i) => i.level === "warn") ? "warn" : it.issues.length ? "info" : "ok");
      const counts = { error: 0, warn: 0, info: 0, ok: 0 };
      for (const it of items) { it.worst = worst(it); counts[it.worst]++; }
      const models = items.filter((i) => i.type === "Model");
      const good = models.filter((i) => i.worst === "ok" || i.worst === "info").length;
      const missingDesc = models.filter((i) => i.issues.some((x) => /^No SEO description/.test(x.text))).length;
      const shown = items.filter((it) => (show === "problems" ? it.worst === "error" || it.worst === "warn" : it.worst === show));
      res.render("admin/seo.njk", view(req, "seo", {
        items: shown, counts, show, total: items.length, missingDesc,
        score: models.length ? Math.round((good / models.length) * 100) : 100,
        origin: "https://www.bongshaisteel.com",
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/seo/fill-descriptions", async (req, res, next) => {
    try {
      const products = await db("products as p").join("categories as c", "c.id", "p.category_id")
        .where("p.published", true).where((b) => b.whereNull("p.meta_description").orWhere("p.meta_description", ""))
        .select("p.*", "c.name as category_name");
      if (!products.length) return res.redirect("/admin/seo?notice=" + encodeURIComponent("Every published model already has an SEO description."));
      const specs = await db("product_specs").whereIn("product_id", products.map((p) => p.id))
        .orderBy("sort_order").select("product_id", "label", "value");
      await db.transaction(async (trx) => {
        for (const p of products) {
          const mine = specs.filter((s) => s.product_id === p.id);
          await trx("product_revisions").insert({
            product_id: p.id, model_code: p.model_code, action: "seo-fill",
            admin_name: req.admin ? (req.admin.name || req.admin.username) : null,
            data: JSON.stringify({ product: (({ category_name, ...row }) => row)(p), specs: mine.map(({ label, value }) => ({ label, value })) }),
          });
          await trx("products").where({ id: p.id }).update({ meta_description: draftDescription(p, mine), updated_at: trx.fn.now() });
        }
      });
      await contentChanged();
      await logActivity(req, "seo.fill", "product", null, "wrote SEO descriptions for " + products.length + " model(s)");
      res.redirect("/admin/seo?notice=" + encodeURIComponent("Wrote SEO descriptions for " + products.length +
        " model(s). Each can be edited on its product page; the old (blank) state is in its edit history."));
    } catch (err) {
      next(err);
    }
  });

  return { draftDescription, auditRows };
};
