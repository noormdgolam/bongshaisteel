"use strict";
const { create } = require("../helpers");

exports.up = async function (knex) {
  // Top level of the Products mega-menu: prefab, structure, furniture, …
  await create(knex, "main_categories", (t) => {
    t.increments("id").primary();
    t.string("key", 50).notNullable().unique();
    t.string("name", 255).notNullable();
    t.string("icon", 32).nullable();
    t.text("blurb").nullable();
    t.boolean("ready").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  // Product families: factory, structural, duplex, cottage, container.
  await create(knex, "categories", (t) => {
    t.increments("id").primary();
    t.string("key", 50).notNullable().unique();
    t.integer("main_category_id").unsigned().nullable()
      .references("id").inTable("main_categories").onDelete("SET NULL");
    t.string("name", 255).notNullable();
    t.string("icon", 32).nullable();
    t.text("blurb").nullable();
    t.string("image", 500).nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await create(knex, "products", (t) => {
    t.increments("id").primary();
    // The id the SPA already uses in #product-<slug> links — kept stable.
    t.string("slug", 100).notNullable().unique();
    // The public URL: /products/<model_code>.
    t.string("model_code", 60).notNullable().unique();
    // RESTRICT: a category cannot vanish from under its products.
    t.integer("category_id").unsigned().notNullable()
      .references("id").inTable("categories").onDelete("RESTRICT");
    t.string("name", 255).notNullable();
    t.text("description").nullable();
    t.string("image", 500).nullable();
    t.boolean("featured").notNullable().defaultTo(false);
    t.integer("featured_order").nullable();
    t.boolean("published").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(["category_id", "sort_order"], "products_category_sort_idx");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("products");
  await knex.schema.dropTableIfExists("categories");
  await knex.schema.dropTableIfExists("main_categories");
};
