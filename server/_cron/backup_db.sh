#!/bin/bash
# A pipeline reports the LAST command's status, so `mysqldump | gzip` returned
# gzip's 0 even when mysqldump failed outright - which is how this script wrote
# 20-byte empty archives every night for a week and logged "OK" each time.
set -o pipefail
# Nightly mysqldump of the app's MySQL database, gzipped and rotated.
# (Copied from bongshaihousing, where it was written.) Nothing backed that DB up before - the account's only backup cron
# (Softaculous, --insid=26_95639) covers a different, unrelated
# Softaculous-installed app, not this hand-built one. Run via cPanel Cron
# Jobs, once daily: bash backup_db.sh
#
# Flags: -v also echo log lines to stdout (for interactive/SSH runs)
#        -k <days> retention in days (default 14)
#
# Credentials come from the app's own .env (never passed on the mysqldump
# command line, which would leak the password to anyone else on this
# shared host via `ps aux` - a --defaults-extra-file with mode 600 is the
# safe way to hand mysqldump a password).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="$APP_DIR/backups"
LOG_FILE="$SCRIPT_DIR/backup_db.log"
RETENTION_DAYS=14
VERBOSE=0

while getopts "vk:" opt; do
  case "$opt" in
    v) VERBOSE=1 ;;
    k) RETENTION_DAYS="$OPTARG" ;;
  esac
done

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$line" >> "$LOG_FILE"
  [ "$VERBOSE" -eq 1 ] && echo "$line"
}

log "backup_db.sh invoked (pid $$)"

if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: .env not found at $ENV_FILE, aborting."
  exit 1
fi

DB_HOST=$(grep -E '^DB_HOST=' "$ENV_FILE" | tail -1 | cut -d'=' -f2- | tr -d '"')
DB_PORT=$(grep -E '^DB_PORT=' "$ENV_FILE" | tail -1 | cut -d'=' -f2- | tr -d '"')
DB_USER=$(grep -E '^DB_USER=' "$ENV_FILE" | tail -1 | cut -d'=' -f2- | tr -d '"')
DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | tail -1 | cut -d'=' -f2- | tr -d '"')
DB_NAME=$(grep -E '^DB_NAME=' "$ENV_FILE" | tail -1 | cut -d'=' -f2- | tr -d '"')

if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then
  log "ERROR: DB_NAME/DB_USER not found in .env, aborting."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

DEFAULTS_FILE=$(mktemp)
chmod 600 "$DEFAULTS_FILE"
cat > "$DEFAULTS_FILE" <<EOF
[client]
user=$DB_USER
password=$DB_PASSWORD
host=${DB_HOST:-localhost}
port=${DB_PORT:-3306}
EOF

MYSQLDUMP_BIN="$(command -v mysqldump || true)"
for candidate in /usr/bin/mysqldump /usr/local/bin/mysqldump /usr/local/mysql/bin/mysqldump; do
  [ -n "$MYSQLDUMP_BIN" ] && break
  [ -x "$candidate" ] && MYSQLDUMP_BIN="$candidate"
done
if [ -z "$MYSQLDUMP_BIN" ]; then
  log "ERROR: mysqldump not found on PATH or in the usual locations, aborting."
  rm -f "$DEFAULTS_FILE"
  exit 1
fi

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
OUT_FILE="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

ERR_FILE=$(mktemp)
if "$MYSQLDUMP_BIN" --defaults-extra-file="$DEFAULTS_FILE" "$DB_NAME" 2>"$ERR_FILE" | gzip > "$OUT_FILE"; then
  BYTES=$(stat -c %s "$OUT_FILE" 2>/dev/null || wc -c < "$OUT_FILE")
  # An empty gzip stream is 20 bytes. Anything near that is a failed dump that
  # happened to exit 0, so treat size as part of the success condition.
  if [ "${BYTES:-0}" -lt 1024 ]; then
    log "ERROR: dump succeeded but produced only ${BYTES} bytes - treating as failure, removing."
    head -c 500 "$ERR_FILE" | while IFS= read -r l; do log "  mysqldump: $l"; done
    rm -f "$OUT_FILE"
  else
    SIZE=$(du -h "$OUT_FILE" 2>/dev/null | cut -f1)
    log "OK: backed up to $OUT_FILE ($SIZE, ${BYTES} bytes)"
  fi
else
  log "ERROR: mysqldump failed, removing partial output"
  head -c 500 "$ERR_FILE" | while IFS= read -r l; do log "  mysqldump: $l"; done
  rm -f "$OUT_FILE"
fi
rm -f "$ERR_FILE"

rm -f "$DEFAULTS_FILE"

DELETED=0
while IFS= read -r old_file; do
  rm -f "$old_file" && DELETED=$((DELETED + 1))
done < <(find "$BACKUP_DIR" -name 'db_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" 2>/dev/null)
log "Rotation: deleted $DELETED backup(s) older than ${RETENTION_DAYS} days."

log "Backup pass complete."
