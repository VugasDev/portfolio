---
title: Backups That Survive the Real Thing — 3-2-1 in the Homelab
description: A backup concept following the 3-2-1 rule with Proxmox vzdump, restic and rclone-crypt — including automated restore tests and alert emails. Because untested backups are just hope.
date: 2026-06-05
difficulty: Fortgeschritten
tags:
  - backup
  - restic
  - proxmox
  - self-hosting
series: ''
order: null
draft: false
---

> **The uncomfortable truth:** A backup whose restore has never been run through isn't a
> backup — it's hope with a timestamp. That's why this guide builds in the restore test as a
> fixed part from the start, not as "someday".

The **3-2-1 rule** is the classic among backup strategies: **3** copies of the data, on **2**
different media, **1** of them off-site. This guide shows how to implement it in the homelab with
built-in tools — at the VM level with Proxmox **vzdump**, at the application level with
**restic**, and off-site, encrypted, via **rclone-crypt**.

## Architecture

```
Live data (ZFS pool)                                     ── copy 1
   │
   ├── vzdump (weekly) ──▶ separate ZFS mirror           ── copy 2 (different medium)
   │                          (its own disks!)
   │
   └── restic (daily) ──▶ rclone-crypt ──▶ cloud         ── copy 3 (off-site, encrypted)
                                  │
                     restore test (monthly, automatic)
                                  │
                        alert email on every failure
```

The two levels complement each other: vzdump backs up entire VMs/containers as images — perfect
for "machine broken, back in 10 minutes". restic backs up the actual application data granularly
and with versions — perfect for "a file from three days ago" and for the off-site route, because
only the payload data is transferred instead of whole images.

## 1. Level 1: vzdump to a separate pool

The most important point first: the backup target belongs on **its own physical disks**, not on
the pool it's meant to protect. A ZFS mirror made of two disks is perfectly sufficient in a
homelab.

In Proxmox, create a job under *Datacenter → Backup* — or directly as configuration:

```
# /etc/pve/jobs.cfg
vzdump: backup-weekly
    schedule sun 02:00
    storage vm-backup
    mode snapshot
    compress zstd
    prune-backups keep-last=4
    notes-template {{guestname}}
```

`mode snapshot` backs up without downtime, `keep-last=4` keeps a month of history at the VM
level. That's all this level needs — restic handles the fine-grained work.

## 2. Level 2: restic off-site via rclone-crypt

restic encrypts every backup on the client side — the cloud provider only sees garbage data.
rclone-crypt adds a second layer on top and additionally obscures the **file names**.

```bash
# rclone: first the cloud remote, then a crypt remote on top of it
rclone config   # 1) "gdrive" (or S3, B2, ...)  2) "offsite-crypt" of type crypt

# initialize the restic repository
export RESTIC_PASSWORD_FILE=/root/.restic-pass   # chmod 600, NOT in the repo!
restic -r rclone:offsite-crypt:backups init
```

The actual backup as a script (`/usr/local/bin/restic-backup.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail
export RESTIC_REPOSITORY="rclone:offsite-crypt:backups"
export RESTIC_PASSWORD_FILE="/root/.restic-pass"

restic backup /opt/app/data --tag app
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

Plus a systemd timer (daily, at night) instead of cron — for clean logging and `OnFailure`:

```ini
# /etc/systemd/system/restic-backup.service
[Unit]
Description=restic off-site backup
OnFailure=backup-alert@%n.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/restic-backup.sh
```

## 3. Automating restore tests

The part almost everyone skips — and the only one that counts. A monthly timer actually restores
the backup and checks the data:

```bash
#!/usr/bin/env bash
# /usr/local/bin/restic-restore-test.sh
set -euo pipefail
export RESTIC_REPOSITORY="rclone:offsite-crypt:backups"
export RESTIC_PASSWORD_FILE="/root/.restic-pass"

# 1) Repository integrity, including a sample of the actual data blocks
restic check --read-data-subset=5%

# 2) A real restore into a throwaway directory
TARGET=$(mktemp -d)
trap 'rm -rf "$TARGET"' EXIT
restic restore latest --target "$TARGET"

# 3) An application check instead of just "the files are there" —
#    e.g. for SQLite-based services:
sqlite3 "$TARGET/opt/app/data/db.sqlite3" 'PRAGMA integrity_check;' | grep -q ok
```

If any step fails, `set -euo pipefail` aborts and systemd fires `OnFailure`.

## 4. Alerting: failures must not be silent

A backup that has been failing silently for three months is worse than none at all — it lulls you
into a false sense of security. A template unit sends an email on every failure (msmtp as a lean
sendmail replacement):

```ini
# /etc/systemd/system/backup-alert@.service
[Unit]
Description=Alert email on backup failure (%i)

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'printf "Subject: [BACKUP-FAIL] %i\n\njournalctl -u %i -n 50:\n%s\n" \
  "$(journalctl -u %i -n 50 --no-pager)" | msmtp admin@example.com'
```

## 5. Checking the concept against the 3-2-1 rule

| Rule | Implementation |
|---|---|
| **3 copies** | Live data + vzdump image + restic repository |
| **2 media** | Data pool and a separate backup mirror (its own disks) |
| **1 off-site** | restic via rclone-crypt in the cloud, encrypted on the client side |
| *Bonus: tested* | Monthly automatic restore test with an application check |
| *Bonus: monitored* | Alert email on every failed backup or restore test |

## Learnings from operation

- **The first real restore test finds errors.** In my case: a path that was missing from the
  backup script, and a database that passed as "healthy" without `--read-data`.
- **Think about retention on both sides:** vzdump coarse (weeks), restic fine (days to months).
  With only one level, you lose either granularity or history.
- **Password files belong in the password manager** (and on paper in a safe place) — a restic repo
  without its password is irretrievably lost. That's a feature, not a bug.
- **Off-site means: a different failure risk.** Cloud storage with rclone-crypt is the pragmatic
  route in a homelab — the data is just as protected from the provider as from a lightning strike
  in your own basement.
