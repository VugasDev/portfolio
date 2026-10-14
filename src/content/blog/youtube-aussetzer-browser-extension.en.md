---
title: YouTube "Offline", Part 2 — This Time It Was a Browser Extension
description: The YouTube dropouts were back. I built my own network monitoring for my desktop to catch them — and in the end the cause was somewhere else entirely.
date: 2026-10-14
tags:
  - homelab
  - troubleshooting
  - windows
  - powershell
  - networking
draft: false
---

Back in the summer I had already fought YouTube dropouts once. That time the culprit was my
own [AAAA rules in AdGuard](/en/blog/youtube-aussetzer-adguard). I removed the rules and
considered the matter closed. Then, in the fall, the symptoms came back, almost word for
word.

## The symptoms

- In the middle of a video or while scrolling, YouTube showed "**Connecting to the
  internet**" again.
- "Retry" didn't help. Pressing F5 or going back to the start page did.
- With Shorts, no new videos loaded after five to ten of them. A little later it worked
  again.

After the lesson from part 1, I wanted to measure before guessing.

## The usual suspects

My first look went to AdGuard again. In the process I stumbled over a completely different
problem: the query log had **no entries at all** for several days. The container's disk had
filled up. So the data was missing for exactly the period I wanted to investigate. I
enlarged the storage and set the retention properly. From then on I could see something
again:

- AdGuard answered quickly, in the low double-digit milliseconds.
- The only thing still blocked was advertising, nothing from YouTube's core functions.
- The firewall showed not a single drop from my PC.
- I had already disabled QUIC in the browser, which changed nothing.

So the network looked unremarkable. But the problem only occurred sporadically, and by the
time I could look, it was usually over.

## A flight recorder for the desktop

So, with the help of AI, I built a small monitoring tool for my Windows desktop. I called
it **NetMon**, and it is pure PowerShell. The idea: record continuously in the background
and, the moment the problem hits, save a "case" with a keystroke. Afterwards I can match
that case against the AdGuard log.

- **Packet capture as a ring buffer** using the built-in Windows tool `pktmon`. It runs
  all the time and overwrites itself so the disk doesn't fill up.
- **Probes every 60 seconds** against DNS, HTTPS and the gateway. That way I can see
  whether the network itself hiccupped at that moment.
- **Chrome NetLog**: a launch parameter makes Chrome record its network events. For that
  the script adjusts the shortcuts and the registry entry, backing up the originals first
  so everything can be rolled back.
- **Save a case via hotkey**: `Ctrl+Alt+N`, and everything from the last few minutes lands
  in its own timestamped folder.
- **A watchdog** checks that all parts are still running.

I had to rebuild the hotkey twice. My first choice was already taken. Then it turned out
that an Explorer shortcut with a key combination is unreliable. In the end it became a
small hotkey process of its own. I wrote everything on my homelab host. The tests ran with
Pester directly on the desktop, and I deployed via SSH. To test the monitoring I blocked
YouTube on purpose. Only once it captured this artificial outage cleanly was it allowed to
run for real.

Over the following days I saved **19 cases**.

## The resolution

In the end it wasn't the network at all. My browser was sending **far too many requests**
to YouTube.

The culprit was the extension **"YouTube Anti Translate"**. It is only supposed to stop
YouTube from automatically translating video titles. To do that, however, it triggered
**dozens of additional requests** for every real request I made. To YouTube it looked as
if I was watching 30 to 60 videos at the same time. No wonder the platform eventually shut
the door and sent me "offline".

I removed the extension. Since then YouTube has run for several days without a single
dropout.

## What I take away

1. **Rule out the browser first, then the network.** A clean browser profile without
   extensions would have spared me building the whole monitoring setup. I had tested this
   in part 1, but back then the cause really was somewhere else. This time I didn't repeat
   the test because I had "already done it". Same symptoms don't mean the same cause.
2. **Check beforehand that the logging itself works.** A query log that stays silent
   because of a full disk is worse than none at all, because it looks as if there is
   nothing to see.
3. **If you measure, you also have to clean up.** I built NetMon with an uninstall script
   from the start. Scheduled tasks, Chrome parameters, the hotkey process and finally a
   good 16 GB of captures were gone again within a few minutes.

The tool wasn't the hero of the story in the end. But it showed me where I no longer had
to look.
