"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BASE_URL = "https://www.bongshaisteel.com";

function getLastMod() {
  try {
    const { ROOT } = require("../lib/paths");
    const contentFile = path.join(ROOT, "data", "content.json");
    if (fs.existsSync(contentFile)) {
      const stat = fs.statSync(contentFile);
      return stat.mtime.toISOString().split("T")[0];
    }
  } catch {}
  return "2026-09-24";
}

/**
 * Returns an array of sitemap entry objects: { loc, lastmod }
 * for the catalogue index (/products), all category pages (/category/:key),
 * and all 72 product pages (/products/:modelCode).
 *
 * @param {Object} [options]
 * @param {Function} [options.getContent] Custom content getter
 * @param {string} [options.baseUrl] Base site URL
 * @returns {Array<{ loc: string, lastmod: string }>}
 */
function getSitemapEntries(options = {}) {
  const getContent = options.getContent || (() => require("../lib/content").load());
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const content = getContent();
  const lastmod = getLastMod();

  const entries = [];

  // 1. Catalogue Index
  entries.push({
    loc: `${baseUrl}/products`,
    lastmod
  });

  // 2. Category Pages
  const categories = Array.isArray(content.categories) ? content.categories : [];
  for (const cat of categories) {
    if (!cat.key) continue;
    entries.push({
      loc: `${baseUrl}/category/${encodeURIComponent(cat.key)}`,
      lastmod
    });
  }

  // 3. All Product Pages
  const products = Array.isArray(content.products) ? content.products : [];
  for (const prod of products) {
    if (!prod.modelCode) continue;
    entries.push({
      loc: `${baseUrl}/products/${encodeURIComponent(prod.modelCode)}`,
      lastmod
    });
  }

  return entries;
}

// Make sitemap callable or directly usable as an iterable array
module.exports = getSitemapEntries;
module.exports.getSitemapEntries = getSitemapEntries;
module.exports.getEntries = getSitemapEntries;

// Allow iterable / array access directly on require('./sitemap')
getSitemapEntries[Symbol.iterator] = function* () {
  yield* getSitemapEntries();
};

Object.defineProperty(getSitemapEntries, "entries", {
  get() {
    return getSitemapEntries();
  },
  enumerable: true
});
