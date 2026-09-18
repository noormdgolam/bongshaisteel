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
   This step arms the installer: `setup.php` answers **409** until `config.php`
   exists, so a stranger cannot claim the CMS on a freshly deployed site.
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
                            also holds .throttle.json (failed sign-in counter)
/images/uploads/.htaccess ← written on first upload; blocks execution there
```

Do **not** enable "Remove untracked files" / `git clean` in the cPanel
deployment settings — a normal `git pull`/checkout leaves the files above alone.

## Editing

- **Dashboard** — `https://bongshaisteel.com/admin/` — forms + product table.
  `Ctrl/Cmd+S` saves.
- **Visual editor** — the "Visual editor ↗" link (opens `/?cms=1`). Click any
  outlined text on the real page to edit it in place; "Replace image" on photos.
  Lists (products, FAQ, stats, categories) are managed in the dashboard only.

## How it is locked down

| Area | Control |
| --- | --- |
| Sign-in | One bcrypt password. **8 failed attempts from one IP → 15-minute lockout** (`admin/backups/.throttle.json`). |
| Session | `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS; id regenerated on sign-in; expires after 2 h idle or 12 h total. |
| CSRF | Every `POST` must carry a same-origin `Origin`/`Referer` — on the API, the sign-in form and the installer. |
| Uploads | JPEG / PNG / WebP / GIF only, ≤ 8 MB and ≤ 40 MP, filename discarded and regenerated. First upload drops an `.htaccess` into `images/uploads/` that strips script handlers, so nothing stored there can execute. |
| Saves | Auth + same-origin + a 4 MB body cap and a JSON depth cap. |
| Pasted text | The visual editor strips pasted markup down to plain text plus `<b> <i> <u> <a> <br>`; `javascript:` hrefs are dropped. |
| Not served | `config.php`, `lib.php`, `README.md`, `backups/` — all denied in `admin/.htaccess`. `noindex`, `nosniff`, `DENY` framing and a CSP on the PHP pages. |

Tuning lives in `admin/config.php`: `max_attempts`, `lockout`, `idle_limit`,
`session_limit`, `max_upload`, `max_pixels`, `max_body`. Anything you leave out
falls back to the defaults in `cms_config_defaults()` (`admin/lib.php`).

Locked yourself out? Delete `admin/backups/.throttle.json`. Forgot the
password? Delete `admin/config.php`, re-copy the sample, and re-upload
`setup.php`.

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
