/* ==========================================================================
   MIGRATION HELPERS
   --------------------------------------------------------------------------
   This host creates new tables as MyISAM, which silently ignores foreign
   keys — the constraint is accepted, stored, and never enforced. Every table
   goes through create() so it is forced to InnoDB and utf8mb4 immediately.
   ========================================================================== */
"use strict";

async function forceInnoDB(knex, table) {
  await knex.raw("ALTER TABLE ?? ENGINE=InnoDB", [table]);
}

/** createTable + utf8mb4 + InnoDB, idempotent. */
async function create(knex, table, build) {
  if (await knex.schema.hasTable(table)) return;
  await knex.schema.createTable(table, (t) => {
    t.charset("utf8mb4");
    t.collate("utf8mb4_unicode_ci");
    t.engine("InnoDB");
    build(t);
  });
  // Belt and braces: t.engine() is honoured on most hosts, but this one has
  // been seen to override it. The ALTER is a no-op when it already took.
  await forceInnoDB(knex, table);
}

module.exports = { create, forceInnoDB };
