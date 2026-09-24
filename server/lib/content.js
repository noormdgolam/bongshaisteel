/* ==========================================================================
   CONTENT STORE
   --------------------------------------------------------------------------
   One synchronous load() for every consumer (render.js, the catalogue, the
   /data/content.json route), whichever store the content lives in.

   CONTENT_SOURCE=file (default)
     data/content.json, falling back to the git-tracked seed. Cached on mtime.

   CONTENT_SOURCE=db
     Read once at boot by init(), held in memory, served from memory. A read
     from the remote dev database takes ~2s, so nothing ever queries per
     request. Changes are picked up by refresh(): called directly after an
     admin write, and by a light poll of the "_rev" marker so every Passenger
     worker catches up, not just the one that saved.
     If the database is unreachable at boot the file is used instead, and a
     failed refresh keeps the last good copy — the site never goes blank.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./paths");

const LIVE = path.join(ROOT, "data", "content.json");
const SEED = path.join(ROOT, "data", "content.default.json");

const SOURCE = process.env.CONTENT_SOURCE === "db" ? "db" : "file";
const POLL_MS = Number(process.env.CONTENT_POLL_MS) || 30000;

let fileCache = { key: null, value: null };
let dbState = { value: null, rev: null, generation: 0, loadedAt: null, error: null };
let pollTimer = null;

/* ------------------------------------------------------------------ shape */

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

/* ------------------------------------------------------------------- file */

function stamp(file) {
  try {
    return String(fs.statSync(file).mtimeMs);
  } catch {
    return "0";
  }
}

function readJSON(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function fileVersion() {
  return "file:" + stamp(LIVE) + ":" + stamp(SEED);
}

function loadFile() {
  const key = fileVersion();
  if (fileCache.key === key && fileCache.value) return fileCache.value;
  const value = Object.freeze(normalise(readJSON(LIVE) || readJSON(SEED) || {}));
  fileCache = { key, value };
  return value;
}

/* --------------------------------------------------------------------- db */

function db() {
  return require("./db"); // lazy: file mode never opens a pool
}

async function readRev() {
  const row = await db()("site_content").where({ section: "_rev" }).first("data");
  return row ? String(row.data) : "0";
}

/** Re-read everything from the database. Keeps the last good copy on failure. */
async function refresh() {
  if (SOURCE !== "db") return false;
  const { loadFromDb } = require("./content-db");
  try {
    const [rev, raw] = await Promise.all([readRev(), loadFromDb(db())]);
    dbState = {
      value: Object.freeze(normalise(raw)),
      rev,
      generation: dbState.generation + 1,
      loadedAt: new Date(),
      error: null,
    };
    return true;
  } catch (err) {
    dbState.error = err;
    console.error("content: database refresh failed, keeping the last good copy:", err.message);
    return false;
  }
}

/** Mark the content as changed so every worker's poll picks it up. */
async function bumpRev(trx) {
  const q = trx || db();
  const rev = String(Date.now());
  await q.raw(
    "INSERT INTO site_content (section, data, updated_at) VALUES ('_rev', ?, UTC_TIMESTAMP()) " +
    "ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)", [rev]);
  return rev;
}

async function poll() {
  try {
    const rev = await readRev();
    if (rev !== dbState.rev) await refresh();
  } catch (err) {
    console.error("content: rev poll failed:", err.message);
  }
}

/** Call once at boot. Resolves in every case — a dead database never stops the app. */
async function init() {
  if (SOURCE !== "db") return { source: "file" };
  const ok = await refresh();
  if (!pollTimer && POLL_MS > 0) {
    pollTimer = setInterval(poll, POLL_MS);
    pollTimer.unref();
  }
  return { source: ok ? "db" : "file (database unreachable at boot)" };
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/* ------------------------------------------------------------------ public */

function load() {
  if (SOURCE === "db" && dbState.value) return dbState.value;
  return loadFile();
}

/** A key that changes whenever the content does — render.js caches on it. */
function version() {
  if (SOURCE === "db" && dbState.value) return "db:" + dbState.generation;
  return fileVersion();
}

function status() {
  return {
    configured: SOURCE,
    serving: SOURCE === "db" && dbState.value ? "db" : "file",
    rev: dbState.rev,
    generation: dbState.generation,
    loadedAt: dbState.loadedAt,
    lastError: dbState.error ? dbState.error.message : null,
  };
}

/** Drop the file cache — used by tests. */
function invalidate() {
  fileCache = { key: null, value: null };
}

module.exports = {
  load, version, init, refresh, bumpRev, stop, status, invalidate, normalise,
  SOURCE, LIVE, SEED,
};
