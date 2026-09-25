/* ==========================================================================
   DEPLOY OVER FTP
     node scripts/deploy-ftp.js [site|app|all]          dry run: shows the plan
     node scripts/deploy-ftp.js [site|app|all] --yes    do it
   site  public files -> the docroot (/home/abongsha/bongshaisteel.com)
   app   server/      -> the Node app (/home/abongsha/bongshai-steel-node)

   What is deployed is the committed HEAD, never the working copy, and HEAD
   must already be on GitHub's main (so the host never runs code that is not
   in the repository). Only files whose content changed are sent: each target
   keeps .deploy-manifest.json (path -> sha1) and is compared against it. The
   first site deploy compares against the commit the docroot's old git clone
   had checked out.

   Nothing is deleted. A file that left the repository is renamed to
   <name>.retired-<stamp>, and so is any index.html / lead.php / counter.php /
   sitemap.xml in the docroot — LiteSpeed would serve such a file before Node
   saw the request. Runtime state on the host (uploads, .env, var/, backups/,
   node_modules) is never touched, apart from installing .env the first time.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { account } = require("./ftp");

const REPO = path.join(__dirname, "..", "..");
const APPLY = process.argv.includes("--yes");
const WHAT = process.argv.slice(2).find((a) => ["site", "app", "all"].includes(a)) || "all";
const MANIFEST = ".deploy-manifest.json";
const SHADOWS = ["index.html", "lead.php", "counter.php", "sitemap.xml"];
const STAMP = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

const git = (...a) => execFileSync("git", a, { cwd: REPO, maxBuffer: 256 * 1024 * 1024 });
const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

/** { path: blobSha } for a commit, from git itself. */
function tree(commit) {
  const out = {};
  for (const line of git("ls-tree", "-r", commit).toString().split("\n")) {
    const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (m) out[m[2]] = m[1];
  }
  return out;
}
const blob = (sha) => git("cat-file", "blob", sha);

const isSite = (p) => !/^(server|deploy|tools|\.claude|\.agents)\//.test(p) &&
  !/\.md$/.test(p) && ![".cpanel.yml", ".gitattributes", ".gitignore"].includes(p);
const isApp = (p) => p.startsWith("server/") && !p.startsWith("server/test/");

function remoteManifest(acc) {
  const buf = acc.get(MANIFEST);
  if (!buf) return null;
  try { return JSON.parse(buf.toString("utf8")); } catch { return null; }
}

function stage(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-"));
  const pairs = files.map(([remote, sha], i) => {
    const local = path.join(dir, String(i));
    fs.writeFileSync(local, blob(sha));
    return [local, remote];
  });
  return { dir, pairs };
}

function upload(acc, pairs) {
  for (let i = 0; i < pairs.length; i += 40) {
    const r = acc.putMany(pairs.slice(i, i + 40));
    if (r.code) throw new Error("upload failed (curl " + r.code + "): " + r.err);
  }
}

function writeManifest(acc, commit, files) {
  const f = path.join(os.tmpdir(), "manifest-" + process.pid + ".json");
  fs.writeFileSync(f, JSON.stringify({ commit, deployed_at: new Date().toISOString(), files }, null, 1));
  const r = acc.putMany([[f, MANIFEST]]);
  fs.unlinkSync(f);
  if (r.code) throw new Error("manifest upload failed: " + r.err);
}

function deploy(label, acc, want, baseline, extra) {
  const changed = Object.entries(want).filter(([p, sha]) => baseline[p] !== sha);
  const gone = Object.keys(baseline).filter((p) => !(p in want));
  const retire = [...new Set([...gone, ...(extra.retire || [])])];
  console.log("\n== " + label + ": " + changed.length + " to upload, " + retire.length + " to retire");
  for (const [p] of changed) console.log("   put    " + p);
  for (const p of retire) console.log("   retire " + p + " -> " + p + ".retired-" + STAMP);
  for (const n of extra.notes || []) console.log("   " + n);
  return { changed, retire };
}

function main() {
  const head = git("rev-parse", "HEAD").toString().trim();
  git("fetch", "-q", "origin", "main");
  const originMain = git("rev-parse", "origin/main").toString().trim();
  if (head !== originMain) {
    console.error("HEAD " + head.slice(0, 7) + " is not origin/main " + originMain.slice(0, 7) +
      ". Push it to main first — the host only runs what is in the repository.");
    process.exit(2);
  }
  const all = tree(head);
  console.log("deploying " + head.slice(0, 7) + (APPLY ? "" : "  (dry run — add --yes to apply)"));

  if (WHAT === "site" || WHAT === "all") {
    const acc = account("site");
    const want = Object.fromEntries(Object.entries(all).filter(([p]) => isSite(p)));
    let base = remoteManifest(acc);
    let baseline;
    if (base) baseline = base.files;
    else {
      // First FTP deploy: the docroot is the old git clone; its checked-out
      // commit tells exactly which files are already there.
      const ref = acc.get(".git/refs/heads/main");
      const old = ref && ref.toString().trim();
      if (!old || !/^[0-9a-f]{40}$/.test(old)) throw new Error("no manifest and no readable .git ref in the docroot — refusing to guess");
      baseline = Object.fromEntries(Object.entries(tree(old)).filter(([p]) => isSite(p)));
      console.log("site baseline: the docroot's git checkout " + old.slice(0, 7));
    }
    const listing = acc.ls("").out.toString();
    const present = SHADOWS.filter((f) => new RegExp("\\s" + f.replace(".", "\\.") + "\\r?$", "m").test(listing));
    const plan = deploy("site (docroot)", acc, want, baseline, { retire: present.filter((f) => !(f in want)) });
    if (APPLY) {
      const { dir, pairs } = stage(plan.changed);
      upload(acc, pairs);
      fs.rmSync(dir, { recursive: true, force: true });
      const exist = plan.retire.filter((p) => p in baseline || present.includes(p));
      const r = acc.renameMany(exist.map((p) => [p, p + ".retired-" + STAMP]));
      if (r.code) console.error("   rename warning (curl " + r.code + "): " + r.err);
      writeManifest(acc, head, want);
      console.log("   site done");
    }
  }

  if (WHAT === "app" || WHAT === "all") {
    const acc = account("app");
    const want = {};
    for (const [p, sha] of Object.entries(all)) if (isApp(p)) want[p.slice("server/".length)] = sha;
    const base = remoteManifest(acc);
    const baseline = base ? base.files : {};
    const needEnv = !acc.get(".env");
    const hostEnv = path.join(REPO, "server", ".env.host");
    const lockChanged = baseline["package-lock.json"] !== want["package-lock.json"];
    const notes = [];
    if (needEnv) notes.push(fs.existsSync(hostEnv) ? "install .env from server/.env.host (mode 600)" : "WARNING: no .env on the host and no server/.env.host here");
    if (lockChanged) notes.push("ACTION after deploy: cPanel > Setup Node.js App > Run NPM Install");
    notes.push("restart: tmp/restart.txt");
    const plan = deploy("app (" + "bongshai-steel-node)", acc, want, baseline, { notes });
    if (APPLY) {
      const { dir, pairs } = stage(plan.changed);
      if (needEnv && fs.existsSync(hostEnv)) pairs.push([hostEnv, ".env"]);
      const restart = path.join(dir, "restart");
      fs.writeFileSync(restart, new Date().toISOString());
      pairs.push([restart, "tmp/restart.txt"]);
      upload(acc, pairs);
      if (needEnv) acc.curl(["-Q", "SITE CHMOD 600 .env", acc.url("")]);
      fs.rmSync(dir, { recursive: true, force: true });
      writeManifest(acc, head, want);
      console.log("   app done" + (lockChanged ? " — now Run NPM Install in cPanel, then Restart" : ""));
    }
  }
}

try { main(); } catch (err) { console.error("\nFAILED: " + err.message); process.exit(1); }
