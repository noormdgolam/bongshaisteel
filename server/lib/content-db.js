/* ==========================================================================
   CONTENT FROM THE DATABASE
   --------------------------------------------------------------------------
   Rebuilds exactly the object data/content.json holds, from the tables. That
   keeps one contract for every consumer — render.js, the catalogue, apply.js
   on the client — whichever store the content comes from.

   Optional fields that are NULL in the database are left out rather than set
   to null, matching how the flat file stores them.
   ========================================================================== */
"use strict";

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

async function loadFromDb(db) {
  const [
    siteRows, mains, cats, products, stats, trust, services, safety, faqs,
    testimonials, team, areas, specs,
  ] = await Promise.all([
    db("site_content").select("section", "data"),
    db("main_categories").orderBy("sort_order").orderBy("id"),
    db("categories").orderBy("sort_order").orderBy("id"),
    db("products as p").join("categories as c", "c.id", "p.category_id")
      .where("p.published", true)
      .orderBy("p.sort_order").orderBy("p.id")
      .select("p.*", "c.key as category_key", "c.name as category_name"),
    db("stats").orderBy("sort_order").orderBy("id"),
    db("trust_items").orderBy("sort_order").orderBy("id"),
    db("services").where("published", true).orderBy("sort_order").orderBy("id"),
    db("safety_points").orderBy("sort_order").orderBy("id"),
    db("faqs").where("published", true).orderBy("sort_order").orderBy("id"),
    db("testimonials").where("published", true).orderBy("sort_order").orderBy("id"),
    db("team_members").where("published", true).orderBy("sort_order").orderBy("id"),
    db("service_areas").orderBy("sort_order").orderBy("id"),
    db("product_specs").orderBy("product_id").orderBy("sort_order").orderBy("id")
      .select("product_id", "label", "value"),
  ]);

  const specsOf = new Map();
  for (const s of specs) {
    if (!specsOf.has(s.product_id)) specsOf.set(s.product_id, []);
    specsOf.get(s.product_id).push({ label: s.label, value: s.value });
  }

  const site = {};
  for (const r of siteRows) {
    try { site[r.section] = JSON.parse(r.data); } catch { site[r.section] = {}; }
  }

  // Every building type under a product line is public (owner: the menu shows
  // the whole range). One without published models is a quote-on-request
  // page — noindex and outside the sitemap until it has models.
  const used = new Set(products.map((p) => p.category_key));
  const visibleCats = cats.filter((c) => c.main_category_id || used.has(c.key));
  const mainKey = Object.fromEntries(mains.map((m) => [m.id, m.key]));
  const visibleMains = mains.filter((m) => visibleCats.some((c) => c.main_category_id === m.id));

  const featured = products
    .filter((p) => p.featured)
    .sort((a, b) => (a.featured_order ?? 1e9) - (b.featured_order ?? 1e9))
    .map((p) => p.slug);

  return {
    settings: site.settings || {},
    seo: site.seo || {},
    text: site.text || {},
    html: site.html || {},
    sections: {
      stats: stats.map((s) => ({ value: s.value, label: s.label })),
      trustBar: trust.map((t) => compact({ icon: t.icon, title: t.title, text: t.text })),
      services: services.map((s) => compact({ title: s.title, desc: s.description })),
      safety: {
        intro: (site.safety && site.safety.intro) || "",
        points: safety.map((p) => p.text),
      },
      faq: faqs.map((f) => ({ q: f.question, a: f.answer })),
      testimonials: testimonials.map((t) => compact({ quote: t.quote, author: t.author, role: t.role })),
      team: team.map((m) => compact({ name: m.name, role: m.role, bio: m.bio, photo: m.photo })),
      serviceAreas: areas.map((a) => compact({ name: a.name, note: a.note })),
    },
    mainCategories: visibleMains.map((m) => compact({
      key: m.key, name: m.name, icon: m.icon, blurb: m.blurb, ready: !!m.ready,
    })),
    categories: visibleCats.map((c) => compact({
      key: c.key, name: c.name, icon: c.icon, blurb: c.blurb, image: c.image,
      main: mainKey[c.main_category_id],
      metaTitle: c.meta_title, metaDescription: c.meta_description,
    })),
    products: products.map((p) => compact({
      id: p.slug,
      category: p.category_key,
      categoryName: p.category_name,
      modelCode: p.model_code,
      name: p.name,
      desc: p.description,
      image: p.image,
      order: p.sort_order,
      imageAlt: p.image_alt,
      metaTitle: p.meta_title,
      metaDescription: p.meta_description,
      priceFrom: p.price_from == null ? null : Number(p.price_from),
      priceUnit: p.price_from == null ? null : p.price_unit || "total",
      priceCurrency: p.price_from == null ? null : p.price_currency || "BDT",
      specs: specsOf.get(p.id),
      updated: p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : null,
    })),
    featuredIds: featured,
    media: site.media || {},
  };
}

module.exports = { loadFromDb };
