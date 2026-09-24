"use strict";
const { create } = require("../helpers");

/* The flat maps that are copy, not records: text (the [data-cms] keys),
   html, settings, seo, media, and the safety-section intro. One JSON object
   per section, the same pattern as Housing's page_content/theme_settings. */
exports.up = async function (knex) {
  await create(knex, "site_content", (t) => {
    t.string("section", 50).primary();
    t.specificType("data", "longtext").notNullable();
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("site_content");
};
