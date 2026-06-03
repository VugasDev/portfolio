---
title: Passwort-Manager im eigenen Keller — Vaultwarden self-hosted
description: Vaultwarden statt Cloud-Passwortmanager — mit Reverse-Proxy, fail2ban und verschlüsseltem restic-Backup. Und warum ich den Tunnel-Container wieder rausgeworfen habe.
date: 2026-04-25
tags:
  - vaultwarden
  - security
  - docker
  - backup
  - self-hosting
---

Passwörter sind das eine Geheimnis, das ich nicht bei einem Drittanbieter liegen haben wollte.
Also läuft mein Passwort-Manager jetzt selbst gehostet: **Vaultwarden**, die schlanke
Rust-Reimplementierung des Bitwarden-Servers. Bitwarden-Clients (Browser, Mobil, CLI) reden
ganz normal mit ihm, aber der Tresor liegt auf meiner Hardware.

## Der Stack

Bewusst minimal gehalten:

- **Vaultwarden** im Docker-Container, Daten auf einem persistenten Volume
- **Reverse-Proxy** mit automatischem TLS davor — der Container selbst spricht nur HTTP intern
- **fail2ban**, das die Vaultwarden-Logs auf fehlgeschlagene Logins beobachtet und IPs sperrt
- **restic**-Backup, verschlüsselt, auf externen Cloud-Speicher

```
Client ──TLS──▶ Reverse-Proxy ──HTTP──▶ Vaultwarden ──▶ Volume
                                              │
                                         restic (verschlüsselt) ──▶ Offsite
```

## fail2ban gegen Brute-Force

Ein öffentlich erreichbarer Login ist ein Brute-Force-Magnet. Vaultwarden schreibt
fehlgeschlagene Anmeldungen ins Log; ein passender fail2ban-Filter greift das ab und bannt die
Quell-IP nach wenigen Versuchen auf Firewall-Ebene. Wichtig dabei: dem Proxy beibringen, die
**echte** Client-IP durchzureichen (`X-Forwarded-For`), sonst bannt fail2ban am Ende den Proxy
selbst.

## Backups, die man auch zurückspielen kann

Ein Passwort-Tresor ohne getestetes Restore ist ein Single Point of Failure mit Extra-Schritten.
Mein restic-Repo ist verschlüsselt, läuft per Timer und wird offsite gespiegelt. Der Teil, den
die meisten überspringen: das **Restore** einmal echt durchzuspielen — leeres Volume, Backup
zurück, einloggen. Erst dann ist es ein Backup und keine Hoffnung.

## Warum der Tunnel-Container wieder rausflog

In der ersten Version hatte ich einen separaten Tunnel-Container vor Vaultwarden gehängt, um den
Dienst von unterwegs zu erreichen. Nachdem mein Netzwerk-Setup einen sauberen Reverse-Proxy mit
Wildcard-Zertifikat bekommen hatte, war diese zweite Schicht nur noch Ballast: ein weiterer
Container, ein weiterer Failure-Point, mehr Latenz. Also raus damit — Vaultwarden hängt jetzt
direkt am zentralen Reverse-Proxy, der TLS terminiert und sauber routet.

> **Lektion:** Jede zusätzliche Schicht „für den Fernzugriff" muss sich rechtfertigen. Sobald die
> Kern-Infrastruktur den Job ohnehin erledigt, ist die Sonderlösung nur noch technische Schuld.

## Fazit

Ein selbst gehosteter Passwort-Manager ist kein Wochenend-Hack, den man laufen lässt und
vergisst — er ist genau der Dienst, bei dem Härtung, Monitoring und ein erprobtes Backup nicht
optional sind. Aber das Gefühl, dass die wichtigsten Geheimnisse auf der eigenen Hardware liegen,
ist den Aufwand wert.
