---
title: Eigene Google-OAuth-App für rclone — ohne 7-Tage-Token und Rate-Limit
description: Warum rclone mit Google Drive eine eigene OAuth-App braucht, welcher Scope der richtige ist, warum „Testing“ nach sieben Tagen das Backup stoppt und wie man das Token auf einem Server ohne Browser holt.
date: 2026-10-04
difficulty: Fortgeschritten
tags:
  - rclone
  - google-drive
  - oauth
  - backup
  - security
series: ''
order: null
draft: false
---

> **Hinweis:** Client-ID, Client-Secret und Token in diesem Guide sind Platzhalter. Alle drei
> gehören in den Passwort-Manager und in eine `rclone.conf` mit Rechten `0600`, nie in ein
> Git-Repo, nie in einen Chat und möglichst nie in die Kommandozeile.

Mein Offsite-Backup läuft über **rclone** nach Google Drive: zuerst für Vaultwarden, später auch
für den Abgleich meines Obsidian-Vaults. Zweimal ist mir dabei die Google-Seite auf die Füße
gefallen, und beide Male lag es nicht an rclone, sondern an der **OAuth-App** dahinter. Dieser
Guide zeigt, wie man sie so anlegt, dass das Backup nicht nach einer Woche stehen bleibt.

## Die zwei Vorfälle

**Mai: Das Backup stirbt am siebten Tag.** Für das Vaultwarden-Backup hatte ich eine eigene
OAuth-App angelegt, sie aber im Status *Testing* gelassen. Eine Woche lief alles, dann schlug der
nächtliche Lauf jeden Tag fehl:

```
rclone: invalid_grant: maybe token expired? - try refreshing with "rclone config reconnect gdrive:"
```

Die Ursache ist eine Google-Regel: Bei Apps im Status *Testing* verfallen die Refresh-Tokens nach
**sieben Tagen**. Ein `rclone config reconnect` hilft genau eine weitere Woche. Dauerhaft hilft nur,
die App zu veröffentlichen.

**September: Rate-Limit auf der geteilten Client-ID.** Für den neuen Vault-Abgleich hatte ich
bequemerweise die eingebaute Client-ID von rclone benutzt. Die teilen sich alle rclone-Nutzer, die
keine eigene eintragen, und entsprechend oft hängt sie im Rate-Limit. Mein restic-Backup über Drive
scheiterte an zwei Tagen in Folge. rclone warnt inzwischen zusätzlich bei jedem Aufruf, dass diese
geteilte ID im Laufe von 2026 abgeschaltet wird. Mit eigener App lief derselbe Backup-Job danach
in 14 Sekunden statt in 22 Minuten.

## 1. Projekt und Drive-API

In der [Google Cloud Console](https://console.cloud.google.com) ein eigenes Projekt anlegen,
zum Beispiel `homelab-rclone`. Dann unter *APIs & Dienste → Bibliothek* die **Google Drive API**
aktivieren. Ohne aktivierte API scheitert später jeder Zugriff mit einem 403, auch mit gültigem
Token.

## 2. Den richtigen Scope wählen

Der Scope entscheidet, was die App in deinem Drive sehen darf. Für rclone kommen zwei in Frage:

| Scope | Sieht | Folge für die Veröffentlichung |
|---|---|---|
| `drive.file` | nur Dateien, die diese App selbst angelegt hat | unkritisch, keine Prüfung durch Google |
| `drive` | das gesamte Drive | „eingeschränkter“ Scope: Branding nötig, ohne Verifizierung Warnhinweis beim Login |

**Für ein reines Backup reicht `drive.file`.** rclone legt die Dateien selbst an und braucht
nichts anderes zu sehen. Das ist auch die sicherere Wahl: Ein geleaktes Token gibt nur das
Backup-Verzeichnis preis, nicht das ganze Drive.

**Für einen Abgleich reicht er nicht.** Sobald auch andere Programme in den Ordner schreiben, bei
mir Drive for Desktop auf dem Arbeitslaptop, sieht rclone mit `drive.file` deren Dateien nicht.
Dann braucht es `drive`, und damit gelten die Regeln aus Schritt 3.

## 3. Zustimmungsbildschirm und Veröffentlichung

Die Einstellungen liegen in der Console unter *Google Auth Platform* (früher „OAuth-Zustimmungsbildschirm“):

1. **Branding:** App-Name, Support-E-Mail, Kontakt. Für den Scope `drive` zusätzlich eine
   **Startseite** und eine **Datenschutzerklärung** als öffentliche URL.
2. **Zielgruppe:** Nutzertyp *Extern*, das eigene Konto als Testnutzer eintragen.
3. **Datenzugriff:** den Scope aus Schritt 2 hinzufügen.
4. **Veröffentlichen:** unter *Zielgruppe* auf **„App veröffentlichen“**, Status danach
   *In Produktion*. Das ist der Schritt, der die 7-Tage-Grenze aufhebt.

Mit `drive.file` ist man damit fertig. Mit `drive` bleibt die App **nicht verifiziert**: Beim Login
erscheint der Hinweis „Google hat diese App nicht überprüft“, den man über *Erweitert* bestätigt.
Für den Eigengebrauch ist das in Ordnung; Google nimmt Apps mit sehr wenigen Nutzern von der
Prüfung aus. Die Tokens laufen trotzdem nicht mehr ab, weil der Status *In Produktion* ist.

Für die Datenschutz-URL habe ich keine eigene Seite gebaut, sondern meine
[Datenschutzerklärung](/datenschutz) um einen Abschnitt ergänzt: welche App das ist, dass nur ich
sie nutze, welche Daten sie abruft und dass sie weder weitergegeben noch für Werbung oder
KI-Training genutzt werden.

## 4. OAuth-Client vom Typ „Desktop“

Unter *Clients* einen neuen OAuth-Client anlegen, Anwendungstyp **Desktop-App**. Client-ID und
Client-Secret direkt in den Passwort-Manager übernehmen. Bei Desktop-Clients ist das Secret
technisch kein echtes Geheimnis, aber es gibt keinen Grund, es herumliegen zu lassen.

## 5. Token holen auf einem Server ohne Browser

rclone holt das Token über einen kurzen lokalen Webserver auf Port **53682**: Google leitet nach
dem Login dorthin zurück. Auf einem Server oder in einem Container ohne Browser geht das über
einen SSH-Tunnel, und Client-ID und Secret kommen aus Umgebungsvariablen statt aus der
Kommandozeile, damit sie nicht in der Prozessliste oder der Shell-History landen:

```bash
# Auf dem Server: Client aus dem Passwort-Manager in die Umgebung laden
# (Variablen, nicht als Argumente – sonst stehen sie in `ps` und in der History)
export RCLONE_DRIVE_CLIENT_ID="…"
export RCLONE_DRIVE_CLIENT_SECRET="…"

# Leere Konfiguration, damit nichts Bestehendes überschrieben wird
rclone --config /tmp/leer.conf authorize drive --auth-no-open-browser
```

```bash
# Auf dem eigenen Rechner: Port 53682 des Servers nach lokal durchreichen
ssh -N -L 53682:127.0.0.1:53682 benutzer@server
```

Dann die URL, die rclone ausgibt, im lokalen Browser öffnen und anmelden. rclone gibt am Ende
einen JSON-Block mit `access_token` und `refresh_token` aus. Der kommt in die `rclone.conf`:

```ini
[gdrive]
type = drive
scope = drive
client_id = …
client_secret = …
token = {"access_token":"…","refresh_token":"…","expiry":"…"}
```

Ein Crypt-Remote darüber bleibt unverändert; es verweist ja nur auf `gdrive:`. Wie das im
Backup-Konzept zusammenspielt, steht im Guide [Backups, die den Ernstfall überleben](/guides/backup-konzept-3-2-1).

## 6. Prüfen

```bash
rclone lsd gdrive:                 # Zugriff klappt
rclone about gdrive:               # Kontingent wird angezeigt
```

Bleibt die Warnung zur geteilten Client-ID aus und läuft der nächste Backup-Lauf durch, ist die
Umstellung fertig. Den eigentlichen Test liefert allerdings erst Tag acht: Läuft das Backup dann
noch, ist die 7-Tage-Falle sicher umgangen.

## Learnings

- **„Testing“ ist kein harmloser Zwischenstand.** Es ist eine Zeitbombe mit sieben Tagen Zünder,
  und sie geht nachts im Backup-Job hoch, nicht beim Einrichten.
- **Geteilte Zugangsdaten teilen auch die Limits.** Die eingebaute Client-ID ist zum Ausprobieren
  gedacht, nicht für Jobs, auf die man sich verlässt.
- **Den kleinsten Scope nehmen, der funktioniert.** `drive.file` für Backups, `drive` nur, wenn
  rclone fremde Dateien sehen muss.
- **Secrets nicht in die Kommandozeile.** Umgebungsvariablen statt Argumente, und den Ablauf zum
  Erneuern des Tokens aufschreiben, solange man ihn noch im Kopf hat. Er wird gebraucht, wenn man
  ihn am wenigsten erwartet.
