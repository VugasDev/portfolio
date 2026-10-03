---
title: A Password Manager in My Own Basement — Self-Hosted Vaultwarden
description: Vaultwarden instead of a cloud password manager — with a reverse proxy, fail2ban and encrypted restic backups. And why I threw the tunnel container back out.
date: 2026-04-25
tags:
  - vaultwarden
  - security
  - docker
  - backup
  - self-hosting
draft: false
---

Passwords are the one secret I didn't want sitting with a third party. So my password manager
is now self-hosted: **Vaultwarden**, the lean Rust reimplementation of the Bitwarden server.
Bitwarden clients (browser, mobile, CLI) talk to it just as usual, but the vault lives on my
hardware.

## The stack

Deliberately kept minimal:

- **Vaultwarden** in a Docker container, data on a persistent volume
- a **reverse proxy** with automatic TLS in front of it — the container itself only speaks HTTP internally
- **fail2ban**, which watches the Vaultwarden logs for failed logins and bans IPs
- **restic** backups, encrypted, to external cloud storage

```
Client ──TLS──▶ Reverse proxy ──HTTP──▶ Vaultwarden ──▶ Volume
                                              │
                                         restic (encrypted) ──▶ Offsite
```

## fail2ban against brute force

A publicly reachable login is a magnet for brute-force attempts. Vaultwarden writes failed
logins to its log; a matching fail2ban filter picks them up and bans the source IP at the
firewall level after a few attempts. The important detail: teach the proxy to pass through the
**real** client IP (`X-Forwarded-For`), otherwise fail2ban ends up banning the proxy itself.

## Backups you can actually restore

A password vault without a tested restore is a single point of failure with extra steps. My
restic repository is encrypted, runs on a timer and is mirrored offsite. The part most people
skip: actually running through the **restore** once — empty volume, restore the backup, log
in. Only then is it a backup and not a hope.

## Why the tunnel container got thrown out

In the first version, I had put a separate tunnel container in front of Vaultwarden to reach
the service on the go. Once my network setup got a proper reverse proxy with a wildcard
certificate, that second layer was just dead weight: one more container, one more point of
failure, more latency. So out it went — Vaultwarden now sits directly behind the central
reverse proxy, which terminates TLS and routes cleanly.

> **Lesson:** Every additional layer "for remote access" has to justify itself. Once the core
> infrastructure does the job anyway, the special-case solution is just technical debt.

## Conclusion

A self-hosted password manager isn't a weekend hack you set up and forget — it's exactly the
kind of service where hardening, monitoring and a tested backup aren't optional. But knowing
that my most important secrets live on my own hardware is worth the effort.
