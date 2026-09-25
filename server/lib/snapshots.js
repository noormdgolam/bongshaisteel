/* ==========================================================================
   CONTENT SNAPSHOTS
   --------------------------------------------------------------------------
   A snapshot is every row of every content table, ids included, so a restore
   puts the site back exactly — unpublished items, category links and sort
   orders too. (The public content object from content-db.js drops all of
   those, which is why it is not used here.)

   Not in a snapshot: leads, admin users, sessions, the activity log. Those are
   records, not content, and rolling them back would lose real messages. The
   nightly database dump covers them.

   Taken:
     auto            before a content change, at most once per AUTO_GAP
     manual          "Take a snapshot now"
     before-restore  always, just before a restore, so a restore can be undone
   The newest KEEP are kept; older ones are pruned when a new one is taken.
   ========================================================================== */
"use strict";

// Children before parents: the order rows are deleted in. Inserts run in reverse.
const TABLES = [
  "products", "categories", "main_categories",
  "stats", "trust_items", "services", "safety_points", "faqs",
  "testimonials", "team_members", "service_areas", "site_content",
];
const FORMAT = "bongshai-steel/content-snapshot@1";
const AUTO_GAP_MS = 30 * 60 * 1000;
const KEEP = 60;

class SnapshotError extends Error {}

/** Date -> "YYYY-MM-DD HH:MM:SS" (UTC; every connection runs in UTC). */
function sqlTime(v) {
  return v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : v;
}

async function dump(q) {
  const tables = {};
  for (const t of TABLES) {
    const rows = await q(t).orderBy(t === "site_content" ? "section" : "id");
    tables[t] = rows.map((r) => {
      const o = {};
      for (const [k, v] of Object.entries(r)) o[k] = sqlTime(v);
      return o;
    });
  }
  return { format: FORMAT, taken_at: new Date().toISOString(), tables };
}

function counts(data) {
  const t = (data && data.tables) || {};
  return {
    products: (t.products || []).length,
    categories: (t.categories || []).length,
    sections: ["stats", "trust_items", "services", "safety_points", "faqs", "testimonials", "team_members", "service_areas"]
      .reduce((n, k) => n + (t[k] || []).length, 0),
  };
}

async function prune(q) {
  const keep = await q("content_snapshots").orderBy("id", "desc").limit(KEEP).pluck("id");
  if (keep.length === KEEP) await q("content_snapshots").whereNotIn("id", keep).del();
}

async function take(db, { admin, reason, note }) {
  const data = await dump(db);
  const json = JSON.stringify(data);
  const [id] = await db("content_snapshots").insert({
    admin_user_id: admin ? admin.id : null,
    admin_name: admin ? (admin.name || admin.username) : null,
    reason, note: note ? String(note).slice(0, 255) : null,
    bytes: Buffer.byteLength(json), summary: JSON.stringify(counts(data)), data: json,
  });
  await prune(db);
  return id;
}

/** Take an automatic snapshot unless one was taken within AUTO_GAP_MS. Never throws. */
async function auto(db, admin) {
  try {
    const last = await db("content_snapshots").orderBy("id", "desc").first("created_at");
    if (last && Date.now() - new Date(last.created_at).getTime() < AUTO_GAP_MS) return null;
    return await take(db, { admin, reason: "auto" });
  } catch (err) {
    console.error("snapshot:", err.message); // a missed backup must not block the edit
    return null;
  }
}

async function list(db) {
  const rows = await db("content_snapshots").orderBy("id", "desc")
    .select("id", "created_at", "admin_name", "reason", "note", "bytes", "summary");
  return rows.map(({ summary, ...r }) => {
    let c = null;
    try { c = JSON.parse(summary); } catch { /* older row */ }
    return { ...r, counts: c };
  });
}

async function get(db, id) {
  const row = await db("content_snapshots").where({ id }).first();
  if (!row) return null;
  let data = null;
  try { data = JSON.parse(row.data); } catch { /* reported by restore */ }
  return { ...row, data, counts: counts(data) };
}

/**
 * Replace every content table with the snapshot's rows, in one transaction.
 * A snapshot of the current state is taken first (reason before-restore).
 */
async function restore(db, id, admin) {
  const snap = await get(db, id);
  if (!snap) throw new SnapshotError("That snapshot does not exist.");
  const data = snap.data;
  if (!data || data.format !== FORMAT || !data.tables) throw new SnapshotError("That snapshot is unreadable.");
  for (const t of TABLES) {
    if (!Array.isArray(data.tables[t])) throw new SnapshotError("That snapshot is missing the " + t + " table.");
  }
  if (!data.tables.products.length || !data.tables.categories.length) {
    throw new SnapshotError("That snapshot has no products or no categories — refusing to empty the catalogue.");
  }

  const safety = await take(db, { admin, reason: "before-restore", note: "state before restoring #" + id });
  await db.transaction(async (trx) => {
    for (const t of TABLES) await trx(t).del();
    for (const t of [...TABLES].reverse()) {
      const rows = data.tables[t];
      for (let i = 0; i < rows.length; i += 200) await trx(t).insert(rows.slice(i, i + 200));
    }
    await require("./content").bumpRev(trx);
  });
  return { safety, counts: snap.counts };
}

module.exports = { take, auto, list, get, restore, counts, SnapshotError, TABLES, FORMAT, KEEP, AUTO_GAP_MS };
