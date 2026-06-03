---
title: AdGuard Home als netzweiter DNS-Filter
description: Werbung und Tracker netzweit blocken, interne Domains auflösen und DNS-Umgehung verhindern — AdGuard Home als zentraler Resolver im Homelab.
difficulty: Einsteiger
tags:
  - dns
  - adguard
  - network
  - self-hosting
series: ''
order: null
---

> **Hinweis:** IP-Adressen sind Beispielwerte. Plane einen Fallback ein (zweiter Resolver oder
> kurze TTL), bevor du dein ganzes Netz auf einen einzigen DNS-Server umstellst — fällt der aus,
> fällt sonst das halbe Internet gefühlt mit aus.

**AdGuard Home** ist ein selbst gehosteter DNS-Resolver mit Filterlisten: Er blockt Werbung und
Tracker für *alle* Geräte im Netz — auch die, auf denen man keinen Adblocker installieren kann
(Smart-TV, Konsole, IoT). Dieser Guide zeigt das Setup als zentraler Resolver.

## 1. Installation

Am einfachsten als Container in einem leichten LXC oder auf einem kleinen Host:

```yaml
services:
  adguardhome:
    image: adguard/adguardhome
    volumes:
      - ./work:/opt/adguardhome/work
      - ./conf:/opt/adguardhome/conf
    network_mode: host       # für DNS auf Port 53 am bequemsten
    restart: unless-stopped
```

Nach dem Start unter `http://<host>:3000` durch den Einrichtungs-Assistenten gehen, Admin-Account
anlegen, Upstream-DNS setzen (z. B. ein DoH/DoT-Anbieter deiner Wahl für verschlüsselte Upstreams).

## 2. Netzweit ausrollen

Damit alle Geräte AdGuard nutzen, gibt es zwei Wege:

- **Per DHCP (empfohlen):** In deinem DHCP-Server (Router/OPNsense) den DNS-Server pro Subnetz auf
  die AdGuard-IP setzen (z. B. `10.0.1.254`). Beim nächsten Lease nutzt jedes Gerät automatisch
  AdGuard.
- **Manuell:** Einzelne Geräte direkt auf die AdGuard-IP zeigen lassen.

## 3. Interne Domains auflösen (Split-DNS)

Der große Vorteil eines eigenen Resolvers: Du kannst interne Namen vergeben. Über *Filters → DNS
rewrites* (oder DNS-Overrides) löst du z. B. `*.lab.example.com` oder einzelne Hostnamen auf interne
IPs auf:

```
jellyfin.lab.example.com   →   10.0.10.14
vault.lab.example.com      →   10.0.10.30
```

So erreichst du deine Dienste intern über sprechende Namen, während externe Anfragen ganz normal
nach draußen aufgelöst werden — das ist **Split-DNS**.

## 4. DNS-Umgehung verhindern

Viele Geräte (vor allem IoT) bringen **hartcodierte** DNS-Server mit und ignorieren deine
DHCP-Vorgabe — und damit deine Filter. Das schließt du auf der Firewall (siehe den
[Zero-Trust-Guide](/guides/vlan-zero-trust-opnsense)):

1. **Block:** alle DNS-Anfragen (Port 53) an *fremde* Server verbieten.
2. **Redirect (DNAT):** Port 53 transparent auf deine AdGuard-IP umbiegen.

Damit läuft jede Namensauflösung im Netz garantiert über AdGuard — egal, was das Gerät einträgt.

## 5. Sinnvolle Filterlisten

Weniger ist mehr: Ein paar gepflegte Listen blocken zuverlässig, ohne ständig falsch-positive
Treffer zu produzieren. Bewährt:

- AdGuard DNS filter (Basis)
- Eine seriöse Tracker-/Malware-Liste
- Bei Bedarf eine Whitelist für Dienste, die durch zu aggressive Listen brechen

> **Tipp:** Das Query-Log in AdGuard ist Gold wert beim Debuggen. Wenn ein Dienst nicht
> funktioniert, siehst du dort sofort, welche Domain geblockt wurde — und kannst sie gezielt
> freigeben.

## Fazit

AdGuard Home ist eines der dankbarsten Homelab-Projekte: in einer halben Stunde aufgesetzt, sofort
spürbar (weniger Werbung auf *jedem* Gerät) und die Grundlage für sauberes Split-DNS. In Kombination
mit dem DNS-Zwang auf der Firewall wird daraus ein Filter, den kein Gerät im Netz umgehen kann.
