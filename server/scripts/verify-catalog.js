/* ==========================================================================
   CATALOGUE HARDENING CHECKS
   --------------------------------------------------------------------------
   catalog/verify.js proves the pages that should exist do exist. This proves
   the things that must NOT happen, which that suite never looked at and
   which were all live when the catalogue was first merged:

   - a product name containing "</script>" breaking out of the JSON-LD block
     and injecting markup (stored XSS once editors can type product names)
   - JSON-LD that no longer parses
   - a Product "offer" with no price, which Google rejects outright
   - unknown slugs answered with plain text instead of the site's HTML 404
   - the same product live at several URLs (case variants, the internal id)
   - srcset candidates pointing at files that are not on disk (browsers do
     not fall back to another candidate when the chosen one 404s)
   - the product count hardcoded into copy

   Runs in-process against the router; no browser, no running server.
     node scripts/verify-catalog.js
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const { ROOT } = require("../lib/paths");
const content = require("../lib/content");
const createCatalogRouter = require("../catalog");

let pass = 0;
let fail = 0;
function check(ok, label, detail) {
  if (ok) pass++;
  else fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label + (ok || detail == null ? "" : "\n        " + String(detail).slice(0, 220)));
}

/* A content state built to break things: one product fewer (so any
   hardcoded count shows), and a first product whose name tries to escape. */
function hostile() {
  const c = JSON.parse(JSON.stringify(content.load()));
  c.products = c.products.slice(0, c.products.length - 1);
  c.products[0] = {
    ...c.products[0],
    name: 'Shed </script><script>alert(1)</script> "q" & <b>bold</b>',
    desc: "Line separator & <i>tag</i>",
  };
  return c;
}

async function main() {
  const data = hostile();
  const app = express();
  app.use(createCatalogRouter({ getContent: () => data }));
  app.use((req, res) => res.status(404).type("html").send("<!doctype html><title>SITE 404</title>"));

  const server = app.listen(0);
  const base = "http://127.0.0.1:" + server.address().port;
  const get = async (u) => {
    const r = await fetch(base + u, { redirect: "manual" });
    return { status: r.status, text: await r.text(), location: r.headers.get("location") };
  };

  try {
    const urls = [
      "/products",
      ...data.categories.map((c) => "/category/" + c.key),
      ...data.products.map((p) => "/products/" + p.modelCode),
    ];

    /* 1-3: every page, JSON-LD, injection, offers */
    const broken = [];
    let injected = 0;
    let pricelessOffers = 0;
    const pages = new Map();
    for (const u of urls) {
      const r = await get(u);
      pages.set(u, r.text);
      if (r.status !== 200) { broken.push(u + " -> " + r.status); continue; }
      const blocks = [...r.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      for (const [, raw] of blocks) {
        try {
          const j = JSON.parse(raw);
          if (j["@type"] === "Product" && j.offers) {
            const spec = j.offers.priceSpecification || {};
            if (j.offers.price == null && spec.price == null) pricelessOffers++;
          }
        } catch (e) {
          broken.push(u + " JSON-LD: " + e.message);
        }
      }
      if (r.text.includes("<script>alert(1)</script>")) injected++;
    }
    check(broken.length === 0, "all " + urls.length + " pages answer 200 with parseable JSON-LD", broken.slice(0, 3).join(" | "));
    check(injected === 0, "a product name cannot inject a <script>", injected + " page(s) carried the payload");
    check(pricelessOffers === 0, "no Product offer without a price", pricelessOffers + " product page(s)");

    /* the hostile name still round-trips intact through JSON-LD */
    const first = data.products[0];
    const firstLd = [...pages.get("/products/" + first.modelCode)
      .matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
      .find((j) => j && j["@type"] === "Product");
    check(firstLd && firstLd.name === first.name, "escaped JSON-LD still decodes to the exact product name",
      firstLd && firstLd.name);

    /* 4: unknown slugs fall through to the site's own 404 */
    const np = await get("/products/NOPE-999");
    check(np.status === 404 && np.text.includes("SITE 404"), "unknown product falls through to the site 404", np.status + " " + np.text.slice(0, 40));
    const nc = await get("/category/nope");
    check(nc.status === 404 && nc.text.includes("SITE 404"), "unknown category falls through to the site 404", nc.status + " " + nc.text.slice(0, 40));

    /* 5: one live URL per page */
    const p = data.products[1];
    const lower = await get("/products/" + p.modelCode.toLowerCase());
    check(lower.status === 301 && (lower.location || "").endsWith("/products/" + p.modelCode),
      "a lower-case model code 301s to the canonical URL", lower.status + " " + lower.location);
    // Today every id is the lower-cased model code, so this is a redirect; if
    // ids ever diverge it must be a 404. Either way, never a second live 200.
    const byId = await get("/products/" + p.id);
    check(byId.status !== 200 && (byId.status === 404 || (byId.location || "").endsWith("/products/" + p.modelCode)),
      "the internal id is never a second live URL for the product", byId.status + " " + byId.location);
    const cat = data.categories[0];
    const catUpper = await get("/category/" + cat.key.toUpperCase());
    check(catUpper.status === 301 && (catUpper.location || "").endsWith("/category/" + cat.key),
      "an upper-case category key 301s to the canonical URL", catUpper.status + " " + catUpper.location);

    /* 6: every referenced local image exists on disk */
    const missing = new Set();
    for (const html of pages.values()) {
      for (const [, attr] of html.matchAll(/\b(?:src|srcset)="([^"]+)"/g)) {
        for (const part of attr.split(",")) {
          const ref = part.trim().split(/\s+/)[0];
          if (!ref.startsWith("/") || ref.startsWith("//")) continue;
          if (!fs.existsSync(path.join(ROOT, decodeURI(ref.split("?")[0])))) missing.add(ref);
        }
      }
    }
    check(missing.size === 0, "every local src/srcset file exists on disk",
      missing.size + " missing, e.g. " + [...missing].slice(0, 3).join(", "));

    /* 7: copy follows the data */
    const desc = (pages.get("/products").match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
    const n = String(data.products.length);
    check(desc.includes(" " + n + " ") && !desc.includes(" " + (data.products.length + 1) + " "),
      "the index description uses the real product count (" + n + ")", desc);

    /* 8: nothing double-escaped in visible HTML */
    const productHtml = pages.get("/products/" + data.products[2].modelCode);
    const dbl = productHtml.match(/.{20}&amp;(?:copy|amp|lt|gt|quot);.{10}/);
    check(!dbl, "no double-escaped entities in visible HTML", dbl && dbl[0]);
  } finally {
    server.close();
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
