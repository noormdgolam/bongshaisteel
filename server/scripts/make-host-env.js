/* Writes server/.env.host — the production .env for the app folder on the
   host — from PROD_DB_* in server/.env plus freshly generated secrets.
   Prints key names only. Refuses to overwrite an existing .env.host (the
   secrets in it are live once uploaded; regenerating would sign everyone out
   and change every lead's IP hash). */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SERVER = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(SERVER, ".env") });
const OUT = path.join(SERVER, ".env.host");

if (fs.existsSync(OUT)) { console.error(".env.host already exists — not overwriting."); process.exit(1); }
const { PROD_DB_NAME, PROD_DB_USER, PROD_DB_PASSWORD } = process.env;
if (!PROD_DB_NAME || !PROD_DB_USER || !PROD_DB_PASSWORD) { console.error("PROD_DB_* missing in server/.env"); process.exit(2); }

const q = (v) => JSON.stringify(String(v));
const lines = [
  "# Production .env for /home/abongsha/bongshai-steel-node — never commit.",
  "NODE_ENV=production",
  "CONTENT_SOURCE=db",
  "SITE_ROOT=/home/abongsha/bongshaisteel.com",
  "CANONICAL_HOST=www.bongshaisteel.com",
  "",
  "# Same server as the app, so localhost (no Remote MySQL needed).",
  "DB_HOST=localhost",
  "DB_PORT=3306",
  "DB_NAME=" + PROD_DB_NAME,
  "DB_USER=" + PROD_DB_USER,
  "DB_PASSWORD=" + q(PROD_DB_PASSWORD),
  "",
  "SESSION_SECRET=" + crypto.randomBytes(36).toString("base64url"),
  "LEAD_SALT=" + crypto.randomBytes(24).toString("base64url"),
  "",
];
fs.writeFileSync(OUT, lines.join("\n"), { mode: 0o600 });
console.log("wrote " + OUT + ": " + lines.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split("=")[0]).join(", "));
