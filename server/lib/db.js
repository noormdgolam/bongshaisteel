/* One shared knex pool for the whole app. */
"use strict";

module.exports = require("knex")(require("../db/knexfile"));
