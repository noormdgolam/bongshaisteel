/* ==========================================================================
   FLAT FILE -> DATABASE IMPORT
   --------------------------------------------------------------------------
     node scripts/import-flatfile.js            dry run: shows what would change
     node scripts/import-flatfile.js --yes      do it

   Content (data/content.json, else the seed) replaces the content tables
   wholesale: until cutover the flat-file CMS is where content is authored,
   so the file is the source of truth and the tables are rebuilt from it.

   Leads (data/leads.json) are ADDITIVE: only messages whose public_id is not
   already in the table are inserted. A lead in the database is never
   overwritten or deleted by this script.

   Everything runs in one transaction — a failure halfway leaves the database
   exactly as it was.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../lib/paths");
const db = require("../lib/db");

const APPLY = process.argv.includes("--yes");
const LIVE = path.join(ROOT, "data", "content.json");
const SEED = path.join(ROOT, "data", "content.default.json");
const LEADS = path.join(ROOT, "data", "leads.json");

// Children before parents, so RESTRICT foreign keys never fire during the wipe.
const CONTENT_TABLES = [
  "products", "categories", "main_categories",
  "stats", "trust_items", "services", "safety_points", "faqs",
  "testimonials", "team_members", "service_areas", "site_content",
];

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const LEAD_COLUMNS = ["name", "phone", "email", "company", "message", "destination",
  "currency", "standard", "dimensions", "source"];

/** "2026-09-24T13:18:01+00:00" -> "2026-09-24 13:18:01" (stored as UTC). */
function mysqlTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? new Date().toISOString().slice(0, 19).replace("T", " ")
    : d.toISOString().slice(0, 19).replace("T", " ");
}

function plan(content, leads) {
  const s = content.sections || {};
  const featured = content.featuredIds || [];
  return {
    main_categories: content.mainCategories || [],
    categories: content.categories || [],
    products: (content.products || []).map((p) => ({ ...p, featuredIdx: featured.indexOf(p.id) })),
    stats: s.stats || [],
    trust_items: s.trustBar || [],
    services: s.services || [],
    safety_points: (s.safety && s.safety.points) || [],
    faqs: s.faq || [],
    testimonials: (s.testimonials || []).filter((t) => t && t.quote),
    team_members: (s.team || []).filter((m) => m && m.name),
    service_areas: (s.serviceAreas || [])
      .map((a) => (typeof a === "string" ? { name: a } : a))
      .filter((a) => a && a.name),
    site_content: {
      text: content.text || {},
      html: content.html || {},
      settings: content.settings || {},
      seo: content.seo || {},
      media: content.media || {},
      safety: { intro: (s.safety && s.safety.intro) || "" },
    },
    leads: Array.isArray(leads) ? leads : [],
  };
}

async function main() {
  const source = fs.existsSync(LIVE) ? LIVE : SEED;
  const content = readJSON(source);
  const leads = fs.existsSync(LEADS) ? readJSON(LEADS) : [];
  const p = plan(content, leads);

  console.log("content source: " + path.relative(ROOT, source));
  console.log("leads source:   " + (fs.existsSync(LEADS) ? "data/leads.json" : "(none)"));
  console.log("");

  // What is there now
  const before = {};
  for (const t of [...CONTENT_TABLES, "leads"]) {
    before[t] = Number((await db(t).count({ n: "*" }))[0].n);
  }
  const existingLeadIds = new Set((await db("leads").whereNotNull("public_id").pluck("public_id")));
  const newLeads = p.leads.filter((l) => l && l.id && !existingLeadIds.has(l.id));

  const rows = [
    ["main_categories", p.main_categories.length],
    ["categories", p.categories.length],
    ["products", p.products.length],
    ["stats", p.stats.length],
    ["trust_items", p.trust_items.length],
    ["services", p.services.length],
    ["safety_points", p.safety_points.length],
    ["faqs", p.faqs.length],
    ["testimonials", p.testimonials.length],
    ["team_members", p.team_members.length],
    ["service_areas", p.service_areas.length],
    ["site_content", Object.keys(p.site_content).length],
  ];
  console.log("table              now   ->  after");
  for (const [t, n] of rows) console.log("  " + t.padEnd(17) + String(before[t]).padStart(4) + "  ->  " + n + "   (replaced)");
  console.log("  " + "leads".padEnd(17) + String(before.leads).padStart(4) + "  ->  " +
    (before.leads + newLeads.length) + "   (+" + newLeads.length + " new, existing untouched)");

  if (!APPLY) {
    console.log("\ndry run — nothing written. Re-run with --yes to apply.");
    return;
  }

  await db.transaction(async (trx) => {
    for (const t of CONTENT_TABLES) await trx(t).del();

    const mainIds = {};
    for (const [i, m] of p.main_categories.entries()) {
      const [id] = await trx("main_categories").insert({
        key: m.key, name: m.name, icon: m.icon || null, blurb: m.blurb || null,
        ready: !!m.ready, sort_order: i,
      });
      mainIds[m.key] = id;
    }

    // Every current family sits under Prefab Buildings in the mega-menu.
    const prefabId = mainIds.prefab || null;
    const catIds = {};
    for (const [i, c] of p.categories.entries()) {
      const [id] = await trx("categories").insert({
        key: c.key, main_category_id: prefabId, name: c.name, icon: c.icon || null,
        blurb: c.blurb || null, image: c.image || null, sort_order: i,
      });
      catIds[c.key] = id;
    }

    for (const [i, pr] of p.products.entries()) {
      const categoryId = catIds[pr.category];
      if (!categoryId) throw new Error("product " + pr.modelCode + " has unknown category '" + pr.category + "'");
      await trx("products").insert({
        slug: pr.id, model_code: pr.modelCode, category_id: categoryId,
        name: pr.name, description: pr.desc || null, image: pr.image || null,
        featured: pr.featuredIdx >= 0, featured_order: pr.featuredIdx >= 0 ? pr.featuredIdx : null,
        published: true, sort_order: typeof pr.order === "number" ? pr.order : i,
      });
    }

    const bulk = async (table, list, map) => {
      if (list.length) await trx(table).insert(list.map((x, i) => ({ ...map(x), sort_order: i })));
    };
    await bulk("stats", p.stats, (x) => ({ value: x.value || "", label: x.label || "" }));
    await bulk("trust_items", p.trust_items, (x) => ({ icon: x.icon || null, title: x.title || "", text: x.text || null }));
    await bulk("services", p.services, (x) => ({ title: x.title || "", description: x.desc || null }));
    await bulk("safety_points", p.safety_points, (x) => ({ text: String(x || "") }));
    await bulk("faqs", p.faqs, (x) => ({ question: x.q || "", answer: x.a || "" }));
    await bulk("testimonials", p.testimonials, (x) => ({ quote: x.quote, author: x.author || "", role: x.role || null }));
    await bulk("team_members", p.team_members, (x) => ({ name: x.name, role: x.role || null, bio: x.bio || null, photo: x.photo || null }));
    await bulk("service_areas", p.service_areas, (x) => ({ name: x.name, note: x.note || null }));

    for (const [section, data] of Object.entries(p.site_content)) {
      await trx("site_content").insert({ section, data: JSON.stringify(data) });
    }

    // Oldest first, so auto-increment ids follow arrival order.
    for (const l of [...newLeads].reverse()) {
      const f = l.fields || {};
      const row = {
        public_id: l.id, kind: l.kind === "quote" ? "quote" : "contact",
        status: ["new", "contacted", "quoted", "won", "lost"].includes(l.status) ? l.status : "new",
        note: l.note || null, model_code: f.modelCode || null,
        from_hash: l.from || null, user_agent: (l.agent || "").slice(0, 200) || null,
        created_at: mysqlTime(l.at), updated_at: mysqlTime(l.at),
      };
      for (const c of LEAD_COLUMNS) row[c] = f[c] == null ? null : String(f[c]);
      if (!row.name) row.name = "(no name)";
      if (!row.phone) row.phone = "";
      await trx("leads").insert(row);
    }
  });

  console.log("\napplied.");
}

main()
  .catch((e) => { console.error("\nFAILED — nothing was changed:\n  " + e.message); process.exitCode = 1; })
  .finally(() => db.destroy());
