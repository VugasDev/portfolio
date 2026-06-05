---
title: Firewall-Audit per API — wenn die GUI lügt und pfctl die Wahrheit sagt
description: Ein vollständiges Audit meiner OPNsense-Zero-Trust-Regeln über die API. Wie ein vermeintlich kritischer DNS-Bug sich als Darstellungsartefakt entpuppte — und warum man Firewall-Regeln immer im Live-Kernel gegenprüfen muss.
date: 2026-06-04
tags:
  - opnsense
  - homelab
  - security
  - firewall
  - dns
---

Im Post zum [Netzwerk-Upgrade](/blog/netzwerk-upgrade) hatte ich es angeteasert: Aus der
VLAN-Segmentierung wurde eine echte Zero-Trust-Firewall mit Default-Deny und DNS-Hijack-Block.
Ein paar Wochen später wollte ich wissen, ob das alles noch so läuft wie gedacht — und habe ein
vollständiges Audit meiner OPNsense gefahren, mit einer KI als Zuarbeiterin am Terminal. Über die
API, nicht über die GUI. Das Ergebnis war lehrreicher als erwartet.

## Der Aufbau: API statt Klickstrecke

Die OPNsense lässt sich komplett über eine REST-API steuern. Credentials liegen in einer
`.env`, der Rest ist `curl`:

```bash
curl -sk -u "$KEY:$SEC" https://<opnsense>/api/firewall/filter/searchRule | jq
```

So konnte ich alle \~70 Filter-Regeln, die DNAT-Redirects und die NAT-Konfiguration auslesen und
gegen meine Dokumentation abgleichen. Erste Erkenntnis: Die Doku war an mehreren
Stellen veraltet — eine Regel verwies noch auf einen alten Domain-Namen, eine WireGuard-Regel
hing tot auf einem längst deaktivierten Interface herum.

## Der vermeintliche Super-GAU

Dann der Schock: Die DNAT-Regeln, die meinen DNS-Hijack-Schutz tragen, zeigten in der API
`destination_port: null` und `enabled: null`. Diese Regeln sollen erzwingen, dass jedes Gerät
— auch ein Smart-TV mit hartkodiertem `8.8.8.8` — transparent auf meinen AdGuard-Resolver
umgeleitet wird. Wenn die kaputt sind, läuft mein halbes Sicherheitskonzept ins Leere.

Erst die Gegenprüfung über einen anderen API-Endpoint (`getRule` statt `searchRule`) und ein
Blick ins rohe Config-XML brachten Entwarnung: Die Regeln sind **aktiv und korrekt**. Die
Such-API gibt schlicht bestimmte Felder nicht aus — Negationen (`!`) und Ports tauchen dort
nicht auf.

**Lektion 1:** Einer einzelnen API-Sicht nie blind vertrauen. Verschiedene Endpoints zeigen
verschiedene Teilwahrheiten.

## Die einzige Quelle der Wahrheit: pfctl

Um endgültig sicherzugehen, brauchte ich den Blick in den laufenden Paketfilter-Kernel. Und
hier wurde es interessant: Der SSH-Zugang zur OPNsense landet normalerweise im interaktiven
Menü (das berühmte „Punkt 8 für Shell"). Für Automatisierung unbrauchbar — dachte ich.

Stellt sich heraus: Das Menü erscheint **nur bei interaktivem Login**. Ein SSH-Aufruf _mit_
Kommando läuft direkt durch:

```bash
ssh root@<opnsense> '/bin/sh -c "pfctl -sr | grep vlan04"'
```

Eine kleine Stolperfalle: Die root-Shell ist `csh`, die bash-typische Umleitungen wie
`2>/dev/null` nicht versteht („Ambiguous output redirect"). Lösung: alles in `sh -c '...'`
wrappen.

Mit `pfctl -vvsr` (Regeln samt Trefferzählern), `pfctl -sn` (NAT/Redirects) und `pfctl -ss`
(State-Table) hatte ich endlich die echte Wahrheit. Und die sah anders aus als die Regelnamen
vermuten ließen.

## Die echte Überraschung: ein Regel-Reihenfolge-Rätsel

Im Live-Ruleset sah ich für das IOT-VLAN:

```plain
@141 block drop in quick on vlan04 inet from <iot-subnet> to 10.0.0.0/8       [Packets: 122]
@163 pass  in       quick on vlan04 inet ... to <adguard-ip> port = domain    [Packets: 0]
```

Mein AdGuard-Resolver liegt **innerhalb** des RFC1918-Bereichs `10.0.0.0/8`. Die
RFC1918-Isolationsregel (`block … to 10/8`) ist `quick` und steht **vor** der DNS-Erlaubnis.
Nach pf-Logik („first match wins") müsste sie jede DNS-Anfrage ans AdGuard verschlucken. Der
Zähler bestätigte: Die DNS-Erlaubnis-Regel ließ **null Pakete** durch.

Panik? Kurz. Denn mein Netz funktionierte ja nachweislich. Die Auflösung lag im DHCP: Kea
verteilt als DNS-Server nicht direkt den AdGuard, sondern die **Gateway-IP des jeweiligen VLANs**
(also die VLAN-eigene Firewall-Adresse). Die Geräte fragen ihr Gateway — also die Firewall selbst —
und der DNAT-Redirect lenkt das `:53`-Paket transparent auf den AdGuard um. Deshalb laufen die
expliziten Erlaubnis-Regeln faktisch leer, und das System funktioniert trotzdem.

Die 122 geblockten Pakete? Kein DNS, sondern korrekt isolierte IoT-Broadcasts und
Cross-VLAN-Versuche eines Smart-Home-Geräts. Genau das, was Zero-Trust wegfiltern soll.

**Lektion 2:** Eine Regel kann den richtigen Effekt haben, aber aus einem ganz anderen Grund
als ihr Name suggeriert. Ohne den Blick in die State-Table und die Trefferzähler hätte ich das
nie verstanden — und im schlimmsten Fall „repariert", was gar nicht kaputt war.

## Was tatsächlich verbessert wurde

Nach der ganzen Detektivarbeit blieben echte, saubere Änderungen übrig:

- **Vier tote/redundante Regeln entfernt** — darunter zwei, die DNS auf `any:53` erlaubten und
  damit (in der Eval-Reihenfolge vor dem Hijack-Block) den eigentlichen Schutz aushebelten.
  Jetzt ist der DNS-Hijack-Block ein _echter_ Enforcer, nicht nur dekorativ.
- **DMZ-Isolation nachgezogen:** Das (noch leere) DMZ-VLAN hatte keine RFC1918-Blocks. Proaktiv
  ergänzt, damit ein künftiger Host dort von Anfang an isoliert ist.
- **Alles dokumentiert** — inklusive des Gateway-DNS-Pfades, damit ich beim nächsten Audit nicht
  wieder über dasselbe Rätsel stolpere.

Jede Änderung lief über die API, wurde angewendet und anschließend im Live-pf-Kernel
gegenverifiziert. Backup vorher, versteht sich.

## Fazit

Drei Dinge nehme ich mit. Erstens: Management-APIs sind bequem, aber sie zeigen eine kuratierte
Sicht — der Paketfilter-Kernel ist die einzige Quelle der Wahrheit. Zweitens: Regelnamen sind
Absichtserklärungen, kein Beweis für Verhalten; Trefferzähler lügen nicht. Und drittens: Eine KI
am Terminal beschleunigt so ein Audit enorm — solange ich jeden ihrer Befunde selbst empirisch
gegenprüfe, statt dem ersten Eindruck zu glauben. Genau dieser Moment „🔴 kritisch → doch nur ein
Darstellungsartefakt" hat mir mehr über mein eigenes Netz beigebracht als jede grüne Statusseite.
