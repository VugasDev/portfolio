---
title: Vaultwarden self-hosted absichern
description: Eigenen Passwort-Manager betreiben — Vaultwarden hinter Reverse-Proxy, mit fail2ban gegen Brute-Force und verschlüsseltem restic-Backup.
date: 2026-06-03
difficulty: Fortgeschritten
tags:
  - vaultwarden
  - security
  - docker
  - backup
series: ''
order: null
draft: false
---

> **Hinweis:** Ein selbst gehosteter Passwort-Manager ist ein hochsensibler Dienst. Setze ihn nur
> ein, wenn du Reverse-Proxy, Updates und vor allem **getestete Backups** zuverlässig betreiben
> kannst — ein verlorener oder kompromittierter Tresor wiegt schwerer als die Cloud-Bequemlichkeit.

**Vaultwarden** ist eine schlanke, in Rust geschriebene Reimplementierung des Bitwarden-Servers.
Die offiziellen Bitwarden-Clients (Browser-Extension, Mobil-App, CLI) verbinden sich ganz normal —
nur liegt der Tresor auf deiner Hardware. Dieser Guide zeigt ein abgesichertes Setup.

## Architektur

```
Client ──TLS──▶ Reverse-Proxy ──HTTP──▶ Vaultwarden ──▶ Daten-Volume
                                              │
                                         restic ──▶ Offsite (verschlüsselt)
                fail2ban ◀── Logs ───────────┘
```

## 1. Vaultwarden als Container

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    environment:
      DOMAIN: "https://vault.example.com"
      SIGNUPS_ALLOWED: "false"      # nach dem ersten Account schließen!
      ADMIN_TOKEN: "<argon2-hash>"  # Admin-Panel absichern
    volumes:
      - ./vw-data:/data
    restart: unless-stopped
    # KEIN direktes Port-Mapping nach außen — nur der Proxy spricht mit dem Container
```

Den ersten Account anlegen, dann `SIGNUPS_ALLOWED=false` setzen, damit niemand sonst Konten
registrieren kann. Das Admin-Panel (`/admin`) nur mit gehashtem `ADMIN_TOKEN` betreiben.

## 2. Reverse-Proxy mit TLS

Vaultwarden selbst spricht intern nur HTTP. Ein vorgelagerter Reverse-Proxy (Caddy, nginx, Traefik)
terminiert TLS und reicht weiter. Mit Caddy ist das ein Dreizeiler:

```
vault.example.com {
    reverse_proxy vaultwarden:80
}
```

Wichtig: Der Proxy muss die **echte Client-IP** durchreichen (`X-Forwarded-For`) — sonst sieht
fail2ban im nächsten Schritt nur den Proxy.

## 3. fail2ban gegen Brute-Force

Ein erreichbarer Login ist ein Brute-Force-Ziel. Vaultwarden loggt fehlgeschlagene Anmeldungen;
fail2ban liest das und bannt die Quell-IP auf Firewall-Ebene.

**Filter** (`/etc/fail2ban/filter.d/vaultwarden.conf`):

```ini
[Definition]
failregex = ^.*Username or password is incorrect\. Try again\. IP: <ADDR>\..*$
```

**Jail** (`/etc/fail2ban/jail.d/vaultwarden.conf`):

```ini
[vaultwarden]
enabled  = true
port     = 80,443,8081
filter   = vaultwarden
logpath  = /pfad/zu/vw-data/vaultwarden.log
maxretry = 3
bantime  = 3600
```

Logging in Vaultwarden dafür aktivieren (`LOG_FILE` setzen), sonst hat fail2ban nichts zu lesen.

## 4. Verschlüsseltes Backup mit restic

Der Tresor ist nur so gut wie sein wiederherstellbares Backup. restic verschlüsselt clientseitig und
dedupliziert:

```bash
export RESTIC_PASSWORD_FILE=/root/.restic-pass
restic -r <offsite-repo> backup /pfad/zu/vw-data
restic -r <offsite-repo> forget --keep-daily 7 --keep-weekly 4 --prune
```

Per systemd-Timer oder Cron täglich ausführen und offsite spiegeln.

> **Das Restore einmal echt durchspielen.** Leeres Volume, `restic restore` zurück, Container starten,
> einloggen. Ein nie getestetes Backup ist nur eine Hoffnung mit Speicherverbrauch.

## 5. Härtung — Checkliste

- [ ] `SIGNUPS_ALLOWED=false` nach dem ersten Account
- [ ] Admin-Panel mit gehashtem Token (oder ganz deaktiviert)
- [ ] Kein direktes Port-Mapping — nur über den Reverse-Proxy erreichbar
- [ ] Dienst in einem eigenen Netz-Segment, nicht zwischen IoT-Geräten
- [ ] fail2ban aktiv und mit echter Client-IP gefüttert
- [ ] restic-Backup automatisiert **und** Restore getestet
- [ ] Container-Image regelmäßig aktualisieren

## Fazit

Mit Reverse-Proxy, fail2ban und erprobtem restic-Backup wird aus „ich hoste meine Passwörter selbst"
ein Setup, dem man wirklich vertrauen kann. Der Aufwand liegt nicht im Aufsetzen, sondern in der
Disziplin: Updates, Monitoring und ein Backup, das du auch zurückspielen kannst.
