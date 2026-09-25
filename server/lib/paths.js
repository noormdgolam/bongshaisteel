/* Where things live.

   ROOT  the public site files (images, styles, app.js, data/content.default.json).
         In the repo, server/ sits inside the site, so ROOT is its parent. On the
         host the app lives outside the docroot (like Housing's) and SITE_ROOT
         points at the docroot instead.
   VAR   runtime files that must never be public: the lead fallback, the
         rate-limit counter, the page-view counter. Inside the app folder, so
         outside the docroot — LiteSpeed serves any docroot file to anyone. */
"use strict";

const path = require("node:path");

const SERVER = path.resolve(__dirname, "..");
const ROOT = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(SERVER, "..");
const VAR = path.join(SERVER, "var");

module.exports = { ROOT, SERVER, VAR };
