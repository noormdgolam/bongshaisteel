#!/usr/bin/env bash
# ==========================================================================
# End-to-end smoke test of the CMS, run against a LOCAL PHP dev server.
#
#   php -S 127.0.0.1:8788 -t .        # from the repo root, in one terminal
#   bash tools/smoke.sh               # in another
#
# DESTRUCTIVE, by design: it wipes data/content.json, admin/config.php and
# admin/backups/ so it can drive the installer from scratch. Never point it
# at the live site - it refuses anything that is not localhost.
#
# Needs: bash, curl, python3, and a PHP build with gd for the upload tests.
# ==========================================================================
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ="$(cd "$HERE/.." && pwd)"
FIX="$HERE/fixtures"
TMP="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/bs-cms-smoke")"
mkdir -p "$TMP"
B="${BASE_URL:-http://127.0.0.1:8788}"
JAR="$TMP/cookies.txt"
PW="${CMS_TEST_PASSWORD:-localtest123}"
PY="${PYTHON:-python}"

# Git Bash reports /c/... paths; a Windows python cannot open those.
if command -v cygpath >/dev/null 2>&1; then
  PROJ_PY="$(cygpath -m "$PROJ")"; TMP_PY="$(cygpath -m "$TMP")"; FIX_PY="$(cygpath -m "$FIX")"
else
  PROJ_PY="$PROJ"; TMP_PY="$TMP"; FIX_PY="$FIX"
fi

case "$B" in
  http://127.0.0.1:*|http://localhost:*|http://[::1]:*) ;;
  *) echo "refusing to run against $B - localhost only"; exit 2 ;;
esac

pass=0; fail=0
set -o pipefail
fixture() { "$@" || { echo "FIXTURE FAILED: $*"; exit 3; }; }

rm -f "$JAR" "$PROJ/admin/config.php" "$PROJ/data/content.json"
rm -rf "$PROJ/admin/backups"

code() { curl -s -o "$TMP/body.txt" -w '%{http_code}' "$@"; }

want() { # want <label> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1));
  else echo "FAIL  $1   expected[$2] got[$3]"; fail=$((fail+1)); fi
}
wantgrep() { # wantgrep <label> <pattern>
  if grep -q "$2" "$TMP/body.txt"; then echo "PASS  $1"; pass=$((pass+1));
  else echo "FAIL  $1   body: $(head -c 200 "$TMP/body.txt")"; fail=$((fail+1)); fi
}

echo "--- installer arming ---"
want "setup.php refuses before config.php is copied" 409 "$(code "$B/admin/setup.php")"
wantgrep "  says how to arm it" "not armed"

cp "$PROJ/admin/config.sample.php" "$PROJ/admin/config.php"
want "setup.php serves the form once armed" 200 "$(code "$B/admin/setup.php")"

want "setup.php rejects a cross-site POST" 200 \
  "$(code -X POST -H "Origin: https://evil.example" -d "password=$PW&password2=$PW" "$B/admin/setup.php")"
wantgrep "  and says why" "did not come from this site"

want "setup.php accepts a same-origin POST" 200 \
  "$(code -X POST -H "Origin: $B" -d "password=$PW&password2=$PW" "$B/admin/setup.php")"
wantgrep "  and writes config.php" "config.php written"
want "setup.php is spent afterwards" 410 "$(code "$B/admin/setup.php")"

echo
echo "--- auth ---"
want "whoami is public" 200 "$(code "$B/admin/api.php?action=whoami")"
wantgrep "  and reports signed out" '"authed":false'
want "load needs auth" 403 "$(code "$B/admin/api.php?action=load")"
want "save needs auth" 403 "$(code -X POST -H "Origin: $B" -H "Content-Type: application/json" \
  -d '{"content":{"text":{}}}' "$B/admin/api.php?action=save")"

want "wrong password is refused" 200 \
  "$(code -c "$JAR" -X POST -H "Origin: $B" -d "password=nope" "$B/admin/login.php")"
wantgrep "  with an error" "Incorrect password"

want "right password signs in (302)" 302 \
  "$(code -c "$JAR" -b "$JAR" -X POST -H "Origin: $B" -d "password=$PW" "$B/admin/login.php")"
want "session now authed" 200 "$(code -b "$JAR" "$B/admin/api.php?action=whoami")"
wantgrep "  authed:true" '"authed":true'

echo
echo "--- content round trip ---"
want "load works when signed in" 200 "$(code -b "$JAR" "$B/admin/api.php?action=load")"
wantgrep "  returns the seed content" '"products"'

want "save rejects a cross-site POST" 403 \
  "$(code -b "$JAR" -X POST -H "Origin: https://evil.example" -H "Content-Type: application/json" \
     -d '{"content":{"text":{"hero.title":"x"}}}' "$B/admin/api.php?action=save")"
wantgrep "  with cross_site" "cross_site"

fixture "$PY" "$FIX_PY/mkpayload.py" "$TMP_PY/save1.json" "FIRST SAVE" "$PROJ_PY/data/content.default.json"
want "first save accepted" 200 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -H "Content-Type: application/json" \
     --data-binary "@$TMP/save1.json" "$B/admin/api.php?action=save")"
want "  content.json written" "yes" "$([ -f "$PROJ/data/content.json" ] && echo yes || echo no)"
wantgrep "  echoes an updated stamp" '"updated"'

fixture "$PY" "$FIX_PY/mkpayload.py" "$TMP_PY/save2.json" "SECOND SAVE" "$PROJ_PY/data/content.default.json"
want "second save accepted" 200 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -H "Content-Type: application/json" \
     --data-binary "@$TMP/save2.json" "$B/admin/api.php?action=save")"

want "live content is the second save" "SECOND SAVE" \
  "$("$PY" -c "import json,sys;print(json.load(sys.stdin)['text']['hero.title'])" < "$PROJ/data/content.json")"

echo
echo "--- snapshots and restore ---"
want "backups list works" 200 "$(code -b "$JAR" "$B/admin/api.php?action=backups")"
SNAP="$("$PY" -c "import json,sys;d=json.load(sys.stdin);print(d['backups'][0]['id'] if d['backups'] else 'NONE')" < "$TMP/body.txt")"
want "  one snapshot exists" "yes" "$([ "$SNAP" != "NONE" ] && echo yes || echo no)"
echo "      snapshot id: $SNAP"

want "restore rejects path traversal" 400 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -H "Content-Type: application/json" \
     -d '{"id":"../../data/content.json"}' "$B/admin/api.php?action=restore")"
wantgrep "  with bad_id" "bad_id"

want "restore accepts a real snapshot" 200 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -H "Content-Type: application/json" \
     -d "{\"id\":\"$SNAP\"}" "$B/admin/api.php?action=restore")"
want "  live content rolled back" "FIRST SAVE" \
  "$("$PY" -c "import json,sys;print(json.load(sys.stdin)['text']['hero.title'])" < "$PROJ/data/content.json")"

echo
echo "--- uploads ---"
fixture "$PY" "$FIX_PY/mkpng.py" "$TMP_PY/shot.png"
want "png upload accepted" 200 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -F "file=@$TMP/shot.png" "$B/admin/api.php?action=upload")"
wantgrep "  converted to webp" '\.webp'
wantgrep "  with responsive variants" '"widths":\[400,700\]'
want "  uploads guarded by .htaccess" "yes" \
  "$([ -f "$PROJ/images/uploads/.htaccess" ] && echo yes || echo no)"

# Sane 8x8 GIF header, truncated body: passes the mime and pixel checks, then
# fails to decode. Must come back as not_image, not get stored as-is.
fixture "$PY" "$FIX_PY/mkbadgif.py" "$TMP_PY/truncated.gif"
want "damaged image rejected" 400 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -F "file=@$TMP/truncated.gif" "$B/admin/api.php?action=upload")"
wantgrep "  as not_image" "not_image"
want "  nothing was stored for it" 0 \
  "$(ls "$PROJ/images/uploads" 2>/dev/null | grep -c 'truncated')"

# Header claiming 802 megapixels: the cap stops it before any decode happens.
printf 'GIF89a this is not really an image' > "$TMP/fake.gif"
want "oversized header rejected" 413 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -F "file=@$TMP/fake.gif" "$B/admin/api.php?action=upload")"
wantgrep "  as too_many_pixels" "too_many_pixels"

fixture "$PY" "$FIX_PY/mkbmp.py" "$TMP_PY/x.bmp"
want "disallowed image type rejected" 415 \
  "$(code -b "$JAR" -X POST -H "Origin: $B" -F "file=@$TMP/x.bmp" "$B/admin/api.php?action=upload")"
wantgrep "  as bad_type" "bad_type"

echo
echo "--- logout and throttle ---"
want "logout works" 200 "$(code -b "$JAR" -c "$JAR" -X POST -H "Origin: $B" "$B/admin/api.php?action=logout")"
want "  session gone" 403 "$(code -b "$JAR" "$B/admin/api.php?action=load")"

for i in 1 2 3 4 5 6 7 8; do
  code -X POST -H "Origin: $B" -d "password=wrong$i" "$B/admin/login.php" > /dev/null
done
code -X POST -H "Origin: $B" -d "password=$PW" "$B/admin/login.php" > /dev/null
wantgrep "8 failures lock the form (right password refused)" "Too many failed attempts"
rm -f "$PROJ/admin/backups/.throttle.json"
want "clearing .throttle.json unlocks it (302)" 302 \
  "$(code -c "$JAR" -X POST -H "Origin: $B" -d "password=$PW" "$B/admin/login.php")"

echo
echo "================================"
echo "PASS: $pass   FAIL: $fail"
[ "$fail" -eq 0 ] || exit 1
