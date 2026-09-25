"use strict";
const { create } = require("../helpers");

// A whole-content backup: every row of every content table, as JSON.
// Leads, users, sessions and the activity log are not content and are not in it.
exports.up = async function (knex) {
  await create(knex, "content_snapshots", (t) => {
    t.increments("id").primary();
    t.integer("admin_user_id").unsigned().nullable()
      .references("id").inTable("admin_users").onDelete("SET NULL");
    t.string("admin_name", 255).nullable();
    // auto | manual | before-restore
    t.string("reason", 20).notNullable();
    t.string("note", 255).nullable();
    t.integer("bytes").unsigned().notNullable();
    // {"products":72,"categories":5,"sections":40} — so the list need not parse `data`
    t.string("summary", 255).nullable();
    t.specificType("data", "LONGTEXT").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["created_at"], "snapshots_created_idx");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("content_snapshots");
};
