---
title: VLAN-Segmentierung & Zero-Trust mit OPNsense
description: Vom flachen Netz zu segmentierten VLANs mit Default-Deny-Firewall — Interfaces, Regeln, DNS-Zwang und Reverse-Proxy-Routing auf OPNsense.
difficulty: Fortgeschritten
tags:
  - opnsense
  - vlan
  - firewall
  - networking
  - security
series: ''
order: null
---

> **Hinweis:** Alle IP-Adressen und VLAN-IDs in diesem Guide sind Beispielwerte. Passe sie an dein
> eigenes Netz an und sperre dich beim Umstellen nicht selbst aus — halte dir immer einen
> Konsolen-/Out-of-Band-Zugang offen.

Ein flaches Netz, in dem der Smart-TV im selben Segment liegt wie der Hypervisor, ist bequem — und
ein Sicherheitsproblem. Dieser Guide zeigt, wie du dein Netz auf **OPNsense** in VLANs zerlegst und
schrittweise auf **Zero-Trust** (Default-Deny) umstellst.

## Zielbild

| VLAN | Name   | Subnetz (Beispiel) | Zweck                          |
|------|--------|--------------------|--------------------------------|
| 1    | MGMT   | 10.0.1.0/24        | Firewall, Switch, Hypervisor   |
| 10   | SRV    | 10.0.10.0/24       | Server & VMs                   |
| 20   | CLIENT | 10.0.20.0/24       | Arbeits-PCs                    |
| 30   | IOT    | 10.0.30.0/24       | Smart-Home, untrusted          |
| 40   | GUEST  | 10.0.40.0/24       | Gäste, vollständig isoliert    |

## 1. VLAN-Interfaces anlegen

Unter *Interfaces → Other Types → VLAN* legst du pro Segment ein VLAN auf deinem physischen
LAN-Interface (z. B. `igb0`) an — die VLAN-ID ist das Tag, das auf dem Switch-Trunk verwendet wird.
Danach unter *Interfaces → Assignments* jedes VLAN als eigenes Interface zuweisen (opt1, opt2 …),
aktivieren und ihm eine statische Gateway-IP geben (z. B. `10.0.10.1` für SRV).

Auf dem Switch gehört der Uplink zur OPNsense als **Trunk** (alle VLANs tagged), die Zugangsports
als Access-Ports im jeweiligen VLAN, und der Hypervisor-Port als Trunk, damit VMs ihr Tag bekommen.

## 2. DHCP pro VLAN

Pro Interface einen eigenen DHCP-Bereich (*Services → DHCPv4*). Wichtig: den DHCP-Server des alten
Provider-Routers **abschalten**, sonst vergeben zwei Server parallel Leases und du jagst
sporadischen Doppel-IPs hinterher.

## 3. Default-Deny als Fundament

Der entscheidende Schritt: OPNsense erlaubt per Default auf einem frischen Interface erstmal
*nichts*. Genau das willst du. Statt einer „LAN → any"-Allow-Regel baust du **explizite** Regeln
für genau die Flows, die nötig sind. Faustregel pro VLAN, in dieser Reihenfolge:

1. **DNS erlauben** → nur zum DNS-Server (siehe unten)
2. **Nötige Inter-VLAN-Services** → explizit (z. B. CLIENT → SRV:443)
3. **RFC1918 blocken** → Rest-Verkehr in andere private Netze verbieten
4. **Internet erlauben** → Ziel „!RFC1918" bzw. nur 80/443 für untrusted VLANs

```
# Beispiel-Reihenfolge der Regeln auf dem CLIENT-Interface (opt2):
PASS   CLIENT-net → DNS-Server:53           (udp/tcp)
PASS   CLIENT-net → SRV-Server:443          (tcp)      # nur was gebraucht wird
BLOCK  CLIENT-net → RFC1918                            # keine anderen Segmente
PASS   CLIENT-net → !RFC1918                           # Internet
```

IOT und GUEST bekommen **kein** Inter-VLAN-Allow — nur DNS und (für IOT) eng begrenztes Internet.
GUEST sieht ausschließlich das Internet, sonst nichts.

## 4. DNS erzwingen (Anti-Hijack)

Geräte — besonders IoT — bringen gern hartcodierte DNS-Server (8.8.8.8 &amp; Co.) mit und umgehen so
deine Filterung. Zwei Regeln schließen das:

```
BLOCK  VLAN-net → !DNS-Server : 53           # alles außer dem eigenen Resolver blocken
NAT    VLAN-net → any : 53  ⇒  DNS-Server    # Port-Forward (DNAT) hardcodierter Anfragen umbiegen
```

Die erste Regel verbietet fremde DNS-Server, die zweite (eine Port-Weiterleitung) biegt hartcodierte
Anfragen transparent auf deinen eigenen Resolver um. Damit läuft *jede* Namensauflösung über deinen
Filter — egal was das Gerät einträgt.

## 5. Zentrales Routing über einen Reverse-Proxy

Statt jedem Dienst einzeln Inter-VLAN-Löcher zu bohren, erlaubst du den VLANs nur den Zugriff auf
**einen** Reverse-Proxy (Port 443) im Server-Netz. Der Proxy terminiert TLS und routet intern weiter.
Das reduziert die Firewall-Regeln drastisch und gibt dir einen einzigen, sauberen Ein- und Ausgang
für Web-Dienste.

```
PASS   alle VLANs → ReverseProxy:443   (tcp)
```

## 6. Sicher umstellen, ohne sich auszusperren

- Arbeite über einen **Konsolen-Zugang** (oder ein Interface, das du nicht gerade umkonfigurierst).
- Nutze *Apply* mit der **Rollback-Funktion** — OPNsense kann Änderungen nach Timeout zurücknehmen.
- Stelle **ein** VLAN nach dem anderen auf Default-Deny um und teste jeden Flow bewusst.
- Führe ein kurzes Logbuch: jede Allow-Regel mit einer Notiz, *warum* es sie gibt. Dein zukünftiges
  Ich wird es dir danken.

## Fazit

Zero-Trust im Homelab ist kein Schalter, sondern eine Haltung: Jede Verbindung ist verboten, bis du
sie bewusst erlaubst. Mit sauberen VLANs, erzwungenem DNS und einem zentralen Reverse-Proxy bekommst
du ein Netz, das man dokumentieren, prüfen und ruhigen Gewissens ans Internet hängen kann.
