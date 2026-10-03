---
title: Securing a Self-Hosted Vaultwarden
description: Run your own password manager — Vaultwarden behind a reverse proxy, with fail2ban against brute force and encrypted restic backups.
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

> **Note:** A self-hosted password manager is a highly sensitive service. Only run one if you can
> reliably operate a reverse proxy, updates and, above all, **tested backups** — a lost or
> compromised vault weighs more heavily than the convenience of the cloud.

**Vaultwarden** is a lean reimplementation of the Bitwarden server written in Rust. The official
Bitwarden clients (browser extension, mobile app, CLI) connect just as usual — except the vault
lives on your hardware. This guide shows a hardened setup.

## Architecture

```
Client ──TLS──▶ Reverse proxy ──HTTP──▶ Vaultwarden ──▶ data volume
                                              │
                                         restic ──▶ offsite (encrypted)
                fail2ban ◀── logs ───────────┘
```

## 1. Vaultwarden as a container

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    environment:
      DOMAIN: "https://vault.example.com"
      SIGNUPS_ALLOWED: "false"      # close after the first account!
      ADMIN_TOKEN: "<argon2-hash>"  # secure the admin panel
    volumes:
      - ./vw-data:/data
    restart: unless-stopped
    # NO direct port mapping to the outside — only the proxy talks to the container
```

Create the first account, then set `SIGNUPS_ALLOWED=false` so nobody else can register accounts.
Only run the admin panel (`/admin`) with a hashed `ADMIN_TOKEN`.

## 2. Reverse proxy with TLS

Vaultwarden itself only speaks HTTP internally. A reverse proxy in front (Caddy, nginx, Traefik)
terminates TLS and forwards the traffic. With Caddy, that's three lines:

```
vault.example.com {
    reverse_proxy vaultwarden:80
}
```

Important: the proxy must pass through the **real client IP** (`X-Forwarded-For`) — otherwise
fail2ban in the next step only sees the proxy.

## 3. fail2ban against brute force

A reachable login is a brute-force target. Vaultwarden logs failed logins; fail2ban reads them
and bans the source IP at the firewall level.

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
logpath  = /path/to/vw-data/vaultwarden.log
maxretry = 3
bantime  = 3600
```

Enable logging in Vaultwarden for this (set `LOG_FILE`), otherwise fail2ban has nothing to read.

## 4. Encrypted backups with restic

The vault is only as good as its restorable backup. restic encrypts on the client side and
deduplicates:

```bash
export RESTIC_PASSWORD_FILE=/root/.restic-pass
restic -r <offsite-repo> backup /path/to/vw-data
restic -r <offsite-repo> forget --keep-daily 7 --keep-weekly 4 --prune
```

Run it daily via a systemd timer or cron and mirror it offsite.

> **Actually run through a restore once.** Empty volume, `restic restore` back, start the
> container, log in. A backup that has never been tested is just a hope that uses disk space.

## 5. Hardening — checklist

- [ ] `SIGNUPS_ALLOWED=false` after the first account
- [ ] Admin panel with a hashed token (or disabled entirely)
- [ ] No direct port mapping — only reachable through the reverse proxy
- [ ] Service in its own network segment, not between IoT devices
- [ ] fail2ban active and fed with the real client IP
- [ ] restic backup automated **and** restore tested
- [ ] Update the container image regularly

## Conclusion

With a reverse proxy, fail2ban and a proven restic backup, "I host my own passwords" turns into a
setup you can actually trust. The effort isn't in the setup, but in the discipline: updates,
monitoring and a backup you can actually restore.
