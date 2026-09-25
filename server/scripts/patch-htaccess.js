/* One-off: fix the deny rules in the live docroot .htaccess without touching
   cPanel's blocks (Passenger, PHP handler, env vars). Downloads, patches,
   keeps a local backup, uploads. Refuses if the expected lines are missing. */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { account } = require("./ftp");

const acc = account("site");
const live = acc.get(".htaccess");
if (!live) throw new Error("no live .htaccess");
let s = live.toString("utf8");
fs.writeFileSync(path.join(os.tmpdir(), "htaccess.before-patch"), s);

const OLD = "RewriteRule \\.(php|sh|sql|gz|log|env|md|yml)$ - [F,L]";
const NEW = [
  "# /lead.php and /counter.php are Node routes (no such files exist here).",
  "RewriteCond %{REQUEST_URI} !^/(lead|counter)\\.php$",
  "RewriteRule \\.(php|sh|sql|gz|log|env|md|yml)$ - [F,L]",
  "# Files the deploy set aside (*.retired-<stamp>) are for rollback, not visitors.",
  "RewriteRule \\.retired-\\d+$ - [F,L]",
].join("\n");
if (s.includes("^/(lead|counter)")) { console.log("already patched"); process.exit(0); }
if (!s.includes(OLD)) throw new Error("expected rule not found — not patching");
s = s.replace(OLD, NEW);
if (!/PassengerAppRoot/.test(s)) console.warn("note: no Passenger block in the live file");

const tmp = path.join(os.tmpdir(), "htaccess.patched");
fs.writeFileSync(tmp, s);
const r = acc.putMany([[tmp, ".htaccess"]]);
if (r.code) throw new Error("upload failed: " + r.err);
console.log("patched; Passenger block " + (/PassengerAppRoot/.test(s) ? "kept" : "absent"));
