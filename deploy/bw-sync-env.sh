#!/usr/bin/env bash
# bw-sync-env.sh — generiert $DEPLOY_DIR/.env aus Bitwarden über die lokale bw-serve-API.
# Hält selbst KEINE Secrets; erwartet einen laufenden, entsperrten bw serve.
#
#   BW_SERVE_URL  default http://127.0.0.1:8087
#   DEPLOY_DIR    default /opt/portfolio
#   Arg --dry-run prüft nur, schreibt nicht.
set -euo pipefail

API="${BW_SERVE_URL:-http://127.0.0.1:8087}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/portfolio}"
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi

VARS=(WEBHOOK_SECRET OAUTH_CLIENT_ID OAUTH_CLIENT_SECRET ORIGINS REDIRECT_URL)

die() { echo "[bw-sync-env] FEHLER: $*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl nicht gefunden"
command -v jq   >/dev/null 2>&1 || die "jq nicht gefunden"

# 1. Serve erreichbar + entsperrt?
status="$(curl -fsS "$API/status" 2>/dev/null | jq -r '.data.template.status' 2>/dev/null || true)"
if [ "$status" != "unlocked" ]; then
  die "bw serve nicht erreichbar/entsperrt (status='$status') — prüfen: systemctl status bw-serve"
fi

# 2. Sync (non-fatal wenn offline)
if ! curl -fsS -X POST "$API/sync" >/dev/null 2>&1; then
  echo "[bw-sync-env] WARN: sync fehlgeschlagen (offline?) — nutze Cache" >&2
fi

# 3. Werte holen (erst vollständig sammeln, dann schreiben)
declare -a LINES=()
for v in "${VARS[@]}"; do
  resp="$(curl -fsS "$API/object/password/portfolio-$v" 2>/dev/null || true)"
  ok="$(printf '%s' "$resp" | jq -r '.success' 2>/dev/null || echo false)"
  val="$(printf '%s' "$resp" | jq -r '.data // empty' 2>/dev/null || true)"
  if [ "$ok" != "true" ] || [ -z "$val" ]; then
    die "Secret 'portfolio-$v' fehlt oder leer in Bitwarden"
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "[bw-sync-env] OK: portfolio-$v"
  else
    LINES+=("$v=$val")
  fi
done

if [ "$DRY_RUN" = "1" ]; then
  echo "[bw-sync-env] dry-run: alle ${#VARS[@]} Secrets vorhanden, nichts geschrieben."
  exit 0
fi

# 4. Atomar schreiben (umask 077 -> temp 600), dann mv
mkdir -p "$DEPLOY_DIR"
tmp="$DEPLOY_DIR/.env.tmp.$$"
( umask 077; printf '%s\n' "${LINES[@]}" > "$tmp" )
chmod 600 "$tmp"
mv -f "$tmp" "$DEPLOY_DIR/.env"
echo "[bw-sync-env] .env geschrieben ($DEPLOY_DIR/.env, ${#VARS[@]} Variablen)."
