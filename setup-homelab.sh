#!/bin/bash
# setup-homelab.sh
# Führt das Portfolio-Deployment auf dem Homelab durch.
# Ausführen als: bash setup-homelab.sh
# Voraussetzung: Docker + Docker Compose installiert, Git verfügbar

set -e

REPO="https://github.com/VugasDev/portfolio.git"
DEPLOY_DIR="/opt/portfolio"

echo "==> Portfolio Deployment auf Homelab"

# 1. Repo klonen falls noch nicht vorhanden
if [ ! -d "$DEPLOY_DIR" ]; then
  echo "--> Klone Repo nach $DEPLOY_DIR"
  git clone "$REPO" "$DEPLOY_DIR"
else
  echo "--> Repo bereits vorhanden, führe git pull durch"
  git -C "$DEPLOY_DIR" pull --ff-only
fi

# 2. .env anlegen falls noch nicht vorhanden
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "--> Erstelle .env"
  WEBHOOK_SECRET=$(openssl rand -hex 32)
  cat > "$DEPLOY_DIR/.env" << EOF
WEBHOOK_SECRET=$WEBHOOK_SECRET
NEWT_ID=66yag17uj4k5yd5
NEWT_SECRET=wofhxuln083hgb35o3zl1krnhuokx8c827zrv97vhlzgo19y
EOF
  echo "    WEBHOOK_SECRET: $WEBHOOK_SECRET"
  echo "    --> Diesen Wert als GitHub Webhook Secret eintragen!"
fi

# 3. Docker Compose starten
echo "--> Starte Docker Stack"
docker compose -f "$DEPLOY_DIR/docker-compose.yml" up -d --build

echo ""
echo "✅ Portfolio läuft auf http://$(hostname -I | awk '{print $1}'):3010"
echo "   Webhook-Endpoint: http://$(hostname -I | awk '{print $1}'):9000/webhook"
echo ""
echo "Nächste Schritte:"
echo "  1. Pangolin Dashboard: Tunnel für Port 3010 (Site) und 9000 (Webhook) anlegen"
echo "  2. GitHub Webhook: https://github.com/VugasDev/portfolio/settings/webhooks"
echo "     Payload URL: https://<deine-domain>/webhook"
echo "     Secret: $(grep WEBHOOK_SECRET $DEPLOY_DIR/.env | cut -d= -f2)"
echo "  3. GitHub OAuth App für Decap CMS /admin erstellen"
