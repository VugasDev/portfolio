---
title: "CCNA-Lernplattform im Homelab: Deployment und ein Cookie, das nicht bleiben wollte"
description: Wie ich meine selbstgebaute Next.js-Lernplattform als LXC auf Proxmox deployt habe — und warum der Login danach trotzdem erst einmal nicht funktionierte.
date: 2026-06-12
tags:
  - homelab
  - proxmox
  - nextjs
  - deployment
  - debugging
draft: true
---

Für meine CCNA-Prüfungsvorbereitung habe ich mir eine eigene Lernplattform gebaut:
Next.js 15, Prisma mit SQLite, ein Fragenkatalog mit gut 160 Übungsfragen inklusive
Exhibits, Prüfungsmodus und Statistiken. Bisher lief das nur lokal in der Dev-Umgebung.
Zeit, das Ding richtig zu deployen — auf meinen Proxmox-Host, wo ohnehin schon meine
anderen Dienste als Container laufen.

## Das Deployment-Muster wiederverwenden

Statt mir etwas Neues auszudenken, habe ich das Muster meiner bestehenden Container
übernommen: ein unprivilegierter LXC mit Debian 12, eigene IP im Server-VLAN,
Autostart, Storage auf dem ZFS-Pool. Mit KI-Unterstützung habe ich vorher kurz
gegengeprüft, welche IPs im Segment schon vergeben sind und wie die bestehenden
Container konfiguriert sind — so bleibt das Setup konsistent, und die Doku stimmt
weiter mit der Realität überein.

Der eigentliche Deploy war dann unspektakulär, und genau so soll es sein:

1. Node 22 aus den NodeSource-Paketen in den Container
2. Projekt als Tarball rüber (ohne `node_modules` und `.next` — die werden im Ziel gebaut)
3. `npm ci`, `prisma db push`, Seed mit dem Fragenimport
4. Production-Build und eine kleine systemd-Unit mit `Restart=on-failure`

Der Seed lief sauber durch, alle Fragen importiert, die App antwortete mit HTTP 200.
Haken dran — dachte ich.

## „Ich kann mich nicht einloggen"

Beim ersten echten Test im Browser: Login-Formular ausgefüllt, abgeschickt — und ich
lande wieder auf der Login-Seite. Keine Fehlermeldung, kein Crash, einfach keine Session.

Der Reflex wäre gewesen, am Passwort oder am Seed zu zweifeln und auf Verdacht Dinge
zu ändern. Stattdessen habe ich das Problem erst einmal außerhalb des Browsers
reproduziert und mit der KI den Auth-Code durchgesehen. Ein `curl` direkt gegen die
Login-API brachte die Antwort in einer einzigen Zeile:

```
HTTP/1.1 200 OK
set-cookie: session=…; Path=/; Secure; HttpOnly; SameSite=lax
```

Der Login funktionierte serverseitig einwandfrei. Aber das Session-Cookie kam mit dem
`Secure`-Flag — und ich griff zu dem Zeitpunkt noch per blankem HTTP über die interne
IP zu. Browser speichern `Secure`-Cookies grundsätzlich nur über HTTPS. Der Server
legte die Session also korrekt an, der Browser warf das Cookie kommentarlos weg, und
beim nächsten Request war ich wieder anonym.

Die Ursache stand in meinem eigenen Code: Das Flag hing an `NODE_ENV === "production"`.
Eine Annahme, die in Produktion hinter einem TLS-terminierenden Proxy völlig richtig
ist — aber eben implizit voraussetzt, dass „Produktion" immer auch „HTTPS" bedeutet.

## Der Fix: sicherer Default, expliziter Ausweg

Das `Secure`-Flag einfach hart abzuschalten wäre die falsche Lösung gewesen — die
Plattform sollte ja kurz darauf ohnehin über eine eigene Subdomain mit TLS erreichbar
sein. Ich habe das Verhalten stattdessen per Umgebungsvariable übersteuerbar gemacht:
Der Default bleibt `Secure` in Produktion, nur für die HTTP-Übergangsphase habe ich
den Override im Container gesetzt.

```ts
secure:
  process.env.NODE_ENV === "production" &&
  process.env.SECURE_COOKIES !== "false",
```

Nachdem die Subdomain mit TLS stand, flog der Override wieder raus, und ich habe per
`curl` verifiziert, dass das Cookie jetzt wieder mit `Secure`-Flag ausgeliefert wird.
Netter Nebeneffekt dieser Reihenfolge: Der interne Zugriff per HTTP funktioniert für
Logins jetzt bewusst nicht mehr — es gibt genau einen sauberen Weg auf die Plattform.

## Was ich mitnehme

- **Erst Beweis, dann Fix.** Ein einziger gezielter `curl` hat das Problem eindeutig
  eingegrenzt, bevor ich irgendetwas angefasst habe. Ohne den Blick auf den
  `Set-Cookie`-Header hätte ich vermutlich erst Passwort und Seed verdächtigt — beides
  war unschuldig.
- **`NODE_ENV=production` ist kein Synonym für HTTPS.** Wer Cookie-Flags daran koppelt,
  baut eine versteckte Annahme ein, die genau dann zuschlägt, wenn man „mal eben kurz"
  ohne TLS testet.
- **Overrides explizit und temporär halten.** Der unsichere Modus war eine bewusste,
  dokumentierte Ausnahme mit Ablaufdatum — nicht der neue Normalzustand.
- **Deployment-Muster zahlen sich aus.** Weil alle Container demselben Schema folgen,
  war der neue Dienst in unter einer Stunde produktiv — inklusive Debugging.
