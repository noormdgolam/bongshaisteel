/* ==========================================================================
   FTP HELPER — list / upload / mkdir over explicit FTPS, for deploys
     node scripts/ftp.js ls [remote-dir]
     node scripts/ftp.js put <local-file> <remote-path>
     node scripts/ftp.js mkdir <remote-dir>
   Credentials come from STEEL_FTP_* in server/.env and reach curl through a
   temporary netrc file (mode 600, deleted afterwards), never the command
   line, so they do not show up in process listings or shell history.
   One attempt per call, no retries: failed logins get this IP banned by the
   host's brute-force guard.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { STEEL_FTP_HOST: HOST, STEEL_FTP_PORT: PORT = "21", STEEL_FTP_USER: USER, STEEL_FTP_PASS: PASS } = process.env;

function curl(args) {
  if (!HOST || !USER || !PASS) throw new Error("STEEL_FTP_HOST / USER / PASS missing in server/.env");
  const netrc = path.join(os.tmpdir(), "ftp-" + process.pid + ".netrc");
  fs.writeFileSync(netrc, "machine " + HOST + " login " + USER + " password " + PASS + "\n", { mode: 0o600 });
  try {
    const r = spawnSync("curl", ["--ssl-reqd", "-k", "-sS", "--connect-timeout", "25", "--netrc-file", netrc, ...args],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return { code: r.status, out: r.stdout, err: (r.stderr || "").trim() };
  } finally {
    fs.unlinkSync(netrc);
  }
}

const url = (p) => "ftp://" + HOST + ":" + PORT + "/" + String(p || "").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");

function ls(dir) {
  const d = String(dir || "").replace(/\/*$/, "/");
  return curl([url(d === "/" ? "" : d) + (d === "/" ? "" : "")]);
}
function put(local, remote) {
  return curl(["--ftp-create-dirs", "-T", local, url(remote)]);
}
function mkdir(dir) {
  return curl(["--ftp-create-dirs", "-Q", "PWD", url(String(dir).replace(/\/*$/, "/"))]);
}

module.exports = { ls, put, mkdir, curl, url };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  const r = cmd === "ls" ? ls(a) : cmd === "put" ? put(a, b) : cmd === "mkdir" ? mkdir(a) : null;
  if (!r) { console.error("usage: ls [dir] | put <local> <remote> | mkdir <dir>"); process.exit(2); }
  if (r.out) process.stdout.write(r.out);
  if (r.code) console.error("curl exit " + r.code + ": " + r.err);
  process.exit(r.code || 0);
}
