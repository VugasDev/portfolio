---
title: Paperless-ngx with a RAG Chatbot
description: Set up paperless document management — OCR with Paperless-ngx, AI-assisted metadata and a local RAG chatbot via Qdrant that answers questions about your documents.
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
draft: false
---

> **Note:** The entire path described here — OCR, embeddings, LLM — stays **local**. With private
> mail (contracts, invoices, letters from authorities), that's not a nice-to-have, it's the
> reason to self-host it in the first place.

The goal of this guide: make documents not just searchable, but *answerable*. In three stages —
from OCR to automatic metadata to a local **RAG chatbot**.

## Stage 1: Paperless-ngx + OCR

Paperless-ngx takes in PDFs (scan, upload or via email), runs them through **Tesseract OCR** and
makes them full-text searchable.

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
      - ./consume:/usr/src/paperless/consume   # new documents land here
    restart: unless-stopped
  # + postgres (db) + redis (broker)
```

Everything that lands in the `consume` folder is automatically processed, OCR'd and indexed. Run
the stack in its own VM/segment — documents don't belong between the IoT devices.

## Stage 2: Metadata via LLM

OCR delivers text, but no understanding. Instead of maintaining document type, correspondent and
tags by hand, you run a **local LLM** in batches over new documents. The rough flow of a script
against the Paperless REST API:

```python
# 1. Fetch new documents without a correspondent
docs = api.get("/api/documents/?correspondent__isnull=true")

for doc in docs:
    text = api.get(f"/api/documents/{doc['id']}/")["content"]    # OCR text
    # 2. Let the local LLM classify it
    meta = llm.classify(text)   # → {type, correspondent, tags}
    # 3. Write it back
    api.patch(f"/api/documents/{doc['id']}/", json=meta)
```

The LLM runs locally (e.g. via Ollama) — no document leaves the house.

## Stage 3: RAG with Qdrant

Now the exciting part: *talking* to the documents. For that you need a vector database —
**Qdrant** is lightweight and self-hosted.

```
                  ┌────────────────────┐
  OCR text  ──▶   │  chunking + embed  │  ──▶  Qdrant (vector index)
                  └────────────────────┘
                                                     ▲
  question  ──▶  embed  ──▶  similarity search  ─────┘
                                │
                                ▼
                 relevant chunks  ──▶  LLM prompt  ──▶  answer + source
```

**Indexing:** split each document's OCR text into chunks, embed them and store them in Qdrant
with metadata (document ID).

**Asking:** embed the user's question, match it against Qdrant, and pass the best chunks into the
prompt as context. The LLM answers — and names the source document. Exactly this **source
reference** makes the difference between "nice" and "trustworthy".

## Pitfalls

- **Chunk size.** Too large → blurry matches, too small → torn-apart context. Test with real
  documents.
- **OCR quality carries through.** Bad scan → bad text → bad embeddings.
- **Keep the embedding model consistent.** The index and the query must be embedded with the
  same model, otherwise the vector spaces don't match.

## Conclusion

Paperless makes documents searchable, the LLM assigns the metadata, and Qdrant makes the filing
cabinet conversational. Three manageable building blocks — and in the end your archive answers
questions without a single document leaving the house.
