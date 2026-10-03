---
title: Every Ore Only Through the Drill — and the API Swamp Behind It
description: How I rebuilt all ore extraction in my Minecraft modpack around Create Ore Excavation — tier gating, veins, fluid boost — and fought my way through Rhino traps, wrong mod IDs and four mod API breaks along the way.
date: 2026-06-19
tags:
  - minecraft
  - modding
  - kubejs
  - create
  - debugging
draft: false
---

For my modpack "Gaia Awakening", I wanted to do one thing fundamentally differently from almost
every other pack: **you shouldn't mine ores anymore.** No classic cave mining, no naturally
generated ore veins. Instead, every ore comes out of the ground exclusively via
**Create: Ore Excavation** (COE) — through veins that you tap with a drilling machine and the
right drill head. Sounds like a config change. It turned into one of the toughest debugging
sessions I've had on the pack.

## The target picture

- **Worldgen off:** no natural ore blocks, no vanilla veins.
- **Every ore as a COE vein:** a _finite_ vein (it depletes) plus an _infinite_ ley line
  (renewable, but gated one drill head tier higher).
- **Hard tier gating:** the basic drill head only reaches tier 1 ores; higher ores need better
  heads. Solved cumulatively via item tags.
- **Multiplication stays:** the ×16 processing path downstream (Create/Mekanism) is preserved.

The logic for this lives in KubeJS scripts that generate the veins and drilling recipes. And
that's exactly where the tuition fees started.

## Trap 1: Static checks lie with Rhino

KubeJS runs on **Rhino**, not Node. I had safeguarded my scripts with `node --check` — green
light. In the game, though, the drill heads **couldn't be inserted into the machine**. With AI
assistance, I looked at the KubeJS server log, and there was a hard syntax error in exactly the
script that adds the drill heads to the COE tag.

The cause: I had used the **spread operator** (`[a, b, ...rest]`) and `Object.values()`. Node
swallows that without complaint — Rhino throws a syntax error and **discards the entire file**.
As a result, the heads never landed in the `createoreexcavation:drills` tag, and the machine
rejected them. A single too-modern language construct, and a whole feature was dead.

Lesson: `node --check` is worthless for KubeJS as soon as you use modern JS. I now additionally
screen my scripts with grep for spread, `Object.values`, `?.` and `??` — and deliberately write
"boring" JS with `.concat()` and explicit arrays.

## Trap 2: Formats only the game knows

The second trap of the same kind: COE expects the **name of a vein as a string** (more
precisely: as a stringified text component), not as an object. I had passed a `{text, color}`
object — `node --check` doesn't see anything there, and on load the parsing of all veins
aborted. I only found it because I tested it **in the game**, and the log showed the concrete
`JsonParseException`.

That became the basic pattern of the whole session: codec/format errors from mods are
practically impossible to catch statically. What helped: I used the **mods' own built-in
recipes** as templates — looking directly into the mod jars at how COE writes its drilling
recipe with a fluid, how Create builds its crushing recipe. Those JSON formats are the
authoritative truth, not any documentation.

## Spacing and radar colors

Two polishing topics that took several rounds:

- **Vein spacing:** At first, all veins were far too close together, then (after
  overcorrecting) far too far apart — partly tens of thousands of blocks. I settled on a
  tier-scaled middle ground where the veins feel like rare finds without being impossible to
  find.
- **Radar colors:** In the vein finder overlay, all veins were orange and indistinguishable.
  The reason: the overlay colors the markers by the vein's **icon** — and I had set the gray ore
  block as the icon. Since I use the colorful raw item as the icon, the types can be told apart.

## The fluid boost and an important COE quirk

The idea: speed up or upgrade a drilling operation when you feed in a fluid — e.g. brine from
Mekanism, which can be turned into fluid form via the rotary condensentrator. At first I was
skeptical whether COE's fluid interface would accept Mekanism chemicals at all; in the game,
though, the brine could be pumped into a fluid tank and the machine without problems. I had
derived the recipe format from COE's built-in netherite recipe.

The real insight came during testing: I had put the boost recipe on the same vein with **higher
priority**, assuming COE would simply fall back to the base recipe without the fluid. It does
**not.** COE picks the highest-priority matching recipe — and if its fluid is missing, the
operation **stalls** instead of taking the base recipe. Result: with the basic drill head,
nothing came out of the ground anymore, and I spent a while searching in completely the wrong
place. So a real tiered fluid boost has to be built so that it does **not** override the base
recipe via priority — probably as its own vein variant. That's now cleanly noted as an open
item.

## The big recipe cleanup: four mod breaks at once

While cleaning up, almost twenty KubeJS errors showed up that had nothing to do with the ore
progression — and showed me how outdated my pack's custom layer had become relative to the
mods. No fewer than **four** APIs had changed:

- **Create 6, Mekanism 10.7, KubeJS 2101:** the high-level recipe calls (`crushing`,
  `mechanical_crafting`, `enriching`, `mixing`, `filling`) no longer fit. I switched them to
  native `event.custom` JSON — with the format taken directly from each mod's built-in recipes.
- **LootJS 3.x:** the old modifier API had been completely replaced. Boss drops now go through
  `LootJS.lootTables`.

On top of that, a whole series of **wrong or renamed IDs** that I checked against the mod jars
with AI assistance: `basic_gas_tank` became `basic_chemical_tank`, `lapis_essence` became
`lapis_lazuli_essence`, a misnamed XP nugget, and — my favorite — a fluid called
`hyper_experience` that **simply never existed.** I had made it up myself at some point and
never registered it. So I created it as a real fluid (with its own tint, reusing a texture) and
switched the entire catalyst chain over to it. Two more "items" I had invented in a foreign
mod's namespace got thrown out — I'll rebuild them later as real items of my own if needed.

## What finally cleared up the confusion

The most stubborn symptom — "no output" — turned out not to be a bug at all, but a mix of
self-deceptions: the brine test hijacked the iron vein, and the ley line deliberately yields
nothing with the basic drill head, because it's gated one tier higher. The finite vein had
long been giving ore with the basic head. The system works — I had just drawn the wrong
conclusions in several places at once. A good reminder to isolate **one** variable at a time
when debugging, instead of mixing three hypotheses.

## Open items

- **Confirm the priority direction:** whether COE picks the higher- or lower-priority recipe
  when several match — that determines whether the best drill head's premium bonus triggers at
  all.
- **Rethink the fluid boost:** as its own vein variant instead of a priority override.
- **LootJS chest/vein drops:** the non-entity modifiers are still pending.
- **Questline:** the new resource progression needs to be explained in the quests — otherwise
  players stand in front of a drilling machine without knowing why their iron ore is gone.
- **Clean up the repo and plan a first release.**

All in all, this was less feature building than archaeology: four generations of mods that had
shifted out from under my pack, plus two or three traps the AI showed me in the log that I
could have avoided myself. The ore system is in place now — and I have a much healthier
skepticism towards "green" static checks.
