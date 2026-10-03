---
title: "Ich habe einen KI-Trader gebaut. Er verliert gegen Kaufen und Liegenlassen."
description: "Überall heißt es, ein Chatbot plus zwei Tools mache einen zum Trader. Ich wollte wissen, ob das überhaupt machbar ist, und habe es ehrlich gemessen: mit Spielgeld, Backtests und einem selbst trainierten Agenten. Das Ergebnis ist eindeutig."
date: 2026-08-16
tags:
  - ki
  - python
  - trading
  - reinforcement-learning
  - backtesting
draft: false
---

> **Vorweg:** Das hier ist ein Experiment und eine Spielerei, keine Anlageberatung. Es ist
> zu keinem Zeitpunkt echtes Geld geflossen. Gehandelt wurde ausschließlich auf einem
> Paper-Trading-Konto mit Spielgeld.

## Warum ich das gebaut habe

In meinem Feed laufen ständig Videos nach demselben Muster: „Verbinde Claude (oder ChatGPT,
oder Gemini) mit diesem Tool und jener Datenquelle, und die KI tradet für dich.“ Mal kopiert
sie angeblich die Käufe von Insidern und Politikern, mal liest sie Charts. Am Ende steht
fast immer ein „Kommentiere SIGNAL und ich schick dir die Anleitung“. Belege für echte
Gewinne zeigt so gut wie keins davon.

Mich hat nicht interessiert, ob man damit reich wird. Mich hat interessiert, ob die
Behauptung überhaupt **technisch und messbar** haltbar ist. Und wenn man das wissen will,
reicht es nicht, einem Chatbot ein paar Trades vorschlagen zu lassen und sich über die
Gewinner zu freuen. Man muss es so aufbauen, dass man sich nicht selbst belügen kann.

## Was ein Chatbot dabei eigentlich tut

Bevor ich etwas gebaut habe, habe ich mir angeschaut, was in diesen Setups passiert:

- **Das Sprachmodell entscheidet nichts, was eine einfache Regel nicht auch könnte.** „Kauf,
  was ein Insider gekauft hat“ ist eine Zeile Code. Die KI formuliert die Begründung dazu.
  Die klingt plausibel, ist aber keine Analyse, die einen Vorsprung verschafft.
- **Die Daten sind alt.** Abgeordnete im US-Kongress müssen Aktiengeschäfte erst bis zu
  45 Tage später melden. Was man „kopiert“, ist zu dem Zeitpunkt längst im Kurs.
- **Die gezeigten Renditen sind Backtests.** Die Datenanbieter schreiben selbst dazu, dass
  die Zahlen hypothetisch sind und Kosten, Slippage und Ausführung nicht abbilden.
- **Manche Plattformen handeln gehebelte Derivate**, keine echten Aktien. Das Risiko steht
  in keinem dieser Videos.

## Wie ich es stattdessen gemessen habe

Ich habe das Experiment ernster aufgezogen als ein Chat-Setup: ein eigenes System in
Python mit einem **selbst trainierten** Modell statt eines Sprachmodells, das nur Text
erzeugt. Wenn schon das keinen Vorteil findet, spricht wenig dafür, dass ein Chatbot es
tut.

Das Wichtigste daran ist nicht das Modell, sondern das Drumherum:

- **Eine gemeinsame Simulation für alles.** Backtest, Training und Live-Betrieb treffen
  ihre Entscheidungen über denselben Code. Es gibt also kein „im Backtest super, live
  kaputt“ durch zwei verschiedene Implementierungen.
- **Kein Blick in die Zukunft.** Die Merkmale, mit denen das Modell entscheidet, werden
  garantiert nur aus Kursen berechnet, die zum Entscheidungszeitpunkt schon bekannt waren.
  Dieser Fehler (Look-ahead) ist der häufigste Grund für traumhafte Backtests.
- **Kosten und Slippage** werden bei jeder simulierten Order abgezogen.
- **Ein Risikomanager** prüft jede Order, bevor sie rausgeht, und deckelt die Positionsgröße.
- **Vergleichsstrategien als Messlatte:** einfach kaufen und halten (Buy-and-Hold), eine
  simple Momentum-Regel und eine Zufallsstrategie als Untergrenze.

Der eigentliche „KI-Trader“ ist ein Reinforcement-Learning-Agent (PPO), der durch
Ausprobieren in der Simulation lernt, wann er kaufen, halten oder verkaufen soll.

Getestet habe ich das am S&P-500-ETF **SPY** in 15-Minuten-Kerzen von Juli 2020 bis Juni
2026, knapp 44.000 Kerzen. Und zwar **walk-forward**: Das Modell wird auf einem Zeitraum
trainiert und auf dem direkt folgenden, nie gesehenen Zeitraum bewertet. Das acht Mal
hintereinander, jeweils mit drei verschiedenen Zufalls-Startwerten. Ein Testfenster
entspricht ungefähr einem halben Börsenjahr.

Dazu gibt es eine Live-Schleife, die per Cron gegen ein Paper-Konto beim Broker Alpaca
läuft: echte Kurse, Spielgeld. Dass Orders dort ankommen, habe ich einmal geprüft, danach
lief sie nur im Beobachtungsmodus, mit der simplen Momentum-Regel als Platzhalter.

## Das Ergebnis

Median über alle Testfenster und Startwerte:

| Strategie | Sharpe-Ratio | Rendite je Testfenster |
|---|---|---|
| **Kaufen und halten** | **0,76** | **+4,9 %** |
| Momentum-Regel | 0,03 | −0,1 % |
| KI-Agent (PPO) | −1,19 | −2,8 % |
| Zufall | −5,44 | −30,5 % |

Die Sharpe-Ratio setzt die Rendite ins Verhältnis zum Risiko. Je höher, desto besser.

Der KI-Agent schlägt nur den Zufall. Gegen die simple Regel und gegen schlichtes Kaufen und
Liegenlassen verliert er, und in **sieben von acht** Testfenstern lag er im Minus. Gelernt
hat er vor allem eins: möglichst wenig zu handeln. Er hatte den geringsten Umsatz und den
kleinsten Verlust zwischendurch, weil er die meiste Zeit gar nicht investiert war.

Das ist kein Fehlschlag des Projekts, sondern genau die Antwort, die ich haben wollte. Ein
selbst trainiertes Modell auf normaler Hardware findet in einem der liquidesten Märkte der
Welt keinen Vorteil. Der Markt selbst, also einfach in einem steigenden Markt investiert zu
bleiben, war besser als jede Strategie, die versucht hat, schlauer zu sein. Den Agenten
habe ich deshalb nie an die Live-Schleife angeschlossen.

## Nachtrag: Kann mein Test überhaupt einen Vorteil finden?

Ein negatives Ergebnis hat eine Schwachstelle: Vielleicht ist nicht der Agent schlecht,
sondern die Messung blind. Deshalb habe ich im August eine **Placebo-Batterie** ergänzt:

- **Nullmodelle:** Dieselben Kauf- und Verkaufsentscheidungen werden zeitlich verschoben
  oder die Kurse so durchgemischt, dass jede echte Struktur verschwindet. Was eine Strategie
  auf diesen Daten erreicht, ist reines Glück. Erst wenn sie deutlich besser ist als ihr
  Placebo, zählt ein Ergebnis.
- **Ein im Code festgeschriebenes Urteil:** Die Schwellen für „Vorteil“ oder „kein Vorteil“
  stehen fest, bevor ein Lauf startet. Hinterher die Schwelle passend zu schieben, geht
  nicht.
- **Tests in beide Richtungen:** Eine Strategie mit eingebautem echtem Vorteil muss erkannt
  werden, reines Rauschen darf nicht durchkommen. Dazu ein Stolperdraht, der anschlägt, wenn
  Zukunftsdaten in die Merkmale gelangen.

Ein vollständiger Lauf der Batterie über die ganze Historie dauert mehrere Stunden. Der
steht noch aus. Sie kann das Ergebnis oben aber nur absichern, nicht umdrehen: Bewertet
wird genau so streng, dass im Zweifel „kein Vorteil“ herauskommt.

## Was ich mitnehme

- **„Die KI tradet für dich“ hält einer ehrlichen Messung nicht stand**, jedenfalls nicht mit
  dem, was ein Einzelner zu Hause bauen kann. Wer mehr behauptet, sollte Out-of-Sample-Zahlen
  zeigen, keine ausgewählten Gewinner-Trades.
- **Das Wertvolle ist die Messung, nicht das Modell.** Den größten Lerneffekt hatten die
  Simulation ohne Zukunftsdaten, die Walk-forward-Auswertung und die Frage, wie man sich
  selbst nicht in die Tasche lügt.
- **Kaufen und halten ist ein harter Gegner.** Jede Strategie muss erst einmal gegen die
  langweiligste Option gewinnen. Meine hat das nicht geschafft.

**Stack:** Python mit uv, pandas, Parquet-Cache, gymnasium und stable-baselines3 (PPO),
alpaca-py für Marktdaten und Paper-Trading, pytest mit über 130 Tests. Betrieben in einem
Container im Homelab, Schlüssel aus dem Passwort-Manager.
