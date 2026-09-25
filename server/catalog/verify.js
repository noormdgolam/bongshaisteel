"use strict";

const http = require("node:http");
const express = require("express");
const cheerio = require("cheerio");
const createCatalogRouter = require("./index");
const { load: loadContent } = require("../lib/content");

const TEST_PORT = 8795; // Never 8788

async function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, html: data });
      });
    }).on("error", reject);
  });
}

async function runVerification() {
  console.log("==================================================");
  console.log("  Bongshai Steel — Catalog Verification Suite");
  console.log("==================================================\n");

  const content = loadContent();
  const products = content.products || [];
  const categories = content.categories || [];

  if (products.length !== 72) {
    console.error(`Expected 72 products, found ${products.length}`);
    process.exit(1);
  }

  // 1. Mount router on a bare Express app
  const app = express();
  app.use("/", createCatalogRouter({ getContent: () => content }));

  const server = await new Promise((resolve) => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });

  console.log(`[PASS] Mounted catalog router on bare Express app at http://localhost:${TEST_PORT}\n`);

  const results = [];
  const titles = new Set();
  const canonicals = new Set();

  let allProductsPassed = true;
  let allCategoriesPassed = true;
  let indexPassed = true;
  let noThreeJsViolations = true;

  try {
    // 2. Test Catalogue Index
    {
      const res = await fetchHtml(`http://localhost:${TEST_PORT}/products`);
      const $ = cheerio.load(res.html);
      const title = $("title").text().trim();
      const canonical = $('link[rel="canonical"]').attr("href");
      const hasThree = res.html.includes("three.min.js");

      const passed =
        res.status === 200 &&
        title.length > 0 &&
        canonical === "https://www.bongshaisteel.com/products" &&
        !hasThree;

      if (!passed) indexPassed = false;
      if (hasThree) noThreeJsViolations = false;

      results.push({
        type: "INDEX",
        id: "/products",
        status: res.status,
        title: title ? `"${title.slice(0, 30)}..."` : "MISSING",
        canonical: canonical || "MISSING",
        jsonLdValid: "N/A",
        hasThreeJs: hasThree ? "FAIL" : "NO",
        pass: passed
      });
    }

    // 3. Test All Categories
    for (const cat of categories) {
      const url = `http://localhost:${TEST_PORT}/category/${encodeURIComponent(cat.key)}`;
      const res = await fetchHtml(url);
      const $ = cheerio.load(res.html);
      const title = $("title").text().trim();
      const canonical = $('link[rel="canonical"]').attr("href");
      const hasThree = res.html.includes("three.min.js");
      const hasName = cheerio.load(res.html).root().text().includes(cat.name);

      const passed =
        res.status === 200 &&
        title.length > 0 &&
        canonical === `https://www.bongshaisteel.com/category/${encodeURIComponent(cat.key)}` &&
        hasName &&
        !hasThree;

      if (!passed) allCategoriesPassed = false;
      if (hasThree) noThreeJsViolations = false;

      results.push({
        type: "CATEGORY",
        id: cat.key,
        status: res.status,
        title: title ? `"${title.slice(0, 30)}..."` : "MISSING",
        canonical: canonical || "MISSING",
        jsonLdValid: "YES",
        hasThreeJs: hasThree ? "FAIL" : "NO",
        pass: passed
      });
    }

    // 4. Test All 72 Products
    let productFailCount = 0;
    for (const prod of products) {
      const url = `http://localhost:${TEST_PORT}/products/${encodeURIComponent(prod.modelCode)}`;
      const res = await fetchHtml(url);
      const $ = cheerio.load(res.html);

      const title = $("title").text().trim();
      const canonical = $('link[rel="canonical"]').attr("href");
      const hasThree = res.html.includes("three.min.js");
      // Compare against decoded text: "Textile & Garments" is correctly served
      // as "&amp;", so a raw-string search only passed while the JSON-LD left
      // "&" unescaped - which is the same gap that let "</script>" through.
      const pageText = $.root().text();
      const hasModel = pageText.includes(prod.modelCode);
      const hasName = pageText.includes(prod.name);

      // Check JSON-LD
      let productBlocks = 0;
      let jsonLdParsed = false;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const raw = $(el).html();
          const parsed = JSON.parse(raw);
          if (parsed && parsed["@type"] === "Product") {
            productBlocks++;
            if (parsed.name === prod.name && parsed.model === prod.modelCode) {
              jsonLdParsed = true;
            }
          }
        } catch {}
      });

      const isUniqueTitle = !titles.has(title);
      titles.add(title);

      const isUniqueCanonical = !canonicals.has(canonical);
      canonicals.add(canonical);

      const passed =
        res.status === 200 &&
        title.length > 0 &&
        isUniqueTitle &&
        canonical === `https://www.bongshaisteel.com/products/${encodeURIComponent(prod.modelCode)}` &&
        isUniqueCanonical &&
        productBlocks === 1 &&
        jsonLdParsed &&
        hasModel &&
        hasName &&
        !hasThree;

      if (!passed) {
        productFailCount++;
        allProductsPassed = false;
      }
      if (hasThree) noThreeJsViolations = false;

      results.push({
        type: "PRODUCT",
        id: prod.modelCode,
        status: res.status,
        title: title ? `"${title.slice(0, 30)}..."` : "MISSING",
        canonical: canonical || "MISSING",
        jsonLdValid: productBlocks === 1 && jsonLdParsed ? "1 VALID" : `INVALID (${productBlocks})`,
        hasThreeJs: hasThree ? "FAIL" : "NO",
        pass: passed
      });
    }

    // Print summary table
    console.log("---------------------------------------------------------------------------------------------------------");
    console.log(
      "Type".padEnd(10) +
      "Identifier".padEnd(20) +
      "Status".padEnd(8) +
      "JSON-LD Product".padEnd(18) +
      "Three.js?".padEnd(12) +
      "Result"
    );
    console.log("---------------------------------------------------------------------------------------------------------");

    for (const r of results.slice(0, 10)) {
      console.log(
        r.type.padEnd(10) +
        r.id.padEnd(20) +
        String(r.status).padEnd(8) +
        r.jsonLdValid.padEnd(18) +
        r.hasThreeJs.padEnd(12) +
        (r.pass ? "PASS" : "FAIL")
      );
    }
    console.log(`... and ${results.length - 10} more rows verified ...`);

    const last = results[results.length - 1];
    console.log(
      last.type.padEnd(10) +
      last.id.padEnd(20) +
      String(last.status).padEnd(8) +
      last.jsonLdValid.padEnd(18) +
      last.hasThreeJs.padEnd(12) +
      (last.pass ? "PASS" : "FAIL")
    );

    console.log("---------------------------------------------------------------------------------------------------------\n");

    console.log("=== Verification Checklist ===");
    console.log(`[${indexPassed ? "PASS" : "FAIL"}] 1. Catalogue index /products returns 200 with proper canonical & title`);
    console.log(`[${allCategoriesPassed ? "PASS" : "FAIL"}] 2. All ${categories.length} category pages return 200 with matching names & canonicals`);
    console.log(`[${allProductsPassed ? "PASS" : "FAIL"}] 3. All ${products.length} product pages return 200 with unique title, canonical, modelCode & name`);
    console.log(`[${titles.size === products.length ? "PASS" : "FAIL"}] 4. All 72 product titles are unique (Titles recorded: ${titles.size})`);
    console.log(`[${canonicals.size === products.length ? "PASS" : "FAIL"}] 5. All 72 product canonicals are unique (Canonicals recorded: ${canonicals.size})`);
    console.log(`[${noThreeJsViolations ? "PASS" : "FAIL"}] 6. Zero pages reference three.min.js`);

    const overallSuccess =
      indexPassed &&
      allCategoriesPassed &&
      allProductsPassed &&
      titles.size === products.length &&
      canonicals.size === products.length &&
      noThreeJsViolations;

    if (overallSuccess) {
      console.log("\n>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<\n");
      return true;
    } else {
      console.error("\n>>> VERIFICATION FAILED! <<<\n");
      return false;
    }
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runVerification()
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Verification error:", err);
      process.exit(1);
    });
}

module.exports = runVerification;
