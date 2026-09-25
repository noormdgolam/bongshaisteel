#!/bin/bash
# ==========================================================================
# DEPLOY — run by cPanel Git ("Deploy HEAD Commit"), via .cpanel.yml
# --------------------------------------------------------------------------
# The repository is cloned OUTSIDE the docroot. This copies:
#   the public site files  -> DOCROOT   (served by LiteSpeed)
#   server/                -> APPROOT   (the Node app, run by Passenger)
# then restarts the app. Paths are read from ~/.bongshai-steel-deploy on the
# host, not from git, so a wrong or missing path stops the deploy instead of
# copying files somewhere unexpected:
#
#   DOCROOT=/home/abongsha/<the domain's document root>
#   APPROOT=/home/abongsha/bongshai-steel-node
#   NODEVENV=/home/abongsha/nodevenv/bongshai-steel-node/22   (optional: npm install when the lockfile changes)
#
# Nothing is deleted from either destination: uploads, .env, var/ and
# backups/ live there and belong to the running site.
# ==========================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$HOME/.bongshai-steel-deploy"
LOG="$HOME/bongshai-steel-deploy.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

command -v rsync > /dev/null || { log "ERROR: rsync not found on this host. Nothing deployed."; exit 1; }
[ -f "$CONF" ] || { log "ERROR: $CONF missing — see CUTOVER.md step 2. Nothing deployed."; exit 1; }
# shellcheck disable=SC1090
. "$CONF"
: "${DOCROOT:?DOCROOT not set in $CONF}"
: "${APPROOT:?APPROOT not set in $CONF}"
[ -d "$DOCROOT" ] || { log "ERROR: DOCROOT $DOCROOT does not exist. Nothing deployed."; exit 1; }
case "$DOCROOT" in "$REPO"|"$REPO"/*) log "ERROR: DOCROOT is inside the repository clone. Nothing deployed."; exit 1 ;; esac
mkdir -p "$APPROOT"

log "deploy $(git -C "$REPO" rev-parse --short HEAD) from $REPO"

# 1. Public files. The exclude list keeps app source, tooling and anything
#    that would shadow a Node route out of the docroot.
rsync -a --exclude-from="$REPO/deploy/public.exclude" "$REPO"/ "$DOCROOT"/
for f in index.html lead.php counter.php sitemap.xml; do
  if [ -e "$DOCROOT/$f" ]; then
    mv "$DOCROOT/$f" "$DOCROOT/$f.retired-$(date +%Y%m%d%H%M%S)"
    log "moved aside $DOCROOT/$f (it would hide the Node route)"
  fi
done

# 2. The app. Runtime state on the host is never overwritten.
before="$(md5sum "$APPROOT/package-lock.json" 2>/dev/null | cut -d' ' -f1 || true)"
rsync -a --exclude node_modules --exclude .env --exclude var --exclude backups \
  --exclude tmp --exclude '_cron/*.log' "$REPO/server"/ "$APPROOT"/
after="$(md5sum "$APPROOT/package-lock.json" | cut -d' ' -f1)"
chmod +x "$APPROOT"/_cron/*.sh

if [ "$before" != "$after" ]; then
  if [ -n "${NODEVENV:-}" ] && [ -x "$NODEVENV/bin/npm" ]; then
    log "package-lock.json changed: npm ci"
    (cd "$APPROOT" && PATH="$NODEVENV/bin:$PATH" npm ci --omit=dev --no-audit --no-fund >> "$LOG" 2>&1)
  else
    log "WARNING: package-lock.json changed — run NPM Install in cPanel > Setup Node.js App."
  fi
fi

# 3. Restart (Passenger watches this file). The page template is cached in
#    production, so this is needed after every deploy, not only code changes.
mkdir -p "$APPROOT/tmp"
touch "$APPROOT/tmp/restart.txt"
log "deployed; app restart requested"
