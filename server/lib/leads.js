/* ==========================================================================
   LEAD INTAKE — Node port of lead.php
   --------------------------------------------------------------------------
   Same field list, same caps, same honeypot, same rate limit, same files:
   data/leads.json for the records and admin/backups/ for the rate-limit
   counter and the activity trail. While both stacks run, the PHP dashboard
   reads exactly what this writes.

   Note for the host: as long as lead.php exists on disk, LiteSpeed runs the
   PHP one and this route never sees the request. It takes over only once the
   PHP files are retired (Phase 5).
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ROOT } = require("./paths");

const LEADS_FILE = path.join(ROOT, "data", "leads.json");
const BACKUP_DIR = path.join(ROOT, "admin", "backups");
const RATE_FILE = path.join(BACKUP_DIR, ".leadrate.json");
const ACTIVITY_FILE = path.join(BACKUP_DIR, "activity.log");

/** Mirrors CMS_LEAD_FIELDS in admin/lib.php. */
const FIELDS = {
  name: 120, phone: 60, email: 160, company: 160, message: 4000,
  destination: 200, currency: 20, standard: 60, dimensions: 200,
  modelCode: 60, source: 120,
};

const MAX_LEADS = Number(process.env.MAX_LEADS) || 2000;
const LEAD_RATE = Number(process.env.LEAD_RATE) || 5;
const LEAD_WINDOW = Number(process.env.LEAD_WINDOW) || 600; // seconds
const SALT = process.env.LEAD_SALT || "";

class LeadError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ht = path.join(BACKUP_DIR, ".htaccess");
  if (!fs.existsSync(ht)) fs.writeFileSync(ht, "Require all denied\n");
}

/** Same key shape as cms_throttle_key(): first 16 hex of sha256(ip). */
function ipKey(ip) {
  return crypto.createHash("sha256").update(String(ip || "?")).digest("hex").slice(0, 16);
}

function readJSON(file, fallback) {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    return v && typeof v === "object" ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Atomic write: tmp file then rename, as the PHP side does. */
function writeJSON(file, value, pretty) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, pretty ? 4 : 0));
  fs.renameSync(tmp, file);
}

/** Seconds until this address may send again, or 0. */
function rateLeft(key) {
  const rec = readJSON(RATE_FILE, {})[key];
  if (!rec) return 0;
  const age = Math.floor(Date.now() / 1000) - (Number(rec.first) || 0);
  if (age >= LEAD_WINDOW) return 0;
  if ((Number(rec.n) || 0) < LEAD_RATE) return 0;
  return LEAD_WINDOW - age;
}

function rateNote(key) {
  ensureBackupDir();
  const now = Math.floor(Date.now() / 1000);
  const all = readJSON(RATE_FILE, {});
  for (const k of Object.keys(all)) {
    if (!all[k] || now - (Number(all[k].first) || 0) > LEAD_WINDOW) delete all[k];
  }
  const rec = all[key];
  all[key] = rec ? { n: Number(rec.n) + 1, first: Number(rec.first) } : { n: 1, first: now };
  writeJSON(RATE_FILE, all, false);
}

function activity(event, detail, key) {
  try {
    ensureBackupDir();
    const line = JSON.stringify({
      at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
      event: String(event).slice(0, 40),
      detail: String(detail || "").slice(0, 300),
      from: key,
    });
    fs.appendFileSync(ACTIVITY_FILE, line + "\n");
  } catch {
    /* the trail must never break the request it describes */
  }
}

/** Cut by code point, not UTF-16 unit, so Bangla is never split mid-character. */
function cut(s, max) {
  return Array.from(s).slice(0, max).join("");
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "-" +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
}

/**
 * Validate and store one submission.
 * @returns {{stored: boolean}}  — throws LeadError on refusal.
 */
function record(input, meta) {
  const body = input && typeof input === "object" ? input : {};
  const key = ipKey(meta.ip);

  // Honeypot: answer normally, keep nothing.
  if (String(body.website || "").trim() !== "") return { stored: false };

  const left = rateLeft(key);
  if (left > 0) {
    throw new LeadError(429, "too_many",
      "Too many messages from this connection. Try again in " + Math.ceil(left / 60) +
      " min, or call the hotline.");
  }

  const kind = body.kind === "quote" ? "quote" : "contact";
  const fields = {};
  for (const [name, max] of Object.entries(FIELDS)) {
    let v = String(body[name] == null ? "" : body[name]).trim();
    if (!v) continue;
    // Control characters end up in a CSV and in the dashboard.
    v = cut(v, max).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    fields[name] = v;
  }
  if (!fields.name || !fields.phone) {
    throw new LeadError(422, "missing", "Please give a name and a phone number.");
  }

  const lead = {
    id: stamp() + "-" + crypto.randomBytes(3).toString("hex"),
    at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    kind,
    status: "new",
    note: "",
    fields,
    from: crypto.createHash("sha256").update(String(meta.ip || "") + SALT).digest("hex").slice(0, 12),
    agent: String(meta.agent || "").slice(0, 200),
  };

  const all = readJSON(LEADS_FILE, []);
  const list = Array.isArray(all) ? all : [];
  list.unshift(lead);
  writeJSON(LEADS_FILE, list.slice(0, MAX_LEADS), true);

  rateNote(key);
  activity("lead.new", kind + " from " + fields.name, key);
  return { stored: true };
}

module.exports = { record, LeadError, FIELDS, LEADS_FILE };
