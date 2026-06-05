---
title: Firefly III self-hosted — und die Import-Odyssee dahinter
description: Wie ich Firefly III zum Finanz-Tracking aufgesetzt habe und warum aus „CSV importieren" ein mehrstündiger Debugging-Krimi um IBANs, 504-Timeouts und eine O(n)-Saldenberechnung wurde.
date: 2026-06-05
tags:
  - firefly-iii
  - self-hosted
  - proxmox
  - docker
  - debugging
  - homelab
draft: true
---

Ich wollte endlich Überblick über meine Finanzen. Die Wahl fiel auf **Firefly III** —
self-hosted, Open Source, volle Datenhoheit. Das Aufsetzen war eine Stunde Arbeit. Der
eigentliche CSV-Import meiner Kontoumsätze hat mich dann den halben Abend gekostet — und war
rückblickend die beste Lehrstunde in systematischem Debugging seit Langem.

## Das Setup

Firefly läuft als eigener unprivilegierter LXC (ID 119) auf meinem Proxmox-Host im SRV-VLAN.
Der Stack ist ein schlankes Docker-Compose:

- **Firefly III Core** (die App)
- **PostgreSQL** als Datenbank
- **Cron** für wiederkehrende Buchungen
- **Data Importer** für CSV- und Bank-Importe

Nach außen via Pangolin-Tunnel mit vorgeschalteter SSO-Auth, intern über den Caddy-Wildcard-
Reverse-Proxy. Backup über den wöchentlichen Proxmox-vzdump. So weit,
so Routine. Dann kam der Import.

## Akt 1: Null importiert

Erster Versuch: CSV hochladen, Spalten mappen, „Run" — und es passiert **nichts**. Kein
einziger Umsatz landet in Firefly. Statt zu raten, habe ich in die Logs geschaut. Die Antwort
stand dort glasklar als HTTP 422:

> Could not find a valid source account when searching for ID "0" or name "L.M. Stuhlmacher".

Firefly konnte mein eigenes Konto nicht auflösen. Der Grund: Asset-Konten legt Firefly
**niemals automatisch** an, und meine Konten hatten keine IBAN hinterlegt. Die CSV liefert auf
der „Ich"-Seite meine IBAN — ohne Match kein gültiges Quellkonto, also Ablehnung jeder Buchung.

Bevor ich das als Lösung verkauft habe, habe ich es **bewiesen**: eine Test-Buchung per API
gepostet (→ 422), die IBAN ans Konto geschrieben, die identische Buchung erneut gepostet
(→ 200), und beides wieder aufgeräumt. Reproduktion, Fix, Verifikation, kein Rückstand. IBANs
gesetzt, weiter geht's.

## Akt 2: Der 504

Mit IBANs lief ein kleiner Import sauber durch. Die **ganze** Datei (gut 4.000 Buchungen aus
vier Jahren) quittierte der Importer dann mit:

> AxiosError: Request failed with status code 504

Ein Gateway-Timeout. Der erste Reflex „Timeout hochdrehen" wäre falsch gewesen — erst messen.
Die Logs zeigten: die **Konvertierung** der Datei lief komplett durch. Es war die
**Submission**, bei der jede Buchung einzeln an die API geht, die in den nginx-Timeout lief.
Also den Browser-Weg ganz umgehen und headless über die CLI des Importers importieren. Kein
Web-Timeout mehr — aber jetzt wurde es richtig interessant.

## Akt 3: Warum dauert ein einzelner Insert 11 Sekunden?

Der CLI-Import lief, aber quälend langsam: drei, vier Buchungen alle 30 Sekunden. Hochgerechnet
**Stunden**. Die POST-Timestamps in den Logs zeigten \~10 Sekunden Abstand pro Buchung. Zehn
Sekunden ist eine verdächtig „timeout-förmige" Zahl, also habe ich der Reihe nach ausgeschlossen:

- **Webhooks?** Deaktiviert (404). Raus.
- **Regeln?** Null Stück. Raus.
- **Externer Netzwerk-Call?** Outbound aus dem Container war schnell (GitHub 0,08 s). Raus.
- **`apply_rules`/`fire_webhooks`-Flags?** Messmatrix mit allen vier Kombinationen: überall
  \~11 s. Raus.

Ein einzelner direkter API-POST brauchte ebenfalls 11 Sekunden — also lag es an Firefly selbst,
nicht am Importer. Der entscheidende Test war dann simpel: dieselbe Buchung auf ein **leeres**
Konto posten statt auf mein volles Hauptkonto.

| Ziel-Konto | Buchungen im Konto | Dauer eines Inserts |
| --- | --- | --- |
| Cash wallet | 0 | **0,41 s** |
| Hauptkonto | 869 | **11 s** |

Damit war die Ursache bewiesen: Firefly berechnet bei jedem Insert die **Running Balance des**
**Kontos neu — O(n)** über alle Buchungen. Weil fast jeder Umsatz mein Hauptkonto berührt, wurde
jeder weitere Insert teurer. Ein klassisches Skalierungsproblem, das bei kleinen Datenmengen nie
auffällt.

## Der Fix: die schwere Arbeit asynchron

Die Lösung war, die teure Neuberechnung aus dem Request-Pfad zu nehmen: Firefly temporär auf
eine **Datenbank-Queue** umgestellt und einen `queue:work`-Worker gestartet. Damit verlagert
sich die Saldenberechnung in den Hintergrund. Die Hypothese habe ich wieder erst an **einer**
Buchung getestet, bevor der große Import lief:

> POST aufs Hauptkonto: **11 s → 0,54 s**.

Bestätigt. Voll-Import gestartet — und dank „classic"-Duplikaterkennung übersprang er die bereits
importierten Buchungen sauber, statt Dubletten zu erzeugen. Am Ende lagen alle \~4.100 Umsätze
drin: Ausgaben, Einnahmen und — korrekt erkannt — die vielen Mini-Transfers meines
Aufrund-Sparens zwischen Giro- und Sparkonto. Danach einmal `refresh-running-balance`, und
zurück auf den synchronen Default. Denn für den Alltag braucht es die Queue gar nicht: ein
**heute** datierter Insert ist auch ohne Worker in 0,5 s durch — nur das einmalige Einfügen
**alt-datierter** Massendaten ist teuer.

## Akt 4: Die Salden stimmen trotzdem nicht

Geschafft? Fast. Die Endsalden lagen daneben — mein Hauptkonto zeigte 699 € statt 42 €. Der
Grund war hausgemacht: Ich hatte bei der Kontoerstellung den _aktuellen_ Stand als Opening
Balance eingetragen und dann die _komplette Historie_ obendrauf importiert. Das doppelt sich.

Dazu kam mein eigener Altlasten-Effekt: früher hatte ich mehrere Unterkonten, deren Transfers in
der Historie stecken, aber nicht mehr als Konten existieren. Statt hunderte Altbuchungen zu
reparieren, habe ich den pragmatischen Weg gewählt, für den die **Opening Balance** genau da ist:
sie als Ausgleichswert so gesetzt, dass der heutige Stand auf den Cent stimmt. Ein bisschen
Mathe — `Soll-Saldo − Summe(Buchungen)` — und beide Konten passten.

## Was ich mitnehme

- **Logs zuerst, raten nie.** Jede der vier Hürden stand als klare Fehlermeldung oder Messzahl
  im Log. Die Lösung war fast immer schon da, man musste nur hinschauen.
- **Hypothesen isoliert testen.** Leeres Konto vs. volles Konto, eine Flag-Variable nach der
  anderen — erst die saubere Messung hat die O(n)-Saldenberechnung entlarvt, die ich sonst nie
  vermutet hätte.
- **Fixes beweisen, nicht behaupten.** Reproduktion → Fix → Verifikation → aufräumen, jedes Mal.
- **Das richtige Werkzeug für den Job.** Browser-Importer für den Monatsabschluss, CLI +
  temporäre Queue für den einmaligen Vier-Jahres-Berg.

Firefly läuft jetzt, die Zahlen stimmen, und ich habe nebenbei den ganzen Import-Workflow samt
Performance-Falle dokumentiert — damit der nächste Import ein Klick und kein Abend wird.
