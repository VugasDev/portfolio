---
title: Backups, die den Ernstfall überleben — 3-2-1 im Homelab
description: Ein Backup-Konzept nach der 3-2-1-Regel mit Proxmox vzdump, restic und rclone-crypt — inklusive automatisierter Restore-Tests und Alert-Mails. Denn ungetestete Backups sind nur Hoffnung.
date: 2026-06-05
difficulty: Fortgeschritten
tags:
  - backup
  - restic
  - proxmox
  - self-hosting
series: ''
order: null
---

> **Die unbequeme Wahrheit:** Ein Backup, dessen Restore nie durchgespielt wurde, ist kein
> Backup — es ist Hoffnung mit Zeitstempel. Dieser Guide baut deshalb den Restore-Test von
> Anfang an als festen Bestandteil ein, nicht als "irgendwann mal".

Die **3-2-1-Regel** ist der Klassiker unter den Backup-Strategien: **3** Kopien der Daten, auf
**2** verschiedenen Medien, davon **1** außer Haus. Dieser Guide zeigt, wie sich das im Homelab
mit Bordmitteln umsetzen lässt — auf VM-Ebene mit Proxmox **vzdump**, auf Applikations-Ebene mit
**restic**, offsite verschlüsselt über **rclone-crypt**.

## Architektur

```
Live-Daten (ZFS-Pool)                                    ── Kopie 1
   │
   ├── vzdump (wöchentlich) ──▶ separater ZFS-Mirror     ── Kopie 2 (anderes Medium)
   │                              (eigene Platten!)
   │
   └── restic (täglich) ──▶ rclone-crypt ──▶ Cloud       ── Kopie 3 (offsite, verschlüsselt)
                                  │
                     Restore-Test (monatlich, automatisch)
                                  │
                        Alert-Mail bei jedem Fehler
```

Die beiden Ebenen ergänzen sich: vzdump sichert ganze VMs/Container als Image — perfekt für
"Maschine kaputt, in 10 Minuten zurück". restic sichert die eigentlichen Applikationsdaten
granular und versioniert — perfekt für "eine Datei von vor drei Tagen" und für den Offsite-Weg,
weil nur die Nutzdaten statt ganzer Images übertragen werden.

## 1. Ebene 1: vzdump auf einen separaten Pool

Wichtigster Punkt zuerst: Das Backup-Ziel gehört auf **eigene physische Platten**, nicht auf den
Pool, den es absichern soll. Ein ZFS-Mirror aus zwei Platten reicht im Homelab völlig.

In Proxmox unter *Datacenter → Backup* einen Job anlegen — oder direkt als Konfiguration:

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

`mode snapshot` sichert ohne Downtime, `keep-last=4` hält einen Monat Historie auf VM-Ebene.
Mehr braucht diese Ebene nicht — die Feinarbeit übernimmt restic.

## 2. Ebene 2: restic offsite via rclone-crypt

restic verschlüsselt jedes Backup client-seitig — der Cloud-Anbieter sieht nur Datenmüll.
rclone-crypt legt eine zweite Schicht darüber und verschleiert zusätzlich die **Dateinamen**.

```bash
# rclone: erst das Cloud-Remote, dann ein crypt-Remote darüber
rclone config   # 1) "gdrive" (oder S3, B2, ...)  2) "offsite-crypt" vom Typ crypt

# restic-Repository initialisieren
export RESTIC_PASSWORD_FILE=/root/.restic-pass   # chmod 600, NICHT im Repo!
restic -r rclone:offsite-crypt:backups init
```

Das eigentliche Backup als Skript (`/usr/local/bin/restic-backup.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail
export RESTIC_REPOSITORY="rclone:offsite-crypt:backups"
export RESTIC_PASSWORD_FILE="/root/.restic-pass"

restic backup /opt/app/data --tag app
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

Dazu ein systemd-Timer (täglich, nachts) statt Cron — wegen sauberem Logging und `OnFailure`:

```ini
# /etc/systemd/system/restic-backup.service
[Unit]
Description=restic Offsite-Backup
OnFailure=backup-alert@%n.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/restic-backup.sh
```

## 3. Restore-Tests automatisieren

Der Teil, den fast alle überspringen — und der einzige, der zählt. Ein monatlicher Timer spielt
das Backup wirklich zurück und prüft die Daten:

```bash
#!/usr/bin/env bash
# /usr/local/bin/restic-restore-test.sh
set -euo pipefail
export RESTIC_REPOSITORY="rclone:offsite-crypt:backups"
export RESTIC_PASSWORD_FILE="/root/.restic-pass"

# 1) Repository-Integrität, inkl. Stichprobe der echten Datenblöcke
restic check --read-data-subset=5%

# 2) Echter Restore in ein Wegwerf-Verzeichnis
TARGET=$(mktemp -d)
trap 'rm -rf "$TARGET"' EXIT
restic restore latest --target "$TARGET"

# 3) Applikations-Check statt nur "Dateien sind da" —
#    z. B. bei SQLite-basierten Diensten:
sqlite3 "$TARGET/opt/app/data/db.sqlite3" 'PRAGMA integrity_check;' | grep -q ok
```

Schlägt irgendein Schritt fehl, bricht `set -euo pipefail` ab und systemd feuert `OnFailure`.

## 4. Alerting: Fehler dürfen nicht leise sein

Ein Backup, das seit drei Monaten still fehlschlägt, ist schlimmer als gar keins — man wiegt
sich in Sicherheit. Eine Template-Unit verschickt bei jedem Fehlschlag eine Mail (msmtp als
schlanker Sendmail-Ersatz):

```ini
# /etc/systemd/system/backup-alert@.service
[Unit]
Description=Alert-Mail bei Backup-Fehler (%i)

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'printf "Subject: [BACKUP-FAIL] %i\n\njournalctl -u %i -n 50:\n%s\n" \
  "$(journalctl -u %i -n 50 --no-pager)" | msmtp admin@example.com'
```

## 5. Das Konzept gegen die 3-2-1-Regel geprüft

| Regel | Umsetzung |
|---|---|
| **3 Kopien** | Live-Daten + vzdump-Image + restic-Repository |
| **2 Medien** | Daten-Pool und separater Backup-Mirror (eigene Platten) |
| **1 offsite** | restic via rclone-crypt in der Cloud, client-seitig verschlüsselt |
| *Bonus: getestet* | Monatlicher automatischer Restore-Test mit Applikations-Check |
| *Bonus: überwacht* | Alert-Mail bei jedem fehlgeschlagenen Backup oder Restore-Test |

## Learnings aus dem Betrieb

- **Der erste echte Restore-Test findet Fehler.** Bei mir: ein Pfad, der im Backup-Skript
  fehlte, und eine Datenbank, die ohne `--read-data` als "gesund" durchging.
- **Retention beidseitig denken:** vzdump grob (Wochen), restic fein (Tage bis Monate). Wer
  nur eine Ebene hat, verliert entweder Granularität oder Geschichte.
- **Passwort-Dateien gehören in den Passwort-Manager** (und auf Papier an einen sicheren Ort) —
  ein restic-Repo ohne Passwort ist unwiederbringlich verloren. Das ist Feature, nicht Bug.
- **Offsite heißt: anderes Ausfallrisiko.** Cloud-Speicher mit rclone-crypt ist im Homelab der
  pragmatische Weg — die Daten sind vor dem Anbieter genauso geschützt wie vor dem Blitzschlag
  im eigenen Keller.
