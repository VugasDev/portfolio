---
title: 'GPU-Transcoding für Jellyfin: NVENC, Secure Boot und ein schwarzer Bildschirm'
description: Wie ich eine alte GTX 1050 durch Proxmox, LXC und Docker bis zu Jellyfin durchgereicht habe — und warum Secure Boot und eine CPU ohne iGPU daraus ein Abenteuer machten.
date: 2026-06-11
tags:
  - jellyfin
  - proxmox
  - nvidia
  - lxc
  - homelab
draft: false
---

Mein Jellyfin lief seit dem Setup auf reinem CPU-Transcoding. Für einen einzelnen
1080p-Stream reicht das gerade so, aber sobald ein zweiter Client mit reduzierter
Bandbreite dazukommt, geht der Container in die Knie. Dabei lag die Lösung längst im
Gehäuse: eine GeForce GTX 1050 aus meinem alten Server, die ich beim Umbau mit
umgezogen hatte — eingebaut, aber nie in Betrieb genommen. Zeit, das zu ändern.

## Die Kette: Host → LXC → Docker → Jellyfin

Bei mir läuft Jellyfin in einem Docker-Container, der wiederum in einem LXC-Container
auf Proxmox steckt. Damit die GPU dort unten ankommt, muss jede Ebene mitspielen:

1. **Proxmox-Host:** NVIDIA-Kernel-Treiber installieren
2. **LXC:** Device-Nodes durchreichen und das Treiber-Userland in identischer Version installieren
3. **Docker:** NVIDIA Container Toolkit mit `runtime: nvidia`
4. **Jellyfin:** NVENC als Hardware-Beschleunigung konfigurieren

Wichtige Vorentscheidung: Die GTX 1050 ist eine Pascal-Karte, und NVIDIA hat den
Pascal-Support mit der 580er-Treiberserie eingestellt — neuere Treiber kennen die Karte
schlicht nicht mehr. Ich habe deshalb bewusst den letzten 580er-Treiber als
.run-Installer genommen und dieselbe Datei auf Host (mit DKMS) und im LXC (nur
Userland, ohne Kernel-Module) installiert. Host-Modul und Container-Bibliotheken
müssen exakt dieselbe Version haben, sonst verweigert der Treiber den Dienst.

## Plot Twist 1: „Key was rejected by service"

Der erste Installationsversuch endete ernüchternd: Das frisch gebaute Kernel-Modul
ließ sich nicht laden. Mit KI-Unterstützung habe ich das Installer-Log durchgesehen,
und dort stand die entscheidende Zeile: _Loading of unsigned module is rejected._
Mein Hypervisor bootet mit **Secure Boot** — der Kernel akzeptiert nur signierte
Module, und das NVIDIA-Modul war keins.

Die Lösung ist ein eigener **MOK** (Machine Owner Key): Schlüsselpaar erzeugen, das
Modul damit signieren und den öffentlichen Schlüssel einmalig in die UEFI-Firmware
einschreiben. Klingt einfach, hatte aber drei Stolpersteine:

- **DKMS signiert nicht automatisch.** Obwohl der Schlüssel an der Standardstelle lag,
  kamen die Module unsigniert aus dem Build. Ich habe sie einmal manuell mit dem
  `sign-file`-Tool des Kernels signiert und DKMS dann per Konfigurationsdatei
  beigebracht, künftige Rebuilds (etwa nach Kernel-Updates) selbst zu signieren.
- **`mokutil --root-pw` funktioniert nicht überall.** Die bequeme Variante, das
  Root-Passwort fürs Enrollment zu nutzen, scheiterte am moderneren Passwort-Hash
  meines Systems. Der Umweg über `--generate-hash` mit einem Einmal-Passwort tut es
  genauso.
- **Der MOK-Manager wartet nicht auf dich.** Beim nächsten Boot erscheint ein blauer
  Dialog mit einem **10-Sekunden-Timeout**. Verpasst man ihn, bootet das System einfach
  weiter — ohne Enrollment, und je nach Lage ist die Anfrage danach verworfen.

## Plot Twist 2: Der Server, der tot aussah

Genau dieser MOK-Dialog wurde zum eigentlichen Problem: Ich brauchte erstmals seit
Monaten wieder Monitor und Tastatur am Server — und bekam **kein Bild**. Weder am
Mainboard-Ausgang noch an der Grafikkarte.

Des Rätsels Lösung war zweiteilig und im Nachhinein fast peinlich:

1. Meine CPU ist ein **F-Modell ohne integrierte Grafik**. Die Videoausgänge auf dem
   Mainboard sind damit tot — nicht defekt, sondern schlicht funktionslos. Das „F" im
   Namen hatte ich beim Anschließen nicht auf dem Schirm.
2. An der GPU kommt sehr wohl ein Bild — aber nur kurz beim POST und im UEFI. Sobald
   Linux übernimmt, bleibt der Bildschirm dunkel (kein Grafiktreiber für die Konsole,
   nouveau hatte ich ja gerade geblacklistet). Dazu kommt: Mein Host braucht durch den
   ZFS-Pool-Import mehrere Minuten, bis er pingbar ist. Ein dunkler Bildschirm plus
   minutenlange Funkstille wirken zusammen täuschend echt wie ein toter Server.

Beim zweiten Anlauf — Monitor an der GPU, richtigen Eingang vorgewählt, ab Sekunde
eins hingeschaut — war der MOK-Dialog da. Beim ersten Versuch war ich zu langsam für
die 10 Sekunden, beim zweiten saß es: Enroll MOK, Einmal-Passwort, Reboot.

## Der Rest war Fleißarbeit

Mit enrolltem Schlüssel lud das Modul sofort. Danach ging es zügig:

- **Device-Nodes beim Boot:** Ein kleiner systemd-Service auf dem Host ruft `nvidia-smi`
  und `nvidia-modprobe` auf, _bevor_ die Gäste starten — sonst fehlen den LXCs die
  `/dev/nvidia*`-Geräte nach jedem Reboot.
- **LXC-Passthrough:** Vier `lxc.mount.entry`-Zeilen für die NVIDIA-Devices in der
  Container-Config.
- **Container Toolkit im LXC:** Wichtigste Einstellung: `no-cgroups = true` — im
  unprivilegierten LXC verwaltet der Host die Device-Cgroups, nicht die
  Container-Runtime. Ohne das Flag startet kein einziger GPU-Container.
- **Jellyfin:** NVENC aktiviert, Hardware-Decode für H.264, HEVC, MPEG2, VC1, VP8 und
  VP9 (inklusive 10-bit), HEVC-Encode an, CUDA-Tonemapping für HDR-Material. AV1
  bleibt aus — das kann Pascal schlicht nicht.

## Das Ergebnis

Der Unterschied ist drastisch. Ein 1080p-H.264-Transcode, der vorher die CPU an die
Wand fuhr, läuft jetzt mit über **elffacher Echtzeit** durch — Decode und Encode
komplett auf der GPU, die CPU bleibt frei für die restlichen Dienste. Mehrere
gleichzeitige Streams mit unterschiedlichen Qualitätsstufen sind kein Thema mehr,
und 4K-HEVC-Material ist für schwächere Clients überhaupt erst flüssig nutzbar
geworden.

## Lektionen

- **Treiberserie vor der Installation prüfen.** Bei älteren Karten endet der Support
  irgendwann — wer blind den neuesten Treiber zieht, jagt einem Phantomfehler nach.
  Die Version habe ich mir jetzt dokumentiert, samt Warnung vor der Nachfolgeserie.
- **Secure Boot ist kein Gegner, aber er will Respekt.** Mit MOK + automatischer
  DKMS-Signierung überlebt das Setup auch Kernel-Updates. Einmal sauber eingerichtet,
  ist Ruhe.
- **Hardware-Basics schlagen Software-Debugging.** Eine halbe Stunde Rätselraten über
  einen „toten" Server, dessen CPU einfach keine Grafikausgabe hat — das passiert mir
  kein zweites Mal.
- **Versionsgleichheit Host ↔ Container notieren.** Das künftige Ich, das in einem Jahr
  ein Treiber-Update einspielt, wird der Doku dankbar sein.
