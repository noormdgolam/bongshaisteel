"use strict";
const { create } = require("../helpers");

/* Quote requests and contact enquiries. Same fields and caps as lead.php
   (CMS_LEAD_FIELDS in admin/lib.php), as real columns so the inbox can
   search and filter. */
exports.up = async function (knex) {
  await create(knex, "leads", (t) => {
    t.increments("id").primary();
    // The id the flat-file system gave it — kept so imported leads can be
    // matched back to data/leads.json.
    t.string("public_id", 40).nullable().unique();
    t.enu("kind", ["quote", "contact"]).notNullable().defaultTo("contact");
    t.enu("status", ["new", "contacted", "quoted", "won", "lost"]).notNullable().defaultTo("new");
    t.text("note").nullable();

    t.string("name", 120).notNullable();
    t.string("phone", 60).notNullable();
    t.string("email", 160).nullable();
    t.string("company", 160).nullable();
    t.text("message").nullable();
    t.string("destination", 200).nullable();
    t.string("currency", 20).nullable();
    t.string("standard", 60).nullable();
    t.string("dimensions", 200).nullable();
    t.string("model_code", 60).nullable();
    t.string("source", 120).nullable();

    // A salted hash of the sender address — enough to spot one abusive
    // source, not enough to identify a person. The IP itself is never kept.
    t.string("from_hash", 24).nullable();
    t.string("user_agent", 200).nullable();

    t.timestamps(true, true);
    t.index(["status", "created_at"], "leads_status_created_idx");
    t.index(["created_at"], "leads_created_idx");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("leads");
};
