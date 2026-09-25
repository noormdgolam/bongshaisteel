"use strict";

/* The product menu from the owner's "Web site Menu" document (2026-09-25):
   four product lines, each with its building types. The five categories that
   already have products keep their keys, so /category/<key> URLs and every
   product link stay the same; they only move under their new line.

   Categories without products are created but not shown publicly
   (content-db.js lists a category only when it has a published product), so
   the menu grows by itself as products are added in the admin.

   Idempotent: every row is matched by key, so a second run changes nothing. */

const LINES = [
  { key: "steel-building", name: "Steel Building", icon: "🏗️",
    blurb: "Pre-engineered (PEB) steel buildings for industry, storage, sport and aviation.",
    cats: [
      ["peb-steel-building", "PEB Steel Building", "🏗️"],
      ["factory", null, null],
      ["warehouse", "Warehouse", "🏬"],
      ["godown", "Godown", "📦"],
      ["farm-house", "Farm House", "🌾"],
      ["indoor-stadium", "Indoor Stadium", "🏟️"],
      ["auditorium", "Auditorium", "🎭"],
      ["aircraft-hangar", "Aircraft Hangar", "✈️"],
    ] },
  { key: "commercial", name: "Commercial Steel Building", icon: "🏢",
    blurb: "Steel-framed buildings for retail, education, offices, banks, healthcare and communities.",
    cats: [
      ["supermarket", "Super Market", "🛒"],
      ["school-college", "School & College", "🏫"],
      ["office", "Office Building", "🏢"],
      ["bank", "Bank Building", "🏦"],
      ["university", "University", "🎓"],
      ["hospital", "Hospital", "🏥"],
      ["community-center", "Community Center", "🏛️"],
    ] },
  { key: "residential", name: "Residential Steel Building", icon: "🏘️",
    blurb: "Steel homes, cottages, container houses, hotels and staff accommodation.",
    cats: [
      ["duplex", null, null],
      ["cottage", null, null],
      ["container", null, null],
      ["hotel-resort", "Hotel & Resort", "🏨"],
      ["accommodation-unit", "Accommodation Unit", "🛏️"],
    ] },
  { key: "structure", name: "Structural Steel", icon: "🏛️",
    blurb: "Structural steel fabrication for industrial and commercial projects.",
    cats: [
      ["pipe-racks", "Pipe Racks", "🛢️"],
      ["equipment-supports", "Equipment Support Structures", "⚙️"],
      ["built-up-girders", "Built-up Girders & Columns", "🏗️"],
      ["structural", null, null],
      ["high-rise", "High-rise Buildings", "🏙️"],
    ] },
];
// Product lines the new menu does not have. Removed only if nothing uses them.
const RETIRED = ["prefab", "furniture", "doorgate", "siteothers"];

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable("main_categories"))) return;

  for (const [i, line] of LINES.entries()) {
    const row = { name: line.name, icon: line.icon, blurb: line.blurb, ready: true, sort_order: i };
    const found = await knex("main_categories").where({ key: line.key }).first("id");
    const mainId = found ? found.id
      : (await knex("main_categories").insert({ key: line.key, ...row }))[0];
    if (found) await knex("main_categories").where({ id: mainId }).update(row);

    for (const [j, [key, name, icon]] of line.cats.entries()) {
      const cat = await knex("categories").where({ key }).first("id");
      if (cat) {
        await knex("categories").where({ id: cat.id }).update({ main_category_id: mainId, sort_order: i * 100 + j });
      } else if (name) {
        await knex("categories").insert({ key, name, icon, main_category_id: mainId, sort_order: i * 100 + j });
      }
    }
  }

  for (const key of RETIRED) {
    const m = await knex("main_categories").where({ key }).first("id");
    if (!m) continue;
    const used = await knex("categories").where({ main_category_id: m.id }).first("id");
    if (!used) await knex("main_categories").where({ id: m.id }).del();
  }

  // Tell running app workers the content changed (they poll _rev).
  await knex.raw("INSERT INTO site_content (section, data, updated_at) VALUES ('_rev', ?, UTC_TIMESTAMP()) " +
    "ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)", [String(Date.now())]);
};

// Structure changes are content: roll back with a content snapshot (Admin →
// Backups), which restores the exact previous rows. Nothing to undo here.
exports.down = async function () {};
