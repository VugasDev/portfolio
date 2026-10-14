---
title: YouTube „offline", Teil 2 — diesmal war es eine Browser-Extension
description: Die YouTube-Aussetzer waren zurück. Ich habe mir ein eigenes Netzwerk-Monitoring für den Desktop gebaut, um sie zu fassen — und am Ende lag die Ursache ganz woanders.
date: 2026-10-14
tags:
  - homelab
  - troubleshooting
  - windows
  - powershell
  - networking
draft: true
---

Im Sommer hatte ich schon einmal mit YouTube-Aussetzern gekämpft. Damals waren es meine
eigenen [AAAA-Regeln in AdGuard](/blog/youtube-aussetzer-adguard). Die Regeln waren raus,
die Sache für mich erledigt. Bis die Symptome im Herbst wiederkamen, fast wortgleich.

## Die Symptome

- Mitten im Video oder beim Scrollen kam wieder „**Verbindung zum Internet herstellen**".
- „Wiederholen" half nicht. Ein F5 oder der Weg über die Startseite dagegen schon.
- Bei Shorts luden nach fünf bis zehn Videos keine neuen mehr. Etwas später ging es dann
  wieder.

Nach der Lektion aus Teil 1 wollte ich messen, bevor ich rate.

## Die üblichen Verdächtigen

Mein erster Blick ging wieder zu AdGuard. Dabei bin ich über ein ganz anderes Problem
gestolpert: Das Query-Log hatte für mehrere Tage **gar keine Einträge**. Die Platte des
Containers war vollgelaufen. Ausgerechnet für den Zeitraum, den ich untersuchen wollte,
fehlten also die Daten. Ich habe den Speicher vergrößert und die Aufbewahrung sauber
eingestellt. Ab da sah ich wieder etwas:

- AdGuard antwortete schnell, im niedrigen zweistelligen Millisekundenbereich.
- Geblockt wurde nur noch Werbung, nichts aus YouTubes Kernfunktionen.
- Die Firewall zeigte keine einzigen Drops von meinem PC.
- QUIC hatte ich im Browser schon abgeschaltet, das änderte nichts.

Das Netz sah also unauffällig aus. Das Problem trat aber nur sporadisch auf, und bis ich
nachschauen konnte, war es meist schon wieder vorbei.

## Ein Flugschreiber für den Desktop

Also habe ich mir mit KI-Unterstützung ein kleines Monitoring für meinen Windows-Desktop
gebaut. Ich habe es **NetMon** genannt, es ist reines PowerShell. Die Idee: dauerhaft im
Hintergrund aufzeichnen und im Moment des Problems per Tastendruck einen „Fall" sichern.
Diesen Fall kann ich danach mit dem AdGuard-Log abgleichen.

- **Paketmitschnitt als Ringpuffer** mit dem Windows-Bordmittel `pktmon`. Er läuft ständig
  mit und überschreibt sich selbst, damit die Platte nicht vollläuft.
- **Probes alle 60 Sekunden** gegen DNS, HTTPS und das Gateway. So sehe ich, ob das Netz
  selbst in dem Moment gehustet hat.
- **Chrome-NetLog**: Chrome lässt sich per Startparameter dazu bringen, seine
  Netzwerk-Ereignisse mitzuschreiben. Dafür passt das Skript die Verknüpfungen und den
  Registry-Eintrag an und sichert vorher die Originale für den Rückbau.
- **Fall sichern per Hotkey**: `Strg+Alt+N`, und alles aus den letzten Minuten landet
  zeitgestempelt in einem eigenen Ordner.
- **Ein Wächter** prüft, ob alle Teile noch laufen.

Den Hotkey musste ich zweimal umbauen. Meine erste Wahl war schon belegt. Dann stellte sich
heraus, dass eine Explorer-Verknüpfung mit Tastenkürzel unzuverlässig ist. Am Ende wurde es
ein eigener kleiner Hotkey-Prozess. Geschrieben habe ich alles auf meinem Homelab-Host. Die
Tests liefen mit Pester direkt auf dem Desktop, ausgeliefert habe ich per SSH. Getestet habe
ich das Monitoring, indem ich YouTube absichtlich gesperrt habe. Erst als es diesen
künstlichen Ausfall sauber erfasste, durfte es scharf laufen.

In den folgenden Tagen habe ich **19 Fälle** gesichert.

## Die Auflösung

Am Ende lag es gar nicht am Netz. Mein Browser schickte **viel zu viele Anfragen** an
YouTube.

Schuld war die Extension **„YouTube Anti Translate"**. Sie soll eigentlich nur verhindern,
dass YouTube Videotitel automatisch übersetzt. Dafür stieß sie aber zu jeder echten Anfrage
von mir **dutzende weitere** an. Für YouTube sah es so aus, als würde ich 30 bis 60 Videos
gleichzeitig schauen. Kein Wunder, dass die Plattform irgendwann dichtmachte und mich
„offline" schickte.

Ich habe die Extension entfernt. Seitdem läuft YouTube auch über mehrere Tage ohne einen
einzigen Aussetzer.

## Was ich mitnehme

1. **Erst den Browser ausschließen, dann das Netz.** Ein sauberes Browserprofil ohne
   Extensions hätte mir den ganzen Monitoring-Bau gespart. In Teil 1 hatte ich das zwar
   getestet, aber damals lag die Ursache tatsächlich woanders. Diesmal habe ich den Test
   nicht wiederholt, weil ich ihn „schon gemacht" hatte. Gleiche Symptome heißen nicht
   gleiche Ursache.
2. **Vorher prüfen, ob das Logging selbst funktioniert.** Ein Query-Log, das wegen voller
   Platte schweigt, ist schlimmer als gar keins. Es wirkt nämlich so, als gäbe es nichts
   zu sehen.
3. **Wer misst, muss auch wieder aufräumen.** NetMon habe ich von Anfang an mit
   Rückbau-Skript gebaut. Aufgaben, Chrome-Parameter, Hotkey-Prozess und am Ende auch die
   gut 16 GB Mitschnitte waren in ein paar Minuten wieder weg.

Das Werkzeug war am Ende nicht der Held der Geschichte. Es hat mir aber gezeigt, wo ich
nicht mehr suchen muss.
