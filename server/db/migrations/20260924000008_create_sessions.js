"use strict";
const { create } = require("../helpers");

/* The admin session store. connect-session-knex can create this table itself,
   but it would inherit this host's MyISAM default — so it is created here, as
   InnoDB, with the exact columns the store expects (sid / sess / expired), and
   the store is told not to create it. */
exports.up = async function (knex) {
  await create(knex, "sessions", (t) => {
    t.string("sid", 255).primary();
    t.specificType("sess", "longtext").notNullable();
    t.dateTime("expired").notNullable().index("sessions_expired_idx");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("sessions");
};
