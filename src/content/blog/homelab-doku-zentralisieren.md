---
title: Eine zentrale Doku für viele Projekte — und wie KI dabei ein Leck fand
description: Wie ich mein Homelab-Monorepo in getrennte Projekte zerlegt, die Dokumentation in ein eigenes Repo gebündelt und jedem Projekt echten Kontext gegeben habe — inklusive eines Klartext-Passworts, das fast auf GitHub landete.
date: 2026-06-04
tags:
  - homelab
  - dokumentation
  - claude-code
  - automation
  - security
draft: false
---

Mein Homelab lebte lange in einem einzigen großen Repo: Code, Dashboard, Doku, Agenten-Definitionen
— alles in `homelab-ai`. Praktisch zum Anfangen, unübersichtlich zum Wachsen. Also habe ich die
Projekte getrennt: jedes unter `~/projects/<name>/` mit eigenem Git-Repo. Damit war der Code sauber
zerlegt — aber die gemeinsame Dokumentation hing in der Luft.

## Ausgangslage

- Die Infra-Doku (Firewall-Regeln, Netzplan, DNS, Services) lag noch im alten Monorepo
- Die frischen Projekt-`CLAUDE.md`-Dateien waren leere Templates — und zeigten auf tote Pfade
  (`~/homelab-ai/...`)
- Es gab keinen gemeinsamen Ort, an dem ein einzelnes Projekt nachschlagen konnte, _wie_ man z.B.
  per SSH oder API an die Firewall kommt

Das Ziel: ein zentrales, separat versioniertes Doku-Repo als Single Source of Truth, und Projekte,
die per Verweis darauf zugreifen — ohne sich gegenseitig zu duplizieren.

## Der Ansatz

Ich habe ein neues Repo `homelab-docs` aufgesetzt und die gesamte Infra-Doku dorthin migriert.
Kernstück ist eine `access.md`: eine Tabelle aller SSH- und API-Zugänge mit Host, Port, Auth-Methode
— aber **ohne Secrets**. Statt Passwörtern steht dort nur der Name des Vaultwarden-Eintrags. Die
echten Geheimnisse bleiben im Passwort-Manager.

Jede Projekt-`CLAUDE.md` verweist jetzt nur noch per Pointer auf die relevanten Doku-Dateien
(„Zugriffe siehe `access.md`, Regelwerk siehe `FIREWALL.md`"). Geladen wird bei Bedarf, nicht
automatisch — das hält das Kontextfenster klein und vermeidet, dass jede Session die komplette
Homelab-Doku mitschleppt.

## Was schiefging — fast

Beim Migrieren der alten Doku ins neue Repo hat mir der KI-Assistent etwas gemeldet, das ich beim
manuellen Kopieren glatt übersehen hätte: In zwei Dateien standen die **WLAN-PPSKs im Klartext** —
und die waren beim ersten Commit schon ins (private) GitHub-Repo gepusht.

Die Reaktion war zum Glück schnell: Werte redigieren, durch `<PSK …>`-Platzhalter plus
Vaultwarden-Verweis ersetzen, und weil das Repo brandneu war, die Historie sauber neu schreiben und
force-pushen. Danach noch ein zweiter Fundort in einer migrierten Spec — gleiches Spiel.

Die Lektion danach war fast die wichtigere: Bevor ich panisch die Historie des **alten** Repos
zerlegt habe, lohnte sich ein harter Blick auf die Fakten. Der Commit mit den Passwörtern lag dort
nämlich nur auf einem lokalen, nie gepushten Branch — auf GitHub war er nie gelandet. Ein
voreiliges History-Rewrite hätte unbestätigte Arbeit zerstört und nichts gewonnen. **Erst messen,**
**dann schreddern.**

## Was es gebracht hat

- Eine Doku, die allen Projekten gehört und separat versioniert ist
- Projekte, die ihren eigenen Kontext kennen — die Firewall weiß jetzt, wo SSH und API stehen,
  ohne dass ein Secret im Repo liegt
- Ein wiederholbares Template, das auf die richtigen Pfade zeigt
- Und nebenbei die Erkenntnis, dass ein zweites Augenpaar — auch ein künstliches — genau die
  Klartext-Zeile findet, die man beim Copy-Paste übersieht

Die nächste offene Baustelle: die belichteten PPSKs trotzdem rotieren. Exponiert waren sie real nur
kurz — aber „kurz exponiert" ist bei einem Passwort eben nicht dasselbe wie „nie".
