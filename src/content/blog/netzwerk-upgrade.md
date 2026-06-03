---
title: Vom flachen Netz zur VLAN-Segmentierung
description: Warum ich mein Homelab vom Vodafone-Router gelöst, auf OPNsense umgestellt und in VLANs zerlegt habe — und was dabei schiefging.
date: 2026-03-15
tags:
  - opnsense
  - vlan
  - proxmox
  - homelab
  - networking
---

Lange lief mein gesamtes Homelab in einem einzigen flachen `/24` hinter der Router-Box
des Providers. Ein Netz, alle Geräte, kein Übergang dazwischen — der Smart-TV im selben
Broadcast-Segment wie der Proxmox-Host und der Passwort-Manager. Das wollte ich loswerden.

## Ausgangslage

- **Ein** flaches Subnetz, DHCP vom Provider-Router
- Keine Segmentierung zwischen Servern, Clients und IoT
- Portfreigaben direkt auf der Router-Box — unübersichtlich und nicht versionierbar

Das Ziel: ein router-on-a-stick-Setup mit einer echten Firewall, getaggten VLANs und einer
Topologie, die ich dokumentieren und reproduzieren kann.

## Die neue Topologie

Ich habe eine Sophos-Appliance mit **OPNsense** geflasht und sie als zentrale Firewall/Router
gesetzt. Der Provider-Router läuft seitdem nur noch als reines Modem (Bridge-nahe
Übergangsphase). Dahinter hängt ein VLAN-fähiger Switch und ein Access Point, der die WLAN-SSIDs
auf VLANs mappt.

| VLAN | Name   | Zweck                              |
|------|--------|------------------------------------|
| 1    | MGMT   | OPNsense, Switch, Proxmox-Host     |
| 10   | SRV    | Server & VMs                       |
| 20   | CLIENT | Arbeits-PCs                        |
| 30   | IOT    | Smart-Home, alles Unvertrauenswürdige |
| 40   | GUEST  | Gäste, vollständig isoliert        |
| 50   | DMZ    | nach außen exponierte Dienste      |

Der Proxmox-Host hängt an einem **Trunk-Port**: VLAN 1 untagged für Management, die restlichen
VLANs tagged. Jede VM/jeder LXC bekommt über eine VLAN-Tag-Zuweisung am virtuellen Bridge-Port
sein Segment — ohne dass ich physische NICs brauche.

## Was schiefging

**Dumb-AP-Falle.** Mein erster Access Point hat VLAN-Tags klaglos geschluckt, aber das
Management-Interface lag plötzlich im falschen Segment — ich hatte mich selbst ausgesperrt und
musste über die serielle Konsole zurück. Lektion: das AP-Management-VLAN *vor* dem Tagging der
SSIDs sauber festziehen.

**DHCP-Doppelung.** Eine Weile vergaben Provider-Router *und* OPNsense parallel Leases, weil ich
den DHCP-Server der Box nicht deaktiviert hatte. Resultat: sporadische Doppel-IPs. Erst als der
Provider-Router wirklich nur noch Modem war, wurde es stabil.

**MCP als Doku-Helfer.** Während der Migration habe ich der OPNsense (und sogar der Provider-Box)
einen API-Zugang für meinen KI-Assistenten gegeben, damit er den Ist-Zustand der Regeln auslesen
und dokumentieren kann. Klingt nach Spielerei, hat aber die Inventarisierung der bestehenden
Freigaben massiv beschleunigt.

## Was es gebracht hat

Mit den VLANs als Fundament konnte ich anschließend Schritt für Schritt auf **Default-Deny**
umstellen: IoT sieht das Server-Netz nicht mehr, Gäste sehen gar nichts außer dem Internet, und
jede Inter-VLAN-Verbindung ist jetzt eine explizite, dokumentierte Regel statt eines impliziten
„alle reden mit allen".

Wie aus der Segmentierung eine echte Zero-Trust-Firewall wurde — also Default-Deny, DNS-Hijack-Block
und Reverse-Proxy-Zwang — ist ein eigener Guide wert. Der Umzug selbst war jedenfalls die
Voraussetzung für alles, was danach kam.
