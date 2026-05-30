# Auto-Deploy Setup

## Flow

```
  GitHub push (main)
       │
       ▼
  https://vugas.de/webhook
       │
       ▼
  nginx → portfolio-webhook:9000
       │      (HMAC verify, write .deploy-trigger)
       ▼
  systemd-path watches /opt/portfolio/.deploy-trigger
       │
       ▼
  portfolio-deploy.service  →  deploy.sh: git fetch/reset (Host, SSH-Key) + docker compose up -d --build portfolio
```

Only the host runs `docker compose` **and** the git update — the repo is private, and the host
has the SSH key. The webhook container only writes the trigger file; it never touches git, ssh,
or the docker socket.

## One-time install (on LXC 115)

```bash
sudo cp /opt/portfolio/deploy/portfolio-deploy.service /etc/systemd/system/
sudo cp /opt/portfolio/deploy/portfolio-deploy.path    /etc/systemd/system/
sudo chmod +x /opt/portfolio/deploy/deploy.sh
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio-deploy.path
```

Verify:
```bash
systemctl status portfolio-deploy.path
journalctl -u portfolio-deploy.service -f
```

## Configure the GitHub webhook

Repo → Settings → Webhooks → Add webhook
- **Payload URL:** `https://vugas.de/webhook`
- **Content type:** `application/json`
- **Secret:** value of `WEBHOOK_SECRET` from `/opt/portfolio/.env`
- **Events:** Just the `push` event
- **Active:** ✓

GitHub sends a ping on creation. Check:
```bash
docker compose logs webhook --tail 20
```
Expect `[webhook] ping` and `pong` response.

## Manual trigger (for testing)

```bash
touch /opt/portfolio/.deploy-trigger
# systemd-path fires → service runs → container rebuilds
```

## Troubleshooting

- **Trigger file stays:** deploy failed. Inspect `/opt/portfolio/deploy.log`.
- **Webhook returns 401:** secret mismatch between GitHub + `.env`.
- **nginx 502 on /webhook:** portfolio-webhook container is down → `docker compose up -d webhook`.

## Secrets aus Bitwarden (bw serve)

Die `.env` wird auf der VM aus dem self-hosted Bitwarden (`vault.vugas.de`, Account
`ai-worker@vugas.de`) generiert. Secrets liegen im Ordner `portfolio-deploy` als je ein
Item `portfolio-<VAR>` (Wert im Passwort-Feld) für: `WEBHOOK_SECRET`, `NEWT_ID`,
`NEWT_SECRET`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `ORIGINS`, `REDIRECT_URL`.

### Einmaliger Bootstrap (auf LXC 115)

```bash
# 1. bw CLI installieren (z.B. via npm) und Server setzen
bw config server https://vault.vugas.de
bw login ai-worker@vugas.de            # einmalig interaktiv

# 2. Master-Passwort hinterlegen (nur für root lesbar)
sudo install -d -m 700 /etc/portfolio
printf '%s' '<MASTER-PASSWORT>' | sudo tee /etc/portfolio/bw-master >/dev/null
sudo chmod 600 /etc/portfolio/bw-master

# 3. bw-serve als System-Service
sudo cp /opt/portfolio/deploy/bw-serve.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bw-serve
curl -s http://127.0.0.1:8087/status | jq .data.template.status   # -> "unlocked"
```

### .env erzeugen / aktualisieren

```bash
/opt/portfolio/deploy/bw-sync-env.sh            # nur .env schreiben
/opt/portfolio/deploy/bw-sync-env.sh --dry-run  # nur prüfen
/opt/portfolio/deploy/refresh-secrets.sh        # .env + docker compose up -d
```

Sicherheit: `bw serve` lauscht nur auf `127.0.0.1` (keine API-Auth). Das Master-Passwort
existiert ausschließlich in `/etc/portfolio/bw-master`; die Deploy-Scripts halten keine Secrets.
