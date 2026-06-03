---
title: Ein Minecraft-Modpack mit KI im Build-Loop
description: Wie ich ein Create-zentriertes Kitchen-Sink-Modpack für NeoForge 1.21.1 baue — eigene Items und Fluids per KubeJS, 58 Quests und ein KI-gestützter Workflow gegen den API-Wahnsinn.
date: 2026-05-16
tags:
  - minecraft
  - neoforge
  - kubejs
  - modding
  - ai
---

Modpack-Entwicklung ist überraschend nah an „echter" Softwareentwicklung: Abhängigkeiten,
Versionskonflikte, brüchige APIs und eine Build-Pipeline, die bei der kleinsten Unstimmigkeit
zickt. Mein aktuelles Hobby-Projekt ist ein **Create-zentriertes Kitchen-Sink-Modpack** für
NeoForge 1.21.1 — und ich entwickle es mit einer KI als Pair-Programmer im Loop.

## Was drin steckt

- **Create** als Herzstück — mechanische Automatisierung statt purer Energie-Balken
- Eigene Items und ein Custom-Fluid (`mythic_liquid_xp`) über **KubeJS**
- Eine eigene Drill-Head-Mechanik mit nativer Rezept-API
- Ein **Catalyst-Node-System**: endliche Nodes plus eine unendliche Ley-Line als später Tech-Gate
- **58 Quests** über fünf Tiers — die komplette Progression, komplett auf Englisch lokalisiert
- Angepasste Weltgenerierung (Tectonic) mit fixierten Werten

## Warum überhaupt KI?

Der schmerzhafteste Teil beim Modding ist nicht die Idee, sondern die **API-Reibung**. KubeJS-
und Mod-APIs ändern sich zwischen Versionen, Fehlermeldungen sind kryptisch (`FluidBuilder
API-Fehler`, `KubeJS 2101 Kompatibilitätsfehler`), und ein einziger falscher Methodenname bricht
den gesamten Script-Load. Genau hier ist eine KI stark: Sie kennt die typischen Signaturen, kann
aus dem Stacktrace die wahrscheinliche Ursache ableiten und liefert einen ersten Patch.

Mein Loop sieht ungefähr so aus:

```
Idee  ──▶  KI generiert KubeJS-Script  ──▶  Spiel lädt Scripts
   ▲                                              │
   └──────  Fehlerlog zurück an KI  ◀─────────────┘
```

Die Commit-Historie liest sich entsprechend: `feat: drill head system` direkt gefolgt von
`fix: FluidBuilder API-Fehler`, `fix: KubeJS 2101 Kompatibilität`, `fix: SNBT-Format der Quests`.
Genau dieser schnelle Wechsel aus Bauen und Reparieren ist der Punkt, an dem die KI Zeit spart.

## Wo die KI an Grenzen stößt

- **Rezept-Isolation.** Dass ein neues Item nicht versehentlich Vanilla-Rezepte überschreibt,
  versteht die KI im Kleinen — aber das Gesamtbild aus hunderten Rezepten muss ich im Kopf haben.
- **Game-Feel.** Ob ein Tech-Gate sich *fair* anfühlt oder nur nervt, kann kein Modell beurteilen.
  Das ist Playtesting, und das bleibt Handarbeit.
- **SNBT & Quest-Format.** FTB-Quests im SNBT-Format sind pingelig; hier war mehr manuelles
  Nachjustieren nötig, als mir lieb war.

## Stand & Learnings

Aktuell bei `v0.1.35-alpha` — spielbar, aber noch alpha. Das größte Learning ist methodisch: Ein
Modpack profitiert von denselben Disziplinen wie jedes Software-Projekt — kleine Commits,
sprechende Versionsnummern, isolierte Änderungen. Die KI beschleunigt das Schreiben, ersetzt aber
weder das Versionieren noch das Testen. Sie ist ein sehr schneller Junior, kein Architekt.
