---
title: A Paperless Office with RAG — Paperless-ngx That Talks Back
description: Making documents searchable with OCR is a solved problem. It gets interesting when you can question them with a local RAG chatbot and let an LLM assign the metadata.
date: 2026-05-26
tags:
  - paperless
  - ocr
  - rag
  - ai
  - self-hosting
draft: false
---

Everyone knows the shoebox full of invoices, contracts and letters from public authorities. My
digital version of it runs on **Paperless-ngx** — and since recently, I can not only search my
documents but *ask them questions*.

## The foundation: Paperless-ngx + OCR

Paperless-ngx takes in scanned PDFs or ones delivered by email, runs them through
**Tesseract OCR** and makes them full-text searchable. Every document gets a correspondent,
document type, tags and a date. That alone is already a win: never again "which folder was the
car insurance in again".

The stack runs in its own VM, cleanly separated from the rest of the homelab — documents are
the kind of data you don't want in the same segment as the IoT smart plugs.

## Step 2: Letting an LLM assign the metadata

OCR delivers text, but no understanding. Which document type is this? Who is the correspondent?
Instead of maintaining that by hand, I run a **local LLM** in batches over new documents: it
reads the OCR text, suggests document type, correspondent and tags, and writes them back via
the Paperless API. Local, because my mail shouldn't travel to a cloud provider.

```
Scan ──▶ Paperless (OCR) ──▶ full text
                                 │
                                 ▼
                       LLM (local, batch) ──▶ type / correspondent / tags
                                 │
                                 ▼
                       back via the Paperless API
```

## Step 3: RAG — talking to the documents

The real leap came with a **vector database (Qdrant)**. Each document's OCR text is split into
chunks, embedded and stored in Qdrant. A question like *"When does my home contents insurance
expire?"* is embedded as well, matched against the index — and the most relevant document
chunks end up as context in the LLM's prompt. Classic **retrieval-augmented generation**, just
over your own filing cabinet.

The result isn't a search hit but an answer *with a source*: the model names the document it
got the information from. Exactly this traceability makes the difference between "nice" and
"I trust it".

## Pitfalls

- **Chunk size.** Chunks that are too large dilute the match; chunks that are too small tear
  the context apart. Only experimenting with real documents helps here.
- **OCR quality carries through.** A badly scanned document produces bad text produces bad
  embeddings. Garbage in, garbage retrieved.
- **Privacy as a design principle.** The entire path — OCR, embeddings, LLM — stays local.
  With private mail that's not a nice-to-have, it's the whole reason to self-host it.

## Conclusion

Paperless makes documents searchable; RAG makes them *conversational*. The combination of OCR,
a local LLM for the metadata and a vector database for the questions turns a passive archive
into something that actually answers — without a single document leaving the house.
