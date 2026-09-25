# Cutover: static site → Node app

What changes for visitors: nothing visible, except that the quote form works
again (live `main` has no `lead.php`, so quote requests are dropped today) and
72 product pages plus a 79-URL sitemap appear.

## Layout on the host

Everything is deployed over FTP by `server/scripts/deploy-ftp.js` (owner
decision: no cPanel Git pull/deploy). It sends the committed HEAD, only once
it is GitHub's `main`, and only files that changed.

| What | Where | FTP account (in `server/.env`) |
|---|---|---|
| Public files | `/home/abongsha/bongshaisteel.com` (docroot) | `STEEL_FTP_*` — confined to the docroot |
| The Node app (`server/` minus tests) | `/home/abongsha/bongshai-steel-node` | `STEEL_APP_FTP_*` — confined to the app folder |
| App secrets | `bongshai-steel-node/.env`, mode 600 | installed once from `server/.env.host` |
| Docroot `.htaccess` | not in git (cPanel edits it) | uploaded from `deploy/htaccess.docroot` |

The docroot must never contain `index.html`, `lead.php`, `counter.php` or
`sitemap.xml`: LiteSpeed serves a file on disk before Passenger sees the
request. The deploy renames any it finds to `*.retired-<stamp>`. `/server/`,
`/deploy/`, dotfiles (the old `.git`, `.deploy-manifest.json`) and `*.md` are
forbidden by the `.htaccess`.

## Done

- [x] Production database `abongsha_steel` / `abongsha_steelprod` — migrated
      (9), content imported (72 products), `verify-db-roundtrip` PASS.
- [x] Node app created in Setup Node.js App (Node 22.23.2, production,
      root `bongshai-steel-node`, URL `bongshaisteel.com`, `server.js`), stopped.
- [x] Crons: orphan reaper every 15 min, `backup_db.sh` daily at 03:00/03:30.
- [x] `server/.env.host` generated locally (git-ignored): production `.env`
      with new secrets.
- [x] Owner's admin account `admin` (superadmin) in the production database.
- [x] Docroot `.htaccess` uploaded (https/www, deny rules; `/.git` now 403).

## The switch (the site is down from step 2 until step 4 finishes)

1. **Owner** — cPanel → FTP Accounts: an account whose Directory is
   `/home/abongsha/bongshai-steel-node`; its login and password go into
   `server/.env` as `STEEL_APP_FTP_USER` / `STEEL_APP_FTP_PASS`.
2. **Claude** — `node scripts/deploy-ftp.js all --yes`: app files + `.env` +
   restart marker to the app folder; 4 changed public files to the docroot;
   `index.html`, `sitemap.xml`, `counter.php` renamed `*.retired-<stamp>`.
3. **Owner** — Setup Node.js App → the app → **Run NPM Install**, then
   **Start App** (cPanel adds its Passenger block to the docroot `.htaccess`).
4. **Claude** — the checks below, once each. **Owner** — the site on mobile data.

### Checks

| Check | Expected |
|---|---|
| `/` in a browser | the site; view source shows server-rendered products |
| `/products/BH-IS-1001` | its own page, own title and canonical |
| `/sitemap.xml` | 79 URLs |
| a quote through the form | appears in Admin → Messages |
| `/admin/login` | Node sign-in; the owner signs in |
| Admin → Media: upload a photo | WebP + 400w/700w, image loads |
| `/styles.css` | `Content-Type: text/css` |
| `/server/.env`, `/server/server.js`, `/.git/config`, `/CUTOVER.md` | 403 |
| `http://bongshaisteel.com/` | 301 to `https://www.bongshaisteel.com/` |

## Rollback

1. Setup Node.js App → **Stop App**.
2. Claude renames `index.html.retired-…` (and `sitemap.xml.retired-…`) back
   over FTP. The static site works with the app stopped.

Leads received through Node stay in the database either way.

## Later deploys

Claude commits, pushes to `main`, then `node scripts/deploy-ftp.js all --yes`
(a dry run without `--yes` shows the plan). When it says the lockfile
changed: owner → **Run NPM Install**, then **Restart**.
