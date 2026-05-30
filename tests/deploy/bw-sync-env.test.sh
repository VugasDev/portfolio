#!/usr/bin/env bash
# Funktionstest für deploy/bw-sync-env.sh gegen einen lokalen Mock der bw-serve-API.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCRIPT="$REPO/deploy/bw-sync-env.sh"
MOCK="$HERE/bw-serve-mock.py"
PORT=8099
API="http://127.0.0.1:$PORT"
VARS=(WEBHOOK_SECRET OAUTH_CLIENT_ID OAUTH_CLIENT_SECRET ORIGINS REDIRECT_URL)
MOCK_PID=""

fail() { echo "FAIL: $1" >&2; [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null; exit 1; }

start_mock() { # $1=status $2=missing
  MOCK_PORT=$PORT MOCK_STATUS="${1:-unlocked}" MOCK_MISSING="${2:-}" python3 "$MOCK" &
  MOCK_PID=$!
  for _ in $(seq 1 50); do curl -sf "$API/status" >/dev/null 2>&1 && return 0; done
  fail "mock kam nicht hoch"
}
stop_mock() { kill "$MOCK_PID" 2>/dev/null; wait "$MOCK_PID" 2>/dev/null; MOCK_PID=""; }

# Case 1: Happy path -> .env mit allen 7 Vars, mode 600
TMP="$(mktemp -d)"; start_mock unlocked ""
BW_SERVE_URL="$API" DEPLOY_DIR="$TMP" bash "$SCRIPT" || fail "happy path exit != 0"
stop_mock
[ -f "$TMP/.env" ] || fail "keine .env erzeugt"
for v in "${VARS[@]}"; do grep -q "^$v=val-$v$" "$TMP/.env" || fail "fehlt: $v"; done
[ "$(stat -c '%a' "$TMP/.env")" = "600" ] || fail ".env nicht chmod 600"
rm -rf "$TMP"

# Case 2: fehlendes Secret -> Abbruch, bestehende .env unangetastet
TMP="$(mktemp -d)"; echo "SENTINEL=keep" > "$TMP/.env"; start_mock unlocked "OAUTH_CLIENT_SECRET"
BW_SERVE_URL="$API" DEPLOY_DIR="$TMP" bash "$SCRIPT" && fail "haette fehlschlagen muessen"
stop_mock
grep -q "^SENTINEL=keep$" "$TMP/.env" || fail "bestehende .env wurde ueberschrieben"
rm -rf "$TMP"

# Case 3: serve locked -> Abbruch, keine .env
TMP="$(mktemp -d)"; start_mock locked ""
BW_SERVE_URL="$API" DEPLOY_DIR="$TMP" bash "$SCRIPT" && fail "locked haette abbrechen muessen"
stop_mock
[ -f "$TMP/.env" ] && fail ".env trotz locked geschrieben"
rm -rf "$TMP"

# Case 4: --dry-run schreibt nichts
TMP="$(mktemp -d)"; start_mock unlocked ""
BW_SERVE_URL="$API" DEPLOY_DIR="$TMP" bash "$SCRIPT" --dry-run || fail "dry-run exit != 0"
stop_mock
[ -f "$TMP/.env" ] && fail "dry-run hat .env geschrieben"
rm -rf "$TMP"

echo "ALL PASS"
