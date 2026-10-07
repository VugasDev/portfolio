---
title: 'Stolperstein: Ein Jellyfin-Update, und die Apps finden den Server nicht mehr'
description: 'Im Browser lief Jellyfin einwandfrei, die Apps auf Handy und Tablet scheiterten von unterwegs. Ein Update hatte zwei Einstellungen hinter dem Reverse-Proxy zurückgesetzt, und Jellyfin verriet den Apps seine interne Adresse.'
date: 2026-07-09
tags:
  - stolperstein
  - jellyfin
  - reverse-proxy
  - homelab
draft: false
---

> **Stolpersteine** sind kurze Posts über Fehler, die mich Zeit gekostet haben — mit Ursache
> und Lösung, damit sie anderen nicht dieselbe Zeit kosten.

## Was passiert ist

Mein Jellyfin ist von außen über einen Reverse-Proxy erreichbar: Pangolin nimmt die Anfrage an,
Traefik reicht sie im Server-Netz an den Jellyfin-Container weiter. Nach einem Update sah zunächst
alles normal aus. Der Web-Client im Browser funktionierte von überall.

Die **nativen Apps** auf iOS, iPad und Android dagegen scheiterten außerhalb des Heimnetzes: Login
oder Wiedergabe brachen ab. Zu Hause im WLAN lief alles.

## Die Ursache

Jellyfin teilt seinen Clients mit, unter welcher Adresse der Server erreichbar ist. Der
Web-Client braucht das nicht, er arbeitet mit relativen Pfaden und bleibt einfach auf der Domain,
über die er geladen wurde. Die Apps dagegen übernehmen die gemeldete Adresse und verbinden sich
danach dorthin.

Hinter einem Reverse-Proxy kann Jellyfin diese Adresse nur richtig bestimmen, wenn zwei
Einstellungen in der `network.xml` stimmen:

- **`EnablePublishedServerUriByRequest`** sorgt dafür, dass Jellyfin die gemeldete Adresse aus
  der Anfrage ableitet, also aus der öffentlichen Domain, über die der Client kam.
- **`KnownProxies`** nennt die IP des Proxys. Nur Anfragen von dort darf Jellyfin glauben, wenn
  sie per `X-Forwarded-*`-Header die ursprüngliche Domain und das Protokoll mitliefern.

Das Update hatte beide Einstellungen zurückgesetzt. Jellyfin meldete den Apps deshalb seine
**interne Adresse** im Server-Netz, so etwas wie `http://10.0.10.20:8096`. Im Heimnetz ist die
erreichbar, unterwegs natürlich nicht.

## Die Lösung

Beide Werte wieder setzen, und zwar in der Konfigurationsdatei statt nur in der Oberfläche, damit
man sie sichern und vergleichen kann:

```xml
<!-- config/network.xml -->
<EnablePublishedServerUriByRequest>true</EnablePublishedServerUriByRequest>
<KnownProxies>
  <string>10.0.10.5</string>  <!-- IP des Reverse-Proxys im Server-Netz -->
</KnownProxies>
```

Vor der Änderung habe ich eine Kopie der Datei angelegt (`network.xml.bak-…`), danach den
Container neu gestartet. Seitdem melden sich die Apps wieder über die öffentliche Domain.

Beim nächsten großen Update, dem Sprung auf Jellyfin 12 im September, habe ich die
`network.xml` deshalb gezielt geprüft, statt anzunehmen, dass sie noch stimmt. Diesmal hatte sie
das Update unverändert überstanden.

## Was ich mitnehme

- **„Im Browser geht's“ ist kein vollständiger Test.** Web-Clients und native Apps reden
  unterschiedlich mit dem Server. Nach einem Update hinter einem Proxy immer auch eine App von
  außerhalb testen.
- **Eine Anwendung hinter einem Proxy muss wissen, dass sie hinter einem Proxy steht.** Sonst
  meldet sie Adressen und Protokolle, die nur von innen stimmen.
- **Einstellungen, die ein Update überschreiben kann, gehören auf die Checkliste.** Wer sie
  nach jedem Update kurz prüft, findet den Fehler in einer Minute statt nach der ersten
  Beschwerde.
