# Antigravity — Bongshai Steel

## 1. Project

- **Bongshai Steel Ltd.**, part of Bongshai Group, Uttara, Dhaka.
- Pre-engineered steel buildings: factory sheds, structural steel, duplex steel
  homes, cottages, container houses, steel furniture, doors and gates.
- B2B industrial and export (Middle East, Africa, South Asia) plus domestic B2C.
- Sister sites: `bongshaihousing.com`, `bongshaiengineering.com`.

## 2. Stack and hosting

- Server-rendered **Express + Nunjucks**. No React, no Next.js, no build step.
  Content must be fully crawlable with JavaScript disabled.
- MySQL via **Knex** (`server/db/migrations/`) — arriving in Phase 2; today the
  content still comes from `data/content.json`.
- Front end is vanilla JS + Three.js. It stays. Do not introduce a framework.
- cPanel / CloudLinux shared hosting, ~512MB per process. Keep it light. Never
  run a build on the server.
- The public site is a single-page app; real server-rendered URLs are being
  added *alongside* it, not replacing it.

## 3. House rules

- Answer-first: open each page with a direct factual statement under 45 words.
- Question-shaped `<h2>`/`<h3>` where it reads naturally.
- JSON-LD on every public page. Never invent specifications, prices or ratings —
  Bongshai Steel quotes per project. If a number is not in the content, do not
  write it.
- Responsive WebP with `srcset`; the variants are `-400w` and `-700w`.
- Bangla copy follows standard NCTB grammar; engineering terms stay precise
  (*erection* → কাঠামো স্থাপন, *fabrication* → ফেব্রিকেশন, *shed* → ইন্ডাস্ট্রিয়াল শেড).

---

## 4. Current task — server-rendered catalogue pages

You are working **in parallel with another agent (Claude)** in this repo. Claude
owns the Express bootstrap and the Phase-0 render path. You own the catalogue
page layer. Staying inside your lane matters more than the feature itself — a
collision costs more than it is worth.

### Lane

**Where:** in your own git worktree — never in `E:\web\Bongshai Steel` itself.
Claude is working in that folder; a `git checkout` there would switch the branch
under Claude's feet. Create yours once:

```
cd "E:\web\Bongshai Steel"
git worktree add "..\Bongshai-Steel-antigravity" -b antigravity/catalog-pages feat/flat-file-cms
```

Then work only in `E:\web\Bongshai-Steel-antigravity`. Never commit to `main`
or to `feat/flat-file-cms`. Never push to `main`.

**Create/edit ONLY inside:** `server/catalog/**` (code, views, assets) and
`server/catalog/README.md`.

**Read but never modify:** `server/lib/content.js`, `server/lib/paths.js`,
`server/lib/render.js`, `index.html`, `app.js`, `apply.js`,
`data/content.default.json`.

**Do not touch at all:** `index.html`, `app.js`, `apply.js`, `sw.js`,
`admin/**`, `lead.php`, `counter.php`, `data/**`, `tools/**`, `server/server.js`,
`server/lib/**`, `server/package.json`, `.gitignore`, `sitemap.xml`.

`node_modules` is not shared between worktrees, so run `npm install` **once**
inside your worktree's `server/` folder — that installs the pinned set (express,
nunjucks, cheerio, helmet, compression, dotenv). Do not add packages beyond it;
if you genuinely need one, write that in your report and work around it. Do not deploy, restart anything, or
touch the live site.

### Why this task exists

All 72 products are drawn in the browser by `app.js`, so there is no per-product
URL and `sitemap.xml` has one entry. That is what you are fixing.

### Data contract

Read content through `require("../lib/content").load()`. Do not read the JSON
files directly. It returns:

- `products[]` — `{ id, modelCode, name, desc, image, category, categoryName, order }`.
  All 72 `modelCode` values are unique and URL-safe (`BH-IS-1001`, …), so they
  are the slug. No slug column, no redirect table.
- `categories[]`, `mainCategories[]`, `featuredIds[]`
- `settings` — `companyName`, `whatsappNumber`, `hotline`, `email`, `address`
- `seo`, `media` (`media[path].widths` drives `srcset`)

Take the getter by injection so it can become a database later:

```js
// server/catalog/index.js
module.exports = function createCatalogRouter({ getContent }) { /* -> express.Router() */ };
```

### Build

1. `GET /products/:modelCode` — one page per product.
2. `GET /products` — catalogue index, grouped by category.
3. `GET /category/:key` — one page per category.
4. `server/catalog/sitemap.js` — exports `{ loc, lastmod }` for all of the above.
   **Do not edit `sitemap.xml`**; Claude wires it in.
5. Nunjucks templates in `server/catalog/views/`.

Every page must:
- Render completely with **JavaScript disabled**. Test with JS off.
- **Not** load Three.js — that viewer belongs to the SPA.
- Reuse the existing classes from `index.html` (`cat-card`, `cat-card-body`,
  `cat-card-title`, `cat-card-desc`, `section-header`, `section-title`,
  `container`, `btn-primary-hero`) so it looks native. Read `index.html` to get
  them right; do not restyle the site.
- Carry its own `<title>`, meta description, `<link rel="canonical">`, OG and
  Twitter tags — each unique, none copied from the homepage.
- Emit JSON-LD `Product` (with `brand`, `category`, `image`) plus
  `BreadcrumbList`. Use `offers` only if you can express "contact for quote"
  honestly — a `PriceSpecification` is not a guess.
- Build `srcset` the way `apply.js` does: from `media[path].widths`, falling back
  to `[400, 700]`, with the full file at `1024w`.
- Link back into the SPA (`/#product-<id>`) and offer the WhatsApp deep link
  built from `settings.whatsappNumber`.

### Verification — required before reporting done

Write `server/catalog/verify.js` and make it pass:

1. Mount your router on a bare Express app on a port of your choosing —
   **not 8788**, a PHP dev server is running there.
2. All 72 product URLs return 200, plus every category URL and the index.
3. Each product page has a unique non-empty `<title>`, a canonical pointing at
   its own URL, exactly one `Product` JSON-LD block that parses, and the
   product's `modelCode` and `name` present in the served HTML.
4. No page references `three.min.js`.
5. Two different products produce different `<title>` and different canonical
   values — this catches a template that silently reuses one product.

Report the pass/fail table.

### Report back

In `server/catalog/README.md`: what you built, the exact route list, the
injection contract, anything you needed but could not do inside your lane, and
anything you believe is wrong in the files you were only allowed to read —
**write it, do not fix it.**
