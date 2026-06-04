---
title: Paperless-ngx mit RAG-Chatbot
description: Papierloses Dokumenten-Management aufsetzen — OCR mit Paperless-ngx, KI-gestützte Metadaten und ein lokaler RAG-Chatbot über Qdrant, der deine Dokumente beantwortet.
date: 2026-06-03
difficulty: Fortgeschritten
tags:
  - paperless
  - ocr
  - rag
  - ai
  - docker
series: ''
order: null
---

> **Hinweis:** Der gesamte hier beschriebene Pfad — OCR, Embeddings, LLM — bleibt **lokal**. Bei
> privater Post (Verträge, Rechnungen, Behörden) ist das kein Nice-to-have, sondern der Grund,
> es überhaupt selbst zu hosten.

Ziel dieses Guides: Dokumente nicht nur durchsuchbar machen, sondern *befragbar*. In drei Stufen —
von OCR über automatische Metadaten bis zu einem lokalen **RAG-Chatbot**.

## Stufe 1: Paperless-ngx + OCR

Paperless-ngx nimmt PDFs (Scan, Upload oder per Mail) entgegen, jagt sie durch **Tesseract-OCR** und
macht sie volltextdurchsuchbar.

```yaml
services:
  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx
    environment:
      PAPERLESS_OCR_LANGUAGE: deu+eng
      PAPERLESS_REDIS: redis://broker:6379
      PAPERLESS_DBHOST: db
    volumes:
      - ./data:/usr/src/paperless/data
      - ./media:/usr/src/paperless/media
      - ./consume:/usr/src/paperless/consume   # hier landen neue Dokumente
    restart: unless-stopped
  # + postgres (db) + redis (broker)
```

Alles, was im `consume`-Ordner landet, wird automatisch verarbeitet, mit OCR versehen und indexiert.
Den Stack in einer eigenen VM/Segment betreiben — Dokumente gehören nicht zwischen die IoT-Geräte.

## Stufe 2: Metadaten per LLM

OCR liefert Text, aber kein Verständnis. Statt Dokumenttyp, Korrespondent und Tags von Hand zu
pflegen, lässt du ein **lokales LLM** im Batch über neue Dokumente laufen. Grober Ablauf eines
Skripts gegen die Paperless-REST-API:

```python
# 1. Neue Dokumente ohne Korrespondent holen
docs = api.get("/api/documents/?correspondent__isnull=true")

for doc in docs:
    text = api.get(f"/api/documents/{doc['id']}/")["content"]    # OCR-Text
    # 2. Lokales LLM klassifizieren lassen
    meta = llm.classify(text)   # → {typ, korrespondent, tags}
    # 3. Zurückschreiben
    api.patch(f"/api/documents/{doc['id']}/", json=meta)
```

Das LLM läuft lokal (z. B. via Ollama) — kein Dokument verlässt das Haus.

## Stufe 3: RAG mit Qdrant

Jetzt der spannende Teil: mit den Dokumenten *reden*. Dafür brauchst du eine Vektordatenbank —
**Qdrant** ist leichtgewichtig und self-hosted.

```
                  ┌────────────────────┐
  OCR-Text  ──▶   │  Chunking + Embed  │  ──▶  Qdrant (Vektor-Index)
                  └────────────────────┘
                                                     ▲
  Frage  ──▶  Embed  ──▶  Ähnlichkeitssuche  ───────┘
                                │
                                ▼
                 relevante Chunks  ──▶  LLM-Prompt  ──▶  Antwort + Quelle
```

**Indexieren:** OCR-Text jedes Dokuments in Chunks zerlegen, einbetten und mit Metadaten
(Dokument-ID) in Qdrant ablegen.

**Fragen:** Die Nutzerfrage einbetten, gegen Qdrant matchen, die besten Chunks als Kontext in den
Prompt geben. Das LLM antwortet — und nennt das Quelldokument. Genau diese **Quellenangabe** macht
den Unterschied zwischen „nett" und „vertrauenswürdig".

## Stolpersteine

- **Chunk-Größe.** Zu groß → unscharfe Treffer, zu klein → zerrissener Kontext. Mit echten
  Dokumenten testen.
- **OCR-Qualität schlägt durch.** Schlechter Scan → schlechter Text → schlechte Embeddings.
- **Embedding-Modell konsistent halten.** Index und Anfrage müssen mit demselben Modell eingebettet
  werden, sonst passt der Vektorraum nicht zusammen.

## Fazit

Paperless macht Dokumente durchsuchbar, das LLM vergibt die Metadaten, und Qdrant macht den
Aktenschrank gesprächsfähig. Drei überschaubare Bausteine — und am Ende beantwortet dein Archiv
Fragen, ohne dass ein Dokument das Haus verlässt.
