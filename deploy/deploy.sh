#!/usr/bin/env bash
# /opt/portfolio/deploy/deploy.sh
# Rebuilds the portfolio container when the webhook-container writes .deploy-trigger.
set -euo pipefail

APP_DIR="/opt/portfolio"
TRIGGER="$APP_DIR/.deploy-trigger"
LOGFILE="$APP_DIR/deploy.log"

log() { echo "[$(date -Is)] $*" | tee -a "$LOGFILE"; }

cd "$APP_DIR"

if [[ ! -f "$TRIGGER" ]]; then
  log "no trigger, exit"
  exit 0
fi

log "deploy begin — $(cat "$TRIGGER" | head -1)"

# The webhook already pulled. Build + restart just the portfolio service.
if docker compose up -d --build portfolio >>"$LOGFILE" 2>&1; then
  rm -f "$TRIGGER"
  log "deploy OK"
else
  log "deploy FAILED (trigger kept for retry/inspection)"
  exit 1
fi
