/* Where the site lives. server/ sits inside the repo, the site is its parent. */
"use strict";

const path = require("node:path");

const SERVER = path.resolve(__dirname, "..");
const ROOT = path.resolve(SERVER, "..");

module.exports = { ROOT, SERVER };
