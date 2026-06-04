---
title: Servarr Suite einrichten
description: Medienserver aufsetzen — Jellyfin + *arr-Automatisierung, Untertitel und Qualitätsprofile für die eigene Bibliothek.
date: 2026-04-15
difficulty: Fortgeschritten
tags:
  - jellyfin
  - servarr
  - docker
series: ''
order: null
---

> **Hinweis:** Diese Anleitung behandelt ausschließlich Aufbau und Automatisierung eines
> Medienservers für selbst erstellte oder rechtmäßig erworbene Inhalte (eigene Disc-Rips,
> Eigenproduktionen, lizenzierte Downloads) — Installation, Reverse-Proxy, Qualitätsprofile,
> Untertitel, Transcoding und Hardening. Die Beschaffung von Inhalten ist nicht Gegenstand
> der Anleitung.

Eine wachsende Medienbibliothek von Hand zu pflegen — Metadaten suchen, Cover zuordnen,
Untertitel besorgen, alles einheitlich benennen — ist mühsam und fehleranfällig. Die *„Servarr"*-
Suite automatisiert genau diese Bibliotheks-Verwaltung rund um **Jellyfin**.

## Die Komponenten

| Dienst       | Rolle                                                        |
|--------------|-------------------------------------------------------------|
| **Jellyfin** | Medienserver & Player — streamt deine Bibliothek im Browser, auf TV und mobil |
| **Sonarr**   | Verwaltung & Organisation von Serien (Benennung, Staffeln, Lücken-Erkennung) |
| **Radarr**   | dasselbe für Filme                                          |
| **Prowlarr** | zentrale Quellen-/Indexer-Verwaltung für Sonarr & Radarr   |
| **Bazarr**   | automatische Untertitel passend zu deinen Inhalten         |
| **Recyclarr**| synchronisiert kuratierte Qualitätsprofile in Sonarr/Radarr|
| **SABnzbd**  | Download-Client für deine eigenen/legitimen Quellen        |

## Architektur

```
                    ┌─────────────┐
                    │  Prowlarr   │  Quellen-Verwaltung
                    └──────┬──────┘
                  ┌────────┴────────┐
            ┌─────▼─────┐     ┌─────▼─────┐
            │  Sonarr   │     │  Radarr   │
            └─────┬─────┘     └─────┬─────┘
                  └────────┬────────┘
                    ┌──────▼──────┐
                    │  SABnzbd    │  holt → benennt → verschiebt
                    └──────┬──────┘
                    ┌──────▼──────┐    ┌──────────┐
                    │  /media     │◀───│  Bazarr  │ Untertitel
                    └──────┬──────┘    └──────────┘
                    ┌──────▼──────┐
                    │  Jellyfin   │  streamt an deine Geräte
                    └─────────────┘
```

## 1. Compose-Grundgerüst

Alle Dienste laufen als Container. Entscheidend ist eine **einheitliche Ordnerstruktur**, die alle
Container identisch sehen — sonst funktionieren Hardlinks nicht und jede Datei wird unnötig kopiert.

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin
    volumes:
      - ./config/jellyfin:/config
      - /srv/media:/media
    devices:
      - /dev/dri:/dev/dri      # GPU für Transcoding (Intel/AMD)
    restart: unless-stopped

  sonarr:
    image: lscr.io/linuxserver/sonarr
    environment: [PUID=1000, PGID=1000, TZ=Europe/Berlin]
    volumes:
      - ./config/sonarr:/config
      - /srv/media:/media       # gleicher Mount-Punkt wie überall!
    restart: unless-stopped

  # radarr, prowlarr, bazarr, sabnzbd analog ...
```

> **Hardlink-Regel:** Download-Verzeichnis und Medienbibliothek müssen unter **einem** gemeinsamen
> Volume liegen (z. B. `/srv/media/downloads` und `/srv/media/library`). Nur dann kann Sonarr/Radarr
> per Hardlink importieren statt zu kopieren — das spart Platz und ist sofort fertig.

## 2. Prowlarr als Single Source of Truth

Statt jede Quelle in Sonarr *und* Radarr einzeln zu pflegen, trägst du sie einmal in **Prowlarr**
ein. Prowlarr pusht die Konfiguration dann an alle „Apps" (Sonarr, Radarr) durch. Eine neue Quelle
hinzufügen heißt: einmal in Prowlarr, fertig.

## 3. Qualitätsprofile mit Recyclarr

Qualitätsprofile von Hand zu bauen ist Detailarbeit. **Recyclarr** zieht kuratierte Profile und
Custom Formats und schreibt sie per API in Sonarr/Radarr:

```bash
recyclarr sync
```

Per Cron einmal täglich ausgeführt, bleiben deine Profile reproduzierbar — die ganze Konfiguration
liegt in einer versionierbaren `recyclarr.yml` statt verstreut in der Web-UI.

## 4. Untertitel mit Bazarr

Bazarr hängt sich an Sonarr und Radarr und besorgt automatisch Untertitel in deinen Wunschsprachen,
sobald ein neuer Titel in der Bibliothek landet. Sprachen-Profil setzen, Provider auswählen, fertig.

## 5. Hardware-Transcoding in Jellyfin

Wenn ein Client ein Format nicht direkt abspielen kann, transkodiert Jellyfin live — und das frisst
CPU. Mit einer iGPU (Intel QuickSync / AMD VAAPI) übernimmt die Grafikeinheit das:

1. `/dev/dri` in den Jellyfin-Container durchreichen (siehe Compose oben)
2. In Jellyfin unter *Dashboard → Wiedergabe* die Hardware-Beschleunigung (VAAPI/QSV) aktivieren
3. Mit einem Transcoding-erzwingenden Client testen und die GPU-Last beobachten

## 6. Hardening

- **Kein direkter Port nach außen.** Alles hinter einem Reverse-Proxy mit TLS; die *arr-Web-UIs
  bleiben nach Möglichkeit nur intern erreichbar.
- **Eigenes VLAN/Segment** für den Medienstack, getrennt vom restlichen Netz.
- **Unprivilegierter Container/VM** — der Stack braucht keine Root-Rechte auf dem Host.
- **Backups** der `config`-Verzeichnisse; die Datenbanken der *arr-Dienste sind dein eigentliches
  Asset, nicht die Mediendateien.

## Fazit

Einmal sauber aufgesetzt, läuft die Bibliotheks-Verwaltung im Hintergrund: neue Titel werden
einheitlich benannt, mit Metadaten und Untertiteln versehen und stehen in Jellyfin sofort bereit.
Der Aufwand steckt im Setup der Ordnerstruktur und der Profile — danach ist es wartungsarm.
