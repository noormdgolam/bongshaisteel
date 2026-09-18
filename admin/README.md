# Bongshai Steel — content editor

A tiny flat-file CMS for this static site. No database, no framework, no build
step — just PHP files (same idea as `counter.php`) plus vanilla JS.

## What it edits

Everything visible on the one-page site: hero, stats, trust bar, section
headings, services, safety policy, the FAQ list, contact details, footer, the
5 product lines, the 5 prefab categories, and the full ~72-model catalog
(add / edit / delete / reorder / set homepage flagships), plus image uploads.

All edits are written to **`/data/content.json`**. The public site reads that
file on load (via `apply.js`) and falls back to the git-tracked
`/data/content.default.json` if it is missing.

## First-time setup on the host (one time)

1. Deploy the repo as usual (cPanel Git auto-pull).
2. In cPanel **File Manager**, copy `admin/config.sample.php` →  `admin/config.php`.
3. Visit `https://bongshaisteel.com/admin/setup.php`, choose a password, submit.
   It writes the password hash into `admin/config.php`.
4. **Delete `admin/setup.php`.**
5. Make sure these are writable by PHP (usually already `755`/`775` on cPanel):
   - `data/`            (for `content.json` + `.tmp`)
   - `admin/`           (only needed if `setup.php` should write `config.php` for you)
   - `images/`          (so `images/uploads/` can be created)

Then sign in at `https://bongshaisteel.com/admin/`.

## Deploy safety (important)

cPanel Git auto-pull overwrites every **tracked** file on each deploy. The
editor only ever writes files that are **git-ignored**, so deploys never wipe
your content:

```
/data/content.json        ← all text/catalog edits
/images/uploads/          ← uploaded images
/admin/config.php         ← password hash
/admin/backups/           ← auto snapshot before every save (keeps last 15)
```

Do **not** enable "Remove untracked files" / `git clean` in the cPanel
deployment settings — a normal `git pull`/checkout leaves the files above alone.

## Editing

- **Dashboard** — `https://bongshaisteel.com/admin/` — forms + product table.
  `Ctrl/Cmd+S` saves.
- **Visual editor** — the "Visual editor ↗" link (opens `/?cms=1`). Click any
  outlined text on the real page to edit it in place; "Replace image" on photos.
  Lists (products, FAQ, stats, categories) are managed in the dashboard only.

## Not covered (edit by hand in `index.html` if ever needed)

- `<head>` Open Graph / Twitter / keywords meta, `canonical`, `manifest.json`,
  `sitemap.xml`.
- The three JSON-LD blocks in `<head>` (Organization / **FAQPage** / HowTo).
  The head FAQPage schema is a deliberately-curated 5-entry set and is **not**
  the same list as the visible FAQ — leave it as is unless intentionally updating.
- `llms.txt` / `llms-full.txt`.
- Nav bar labels (they mirror the category names but are static markup).

## If something breaks

Restore the newest file from `admin/backups/` over `data/content.json`, or just
delete `data/content.json` entirely — the site falls back to
`data/content.default.json` and keeps working.

To regenerate the seed after big manual catalog changes in `app.js`:
`node tools/gen-default-content.mjs`.
