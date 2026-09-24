"use strict";
const { forceInnoDB } = require("../helpers");

/* knex creates its own bookkeeping tables before any migration runs, so they
   inherit this host's MyISAM default. MyISAM is not crash-safe; losing the
   record of which migrations ran would make the next migrate re-run them. */
exports.up = async function (knex) {
  for (const t of ["knex_migrations", "knex_migrations_lock"]) {
    if (await knex.schema.hasTable(t)) await forceInnoDB(knex, t);
  }
};

// Nothing to undo: InnoDB is the correct engine either way.
exports.down = async function () {};
