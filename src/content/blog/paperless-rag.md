---
title: Papierloses Büro mit RAG — Paperless-ngx, das mit mir spricht
description: Dokumente per OCR durchsuchbar machen ist gelöst. Spannend wird es, wenn man sie mit einem lokalen RAG-Chatbot befragen und die Metadaten von einem LLM vergeben lassen kann.
date: 2026-05-26
tags:
  - paperless
  - ocr
  - rag
  - ai
  - self-hosting
---

Jeder kennt den Schuhkarton voller Rechnungen, Verträge und Behördenpost. Meine digitale Version
davon läuft auf **Paperless-ngx** — und seit Kurzem kann ich meine Dokumente nicht mehr nur
durchsuchen, sondern *befragen*.

## Die Basis: Paperless-ngx + OCR

Paperless-ngx nimmt eingescannte oder per Mail eingelieferte PDFs entgegen, jagt sie durch
**Tesseract-OCR** und macht sie volltextdurchsuchbar. Jedes Dokument bekommt Korrespondent,
Dokumenttyp, Tags und Datum. Das allein ist schon ein Gewinn: nie wieder „in welchem Ordner war
nochmal die KFZ-Versicherung".

Der Stack läuft in einer eigenen VM, sauber vom Rest des Homelabs getrennt — Dokumente sind die
Art von Daten, die man nicht im selben Segment wie die IoT-Steckdosen haben will.

## Schritt 2: Metadaten vom LLM vergeben lassen

OCR liefert Text, aber kein Verständnis. Welcher Dokumenttyp ist das? Wer ist der Korrespondent?
Statt das händisch zu pflegen, lasse ich ein **lokales LLM** im Batch über neue Dokumente laufen:
Es liest den OCR-Text, schlägt Dokumenttyp, Korrespondent und Tags vor und schreibt sie über die
Paperless-API zurück. Lokal deshalb, weil meine Post nicht zu einem Cloud-Anbieter wandern soll.

```
Scan ──▶ Paperless (OCR) ──▶ Volltext
                                 │
                                 ▼
                       LLM (lokal, Batch) ──▶ Typ / Korrespondent / Tags
                                 │
                                 ▼
                       zurück über die Paperless-API
```

## Schritt 3: RAG — mit den Dokumenten reden

Der eigentliche Sprung kam mit einer **Vektordatenbank (Qdrant)**. Der OCR-Text jedes Dokuments
wird in Chunks zerlegt, eingebettet und in Qdrant abgelegt. Eine Frage wie *„Wann läuft meine
Hausratversicherung aus?"* wird ebenfalls eingebettet, gegen den Index gematcht — und die
relevantesten Dokument-Chunks landen als Kontext im Prompt des LLM. Klassisches
**Retrieval-Augmented Generation**, nur eben über den eigenen Aktenschrank.

Das Ergebnis ist kein Suchtreffer, sondern eine Antwort *mit Quellenangabe*: das Modell nennt das
Dokument, aus dem es die Information hat. Genau diese Nachvollziehbarkeit macht den Unterschied
zwischen „nett" und „vertraue ich".

## Stolpersteine

- **Chunking-Größe.** Zu große Chunks verwässern den Treffer, zu kleine zerreißen den Kontext.
  Hier hilft nur Ausprobieren mit echten Dokumenten.
- **OCR-Qualität schlägt durch.** Ein schlecht gescanntes Dokument liefert schlechten Text liefert
  schlechte Embeddings. Garbage in, garbage retrieved.
- **Datenschutz als Design-Prinzip.** Der gesamte Pfad — OCR, Embeddings, LLM — bleibt lokal. Das
  ist bei privater Post kein Nice-to-have, sondern der ganze Grund, es selbst zu hosten.

## Fazit

Paperless macht Dokumente durchsuchbar; RAG macht sie *gesprächsfähig*. Die Kombination aus OCR,
lokalem LLM für die Metadaten und einer Vektordatenbank für die Fragen verwandelt ein passives
Archiv in etwas, das tatsächlich antwortet — ohne dass ein einziges Dokument das Haus verlässt.
