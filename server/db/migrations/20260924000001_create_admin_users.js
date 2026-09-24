"use strict";
const { create } = require("../helpers");

exports.up = async function (knex) {
  await create(knex, "admin_users", (t) => {
    t.increments("id").primary();
    t.string("username", 64).notNullable().unique();
    t.string("email", 255).nullable();
    t.string("name", 255).nullable();
    t.string("password_hash", 255).notNullable();
    // superadmin is in the enum from day one — the Housing app has it in code
    // but not in the enum, so that role can never actually be created there.
    t.enu("role", ["superadmin", "admin", "editor", "sales"]).notNullable().defaultTo("editor");
    t.boolean("two_factor_enabled").notNullable().defaultTo(false);
    t.string("two_factor_secret", 255).nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.dateTime("last_login_at").nullable();
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("admin_users");
};
