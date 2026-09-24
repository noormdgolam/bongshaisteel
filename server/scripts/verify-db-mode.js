/* ==========================================================================
   DATABASE MODE == FILE MODE
   --------------------------------------------------------------------------
     node scripts/verify-db-mode.js
   verify-phase0.js proves file mode matches the static site. This proves the
   database mode matches file mode: the home page and every catalogue page
   are rendered once from data/content.json and once from the tables, and the
   HTML must be byte-identical. Together: database mode == the static site.

   Run it right after an import (the tables must hold what the file holds).
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const express = require("express");

const db = require("../lib/db");
const content = require("../lib/content");
const { loadFromDb } = require("../lib/content-db");
const render = require("../lib/render");
const createCatalogRouter = require("../catalog");

function fromFile() {
  const file = fs.existsSync(content.LIVE) ? content.LIVE : content.SEED;
  return content.normalise(JSON.parse(fs.readFileSync(file, "utf8")));
}

async function pages(getContent) {
  const app = express();
  app.use(createCatalogRouter({ getContent }));
  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const c = getContent();
  const urls = ["/products",
    ...c.categories.map((x) => "/category/" + x.key),
    ...c.products.map((p) => "/products/" + p.modelCode)];
  const out = new Map();
  try {
    for (const u of urls) {
      const r = await fetch(base + u);
      out.set(u, r.status + "\n" + (await r.text()));
    }
  } finally {
    server.close();
  }
  return out;
}

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return "at char " + i + ":\n      file: …" + a.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, " ") +
    "\n      db  : …" + b.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, " ");
}

async function main() {
  const file = fromFile();
  const t0 = Date.now();
  const dbc = content.normalise(await loadFromDb(db));
  console.log("database content loaded in " + (Date.now() - t0) + " ms");

  let fail = 0;

  const h1 = render.build(file);
  const h2 = render.build(dbc);
  if (h1 === h2) console.log("PASS  home page identical (" + h1.length + " bytes)");
  else { fail++; console.log("FAIL  home page differs " + firstDifference(h1, h2)); }

  const p1 = await pages(() => file);
  const p2 = await pages(() => dbc);
  const differing = [...p1.keys()].filter((u) => p1.get(u) !== p2.get(u));
  const missing = [...p1.keys()].filter((u) => !p2.has(u));
  if (!differing.length && !missing.length && p1.size === p2.size) {
    console.log("PASS  all " + p1.size + " catalogue pages identical");
  } else {
    fail++;
    console.log("FAIL  " + differing.length + " catalogue page(s) differ, " + missing.length + " missing");
    if (differing[0]) console.log("      " + differing[0] + " " + firstDifference(p1.get(differing[0]), p2.get(differing[0])));
  }

  console.log(fail ? "\nRESULT: database mode does NOT match file mode" : "\nRESULT: database mode renders exactly what file mode renders");
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; }).finally(() => db.destroy());
