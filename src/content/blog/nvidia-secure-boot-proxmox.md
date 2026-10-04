---
title: 'Stolperstein: NVIDIA-Treiber auf Proxmox mit Secure Boot'
description: 'Ich wollte nur die Grafikkarte für das Jellyfin-Transcoding einrichten. Am Ende waren es vier Stolperstellen auf einmal: ein Kernel, der das Modul ablehnt, ein DKMS, das nicht signiert, ein Passwort-Hash, den mokutil nicht kennt, und ein Bildschirm, der zehn Sekunden wartet.'
date: 2026-06-11
tags:
  - stolperstein
  - proxmox
  - nvidia
  - secure-boot
  - homelab
draft: false
---

> **Stolpersteine** sind kurze Posts über Fehler, die mich Zeit gekostet haben — mit Ursache
> und Lösung, damit sie anderen nicht dieselbe Zeit kosten.

## Was passiert ist

Mein Mediaserver sollte endlich in Hardware transcodieren: eine GTX 1050 im Proxmox-Host,
durchgereicht an den Container mit Jellyfin. Schritt eins ist der NVIDIA-Treiber auf dem Host,
also der offizielle `.run`-Installer mit `--dkms`, damit das Kernelmodul Kernel-Updates
übersteht.

Der Installer baute das Modul, versuchte es zu laden und rollte dann alles wieder zurück. Im
Kernel-Log stand:

```
Loading of unsigned module is rejected
Key was rejected by service
```

Auf dem Host ist **Secure Boot** aktiv. Der Kernel lädt dann nur Module, die mit einem Schlüssel
signiert sind, dem die Firmware vertraut. Eingetragen war nur der Schlüssel von Proxmox selbst,
und das frisch gebaute NVIDIA-Modul war mit gar nichts signiert.

## Die Ursache: vier Stolperstellen hintereinander

Die Lösung ist im Prinzip bekannt: einen eigenen Schlüssel (MOK, *Machine Owner Key*) erzeugen,
in der Firmware eintragen und das Modul damit signieren. Auf dem Weg dahin lagen vier Fallen.

**1. DKMS signiert nicht von selbst.** DKMS hatte bereits einen Schlüssel unter
`/var/lib/dkms/mok.key` und `mok.pub` angelegt. Beim Bauen über den `.run`-Installer hat DKMS 3.2
das Modul damit aber **nicht** signiert. Dass ein Schlüssel daliegt, heißt nicht, dass er benutzt
wird.

**2. `mokutil` kennt den Passwort-Hash nicht.** Um den Schlüssel in die Firmware einzutragen,
fragt `mokutil --import` nach einem Einmal-Passwort. Die bequeme Variante `--root-pw` (nimm das
root-Passwort) scheiterte mit `Failed to get root password hash`: Proxmox speichert Passwörter
als yescrypt-Hash, und den versteht `mokutil` nicht.

**3. Der MOK-Bildschirm wartet zehn Sekunden.** Eingetragen wird der Schlüssel beim nächsten
Neustart in einem blauen Menü, dem MOK-Manager. Der wartet nur etwa zehn Sekunden auf einen
Tastendruck, und wenn man sie verpasst, ist die Anfrage teilweise verworfen. Dann geht alles von
vorn los.

**4. Der Bildschirm bleibt schwarz.** Der Host hat einen i5-12400**F**. Das F heißt: keine
integrierte Grafik. Der Monitor am Videoausgang des Mainboards zeigt deshalb nie ein Bild, auch
nicht den MOK-Manager. Wer zehn Sekunden Zeit hat, ein blaues Menü zu bedienen, sollte es
wenigstens sehen können.

## Die Lösung

**Installer so starten, dass er nicht zurückrollt.** Ohne den Ladeversuch bleibt das gebaute
Modul liegen und kann signiert werden:

```bash
./NVIDIA-Linux-x86_64-580.159.04.run --silent --dkms --skip-module-load
```

**Module von Hand signieren:**

```bash
SIGN=/usr/lib/modules/$(uname -r)/build/scripts/sign-file
for m in nvidia nvidia-modeset nvidia-drm nvidia-uvm; do
  $SIGN sha256 /var/lib/dkms/mok.key /var/lib/dkms/mok.pub "$(modinfo -n $m)"
done
```

**Künftige Builds automatisch signieren.** Damit das nach jedem Kernel-Update nicht wieder
passiert, bekommt DKMS den Schlüssel ausdrücklich genannt:

```bash
# /etc/dkms/framework.conf.d/signing.conf
mok_signing_key="/var/lib/dkms/mok.key"
mok_certificate="/var/lib/dkms/mok.pub"
```

**Schlüssel eintragen, ohne `--root-pw`.** Den Hash für das Einmal-Passwort erzeugt `mokutil`
selbst, dann klappt der Import auch ohne Nachfrage:

```bash
mokutil --generate-hash=<einmal-passwort> > /root/mok.hash
mokutil --import /var/lib/dkms/mok.pub --hash-file /root/mok.hash
```

Das Passwort braucht man genau einmal, im MOK-Manager. Danach ist es wertlos.

**Neustart mit Monitor an der Grafikkarte.** Den Monitor an die GTX 1050 statt ans Mainboard,
Finger auf die Tastatur und beim blauen Bildschirm sofort eine Taste drücken. Dann *Enroll MOK*,
Einmal-Passwort eingeben, fertig. Danach lädt der Kernel das Modul, und `nvidia-smi` zeigt die
Karte.

Der Rest war Fleißarbeit: Device-Nodes beim Booten anlegen, bevor die Container starten, die
Geräte an den Container durchreichen und dort dasselbe Userland in **exakt derselben Version**
installieren wie auf dem Host. Seitdem transcodiert Jellyfin 1080p in H.264 mit rund elffacher
Echtzeit statt ein- bis zweifacher auf der CPU.

## Was ich mitnehme

- **Secure Boot ist kein Hindernis, sondern eine Reihenfolge.** Schlüssel erzeugen, eintragen,
  signieren, dann laden. Wer den Ladeversuch vor das Signieren setzt, bekommt einen Rollback.
- **„Der Schlüssel liegt da“ heißt nicht „der Schlüssel wird benutzt“.** Die Auto-Signierung
  ausdrücklich konfigurieren und nach dem nächsten Kernel-Update prüfen, ob das Modul noch lädt.
- **Bei einem Server ohne iGPU vor dem Neustart klären, wo das Bild herkommt.** Interaktive
  Boot-Menüs mit Zeitlimit verzeihen keinen falsch eingesteckten Monitor.
- **Treiber auf Host und im Container immer gemeinsam aktualisieren.** Weichen die Versionen ab,
  kann der Container die Karte nicht mehr nutzen. Bei der GTX 1050 kommt hinzu: Die 580er-Serie ist
  die letzte mit Unterstützung für diese Generation.
