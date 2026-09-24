"use strict";
const { create } = require("../helpers");

exports.up = async function (knex) {
  await create(knex, "activity_log", (t) => {
    t.increments("id").primary();
    t.integer("admin_user_id").unsigned().nullable()
      .references("id").inTable("admin_users").onDelete("SET NULL");
    // Snapshot of the name, so a line still reads sensibly after the user
    // is deleted.
    t.string("admin_name", 255).nullable();
    t.string("action", 50).notNullable();
    t.string("entity_type", 50).nullable();
    t.string("entity_id", 100).nullable();
    t.string("summary", 500).nullable();
    t.string("from_hash", 24).nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["created_at"], "activity_created_idx");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("activity_log");
};
