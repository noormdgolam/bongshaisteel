# Bongshai Steel — Node app

Express + Nunjucks, replacing the static page and the flat-file PHP CMS in
phases. Reference implementation: `E:\web\Bongshaihousing\server`. Full plan:
the Phase 0–5 breakdown agreed in the planning session.

## Run locally

```
cd server
npm install
PORT=3100 node --watch server.js
```

`http://127.0.0.1:3100/` — the site, rendered on the server.

## Phase 0 — where things stand

The Node app serves the current site with identical output.

| Path | Handled by |
| --- | --- |
| `/`, `/index.html` | `lib/render.js` — `index.html` with the CMS content applied server-side (the twin of `apply.js`), cached until the page or the content changes |
| `POST /lead.php` | `lib/leads.js` — port of `lead.php`: same fields, caps, honeypot, rate limit and files, so the PHP inbox reads what it writes |
| `GET /counter.php` | page-view counter, once per browser visit |
| everything else | static files from the repo root, **except** `admin/` (bar `editor.js`/`editor.css`, which the public page loads), `server/`, `tools/`, `data/leads.json`, `*.php` and dotfiles — Node does not execute PHP, so without this the CMS source would be served as text |

On the host, LiteSpeed serves any file that exists on disk before Passenger
sees the request. So while `index.html`, `lead.php` and `counter.php` sit in
the docroot, the PHP/static versions keep answering; the Node routes take over
as those files are retired.

## Verify

```
DBG=http://127.0.0.1:9224 node scripts/verify-phase0.js
```

Needs headless Chrome with `--remote-debugging-port`, the untouched site on a
static server (`STATIC_URL`, default `http://127.0.0.1:8788/`) and this app
(`NODE_URL`, default `http://127.0.0.1:3100/`). Checks, for a seed and a rich
content state, that the server's raw HTML carries exactly what the browser
builds with `apply.js` (every `[data-cms*]` value, every generated container,
section visibility, `<head>` SEO), and that nothing outside the CMS regions
changed.

## Deploy notes (from the Housing app — same hosting account)

- Never build or `npm install` for production on the server outside the cPanel
  Node.js Selector UI.
- `trust proxy` is on because LiteSpeed terminates TLS; without it a secure
  session cookie is never set.
- Touch `tmp/restart.txt` in the app root after any template or route change.
- Copy Housing's `_cron/cleanup_orphans.sh`: Passenger leaks a worker per
  restart and the account's process limit eventually runs out.
