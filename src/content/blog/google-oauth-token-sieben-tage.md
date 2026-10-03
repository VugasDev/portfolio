---
title: "Stolperstein: Mein Backup lief genau sieben Tage"
description: "Ein Google-OAuth-Client im Modus „Testing“ verliert seine Tokens nach einer Woche. Wie mich das zweimal erwischt hat und warum meine Website jetzt eine Datenschutzerklärung für meine eigene Backup-App hat."
date: 2026-09-27
tags:
  - stolperstein
  - google-drive
  - rclone
  - backup
  - homelab
draft: false
---

> **Stolpersteine** sind kurze Posts über Fehler, die mich Zeit gekostet haben — mit Ursache
> und Lösung, damit sie anderen nicht dieselbe Zeit kosten.

## Teil 1: Das Backup, das nach einer Woche aufgab

Mein Passwort-Manager (Vaultwarden) sichert sich jede Nacht selbst: Container kurz stoppen,
**restic** zieht einen verschlüsselten Snapshot, der über **rclone** in Google Drive landet,
Container wieder starten. Fällt der Job aus, schickt mir systemd per `OnFailure` eine Mail
mit den letzten Log-Zeilen.

Eine Woche lang lief alles. Ab dem siebten Tag kam jeden Morgen dieselbe Mail:

```text
rclone: invalid_grant: maybe token expired?
  - try refreshing with "rclone config reconnect gdrive:"
```

Die gute Nachricht stand im selben Log: Vaultwarden war trotzdem jedes Mal sauber wieder
hochgefahren. Das Skript startet den Container per `trap` auch dann neu, wenn der Backup-Teil
scheitert. Die Daten waren also sicher, nur das Offsite-Backup fehlte.

**Die Ursache:** Mein OAuth-Client in der Google Cloud Console stand noch im
Veröffentlichungsstatus **„Testing“**. Für solche Apps lässt Google ausgestellte
Refresh-Tokens nach **sieben Tagen** verfallen. Das ist Absicht und kein Bug: Testing-Apps
sollen nicht dauerhaft auf Nutzerdaten zugreifen.

Kurzfristig hilft `rclone config reconnect gdrive:` mit einem neuen Browser-Login. Das
verschiebt das Problem aber nur um eine Woche. Die eigentliche Lösung war ein Klick: Ich
habe die App, ein eigenes Google-Cloud-Projekt nur für dieses Backup, in der Console auf
**„In production“** gestellt. Damit gilt die Sieben-Tage-Grenze nicht mehr.

## Teil 2: Die geteilte Client-ID

Im September kam das Thema wieder hoch, diesmal von der anderen Seite, und diesmal kannte
ich die Falle schon. Meine Synchronisations- und Backup-Jobs auf dem Homelab-Host nutzten
bis dahin die **eingebaute Client-ID von rclone**, die sich alle rclone-Nutzer teilen.
rclone warnte schon länger bei jedem Aufruf, dass diese ID im Lauf von 2026 abgeschaltet
wird. Dann lief sie in ein akutes Rate-Limit, und die Jobs krochen nur noch.

Die Lösung war klar: eine **eigene OAuth-App**, diesmal von Anfang an auf „In production“.
Neu war nur eine Hürde: Anders als die Backup-App braucht diese vollen Zugriff auf Google
Drive, und dafür verlangt Google zum Veröffentlichen ein Branding, also eine Startseite und
eine Datenschutzerklärung. Deshalb hat diese Website seit Ende September in der
Datenschutzerklärung einen eigenen Abschnitt zu meiner privaten Google-Drive-App.

Eine Prüfung durch Google war nicht nötig. Bei einer App für den Eigengebrauch ist die
Verifizierung nicht erforderlich. Beim Login erscheint dafür der Hinweis „nicht verifizierte
App“, den ich einmal bestätige.

Danach: Client-ID und Secret in den Passwort-Manager, rclone auf beiden Hosts neu
autorisiert, alle Jobs getestet. Ein Backup-Lauf, der mit der geteilten ID **22 Minuten**
gebraucht hatte, war mit der eigenen App nach **14 Sekunden** durch.

## Was ich mitnehme

- **„Testing“ heißt sieben Tage.** Wer einen OAuth-Client für einen Dienst baut, der
  unbeaufsichtigt läuft, sollte ihn direkt auf „In production“ stellen.
- **Geteilte Zugangsdaten sind geliehen.** Eine Client-ID, die sich tausende Nutzer teilen,
  kann jederzeit gedrosselt oder abgeschaltet werden.
- **Ein Backup-Job braucht einen Alarm.** Ohne die Fehler-Mail wäre mir der stille Ausfall
  erst beim nächsten Restore-Test aufgefallen — oder im Ernstfall.
