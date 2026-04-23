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
       │      (HMAC verify, git pull, write .deploy-trigger)
       ▼
  systemd-path watches /opt/portfolio/.deploy-trigger
       │
       ▼
  portfolio-deploy.service  →  docker compose up -d --build portfolio
```

Only the host runs `docker compose`; the webhook container never touches the docker socket.

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
