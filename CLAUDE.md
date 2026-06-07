# portfolio – Projekt-Kontext

## Beschreibung
Persönliche Portfolio-Website auf Basis von Astro, containerisiert mit Docker und selbst-gehostet im Homelab.

## Tech Stack
Astro, TypeScript, Tailwind CSS, Docker, Docker Compose, Nginx, Node.js, Playwright (Tests).

## Verzeichnisstruktur
- `src/` – Astro-Quellcode (Pages, Components)
- `public/` – Statische Assets
- `deploy/` – Deployment-Skripte und -Konfigurationen
- `webhook/` – Webhook-Handler für Auto-Deploy
- `tests/` – Playwright-End-to-End-Tests
- `docker-compose.yml` – Container-Definition
- `nginx.conf` – Nginx-Reverse-Proxy-Konfiguration
- `docs/` – Projektdokumentation

## Zugriffe & Infrastruktur
Bei Bedarf laden (NICHT auto-importieren):
- Deploy-Infrastruktur & Server-Zugänge: `~/projects/docs/homelab/services.md`

## Entwicklungs-Regeln
- Vor komplexen Aufgaben: `~/projects/docs/common-mistakes.md` (Sektionen [ALLE] + [@code])
- Backlog/Ideen (projektübergreifend) → `~/projects/docs/BACKLOG.md` (Format-Regeln dort); keine projektlokalen Backlog-Dateien anlegen
- Neue Fehler dort dokumentieren (Format in der Datei vorgegeben)
- Nur ändern was explizit angefragt wurde; Inputs validieren
- Secrets (Webhook-Token, Deploy-Keys) ausschließlich über Vaultwarden — nie im Code/Repo
- Infra-Änderungen (VM/Ports/DNS/Services) → in `~/projects/docs/homelab/` dokumentieren
  und dort committen, NICHT in diesem Repo
