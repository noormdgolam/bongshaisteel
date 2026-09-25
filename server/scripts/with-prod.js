/* ==========================================================================
   RUN A SCRIPT AGAINST THE PRODUCTION DATABASE
     node scripts/with-prod.js <script.js | knex> [args...]
   e.g.
     node scripts/with-prod.js knex migrate:latest
     node scripts/with-prod.js scripts/import-flatfile.js --yes
   Takes PROD_DB_NAME / PROD_DB_USER / PROD_DB_PASSWORD from server/.env and
   hands them to the child as DB_* (dotenv never overrides a variable that is
   already set, so the child's own dotenv load keeps them). The host stays
   DB_HOST: the same server as the dev database.
   ========================================================================== */
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SERVER = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(SERVER, ".env") });

const { PROD_DB_NAME, PROD_DB_USER, PROD_DB_PASSWORD } = process.env;
if (!PROD_DB_NAME || !PROD_DB_USER || !PROD_DB_PASSWORD) {
  console.error("PROD_DB_NAME / PROD_DB_USER / PROD_DB_PASSWORD missing in server/.env");
  process.exit(2);
}
const [target, ...args] = process.argv.slice(2);
if (!target) { console.error("usage: node scripts/with-prod.js <script.js | knex> [args...]"); process.exit(2); }

const env = { ...process.env, DB_NAME: PROD_DB_NAME, DB_USER: PROD_DB_USER, DB_PASSWORD: PROD_DB_PASSWORD, CONTENT_SOURCE: "db" };
const cmd = target === "knex"
  ? [path.join(SERVER, "node_modules", "knex", "bin", "cli.js"), "--knexfile", path.join(SERVER, "db", "knexfile.js"), ...args]
  : [path.resolve(target), ...args];

console.error("[prod] " + PROD_DB_USER + "@" + process.env.DB_HOST + "/" + PROD_DB_NAME + " :: " + [target, ...args].join(" "));
const r = spawnSync(process.execPath, cmd, { cwd: SERVER, env, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);
