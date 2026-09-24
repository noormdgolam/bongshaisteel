/* ==========================================================================
   DATABASE CONNECTIVITY CHECK — read-only.
     node scripts/db-check.js
   Times the handshake, confirms who and where we are, and lists every table
   with its engine so a MyISAM table can never slip past unnoticed.
   ========================================================================== */
"use strict";

const db = require("../lib/db");

async function main() {
  const cfg = require("../db/knexfile").connection;
  if (!cfg.user || !cfg.database) {
    console.error("DB_USER / DB_NAME are not set — fill in server/.env first.");
    process.exit(2);
  }
  console.log("connecting to " + cfg.user + "@" + cfg.host + ":" + cfg.port + "/" + cfg.database + " …");

  const t0 = Date.now();
  const [[info]] = await db.raw(
    "SELECT VERSION() AS version, CURRENT_USER() AS user, DATABASE() AS db, " +
    "@@default_storage_engine AS engine, @@character_set_connection AS charset, " +
    "@@time_zone AS tz, NOW() AS now");
  console.log("connected in " + (Date.now() - t0) + " ms");
  for (const [k, v] of Object.entries(info)) console.log("  " + k.padEnd(8) + v);

  const [tables] = await db.raw(
    "SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_ROWS AS approx_rows " +
    "FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME");
  if (!tables.length) {
    console.log("\nno tables yet — run: npx knex --knexfile db/knexfile.js migrate:latest");
  } else {
    console.log("\n" + tables.length + " tables:");
    let myisam = 0;
    for (const t of tables) {
      if (t.engine && t.engine !== "InnoDB") myisam++;
      console.log("  " + (t.engine === "InnoDB" ? "  " : "!!") + " " + t.name.padEnd(22) +
        String(t.engine).padEnd(8) + "~" + t.approx_rows + " rows");
    }
    if (myisam) console.log("\n!! " + myisam + " table(s) are not InnoDB — foreign keys on them are NOT enforced.");
  }
}

main()
  .catch((e) => {
    console.error("\nFAILED: " + (e.code || "") + " " + e.message);
    if (e.code === "ER_ACCESS_DENIED_ERROR" || e.code === "ER_HOST_NOT_PRIVILEGED" || /not allowed to connect/i.test(e.message)) {
      console.error("-> the host refused this address. In cPanel > Remote MySQL, add this machine's public IPv4.");
    } else if (e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
      console.error("-> nothing answered on that host/port. Check DB_HOST and that Remote MySQL allows this IP.");
    }
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
