/* ==========================================================================
   FTP HELPER — explicit FTPS, for deploys
     node scripts/ftp.js [--app] ls [remote-dir]
     node scripts/ftp.js [--app] get <remote-file>
     node scripts/ftp.js [--app] put <local-file> <remote-path>
   Two accounts, both in server/.env (host and port shared):
     STEEL_FTP_USER / STEEL_FTP_PASS          the docroot  (default)
     STEEL_APP_FTP_USER / STEEL_APP_FTP_PASS  the Node app folder  (--app)
   Credentials reach curl through a temporary netrc file (mode 600, deleted
   afterwards), never the command line. One attempt per call and many files
   per connection: repeated logins get this IP banned by the host.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function account(which = "site") {
  const p = which === "app" ? "STEEL_APP_FTP_" : "STEEL_FTP_";
  const host = process.env.STEEL_FTP_HOST, port = process.env.STEEL_FTP_PORT || "21";
  const user = process.env[p + "USER"], pass = process.env[p + "PASS"];
  if (!host || !user || !pass) throw new Error(p + "USER / " + p + "PASS (and STEEL_FTP_HOST) missing in server/.env");

  const url = (p2) => "ftp://" + host + ":" + port + "/" +
    String(p2 || "").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");

  function curl(args) {
    const netrc = path.join(os.tmpdir(), "ftp-" + process.pid + "-" + Date.now() + ".netrc");
    fs.writeFileSync(netrc, "machine " + host + " login " + user + " password " + pass + "\n", { mode: 0o600 });
    try {
      const r = spawnSync("curl", ["--ssl-reqd", "-k", "-sS", "--connect-timeout", "25", "--netrc-file", netrc, ...args],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
      return { code: r.status, out: r.stdout, err: (r.stderr || "").toString().trim() };
    } finally {
      fs.unlinkSync(netrc);
    }
  }

  return {
    url, curl,
    ls: (dir) => curl([url(dir ? String(dir).replace(/\/*$/, "/") : "")]),
    /** Remote file as a Buffer, or null when it does not exist. */
    get(file) {
      const r = curl([url(file)]);
      if (r.code === 78 || /550/.test(r.err)) return null;
      if (r.code) throw new Error("get " + file + ": curl " + r.code + " " + r.err);
      return r.out;
    },
    /** Many uploads over one connection: [[localFile, remotePath], ...]. */
    putMany(pairs) {
      if (!pairs.length) return { code: 0, err: "" };
      const args = ["--ftp-create-dirs"];
      for (const [local, remote] of pairs) args.push("-T", local, url(remote));
      return curl(args);
    },
    /** Rename remote files: [[from, to], ...] in the root directory. */
    renameMany(pairs) {
      if (!pairs.length) return { code: 0, err: "" };
      const q = [];
      for (const [from, to] of pairs) q.push("-Q", "RNFR " + from, "-Q", "RNTO " + to);
      return curl([...q, url("")]);
    },
  };
}

module.exports = { account };

if (require.main === module) {
  let argv = process.argv.slice(2);
  const which = argv[0] === "--app" ? (argv = argv.slice(1), "app") : "site";
  const [cmd, a, b] = argv;
  const acc = account(which);
  let r;
  if (cmd === "ls") r = acc.ls(a);
  else if (cmd === "get") { const buf = acc.get(a); if (buf === null) { console.error("not found"); process.exit(1); } process.stdout.write(buf); process.exit(0); }
  else if (cmd === "put") r = acc.putMany([[a, b]]);
  else { console.error("usage: [--app] ls [dir] | get <file> | put <local> <remote>"); process.exit(2); }
  if (r.out && r.out.length) process.stdout.write(r.out);
  if (r.code) console.error("curl exit " + r.code + ": " + r.err);
  process.exit(r.code || 0);
}
