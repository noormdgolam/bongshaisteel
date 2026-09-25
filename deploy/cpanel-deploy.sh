#!/bin/bash
# ==========================================================================
# DEPLOY — run by cPanel Git ("Deploy HEAD Commit"), via .cpanel.yml
# --------------------------------------------------------------------------
# On this host the repository clone IS the docroot
# (/home/abongsha/bongshaisteel.com): "Update from Remote" already put the
# public files in place. This script deploys the Node app:
#   server/  ->  APPROOT (/home/abongsha/bongshai-steel-node, outside the docroot)
# and restarts it.
#
# The app's .env is never in git. To install or replace it, upload it over
# FTP to <docroot>/server/.env (the docroot .htaccess forbids /server/ and
# dotfiles); this script moves it into APPROOT with mode 600, so it does not
# stay under the docroot.
#
# Optional override in ~/.bongshai-steel-deploy (APPROOT=).
# Nothing is deleted from APPROOT: node_modules, .env, var/, backups/ and
# logs live there and belong to the running app.
# ==========================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPROOT="/home/abongsha/bongshai-steel-node"
# shellcheck disable=SC1090
[ -f "$HOME/.bongshai-steel-deploy" ] && . "$HOME/.bongshai-steel-deploy"
LOG="$HOME/bongshai-steel-deploy.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

command -v rsync > /dev/null || { log "ERROR: rsync not found on this host. Nothing deployed."; exit 1; }
case "$APPROOT" in "$REPO"|"$REPO"/*) log "ERROR: APPROOT is inside the docroot clone. Nothing deployed."; exit 1 ;; esac
[ -f "$REPO/server/server.js" ] || { log "ERROR: $REPO/server/server.js missing. Nothing deployed."; exit 1; }
mkdir -p "$APPROOT"

log "deploy $(git -C "$REPO" rev-parse --short HEAD) from $REPO"

# 1. A freshly uploaded .env moves out of the docroot into the app.
if [ -f "$REPO/server/.env" ]; then
  mv -f "$REPO/server/.env" "$APPROOT/.env"
  chmod 600 "$APPROOT/.env"
  log "installed new .env into $APPROOT (mode 600)"
fi
[ -f "$APPROOT/.env" ] || log "WARNING: $APPROOT/.env does not exist yet — the app cannot reach its database."

# 2. The app. Runtime state on the host is never overwritten.
before="$(md5sum "$APPROOT/package-lock.json" 2>/dev/null | cut -d' ' -f1 || true)"
rsync -a --exclude node_modules --exclude .env --exclude '.env.*' --exclude var --exclude backups \
  --exclude tmp --exclude '_cron/*.log' "$REPO/server"/ "$APPROOT"/
after="$(md5sum "$APPROOT/package-lock.json" | cut -d' ' -f1)"
chmod +x "$APPROOT"/_cron/*.sh

# On CloudLinux node_modules is a symlink into the Node Selector's virtual
# environment; installing from a script would replace it with a real folder.
# Dependencies are installed with the NPM Install button, never from here.
if [ "$before" != "$after" ] || [ ! -e "$APPROOT/node_modules" ]; then
  log "ACTION NEEDED: dependencies changed or missing — cPanel > Setup Node.js App > Run NPM Install, then Restart."
fi

# 3. Restart (Passenger watches this file). Templates are cached in
#    production, so this is needed after every deploy, not only code changes.
mkdir -p "$APPROOT/tmp"
touch "$APPROOT/tmp/restart.txt"
log "deployed; app restart requested"
