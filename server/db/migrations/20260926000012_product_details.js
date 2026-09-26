"use strict";
const { create } = require("../helpers");

/* Product details the Housing admin has and Steel lacked (2026-09-26):
     products.image_alt, meta_title, meta_description   SEO per model
     products.price_from / price_unit / price_currency  optional "from" price
     categories.spec_template                          one spec label per line
     categories.meta_title / meta_description          SEO per building type
     product_specs                                     label/value rows per model
     product_revisions                                 per-model edit history
   All additive: existing rows keep working with every new column NULL. */

exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn("products", "meta_title"))) {
    await knex.schema.alterTable("products", (t) => {
      t.string("image_alt", 255).nullable();
      t.string("meta_title", 255).nullable();
      t.string("meta_description", 500).nullable();
      t.decimal("price_from", 14, 2).nullable();
      t.string("price_unit", 10).nullable();       // total | sqft
      t.string("price_currency", 3).nullable();    // BDT | USD
    });
  }
  // Column by column: each one is added only if missing.
  const catCols = [
    ["spec_template", (t) => t.text("spec_template").nullable()],
    ["meta_title", (t) => t.string("meta_title", 255).nullable()],
    ["meta_description", (t) => t.string("meta_description", 500).nullable()],
  ];
  for (const [col, add] of catCols) {
    if (!(await knex.schema.hasColumn("categories", col))) await knex.schema.alterTable("categories", add);
  }

  await create(knex, "product_specs", (t) => {
    t.increments("id").primary();
    t.integer("product_id").unsigned().notNullable()
      .references("id").inTable("products").onDelete("CASCADE");
    t.string("label", 100).notNullable();
    t.string("value", 255).notNullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.index(["product_id", "sort_order"], "product_specs_product_idx");
  });

  // No foreign key: history outlives a deleted product, so it can be restored.
  await create(knex, "product_revisions", (t) => {
    t.increments("id").primary();
    t.integer("product_id").unsigned().notNullable();
    t.string("model_code", 60).nullable();
    t.string("action", 20).notNullable();          // update | delete | restore | bulk
    t.string("admin_name", 255).nullable();
    t.text("data", "mediumtext").notNullable();    // { product: row, specs: [...] } BEFORE the change
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["product_id", "id"], "product_revisions_product_idx");
  });

  // Starting templates for the lines that have models; editable per category.
  const TEMPLATES = {
    factory: "Floor area\nClear span\nEave height\nBay spacing\nRoof slope\nCrane capacity\nWall & roof cladding",
    structural: "Floor area\nNumber of floors\nClear span\nFloor height\nSteel grade\nFoundation type",
    duplex: "Floor area\nFloors\nBedrooms\nBathrooms\nFootprint\nWall system",
    cottage: "Floor area\nBedrooms\nBathrooms\nFootprint\nWall system\nRoof",
    container: "Floor area\nContainer size\nNumber of containers\nBedrooms\nBathrooms\nInsulation",
  };
  for (const [key, spec_template] of Object.entries(TEMPLATES)) {
    await knex("categories").where({ key }).whereNull("spec_template").update({ spec_template });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("product_revisions");
  await knex.schema.dropTableIfExists("product_specs");
  for (const col of ["spec_template", "meta_title", "meta_description"]) {
    if (await knex.schema.hasColumn("categories", col)) await knex.schema.alterTable("categories", (t) => t.dropColumn(col));
  }
  if (await knex.schema.hasColumn("products", "meta_title")) {
    await knex.schema.alterTable("products", (t) => {
      t.dropColumns("image_alt", "meta_title", "meta_description", "price_from", "price_unit", "price_currency");
    });
  }
};
