---
title: Ein Abruf statt dreißig — wie ein Datenschutzgespräch meine Stundenplan-App umgebaut hat
description: Meine App holte für jeden Nutzer denselben Klassenplan einzeln. Der Umbau auf einen Abruf je Klasse hat mich mehr über Prüfen gelehrt als über Architektur.
date: 2026-09-13
tags:
  - flask
  - python
  - webuntis
  - datenschutz
  - pwa
  - homelab
draft: true
---

Ich besuche gerade drei Klassen an zwei Schulen — Berufsschule und Fachschule parallel.
Drei Stundenpläne in zwei verschiedenen WebUntis-Instanzen, mit unterschiedlichen
Anfangszeiten. Morgens in drei Portale zu schauen, um herauszufinden, wo ich als
Nächstes sein muss, hat mich genug genervt, dass ich mir eine kleine Flask-App gebaut
habe, die alles in einer Ansicht bündelt.

Die lief eine Weile gut. Dann wollte ich sie Mitschülern geben — und ab da wurde es
interessant.

## Das Problem, das erst bei mehreren Nutzern entsteht

Die erste Fassung war naheliegend gebaut: Jede Person hinterlegt ihre WebUntis-Zugangsdaten,
für jedes Konto läuft ein eigener Abruf. Für mich allein völlig in Ordnung.

Bei dreißig Leuten aus derselben Klasse sind es dreißig Abrufe für **eine einzige
Information**. Der Plan ist ja derselbe. Und die Last landet nicht bei mir, sondern beim
WebUntis-Server der Schule.

Solange das so war, verbot sich auch jedes kurze Abrufintervall. Der Job lief einmal
täglich — was bei Vertretungsstunden ungefähr so nützlich ist wie ein Wetterbericht von
gestern.

Das zweite Problem war unangenehmer: Die App speicherte fremde WebUntis-Passwörter.
Verschlüsselt, aber sie lagen da. Eines pro Person.

## Das Gespräch, das alles gedreht hat

Mein Plan war, die Schule um offizielle Klassenpläne zu bitten. Ein Lesezugang, ein Abruf
je Klasse, fertig.

Die Antwort war ein Nein — und zwar mit einer Begründung, die ich vorher nicht auf dem
Schirm hatte. Wer alle Klassenpläne hat, kann für die **gesamte Belegschaft** nachvollziehen,
wer wann wo ist. Das ist ein Bewegungsprofil über Lehrkräfte und Schüler, und das gibt eine
Schule keiner Einzelperson in die Hand. Völlig zu Recht, wenn ich ehrlich bin.

Bemerkenswert fand ich, was mein Lehrer dann von sich aus vorgeschlagen hat, ohne dass ich
es ins Gespräch gebracht hätte: Eine Person pro Klasse stellt ihren Zugang bereit, alle
anderen weisen nur noch nach, dass sie zu dieser Klasse gehören. Genau das Modell, das ich
als Notlösung im Hinterkopf hatte — nur dass es jetzt kein Workaround war, sondern der Weg,
den die Schule selbst als gangbar bezeichnet hat.

## Der Teil, den ich mir selbst aufschreiben musste

Beim Aufschreiben des Konzepts ist mir aufgefallen, dass das Argument der Schule nicht
verschwindet, nur weil die Daten jetzt über Freiwillige hereinkommen. **Es verlagert sich
zu mir.** Jeder Klassenplan enthält Lehrerkürzel und Räume. Bei mehreren bereitgestellten
Klassen kann ich den Tagesablauf einzelner Lehrkräfte rekonstruieren — und die haben in
gar nichts eingewilligt. Der bereitstellende Schüler verfügt über seinen Zugang, nicht
über die Daten Dritter.

Das hat mich dazu gebracht, ein paar Dinge nicht als „nice to have", sondern als Bedingung
in die Spezifikation zu schreiben:

- **Keine Historie.** Was außerhalb des Abruffensters liegt, wird bei jedem Abruf gelöscht.
  Es gibt kein Archiv vergangener Wochen, aus dem sich Gewohnheiten ablesen ließen.
- **Kein klassenübergreifender Zugriff.** Auch nicht für mich als Betreiber. Es gibt keine
  Ansicht „alle Klassen".
- **Widerruf jederzeit**, und der löscht die Zugangsdaten sofort — nicht irgendwann.
- **Aufklärung vor der Eingabe**, nicht im Kleingedruckten.

Rückblickend ist das der wertvollste Teil des ganzen Projekts. Nicht der Code.

## Vorher messen, statt hinterher raten

Bevor ich das Datenmodell darauf ausgerichtet habe, wollte ich eine Sache wissen: Darf ein
normaler Schüler-Zugang überhaupt den **Klassen**plan abrufen, oder nur den eigenen? Viele
WebUntis-Installationen erlauben nur Letzteres. Wäre das so, wäre der bereitgestellte Plan
der Plan des Spenders — bei Wahlpflichtkursen also falsch für alle anderen.

Also habe ich es mit meinem eigenen Zugang ausprobiert, bevor ich irgendwas gebaut habe.
Ergebnis: Der Klassenplan ist abrufbar und **deckungsgleich** mit meinem persönlichen —
null Abweichung in beide Richtungen. Und der Versuch, eine fremde Klasse abzurufen, wurde
mit `no right for timetable` abgewiesen. Die Berechtigung ist also auf die eigene Klasse
beschränkt, was den Einwand der Schule technisch zusätzlich entschärft.

Was ich bewusst **nicht** getestet habe: ob sich an der anderen Schule fremde Klassenpläne
abrufen lassen. Das wäre ein Zugriff auf Daten, die ich nicht brauche und die die Schule
ausdrücklich nicht herausgeben will. Nicht zu wissen, ob es ginge, ist hier die sauberere
Position.

## Der Umbau

`WebUntisAccount` — bis dahin Zugangsdaten, Abruf und Stundenplan in einem — wurde in zwei
Dinge zerlegt:

| Vorher | Nachher |
|---|---|
| Konto pro Person, mit Zugangsdaten | **Klassenquelle**: eine Zeile je Klasse, mit den Daten der bereitstellenden Person |
| Stunden hängen am Konto | **Mitgliedschaft**: wer darf welche Klasse lesen |

Dazu die Abrufregeln: alle 90 Minuten zwischen 6 und 22 Uhr, manuell frühestens alle 15
Minuten je Klasse. Innerhalb der Frist bekommt man den gespeicherten Stand mit Altersangabe
statt einer Fehlermeldung.

Der systemd-Timer weckt dabei halbstündlich, aber **entscheiden** tut die Anwendung. So
steht die Regel an einer Stelle statt doppelt in systemd und im Code — sonst driften die
beiden garantiert irgendwann auseinander.

## Drei Dinge, die grüne Tests nicht gefunden haben

Ich habe den Umbau in zehn Schritte zerlegt, jeden mit Tests zuerst, und nach jedem Schritt
gegen die Anforderungen prüfen lassen. Am Ende stand eine Prüfung über den gesamten Stand.
Die hat drei Sachen gefunden, die es sonst auf den Server geschafft hätten — obwohl alle
Tests grün waren.

**1. Der Beitritt prüfte gar nichts.**

Die Route, die die Klassenauswahl entgegennimmt, übernahm Schule, Klassen-ID, Benutzername
und Passwort ungeprüft aus dem Formular. Die Prüfung der Zugehörigkeit lief einen Schritt
vorher — und es gab nichts, was beide Schritte aneinander band. Ein direkter POST genügte,
um einer beliebigen Klasse beizutreten und **erfundene Zugangsdaten** zu hinterlegen.
Danach gilt die Klasse als versorgt, echte Bereitsteller werden abgewiesen, und jeder
Abruf erzeugt einen fehlschlagenden Login.

Alle sieben Tests für diesen Schritt waren grün. Sie prüften nur den regulären Weg.

Der Fehler stand übrigens schon in meinem eigenen Implementierungsplan — ich hatte den
unsicheren Code dort vorgegeben und er wurde brav so umgesetzt. Behoben habe ich es mit
einem signierten, kurzlebigen Token, das die verifizierte Klassenliste trägt; die Route
nimmt Server und Schule jetzt ausschließlich daraus.

**2. Die Migration hätte die Datenbank unbenutzbar gemacht.**

`db.create_all()` legt fehlende **Tabellen** an. Bestehende lässt es in Ruhe. Da eine Spalte
umbenannt wurde, wäre nach dem Deploy jede Abfrage mit `no such column` gescheitert — bei
einer Flask-App heißt das: jede Seite ein 500er, und der Migrationsbefehl hätte es nicht
reparieren können.

Lokal fällt das nie auf, weil Testdatenbanken frisch angelegt werden.

Das Ärgerliche: Zwei Wochen später ist mir beim nächsten Feature **derselbe** Fehler fast
wieder passiert, als eine neue Spalte dazukam. Diesmal ist es mir noch im Branch aufgefallen.
Seitdem gibt es einen idempotenten Befehl, der fehlende Spalten per `ALTER TABLE` nachträgt,
und er steht als fester Schritt in der Upgrade-Anleitung.

**3. Eine plausible Regel, die nicht stimmte.**

Für das automatische Stilllegen beendeter Klassen wollte ich die Laufzeit aus dem
Klassennamen ableiten. Das Schema ist Kürzel + eine Ziffer fürs Einschulungsjahr +
Parallelklasse, also etwa `AB42` für Bildungsgang AB, 2024, Klasse 2. Meine Annahme:
dreibuchstabige Kürzel sind Fachschulklassen mit vier Jahren, zweibuchstabige Berufsschule
mit drei.

Klang schlüssig. Also habe ich die echten Klassenlisten ausgezählt, bevor ich es gebaut habe:
An einer Schule folgen von über 160 Klassen **28 dem Schema überhaupt nicht** (Namen wie
„Beratung"). Die andere führt zusätzlich **einbuchstabige** Kürzel. Und in derselben
Dreibuchstaben-Gruppe stehen vierjährige Fachschulklassen direkt neben Kürzeln, die
offensichtlich für ein- bis zweijährige Bildungsgänge stehen.

Nach meiner Regel wäre eine kurze Klasse jahrelang unnötig abgerufen worden — und schlimmer:
eine vierjährige Fachschulklasse mit kurzem Kürzel **ein Jahr zu früh stillgelegt** worden.
Mitten im laufenden Bildungsgang.

Jetzt ist es eine gepflegte Liste statt einer Regel. Ein Kürzel ohne Eintrag wird **nie**
stillgelegt, und die Oberfläche weist aus, wenn eine Laufzeit unbekannt ist.

## Die Fehlerarten sind nicht gleich schwer

Bei derselben Sache ist mir etwas klar geworden, das ich mitnehme: Die einstellige
Jahresziffer ist mehrdeutig — „4" kann 2014 oder 2024 heißen. Bei drei bis vier Jahren
Laufzeit liegen zwei Jahrgänge mit gleicher Ziffer aber immer zehn Jahre auseinander, also
praktisch nie im Konflikt.

Trotzdem musste ich mich entscheiden, in welche Richtung ich im Zweifel auflöse. Und da sind
die beiden Fehler eben **nicht** gleich teuer:

- Eine laufende Klasse zu früh stillzulegen nimmt ihren Mitgliedern mitten im Schuljahr den
  Plan weg.
- Eine längst beendete Klasse weiter abzurufen kostet einen überflüssigen Abruf.

Also löse ich zum späteren Jahr auf. Die Regel steht als Kommentar im Code, damit sie nicht
irgendwann jemand „aufräumt".

## Zum Schluss: aufs Handy

Als ich die App Mitschülern gezeigt habe, kam sofort die Frage nach einer App. In die
Stores wollte ich nicht — Entwicklergebühren für eine Schul-App sind es mir nicht wert.

Also eine installierbare Web-App: Manifest, Icons, Service Worker. Android bietet
„App installieren" an, auf iOS geht es über Teilen → „Zum Home-Bildschirm". Zwei Details,
die leicht schiefgehen:

- Manifest und Service Worker müssen an die **Wurzel**. Aus `/static/` darf ein Service
  Worker die Seiten der Anwendung gar nicht behandeln.
- iOS wertet das Manifest nicht aus und braucht `apple-touch-icon` separat — ohne
  Transparenz, sonst wird es schwarz hinterlegt.

Für offline habe ich zwei Strategien getrennt: Die Oberfläche kommt aus dem Speicher,
**Seiten aber erst aus dem Netz** und nur bei Fehlschlag aus dem Cache. Ein veralteter Plan,
der so aussieht wie ein aktueller, wäre schlimmer als gar keiner. Getestet habe ich es,
indem ich den Server abgeschaltet und neu geladen habe — der Plan war vollständig da, und
die Linie der aktuellen Uhrzeit lief weiter, weil die im Browser rechnet.

Beim Abmelden schickt der Server `Clear-Site-Data`. Auf einem geteilten Gerät soll nichts
zurückbleiben — das war für mich die Bedingung, den Plan überhaupt aufs Gerät zu legen.

Der Dunkelmodus war dann fast ein Nebenprodukt. Der Aufwand steckte nicht im Umschalter,
sondern darin, dass die Stundenblöcke eigene Farbvariablen hatten, die nur hell definiert
waren. Ohne die hätte der Plan im Dunkeln gleißend weiß geleuchtet.

## Was ich mitnehme

Ich habe in diesem Projekt viel mit KI-Unterstützung gearbeitet — Code geschrieben, Pläne
gegengeprüft, Reviews fahren lassen. Das Nützlichste daran war nicht der erzeugte Code,
sondern die Angewohnheit, **jede Annahme vorher zu messen**: Erlaubt WebUntis das überhaupt?
Wie heißen die Klassen wirklich? Was passiert mit der bestehenden Datenbank?

Drei von drei Annahmen, die ich für offensichtlich hielt, waren falsch. Und die eine
Sicherheitslücke, die es fast auf den Server geschafft hätte, stammte aus meinem eigenen
Plan — nicht aus einer schlampigen Umsetzung.

Grüne Tests heißen, dass das getestet wurde, woran ich gedacht habe. Nicht mehr.
