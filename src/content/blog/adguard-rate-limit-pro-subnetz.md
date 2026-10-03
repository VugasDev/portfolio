---
title: "Stolperstein: Ein AdGuard-Rate-Limit für ein ganzes VLAN"
description: "Ich wollte meinen DNS-Server gegen Missbrauch härten und habe dabei allen Geräten eines Netzes einen gemeinsamen Topf von 30 Anfragen pro Sekunde verpasst. Das Ergebnis: WLAN ja, Internet nein."
date: 2026-05-21
tags:
  - stolperstein
  - adguard
  - dns
  - homelab
draft: true
---

> **Stolpersteine** sind kurze Posts über Fehler, die mich Zeit gekostet haben — mit Ursache
> und Lösung, damit sie anderen nicht dieselbe Zeit kosten.

## Was passiert ist

Mein DNS läuft netzweit über **AdGuard Home**, und über DNS-over-HTTPS (DoH) ist er auch
von unterwegs erreichbar. Beim Härten dieses Zugangs wollte ich Missbrauch vorbeugen und habe
in der `AdGuardHome.yaml` ein Rate-Limit gesetzt:

```yaml
dns:
  ratelimit: 30
  ratelimit_subnet_len_ipv4: 24
```

Klingt vernünftig: höchstens 30 Anfragen pro Sekunde, danach wird gedrosselt. Kurz darauf
ging es los: Geräte hingen im WLAN, hatten aber „kein Internet". Seiten luden endlos,
Domains ließen sich nicht auflösen. Lokale Dienste über ihre IP funktionierten dagegen
weiter.

Bemerkt habe ich es selbst, und einen Hinweis auf die Ursache gab es nirgends: AdGuard
meldete keinen Fehler, die Geräte zeigten nur „kein Internet“.

## Die Ursache

Der entscheidende Teil ist die zweite Zeile. `ratelimit_subnet_len_ipv4: 24` sagt AdGuard,
dass Clients für das Limit **nach /24-Subnetz zusammengefasst** werden. Das Limit gilt dann
nicht pro Gerät, sondern pro Netz.

In einem segmentierten Heimnetz ist ein /24 aber typischerweise ein ganzes VLAN. Alle
Clients — oder alle IoT-Geräte — teilten sich damit **einen** Topf von 30 Anfragen pro
Sekunde. Ein einziges Handy mit TikTok oder ein Streaming-Gerät beim Start schafft das
allein. Danach bekam das ganze VLAN keine Antworten mehr.

Gemein daran: AdGuard verwirft die überzähligen Anfragen **lautlos**. Im Query-Log tauchen
sie nicht als Fehler auf, die Clients laufen einfach in Timeouts. Für die Nutzer sieht das
genau so aus wie ein Ausfall der Internetleitung.

## Die Lösung

Für das interne Netz habe ich das Limit abgeschaltet:

```yaml
dns:
  ratelimit: 0
```

Die Überlegung dahinter: Die Clients im LAN sind meine eigenen Geräte, und gegen sie muss
sich der Resolver nicht verteidigen. Ein Rate-Limit gehört an die Stelle, an der fremde
Anfragen hereinkommen — also auf den öffentlichen DoH-Pfad am Reverse-Proxy, nicht auf den
DNS-Server, den das ganze Haus benutzt.

Wer das Limit in AdGuard trotzdem braucht, sollte zwei Dinge beachten:

- **Pro IP statt pro Subnetz** zählen, also die Subnetzlänge auf `32` setzen.
- **Das eigene LAN ausnehmen**, damit interne Geräte gar nicht erst gedrosselt werden.

## Was ich mitnehme

- Ein Rate-Limit ist nur so gut wie die Einheit, auf die es zählt. „30 pro Sekunde" klingt
  großzügig, bis man merkt, dass sich zwanzig Geräte die 30 teilen.
- „WLAN verbunden, aber kein Internet" bei funktionierender IP-Verbindung ist fast immer DNS.
- Schutzmaßnahmen gehören an die Grenze, an der die Bedrohung auftritt. Nach innen gerichtet
  treffen sie vor allem einen selbst.
