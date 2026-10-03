---
title: "Stolperstein: Nach dem Reboot lieferte jede Domain 404"
description: "Ein Kernel-Update, ein Neustart des Proxmox-Hosts und danach waren alle meine Dienste von außen weg, obwohl jeder Container lief. Schuld war die Reihenfolge, in der sie gestartet sind."
date: 2026-09-24
tags:
  - stolperstein
  - proxmox
  - traefik
  - pangolin
  - dns
  - homelab
draft: true
---

> **Stolpersteine** sind kurze Posts über Fehler, die mich Zeit gekostet haben — mit Ursache
> und Lösung, damit sie anderen nicht dieselbe Zeit kosten.

## Was passiert ist

Routinearbeit: Kernel-Update auf meinem Proxmox-Host, Neustart. Alle Container kamen
hoch, Proxmox meldete jeden als „running". Trotzdem lieferte danach **jede** meiner Domains
von außen nur noch `404 Not Found`.

Die Dienste selbst liefen. Der Reverse-Proxy lief auch. Nur kamen die Anfragen nirgendwo
mehr an.

## Die Ursache

Mein Zugang von außen läuft über **Pangolin**, und darin arbeitet **Traefik** als
Reverse-Proxy. Pangolin bindet seine Authentifizierung als Traefik-Plugin namens `badger`
ein. Jede Route, die von außen erreichbar ist, läuft durch diese Middleware.

Traefik lädt seine Plugins beim Start aus dem Internet nach. Dafür braucht es DNS, und DNS
kommt in meinem Netz von **AdGuard Home**, das in einem anderen Container auf demselben
Host läuft. Ohne festgelegte Startreihenfolge war Traefik schneller:

```text
lookup plugins.traefik.io ... server misbehaving
Plugins are disabled because an error has occurred
invalid middleware "badger@http"
```

Der Ablauf war also:

1. Traefik startet, bevor AdGuard DNS-Anfragen beantwortet.
2. Der Plugin-Download scheitert, Traefik schaltet daraufhin **alle** Plugins ab.
3. Jede Route, die `badger` verwendet, ist damit ungültig und wird verworfen.
4. Traefik läuft ohne diese Routen weiter und versucht es **nicht** erneut.

Ergebnis: Ein laufender Proxy ohne eine einzige gültige Route, also 404 für alles.

Im Nachhinein ist mir ein Detail daran sogar sympathisch: Traefik hat die Routen ohne
Authentifizierung **verworfen**, statt sie ungeschützt auszuliefern. Lieber alles offline
als alles offen.

## Die Lösung

Akut reichte ein Neustart von Traefik, sobald DNS wieder lief. Danach muss im Log
`Plugins loaded.` stehen.

Dauerhaft habe ich in Proxmox eine Startreihenfolge festgelegt: erst DNS, dann der
Identity-Provider (Authentik), zuletzt der Container mit Pangolin und Traefik.

```bash
pct set <adguard-id>   --startup order=1,up=15
pct set <authentik-id> --startup order=2
pct set <pangolin-id>  --startup order=3
```

`up=15` lässt Proxmox nach dem Start von AdGuard 15 Sekunden warten, bevor der nächste
Container drankommt. Das ist großzügig bemessen, denn AdGuard braucht nach einem Neustart
ein paar Sekunden, bis es wieder auf Port 53 antwortet.

Nach jedem Neustart des Hosts prüfe ich außerdem einmal von außen, ob eine geschützte
Domain mit einer Weiterleitung zum Login antwortet (HTTP `302`) und nicht mit `404`.

## Was ich mitnehme

- **„Läuft" heißt nicht „funktioniert".** Alle Container waren grün, der Dienst trotzdem tot.
  Ein Test von außen nach jedem Neustart ist Pflicht.
- **Abhängigkeiten beim Booten sind unsichtbar, bis sie reißen.** Dass mein Proxy beim Start
  DNS braucht, stand nirgends, bis der erste Neustart ohne festgelegte Reihenfolge kam.
- **Eine Startreihenfolge ist besser als keine, aber kein Health-Check.** `up=15` ist eine
  Wartezeit, keine Garantie. Robuster wäre, wenn Traefik den Plugin-Download wiederholen
  würde, oder ein Check, der nach dem Boot nachhilft.
