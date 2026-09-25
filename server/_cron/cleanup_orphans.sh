#!/bin/bash
# Keeps only the newest lsnode process for this app, force-kills older
# duplicates left behind by repeated restarts (cPanel Node Selector's
# restart.txt convention starts a new worker but doesn't always reap the
# old one, which eventually exhausts the account's process-count limit).
# Run via cPanel Cron Jobs every 15 min: bash cleanup_orphans.sh -f
#
# Flags: -f actually kill orphans (default: dry run, report only)
#        -d force dry run even if -f is also passed
#        -v also echo log lines to stdout (for interactive/SSH runs)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Derived from this script's own deployed location (not hardcoded) so the
# same file works correctly for both bongshai-node-app and
# bongshai-node-app-prod without per-environment edits (and for this app). "bongshai-node-app"
# is a string-prefix of "bongshai-node-app-prod" though, so a plain `pgrep
# -f` substring match on the shorter (staging) pattern would also catch the
# longer (prod) app's processes, pooling both apps' workers together and
# letting one cron pass kill the other app's only live process. The
# post-filter below requires the match be followed by "/" or end-of-string,
# not another path-name character, to keep the two apps' process pools
# genuinely separate.
APP_DIR="$(dirname "$SCRIPT_DIR")"
APP_PATTERN="lsnode:${APP_DIR}"
LOG_FILE="$SCRIPT_DIR/cleanup_orphans.log"
FORCE=0
VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    -f) FORCE=1 ;;
    -d) FORCE=0 ;;
    -v) VERBOSE=1 ;;
  esac
done

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$line" >> "$LOG_FILE"
  [ "$VERBOSE" -eq 1 ] && echo "$line"
}

log "cleanup_orphans.sh invoked (pid $$, args: $*)"

# oldest-first PID list for matching processes, keyed by process start time.
# Re-checks each pgrep hit's full command line to reject a same-prefix
# collision from a sibling app (see comment above APP_PATTERN) before
# counting it as one of ours.
PIDS=$(pgrep -f "$APP_PATTERN" | while read -r pid; do
  cmd=$(ps -o args= -p "$pid" 2>/dev/null)
  case "$cmd" in
    *"${APP_PATTERN}/"*) ;;
    *"${APP_PATTERN}") ;;
    *) continue ;;
  esac
  etime=$(ps -o lstart= -p "$pid" 2>/dev/null)
  [ -n "$etime" ] && echo "$(date -d "$etime" +%s 2>/dev/null) $pid"
done | sort -n | awk '{print $2}')

COUNT=$(echo "$PIDS" | grep -c . || true)

if [ "$COUNT" -le 1 ]; then
  log "OK: $COUNT matching process(es), nothing to clean up."
  log "Cleanup pass complete."
  exit 0
fi

NEWEST_PID=$(echo "$PIDS" | tail -n 1)
OLD_PIDS=$(echo "$PIDS" | grep -v "^${NEWEST_PID}$")

log "Found $COUNT processes matching '$APP_PATTERN'. Keeping newest PID $NEWEST_PID."
for pid in $OLD_PIDS; do
  if [ "$FORCE" -eq 1 ]; then
    kill -9 "$pid" 2>/dev/null && log "Killed orphan PID $pid" || log "Failed to kill PID $pid (already gone?)"
  else
    log "DRY RUN: would kill orphan PID $pid"
  fi
done
log "Cleanup pass complete."
