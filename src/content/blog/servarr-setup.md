---
title: Meine Servarr Suite — wie ich sie aufgebaut habe
description: Jellyfin + *arr-Automatisierung als self-hosted Medienserver — Setup, Struktur und Learnings.
date: 2026-04-14
tags:
  - jellyfin
  - servarr
  - docker
  - homelab
---

> **Hinweis:** Dieser Beitrag behandelt ausschließlich Aufbau und Automatisierung eines
> Medienservers für selbst erstellte oder rechtmäßig erworbene Inhalte (eigene Disc-Rips,
> Eigenproduktionen, lizenzierte Downloads). Die Beschaffung von Inhalten ist nicht
> Gegenstand des Beitrags.

Meine Medienbibliothek war lange ein Chaos: Dateien mit kryptischen Namen, fehlende Cover, mal
deutsche, mal englische Ordnerstruktur, Untertitel irgendwo verstreut. Streaming-Dienste lösen das,
aber sie entscheiden auch, was verfügbar bleibt. Ich wollte beides: die Bequemlichkeit von Netflix
*und* die Kontrolle über meine eigene Sammlung. Das Ergebnis ist meine **Servarr Suite** rund um
Jellyfin.

## Der Stack auf einen Blick

- **Jellyfin** — der Medienserver, den ich im Browser, auf dem TV und mobil nutze
- **Sonarr / Radarr** — verwalten Serien bzw. Filme, benennen einheitlich, erkennen Lücken
- **Prowlarr** — eine zentrale Stelle für alle Quellen
- **Bazarr** — besorgt automatisch passende Untertitel
- **Recyclarr** — hält meine Qualitätsprofile reproduzierbar
- **SABnzbd** — Download-Client für meine legitimen Quellen

Alles läuft in Containern auf einem eigenen, vom restlichen Netz getrennten Segment.

## Die wichtigste Entscheidung: die Ordnerstruktur

Klingt unspektakulär, ist aber das Fundament. Alle Container sehen **denselben** Mount-Punkt
(`/media`), darunter `downloads` und `library`. Nur so kann Sonarr/Radarr per **Hardlink**
importieren, statt jede Datei zu kopieren — das spart Platz und ist sofort fertig. Mein erster
Versuch mit getrennten Volumes hat genau hier wehgetan: Jede Datei lag doppelt, und die Platte war
schneller voll als die Bibliothek gewachsen ist.

## Was die Automatisierung mir abnimmt

Wenn ein neuer Titel reinkommt, passiert ohne mein Zutun:

1. Sonarr/Radarr erkennt und benennt ihn einheitlich
2. Die Datei wandert per Hardlink in die Bibliothek
3. Bazarr lädt passende Untertitel
4. Jellyfin zieht Metadaten und Cover und zeigt ihn sofort an

Aus „Datei suchen, umbenennen, einsortieren, Untertitel googeln" wird: nichts. Genau das war das
Ziel.

## Recyclarr — Profile als Code

Der Teil, den ich anfangs unterschätzt habe: Qualitätsprofile. Von Hand in der Web-UI
zusammengeklickt sind sie nirgends dokumentiert und nach einem Neuaufsetzen weg. **Recyclarr** zieht
kuratierte Profile per Cron in Sonarr/Radarr — die ganze Konfiguration liegt in einer
versionierbaren `recyclarr.yml`. Reproduzierbar statt zusammengeklickt.

## Transcoding: aktuell CPU, NVENC in Vorbereitung

Mein offener Schmerzpunkt im Betrieb: Transcoding läuft noch in **Software** über die CPU. Solange
ein Client das Originalformat direkt abspielt (Direct Play), ist alles ruhig — sobald aber live
transkodiert werden muss, geht die CPU-Last hoch und parallele Streams werden eng.

Der Plan dagegen liegt schon bereit: In der Kiste steckt eine **NVIDIA GTX 1050**, deren **NVENC**-
Encoder genau dafür gemacht ist. Was noch fehlt, ist der NVIDIA-Treiber auf dem Proxmox-Host plus
die NVIDIA-Container-Runtime, um die GPU sauber in den Jellyfin-Container durchzureichen. Das ist
der nächste Schritt — und ein gutes Beispiel dafür, dass „Hardware vorhanden" und „Hardware nutzbar"
im Homelab zwei verschiedene Tickets sind.

## Learnings

- **Ordnerstruktur zuerst.** Hardlinks scheitern leise an getrennten Volumes. Das einmal richtig
  aufsetzen erspart später viel Umzieherei.
- **Profile als Code.** Recyclarr macht den Unterschied zwischen „läuft bei mir" und
  „reproduzierbar".
- **Backups sind die Datenbanken, nicht die Filme.** Die `config`-Verzeichnisse der *arr-Dienste
  sind das eigentliche Asset — die Mediendateien lassen sich neu beschaffen, die kuratierte
  Verwaltung nicht.
- **Eigenes Segment.** Der Medienstack hat im Netz nichts beim Rest zu suchen; ein eigenes VLAN und
  ein Reverse-Proxy davor sind Pflicht.

Wer das Schritt für Schritt nachbauen will: Ich habe die Details im
[Servarr-Suite-Guide](/guides/servarr-suite) zusammengeschrieben.
