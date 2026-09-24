# Server-Rendered Catalogue Layer — Bongshai Steel

This module implements the complete server-rendered catalogue page layer for Bongshai Steel, fulfilling **Section 4 of `antigravity_prompt.md`**.

---

## 1. What Was Built

- **Catalog Router Factory (`server/catalog/index.js`)**: An Express router factory adhering to the injection contract `createCatalogRouter({ getContent })`.
- **Nunjucks Views (`server/catalog/views/`)**:
  - `layout.njk`: Base layout reusing CSS classes, design tokens, top-header, main navigation, and footer from `index.html`. Fully operational with JavaScript disabled and completely excludes `three.min.js`.
  - `product.njk`: Dedicated product detail page for each of the 72 products, featuring answer-first opening (<45 words), question-shaped headings, AISC/BNBC trust signals, responsive WebP `srcset` generation, WhatsApp deep links, link to SPA interactive 3D explorer (`/#product-<id>`), WebMCP action bindings, and valid `Product` + `BreadcrumbList` JSON-LD schemas.
  - `category.njk`: Category overview page for each of the 5 categories (`factory`, `structural`, `duplex`, `cottage`, `container`), listing category models, compliance FAQs, and `CollectionPage` + `BreadcrumbList` JSON-LD.
  - `index.njk`: Catalogue index (`/products`), grouping all 72 models under their respective categories using `.catalog-group` and `.products-grid`.
- **Sitemap Generator (`server/catalog/sitemap.js`)**: Generates `{ loc, lastmod }` entries for all 78 catalogue URLs.
- **Image & Link Helpers (`server/catalog/helpers.js`)**: Builds responsive `srcset` matching `apply.js` specifications (`media[path].widths` falling back to `[400, 700]` + `1024w` full file) and WhatsApp deep links.
- **Verification Suite (`server/catalog/verify.js`)**: Standalone automated test suite validating all 5 verification conditions against a bare Express instance.

---

## 2. Exact Route List

| Route | Method | Description | Count |
| :--- | :--- | :--- | :--- |
| `/products` | `GET` | Catalogue index grouped by category | 1 page |
| `/category/:key` | `GET` | Category landing pages (`factory`, `structural`, `duplex`, `cottage`, `container`) | 5 pages |
| `/products/:modelCode` | `GET` | Individual product specification and inquiry pages | 72 pages |
| **Total** | | | **78 pages** |

---

## 3. Injection Contract

The catalog router is exported as a factory function in `server/catalog/index.js`:

```javascript
const createCatalogRouter = require("./catalog");

// Mount on your Express app:
app.use("/", createCatalogRouter({
  getContent: () => contentStore.load() // Defaults to require("../lib/content").load()
}));
```

### Sitemap Contract

Exported from `server/catalog/sitemap.js`:

```javascript
const getSitemapEntries = require("./catalog/sitemap");

// 1. Call as a function with options:
const entries = getSitemapEntries({
  getContent: () => contentStore.load(),
  baseUrl: "https://www.bongshaisteel.com"
});

// 2. Or iterate directly:
for (const { loc, lastmod } of getSitemapEntries) {
  // ...
}
```

---

## 4. Verification Results (`server/catalog/verify.js`)

Executed on a bare Express app on port `8795`:

```
==================================================
  Bongshai Steel — Catalog Verification Suite
==================================================

[PASS] Mounted catalog router on bare Express app at http://localhost:8795

---------------------------------------------------------------------------------------------------------
Type      Identifier          Status  JSON-LD Product   Three.js?   Result
---------------------------------------------------------------------------------------------------------
INDEX     /products           200     N/A               NO          PASS
CATEGORY  factory             200     YES               NO          PASS
CATEGORY  structural          200     YES               NO          PASS
CATEGORY  duplex              200     YES               NO          PASS
CATEGORY  cottage             200     YES               NO          PASS
CATEGORY  container           200     YES               NO          PASS
PRODUCT   BH-IS-1001          200     1 VALID           NO          PASS
PRODUCT   BH-IS-1002          200     1 VALID           NO          PASS
PRODUCT   BH-IS-1003          200     1 VALID           NO          PASS
PRODUCT   BH-IS-1004          200     1 VALID           NO          PASS
... and 68 more rows verified ...
PRODUCT   BH-CH-512           200     1 VALID           NO          PASS
---------------------------------------------------------------------------------------------------------

=== Verification Checklist ===
[PASS] 1. Catalogue index /products returns 200 with proper canonical & title
[PASS] 2. All 5 category pages return 200 with matching names & canonicals
[PASS] 3. All 72 product pages return 200 with unique title, canonical, modelCode & name
[PASS] 4. All 72 product titles are unique (Titles recorded: 72)
[PASS] 5. All 72 product canonicals are unique (Canonicals recorded: 72)
[PASS] 6. Zero pages reference three.min.js

>>> ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<
```

---

## 5. Items Outside Lane (For Claude / Main Integration)

1. **Mounting the Router in `server/server.js`**:
   The catalog router needs to be wired into Claude's main Express server bootstrap:
   ```javascript
   const createCatalogRouter = require("./catalog");
   app.use("/", createCatalogRouter({ getContent: content.load }));
   ```
2. **Sitemap Integration in `sitemap.xml`**:
   Claude owns the sitemap generation/serving route. Claude can call `require("./catalog/sitemap")()` to retrieve the 78 catalog URLs and inject them into `sitemap.xml`.

---

## 6. Observations in Read-Only Files

1. **Image Filename Spaces (`data/content.json`)**:
   Multiple image paths contain spaces (e.g., `images/products/Model No-BH-IS-1001.webp`). In HTML `srcset`, spaces serve as delimiters between URLs and width descriptors. Our catalog helper wraps image paths in `encodeURI()` (producing `Model%20No-...`), which is required for valid HTML5 `srcset` parsing.
2. **Sparse `media` dictionary (`data/content.json`)**:
   The `media` object in `content.json` currently only defines custom `widths` for 4 images (`Model No-BH-TB-101.webp`, `bh-tsb-108.webp`, `Model No-BH-TH-708.webp`, `Model No-BH-TH-711.webp`). The remaining 68 product images seamlessly use the `[400, 700]` fallback widths, which are present on disk.
3. **Navigation Interactivity in Static HTML (`index.html`)**:
   In `index.html`, navigation items are `<button onclick="navigateToView(...)">`. The catalog views replace these with standard semantic `<a href="...">` links so navigation is fully accessible with JavaScript disabled.
