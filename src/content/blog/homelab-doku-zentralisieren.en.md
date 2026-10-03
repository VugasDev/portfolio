---
title: One Central Documentation for Many Projects — and the Leak That Almost Came Along
description: How I split my homelab monorepo into separate projects, bundled the documentation into its own repo and gave every project real context — including a plaintext password that almost slipped through during the migration.
date: 2026-06-04
tags:
  - homelab
  - dokumentation
  - claude-code
  - automation
  - security
draft: false
---

For a long time, my homelab lived in one big repo: code, dashboard, docs, agent definitions —
all in `homelab-ai`. Handy for getting started, messy as it grew. So I split up the projects:
each one under `~/projects/<name>/` with its own Git repo. That cleanly separated the code —
but the shared documentation was left hanging.

## Starting point

- The infrastructure docs (firewall rules, network plan, DNS, services) were still in the old
  monorepo
- The fresh project `CLAUDE.md` files were empty templates — pointing to dead paths
  (`~/homelab-ai/...`)
- There was no shared place where an individual project could look up _how_ to reach, say,
  the firewall via SSH or API

The goal: a central, separately versioned documentation repo as the single source of truth,
and projects that reference it — without duplicating each other.

## The approach

I set up a new repo, `homelab-docs`, and migrated all the infrastructure docs into it. Its
centerpiece is an `access.md`: a table of all SSH and API access points with host, port and
auth method — but **without secrets**. Instead of passwords, it only lists the name of the
Vaultwarden entry. The actual secrets stay in the password manager.

Every project `CLAUDE.md` now only contains pointers to the relevant doc files ("for access
see `access.md`, for the rule set see `FIREWALL.md`"). They're loaded on demand, not
automatically — that keeps the context window small and avoids every session dragging along
the entire homelab documentation.

## What went wrong — almost

While migrating the old docs into the new repo, I had an AI cross-check the diffs — and it
pointed out a line that easily slips through with plain copy-paste: two files contained the
**Wi-Fi PPSKs in plaintext** — and they had already been pushed to the (private) GitHub repo
with the first commit.

Fortunately the response was quick: redact the values, replace them with `<PSK …>`
placeholders plus a Vaultwarden reference, and since the repo was brand new, cleanly rewrite
the history and force-push. Then a second occurrence in a migrated spec — same procedure.

The lesson afterwards was almost the more important one: before frantically tearing apart the
history of the **old** repo, a hard look at the facts paid off. The commit with the passwords
only existed there on a local branch that had never been pushed — it had never reached GitHub.
A hasty history rewrite would have destroyed uncommitted work and gained nothing. **Measure
first, then shred.**

## What it achieved

- Documentation that belongs to all projects and is versioned separately
- Projects that know their own context — the firewall project now knows where SSH and the API
  are, without a single secret in the repo
- A repeatable template that points to the right paths
- And, along the way, the reminder that migrations are exactly the moments when secrets
  quietly come along — a deliberate review pass is mandatory, and a second pair of eyes (here
  an AI going over the diffs) catches exactly the line you overlook yourself

The next open item: rotating the exposed PPSKs anyway. They were only really exposed briefly —
but with a password, "briefly exposed" just isn't the same as "never".
