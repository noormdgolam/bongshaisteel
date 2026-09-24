"use strict";
const { create } = require("../helpers");

/* The repeatable blocks on the home, services, safety, FAQ and contact views.
   All share the same shape: a few fields, sort_order, and (for anything a
   visitor reads as a claim) a published flag so a draft can wait. */
exports.up = async function (knex) {
  await create(knex, "stats", (t) => {
    t.increments("id").primary();
    t.string("value", 100).notNullable();
    t.string("label", 255).notNullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "trust_items", (t) => {
    t.increments("id").primary();
    t.string("icon", 32).nullable();
    t.string("title", 255).notNullable();
    t.text("text").nullable();            // may carry a link — rendered as HTML
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "services", (t) => {
    t.increments("id").primary();
    t.string("title", 255).notNullable();
    t.text("description").nullable();     // rendered as HTML, as today
    t.boolean("published").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "safety_points", (t) => {
    t.increments("id").primary();
    t.text("text").notNullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "faqs", (t) => {
    t.increments("id").primary();
    t.text("question").notNullable();
    t.text("answer").notNullable();       // rendered as HTML, as today
    t.boolean("published").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "testimonials", (t) => {
    t.increments("id").primary();
    t.text("quote").notNullable();
    t.string("author", 255).notNullable();
    t.string("role", 255).nullable();
    t.boolean("published").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "team_members", (t) => {
    t.increments("id").primary();
    t.string("name", 255).notNullable();
    t.string("role", 255).nullable();
    t.text("bio").nullable();
    t.string("photo", 500).nullable();
    t.boolean("published").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "service_areas", (t) => {
    t.increments("id").primary();
    t.string("name", 100).notNullable();
    t.string("note", 255).nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  for (const t of ["service_areas", "team_members", "testimonials", "faqs",
    "safety_points", "services", "trust_items", "stats"]) {
    await knex.schema.dropTableIfExists(t);
  }
};
