# Cutover: static site → Node app

What changes for visitors: nothing visible, except that the quote form works
again (live `main` has no `lead.php`, so quote requests are dropped today) and
72 product pages plus a 79-URL sitemap appear.

## Layout on the host

| What | Where | Updated by |
|---|---|---|
| Docroot = the git clone of `main` | `/home/abongsha/bongshaisteel.com` | cPanel Git → *Update from Remote* |
| The Node app (copy of `server/`) | `/home/abongsha/bongshai-steel-node` | cPanel Git → *Deploy HEAD Commit* → `.cpanel.yml` → `deploy/cpanel-deploy.sh` |
| App secrets | `bongshai-steel-node/.env` (mode 600) | FTP upload to `<docroot>/server/.env`; the deploy moves it into the app |
| Docroot `.htaccess` | not in git (cPanel edits it) | FTP upload of `deploy/htaccess.docroot` |

The docroot must never contain `index.html`, `lead.php`, `counter.php` or
`sitemap.xml`: LiteSpeed serves any file on disk before Passenger sees the
request, so such a file would hide the Node route. The new `main` deletes the
tracked ones on pull. `/server/`, `/deploy/`, dotfiles and `*.md` in the
docroot are forbidden by the `.htaccess`.

## Done

- [x] Production database `abongsha_steel` / `abongsha_steelprod` — migrated
      (9), content imported (72 products), `verify-db-roundtrip` PASS.
- [x] Node app created in Setup Node.js App (Node 22.23.2, production,
      root `bongshai-steel-node`, URL `bongshaisteel.com`, `server.js`), stopped.
- [x] Crons: orphan reaper every 15 min, `backup_db.sh` daily at 03:00/03:30.
- [x] `server/.env.host` generated locally (git-ignored): production `.env`
      with new secrets.
- [ ] Owner's admin account in the production database (`create-admin.js`).

## The switch (a few minutes of downtime between steps 3 and 6)

1. **Claude** — FTP: upload `deploy/htaccess.docroot` as the docroot
   `.htaccess` (keeps cPanel's blocks; adds https/www and the deny rules).
   The live site keeps working: `index.html` is still there.
2. **Claude** — merge `feat/flat-file-cms` into `main`, push.
3. **Owner** — cPanel → Git Version Control → `bongshaisteel` → *Pull or
   Deploy* → **Update from Remote**. (From here `/` has no index.html.)
4. **Claude** — FTP: upload `server/.env.host` to `<docroot>/server/.env`.
5. **Owner** — same page → **Deploy HEAD Commit** (copies the app, moves
   `.env` in, requests a restart). Log: `/home/abongsha/bongshai-steel-deploy.log`.
6. **Owner** — Setup Node.js App → the app → **Run NPM Install**, then
   **Start App**. cPanel adds its Passenger block to the docroot `.htaccess`.
7. **Claude** — the checks below, once each (repeated probes get this IP
   banned). **Owner** — open the site on mobile data.

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
2. Git Version Control → *Basic Information* → checked-out branch stays
   `main`; instead Claude pushes a revert of the merge to `main`, owner
   clicks **Update from Remote** — `index.html` and the old files return.
3. If that is not fast enough: File Manager → upload the old `index.html`
   into the docroot. The static site works with the app stopped.

Leads received through Node stay in the database either way.

## Later deploys

Claude pushes to `main`; owner clicks **Update from Remote**, then **Deploy
HEAD Commit**. When the deploy log says dependencies changed: **Run NPM
Install**, then **Restart**.
