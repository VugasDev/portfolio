#!/usr/bin/env bash
# refresh-secrets.sh — .env aus Bitwarden neu ziehen und den Stack anwenden.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/portfolio}"

"$HERE/bw-sync-env.sh"
docker compose -f "$DEPLOY_DIR/docker-compose.yml" up -d
echo "[refresh-secrets] .env aktualisiert und Stack neu gestartet."
