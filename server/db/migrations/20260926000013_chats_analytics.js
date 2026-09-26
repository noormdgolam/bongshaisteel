"use strict";
const { create } = require("../helpers");

/* Support chats and visitor analytics (2026-09-26), as in the Housing admin.
     chat_sessions   one row per AI-chat conversation (the browser's chat id),
                     updated with the whole transcript after every reply
     page_views      one row per public page view; pruned after 180 days
     analytics_excluded_ips   the owner's own addresses, not counted
   Visitors are counted by a daily-salted hash, never by a stored IP. */

exports.up = async function (knex) {
  await create(knex, "chat_sessions", (t) => {
    t.increments("id").primary();
    t.string("chat_id", 40).notNullable().unique();
    t.string("status", 20).notNullable().defaultTo("open");   // open | followed-up | closed
    t.integer("message_count").notNullable().defaultTo(0);
    t.text("messages", "mediumtext").notNullable();          // JSON [{ role, content, at }]
    t.string("first_page", 200).nullable();
    t.string("last_page", 200).nullable();
    t.string("visitor_hash", 24).nullable();
    t.string("user_agent", 200).nullable();
    t.integer("lead_id").unsigned().nullable();
    t.text("note").nullable();
    t.timestamps(true, true);
    t.index(["updated_at"], "chat_sessions_updated_idx");
  });

  await create(knex, "page_views", (t) => {
    t.bigIncrements("id").primary();
    t.date("day").notNullable();
    t.string("path", 255).notNullable();
    t.string("referrer_host", 120).nullable();
    t.string("device", 10).nullable();          // mobile | desktop | tablet
    t.string("visitor_hash", 24).notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["day"], "page_views_day_idx");
    t.index(["day", "path"], "page_views_day_path_idx");
  });

  await create(knex, "analytics_excluded_ips", (t) => {
    t.increments("id").primary();
    t.string("ip", 64).notNullable().unique();
    t.string("note", 120).nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("analytics_excluded_ips");
  await knex.schema.dropTableIfExists("page_views");
  await knex.schema.dropTableIfExists("chat_sessions");
};
