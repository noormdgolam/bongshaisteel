/* ==========================================================================
   CREATE OR UPDATE AN ADMIN USER
     ADMIN_PASSWORD='…' node scripts/create-admin.js <username> [role] [name]

   Deliberately not a seed: `knex seed:run` would reset the password on every
   deploy. Upserts by username. The password comes from the environment so it
   never lands in the process list as an argument.
   ========================================================================== */
"use strict";

const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const ROLES = ["superadmin", "admin", "editor", "sales"];

async function main() {
  const [username, role = "admin", ...nameParts] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD || "";
  const name = nameParts.join(" ") || null;

  if (!username || !/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    throw new Error("usage: ADMIN_PASSWORD='…' node scripts/create-admin.js <username> [role] [name]");
  }
  if (!ROLES.includes(role)) throw new Error("role must be one of: " + ROLES.join(", "));
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");

  const hash = await bcrypt.hash(password, 12);
  const existing = await db("admin_users").where({ username }).first();
  if (existing) {
    await db("admin_users").where({ id: existing.id })
      .update({ password_hash: hash, role, name: name || existing.name, active: true, updated_at: db.fn.now() });
    console.log("updated user '" + username + "' (id " + existing.id + ", role " + role + ")");
  } else {
    const [id] = await db("admin_users").insert({ username, password_hash: hash, role, name });
    console.log("created user '" + username + "' (id " + id + ", role " + role + ")");
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => db.destroy());
