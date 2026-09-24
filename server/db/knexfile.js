/* ==========================================================================
   KNEX CONFIG
   --------------------------------------------------------------------------
   Copied from the Bongshai Housing app on the same hosting account. Each of
   the non-obvious settings below cost a debugging session there.
   ========================================================================== */
"use strict";

const path = require("node:path");

// The knex CLI chdirs into this folder, so a bare dotenv.config() would miss
// server/.env. Load it by explicit path.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connection = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // The first handshake from outside the server takes 15-20s on this host;
  // mysql2's 10s default produces a misleading ETIMEDOUT.
  connectTimeout: 25000,

  // Only DATE columns come back as strings. Converting them to JS Dates shifts
  // a plain calendar date back a day under UTC+6.
  dateStrings: ["DATE"],

  // Read and write DATETIME/TIMESTAMP as UTC on the JS side too.
  timezone: "Z",
};

module.exports = {
  client: "mysql2",
  connection,
  migrations: {
    directory: path.join(__dirname, "migrations"),
    tableName: "knex_migrations",
  },
  seeds: {
    directory: path.join(__dirname, "seeds"),
  },
  pool: {
    min: 0,
    max: 5,
    // mysql2's `charset` option was verified not to take effect on this host;
    // setting it per connection does.
    // The server's own clock is @@time_zone=SYSTEM (UTC-4 on this host), so
    // NOW() and TIMESTAMP defaults would land in a different zone from what
    // the app writes. Every connection is pinned to UTC.
    afterCreate(conn, done) {
      conn.query("SET NAMES utf8mb4", (err) => {
        if (err) return done(err, conn);
        conn.query("SET time_zone = '+00:00'", (err2) => done(err2, conn));
      });
    },
  },
};
