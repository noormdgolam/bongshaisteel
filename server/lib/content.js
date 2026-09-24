/* ==========================================================================
   CONTENT STORE
   --------------------------------------------------------------------------
   Same contract as apply.js on the client and lib.php on the PHP side: the
   live file wins, the git-tracked seed is the fallback, and a missing or
   unparseable file must never take the site down.

   Cached on the file's mtime, so a save through the CMS is picked up on the
   next request without a restart and without stat-ing on every read path.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const { ROOT } = require("./paths");
const path = require("node:path");

const LIVE = path.join(ROOT, "data", "content.json");
const SEED = path.join(ROOT, "data", "content.default.json");

let cache = { key: null, value: null };

function stamp(file) {
  try {
    return String(fs.statSync(file).mtimeMs);
  } catch {
    return "0";
  }
}

/** A key that changes whenever either file changes. */
function version() {
  return stamp(LIVE) + ":" + stamp(SEED);
}

function readJSON(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Fill in anything missing so callers can assume the shape. */
function normalise(c) {
  for (const k of ["text", "html", "settings", "seo", "sections", "media"]) {
    if (!c[k] || typeof c[k] !== "object" || Array.isArray(c[k])) c[k] = {};
  }
  for (const k of ["products", "categories", "mainCategories", "featuredIds"]) {
    if (!Array.isArray(c[k])) c[k] = [];
  }
  const s = c.sections;
  for (const k of ["stats", "trustBar", "services", "faq", "testimonials", "team", "serviceAreas"]) {
    if (!Array.isArray(s[k])) s[k] = [];
  }
  if (!s.safety || typeof s.safety !== "object") s.safety = { intro: "", points: [] };
  if (!Array.isArray(s.safety.points)) s.safety.points = [];
  if (!Array.isArray(c.settings.sisterLinks)) c.settings.sisterLinks = [];
  return c;
}

function load() {
  const key = version();
  if (cache.key === key && cache.value) return cache.value;

  const raw = readJSON(LIVE) || readJSON(SEED) || {};
  const value = Object.freeze(normalise(raw));
  cache = { key, value };
  return value;
}

/** Drop the cache — used by tests and, later, by the admin save path. */
function invalidate() {
  cache = { key: null, value: null };
}

module.exports = { load, version, invalidate, LIVE, SEED };
