/* ==========================================================================
   IMPORT ROUND-TRIP CHECK — read-only.
     node scripts/verify-db-roundtrip.js
   Rebuilds the content object from the database and compares it, value for
   value, with the flat file it was imported from. Any difference means the
   import (or lib/content-db.js) loses or changes something.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../lib/paths");
const db = require("../lib/db");
const { loadFromDb } = require("../lib/content-db");

const LIVE = path.join(ROOT, "data", "content.json");
const SEED = path.join(ROOT, "data", "content.default.json");

/** The flat file, with the same empty-entry filtering the importer applies. */
function expected() {
  const c = JSON.parse(fs.readFileSync(fs.existsSync(LIVE) ? LIVE : SEED, "utf8"));
  const s = c.sections || {};
  return {
    settings: c.settings || {},
    seo: c.seo || {},
    text: c.text || {},
    html: c.html || {},
    sections: {
      stats: s.stats || [],
      trustBar: s.trustBar || [],
      services: s.services || [],
      safety: { intro: (s.safety && s.safety.intro) || "", points: (s.safety && s.safety.points) || [] },
      faq: s.faq || [],
      testimonials: (s.testimonials || []).filter((t) => t && t.quote),
      team: (s.team || []).filter((m) => m && m.name),
      serviceAreas: (s.serviceAreas || [])
        .map((a) => (typeof a === "string" ? { name: a } : a)).filter((a) => a && a.name),
    },
    mainCategories: c.mainCategories || [],
    categories: c.categories || [],
    products: c.products || [],
    featuredIds: c.featuredIds || [],
    media: c.media || {},
  };
}

function diff(a, b, at, out) {
  if (out.length > 25) return;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) { out.push(at + ": array vs " + typeof b); return; }
    if (a.length !== b.length) out.push(at + ": length " + a.length + " vs " + b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], at + "[" + i + "]", out);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], at + "." + k, out);
    return;
  }
  if (a !== b) out.push(at + ": " + JSON.stringify(a) + "  !=  " + JSON.stringify(b));
}

async function main() {
  const want = expected();
  const t0 = Date.now();
  const got = await loadFromDb(db);
  const ms = Date.now() - t0;

  const out = [];
  diff(want, got, "content", out);

  const count = (o) => JSON.stringify(o).length;
  console.log("rebuilt from the database in " + ms + " ms (" + count(got) + " bytes of JSON)");
  console.log("  products " + got.products.length + ", categories " + got.categories.length +
    ", faq " + got.sections.faq.length + ", text keys " + Object.keys(got.text).length +
    ", featured " + got.featuredIds.length);
  if (out.length) {
    console.log("\nFAIL — " + out.length + " difference(s):");
    out.forEach((l) => console.log("  " + l.slice(0, 200)));
    process.exitCode = 1;
  } else {
    console.log("\nPASS — the database holds exactly what the flat file held");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => db.destroy());
