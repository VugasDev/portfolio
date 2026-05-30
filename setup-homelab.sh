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

# 2. .env aus Bitwarden generieren (bw serve muss laufen & entsperrt sein)
echo "--> Generiere .env aus Bitwarden (bw serve)"
bash "$DEPLOY_DIR/deploy/bw-sync-env.sh"

# 3. Docker Compose starten
echo "--> Starte Docker Stack"
docker compose -f "$DEPLOY_DIR/docker-compose.yml" up -d --build

echo ""
echo "✅ Portfolio läuft auf http://$(hostname -I | awk '{print $1}'):3010"
echo "   Webhook-Endpoint: http://$(hostname -I | awk '{print $1}'):9000/webhook"
echo ""
echo "Nächste Schritte:"
echo "  1. Erreichbarkeit: Site (3010) und Webhook (9000) laufen über das interne Netz / IPsec (OPNsense)"
echo "  2. GitHub Webhook: https://github.com/VugasDev/portfolio/settings/webhooks"
echo "     Payload URL: https://<deine-domain>/webhook"
echo "     Secret: in Bitwarden (Item portfolio-WEBHOOK_SECRET) — muss mit dem GitHub-Webhook-Secret übereinstimmen"
echo "  3. GitHub OAuth App für Decap CMS /admin erstellen"
