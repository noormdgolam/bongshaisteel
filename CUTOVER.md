# Cutover: static site → Node app

What changes for visitors: nothing visible, except that the quote form works
again (live `main` has no `lead.php`, so quote requests are dropped today) and
72 product pages plus a 79-URL sitemap appear.

Layout on the host (same as Housing's):

| What | Where | Served by |
|---|---|---|
| Public files (images, styles.css, app.js, …) | the domain's document root (`DOCROOT`) | LiteSpeed |
| The Node app (`server/` in git) | `/home/abongsha/bongshai-steel-node` (`APPROOT`) | Passenger |
| Repository clone | `/home/abongsha/repositories/bongshai-steel` | cPanel Git |

`deploy/cpanel-deploy.sh` copies from the clone to the two places. Nothing in
the app folder is reachable from the web, and the docroot must never contain
`index.html`, `lead.php`, `counter.php` or `sitemap.xml` (the script moves
them aside) — LiteSpeed would serve such a file and Node would never see
the request.

**Owner** marks a step done in cPanel. **Claude** marks a step done from this PC.
Steps 1–5 change nothing the public can see; step 6 is the switch.

---

## 1. Production database — Owner, then Claude

1. cPanel → MySQL Databases: create database `abongsha_steel` and a user
   `abongsha_steelprod` with a long generated password; add the user to the
   database with **All Privileges**.
2. Remote MySQL already allows `45.248.151.%` — nothing to do.
3. Send Claude the password (not in chat history you keep — or type it into
   `server/.env.prod` yourself on this PC).
4. Claude, from this PC, against the new database:
   `migrate:latest`, `import-flatfile.js --yes` (content from the seed or the
   dev database's latest snapshot), `create-admin.js` for the owner's account.
   Checked with `verify-db-roundtrip.js`.

## 2. Deploy config on the host — Owner

1. cPanel → Domains: note the **Document Root** of `bongshaisteel.com`.
2. cPanel → File Manager → Settings → tick *Show Hidden Files*.
3. In `/home/abongsha/` create the file `.bongshai-steel-deploy`:
   ```
   DOCROOT="/home/abongsha/<document root from step 2.1>"
   APPROOT="/home/abongsha/bongshai-steel-node"
   NODEVENV="/home/abongsha/nodevenv/bongshai-steel-node/22"
   ```
   The deploy refuses to run without this file, and refuses a DOCROOT that is
   missing or inside the repository clone.

## 3. The Node app — Owner

1. cPanel → Setup Node.js App → **Create Application**:
   - Node.js version **22**, Application mode **Production**
   - Application root `bongshai-steel-node`
   - Application URL `bongshaisteel.com` (the root, no sub-path)
   - Application startup file `server.js`
   - **Do not start it yet.**
2. cPanel writes a Passenger block into the docroot `.htaccess`. Compare it
   with the one at the top of `.htaccess` in git; if any value differs, tell
   Claude — the git copy is updated to match, or the next deploy would
   overwrite cPanel's.
3. In File Manager, create `/home/abongsha/bongshai-steel-node/.env`
   (permissions **600**):
   ```
   NODE_ENV=production
   CONTENT_SOURCE=db
   SITE_ROOT=/home/abongsha/<document root>
   CANONICAL_HOST=www.bongshaisteel.com
   DB_HOST=localhost
   DB_NAME=abongsha_steel
   DB_USER=abongsha_steelprod
   DB_PASSWORD=<from step 1>
   SESSION_SECRET=<48+ random characters — Claude generates>
   LEAD_SALT=<32+ random characters — Claude generates>
   ```
   The file, not the Node Selector's variable list, because the nightly
   backup cron reads it too.

## 4. Repository clone outside the docroot — Owner

1. cPanel → Git Version Control: look at how the current site is deployed.
   **If the docroot itself is a managed repository**, do not delete it yet —
   tell Claude first; removing a repository there can remove the site files.
2. **Create** → *Clone a Repository*: clone URL
   `https://github.com/noormdgolam/bongshaisteel.git` (or the SSH URL if the
   repo is private and a deploy key is set up), path
   `/home/abongsha/repositories/bongshai-steel`.

## 5. Cron jobs — Owner

cPanel → Cron Jobs, two entries:
```
*/15 * * * *  bash /home/abongsha/bongshai-steel-node/_cron/cleanup_orphans.sh -f
30 3 * * *    bash /home/abongsha/bongshai-steel-node/_cron/backup_db.sh
```
(The first reaps the worker Passenger leaves behind on each restart — without
it the account's process limit is eventually reached. The second writes a
gzipped dump to `bongshai-steel-node/backups/`, keeps 14 days, and refuses
to call a near-empty dump a success.)

## 6. The switch — Claude, then Owner

1. **Claude**: merge `feat/flat-file-cms` into `main` and push. (Nothing on
   the host changes yet if the docroot is no longer auto-pulled — see 4.1.)
2. **Owner**, cPanel → Git Version Control → the new clone → *Manage* →
   *Pull or Deploy*: **Update from Remote**, then **Deploy HEAD Commit**.
   The deploy log is `/home/abongsha/bongshai-steel-deploy.log`.
3. **Owner**, Setup Node.js App → the app → **Run NPM Install** (only the
   first time, or when the log says the lockfile changed and NODEVENV is not
   set), then **Start App**.
4. **Claude** runs the checks below from this PC and a real browser.

### Checks after the switch

| Check | Expected |
|---|---|
| `https://www.bongshaisteel.com/` in a browser | the site, server-rendered (view source shows the products) |
| `/products/BH-IS-1001` | its own page, own title and canonical |
| `/sitemap.xml` | 79 URLs |
| a quote sent through the form | appears in Admin → Messages |
| `/admin/login` | the Node sign-in page; the owner signs in |
| Admin → Media: upload a photo | WebP + 400w/700w created, image loads |
| `/styles.css` | `Content-Type: text/css` |
| `/server/.env`, `/data/leads.json`, `/.git/config` | 403 or 404 |
| `http://bongshaisteel.com/` | 301 to `https://www.bongshaisteel.com/` |

`curl` on HTML from this host returns a bot-challenge page — use it for status
codes only, and a real browser for content.

## Rollback

The old site is static and its files stay in the docroot, so going back takes
two minutes and needs no git:
1. Setup Node.js App → the app → **Stop App**.
2. File Manager → docroot: rename `index.html.retired-…` back to `index.html`
   (and `sitemap.xml.retired-…`).
3. Remove the Passenger block from the docroot `.htaccess`.

Leads received through Node stay in the database either way.

## Later deploys

Push to `main` (Claude), then *Update from Remote* + *Deploy HEAD Commit*
(Owner). The script restarts the app every time — needed even for a template
change, because templates are cached in production.
