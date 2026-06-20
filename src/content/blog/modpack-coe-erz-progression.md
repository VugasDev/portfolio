---
title: Jedes Erz nur noch über die Bohrmaschine — und der API-Sumpf dahinter
description: Wie ich für mein Minecraft-Modpack die komplette Erz-Gewinnung auf Create Ore Excavation umgebaut habe — Tier-Gating, Adern, Fluid-Boost — und mich dabei durch Rhino-Fallen, falsche Mod-IDs und vier Mod-API-Umbrüche gekämpft habe.
date: 2026-06-19
tags:
  - minecraft
  - modding
  - kubejs
  - create
  - debugging
---

Für mein Modpack „Gaia Awakening" wollte ich eine Sache grundlegend anders machen als in
fast jedem anderen Pack: **man soll Erze nicht mehr abbauen.** Kein klassisches Höhlen-Mining,
keine natürlich generierten Erzadern. Stattdessen kommt jedes Erz ausschließlich über
**Create: Ore Excavation** (COE) aus dem Boden — über Adern, die man mit einer Bohrmaschine
und dem passenden Bohrkopf erschließt. Klingt nach einer Konfig-Änderung. Es wurde eine der
zähesten Debugging-Sessions, die ich am Pack hatte.

## Das Zielbild

- **Worldgen aus:** keine natürlichen Erzblöcke, keine Vanilla-Adern.
- **Jedes Erz als COE-Ader:** eine _endliche_ Ader (erschöpft sich) plus eine _unendliche_
  Ley-Line (erneuerbar, aber eine Bohrkopf-Stufe höher gegated).
- **Hartes Tier-Gating:** Basic-Bohrkopf kommt nur an Tier-1-Erze, höhere Erze brauchen
  bessere Köpfe. Kumulativ über Item-Tags gelöst.
- **Multiplikation bleibt:** der ×16-Verarbeitungspfad nachgelagert (Create/Mekanism) bleibt
  erhalten.

Die Logik dafür steckt in KubeJS-Skripten, die die Adern und Drilling-Rezepte generieren. Und
genau da fing das Lehrgeld an.

## Falle 1: Statische Checks lügen bei Rhino

KubeJS läuft auf **Rhino**, nicht auf Node. Ich hatte meine Skripte mit `node --check`
abgesichert — grünes Licht. Im Spiel ließen sich die Bohrköpfe trotzdem \*\*nicht in die Maschine
einsetzen\*\*. Mit KI-Unterstützung habe ich mir das KubeJS-Server-Log angesehen, und da stand
ein harter Syntaxfehler genau in dem Skript, das die Bohrköpfe dem COE-Tag hinzufügt.

Die Ursache: ich hatte den **Spread-Operator** (`[a, b, ...rest]`) und `Object.values()`
verwendet. Node frisst das anstandslos — Rhino wirft einen Syntaxfehler und \*\*verwirft die
ganze Datei\*\*. Dadurch landeten die Köpfe nie im Tag `createoreexcavation:drills`, und die
Maschine lehnte sie ab. Ein einziger zu moderner Sprachausdruck, und ein komplettes Feature
war tot.

Lektion: `node --check` ist für KubeJS wertlos, sobald man modernes JS benutzt. Ich screene
meine Skripte jetzt zusätzlich per Grep auf Spread, `Object.values`, `?.` und `??` — und
schreibe bewusst „langweiliges" JS mit `.concat()` und expliziten Arrays.

## Falle 2: Formate, die nur das Spiel kennt

Die zweite Falle derselben Sorte: COE erwartet den **Namen einer Ader als String** (genauer:
als stringifizierte Text-Komponente), nicht als Objekt. Ich hatte ein `{text, color}`-Objekt
übergeben — `node --check` sieht da nichts, und beim Laden brach das Parsen aller Adern ab.
Gefunden habe ich das erst, weil ich es **im Spiel** getestet habe und im Log die konkrete
`JsonParseException` stand.

Das hat sich als Grundmuster durch die ganze Session gezogen: Codec-/Format-Fehler von Mods
kann man statisch praktisch nicht abfangen. Was geholfen hat: ich habe die **eingebauten**
**Rezepte der Mods selbst** als Vorlage genommen — also direkt in die Mod-Jars geschaut, wie
COE sein Drilling-Rezept mit Fluid schreibt, wie Create sein Crushing-Rezept aufbaut. Diese
JSON-Formate sind die maßgebliche Wahrheit, nicht irgendeine Doku.

## Spacing und Radar-Farben

Zwei Feinschliff-Themen, die mehrere Runden brauchten:

- **Vein-Spacing:** Erst lagen alle Adern viel zu dicht beieinander, dann (nach einer
  Übersteuerung) viel zu weit auseinander — teils zehntausende Blöcke. Ich habe mich auf einen
  tier-skalierten Mittelwert eingependelt, bei dem die Adern als seltene Fundpunkte wirken,
  ohne unauffindbar zu sein.
- **Radar-Farben:** Im Vein-Finder-Overlay waren alle Adern orange, nicht unterscheidbar. Der
  Grund: das Overlay färbt die Marker nach dem **Icon** der Ader — und ich hatte den grauen
  Erzblock als Icon gesetzt. Seit ich das bunte Roh-Item als Icon nehme, sind die Typen
  unterscheidbar.

## Der Fluid-Boost und eine wichtige COE-Eigenheit

Die Idee: einen Bohrvorgang beschleunigen/aufwerten, wenn man eine Flüssigkeit einspeist —
z.B. Sole (Brine) aus Mekanism, die sich über den Rotary Condensentrator in Fluid-Form bringen
lässt. Erst war ich skeptisch, ob das COE-Fluid-Interface Mekanism-Chemikalien überhaupt
annimmt; im Spiel ließ sich die Sole aber problemlos in einen Fluid-Tank und die Maschine
pumpen. Das Rezept-Format hatte ich aus COEs eingebautem Netherite-Rezept abgeleitet.

Die eigentliche Erkenntnis kam beim Testen: Ich hatte das Boost-Rezept mit **höherer Priorität**
auf dieselbe Ader gelegt, in der Annahme, COE falle ohne Fluid einfach aufs Basis-Rezept zurück.
Tut es **nicht.** COE wählt das höchstpriorisierte passende Rezept — und wenn dessen Fluid fehlt,
**stallt** der Vorgang, statt das Basis-Rezept zu nehmen. Ergebnis: mit Basic-Bohrkopf kam gar
nichts mehr aus dem Boden, und ich habe eine Weile an der völlig falschen Stelle gesucht. Der
echte gestaffelte Fluid-Boost muss also so gebaut werden, dass er das Basis-Rezept **nicht** per
Priorität überschreibt — vermutlich als eigene Adern-Variante. Das ist jetzt sauber als offener
Punkt notiert.

## Der große Rezept-Cleanup: vier Mod-Umbrüche auf einmal

Beim Aufräumen tauchten knapp zwanzig KubeJS-Fehler auf, die nichts mit der Erz-Progression zu
tun hatten — und mir vor Augen führten, wie sehr die Custom-Schicht meines Packs gegenüber den
Mods veraltet war. Gleich **vier** APIs hatten sich geändert:

- **Create 6, Mekanism 10.7, KubeJS 2101:** die High-Level-Rezept-Aufrufe (`crushing`,
  `mechanical_crafting`, `enriching`, `mixing`, `filling`) passten nicht mehr. Ich habe sie auf
  natives `event.custom`-JSON umgestellt — mit dem Format direkt aus den eingebauten Rezepten
  der jeweiligen Mod.
- **LootJS 3.x:** die alte Modifier-API war komplett ersetzt. Boss-Drops laufen jetzt über
  `LootJS.lootTables`.

Dazu eine ganze Reihe **falscher oder umbenannter IDs**, die ich mit KI-Unterstützung gegen die
Mod-Jars geprüft habe: aus `basic_gas_tank` wurde `basic_chemical_tank`, aus `lapis_essence`
ein `lapis_lazuli_essence`, ein falsch benanntes XP-Nugget, und — mein Favorit — eine
Flüssigkeit `hyper_experience`, die **schlicht nie existiert hat.** Die hatte ich irgendwann
selbst erfunden und nie registriert. Also habe ich sie als echten Fluid angelegt (mit eigenem
Tint, Textur wiederverwendet) und die ganze Katalysator-Kette darauf umgestellt. Zwei weitere
„Items", die ich im fremden Mod-Namespace erfunden hatte, sind rausgeflogen — die baue ich
später bei Bedarf als echte eigene Items neu.

## Was am Ende die Verwirrung auflöste

Das hartnäckigste Symptom — „kein Output" — war am Ende gar kein Bug, sondern eine Mischung aus
Selbsttäuschungen: der Brine-Test kaperte die Iron-Ader, und die Ley-Line liefert mit dem
Basic-Bohrkopf bewusst nichts, weil sie eine Tier-Stufe höher gegated ist. Die endliche Ader
gibt mit Basic-Kopf längst Erz. Das System funktioniert — ich hatte nur an mehreren Stellen
gleichzeitig die falschen Schlüsse gezogen. Eine gute Erinnerung daran, beim Debuggen jeweils
**eine** Variable zu isolieren, statt drei Hypothesen zu vermengen.

## Offene Punkte

- **Prioritäts-Richtung bestätigen:** ob COE bei mehreren passenden Rezepten das höher- oder
  niedriger-priorisierte nimmt — davon hängt ab, ob der Premium-Bonus des besten Bohrkopfs
  überhaupt auslöst.
- **Fluid-Boost neu denken:** als eigene Adern-Variante statt Prioritäts-Override.
- **LootJS-Truhen-/Adern-Drops:** die nicht-Entity-Modifier stehen noch aus.
- **Questline:** die neue Ressourcen-Progression muss in den Quests erklärt werden — sonst
  steht der Spieler vor einer Bohrmaschine und weiß nicht, warum sein Eisenerz weg ist.
- **Repo aufräumen und erste Veröffentlichung** planen.

Unterm Strich war das weniger ein Feature-Bau als eine Archäologie: vier Mod-Generationen, die
sich unter meinem Pack weggedreht haben, plus zwei, drei Fallen, die mir die KI im Log gezeigt
hat, ich aber selbst hätte vermeiden können. Das Erz-System steht jetzt — und ich habe eine
deutlich gesündere Skepsis gegenüber „grünen" statischen Checks.
