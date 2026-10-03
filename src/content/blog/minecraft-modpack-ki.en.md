---
title: A Minecraft Modpack with AI in the Build Loop
description: How I'm building a Create-centric kitchen-sink modpack for NeoForge 1.21.1 — custom items and fluids via KubeJS, 58 quests and an AI-assisted workflow against API madness.
date: 2026-05-16
tags:
  - minecraft
  - neoforge
  - kubejs
  - modding
  - ai
draft: false
---

Modpack development is surprisingly close to "real" software development: dependencies,
version conflicts, brittle APIs and a build pipeline that throws a fit at the slightest
inconsistency. My current hobby project is a **Create-centric kitchen-sink modpack** for
NeoForge 1.21.1 — and I'm developing it with an AI as a pair programmer in the loop.

## What's inside

- **Create** as the centerpiece — mechanical automation instead of pure energy bars
- Custom items and a custom fluid (`mythic_liquid_xp`) via **KubeJS**
- A custom drill head mechanic using the native recipe API
- A **catalyst node system**: finite nodes plus an infinite ley line as a late tech gate
- **58 quests** across five tiers — the complete progression, fully localized in English
- Customized world generation (Tectonic) with fixed values

## Why AI at all?

The most painful part of modding isn't the idea, it's the **API friction**. KubeJS and mod
APIs change between versions, error messages are cryptic (`FluidBuilder API error`,
`KubeJS 2101 compatibility error`), and a single wrong method name breaks the entire script
load. This is exactly where an AI is strong: it knows the typical signatures, can infer the
likely cause from the stack trace and delivers a first patch.

My loop looks roughly like this:

```
Idea  ──▶  AI generates KubeJS script  ──▶  game loads scripts
   ▲                                              │
   └──────  error log back to the AI  ◀───────────┘
```

The commit history reads accordingly: `feat: drill head system` immediately followed by
`fix: FluidBuilder API error`, `fix: KubeJS 2101 compatibility`, `fix: SNBT format of the
quests`. That rapid back-and-forth between building and fixing is exactly where the AI saves
time.

## Where the AI hits its limits

- **Recipe isolation.** The AI understands at a small scale that a new item mustn't
  accidentally overwrite vanilla recipes — but I have to keep the big picture of hundreds of
  recipes in my head.
- **Game feel.** Whether a tech gate feels *fair* or just annoying is something no model can
  judge. That's playtesting, and it stays manual work.
- **SNBT & quest format.** FTB Quests in SNBT format are picky; it took more manual
  adjustment than I would have liked.

## Status & learnings

Currently at `v0.1.35-alpha` — playable, but still alpha. The biggest learning is about method:
a modpack benefits from the same disciplines as any software project — small commits,
meaningful version numbers, isolated changes. The AI speeds up the writing, but replaces
neither versioning nor testing. It's a very fast junior, not an architect.
