---
title: When YouTube Says "Offline" but the Ping Goes Through
description: A DNS detective story from my homelab — how a well-meant AdGuard rule broke my YouTube playback and why an nslookup almost led me astray.
date: 2026-06-22
tags:
  - homelab
  - adguard
  - dns
  - ipv6
  - troubleshooting
draft: false
---

It started harmlessly. Suddenly I couldn't reach one of my servers via its domain anymore — a
domain of my own with a `.win` ending. Pinging the IP directly worked fine, and other DNS
resolvers found the domain too. Only my own network didn't. Clear case: DNS.

## Episode 1: The entire TLD was gone

My homelab DNS runs on **AdGuard Home**. I looked at the resolution and immediately saw the
telltale pattern: the domain resolved to `0.0.0.0` or `::` — AdGuard's classic "blocked"
answer. Not a network problem, a blocklist.

The cause was odd: one of my active lists (HaGeZi's _"The World's Most Abused TLDs"_) blocks
the entire `.win` top-level domain, because it's abused massively for spam and malware. My own
domain simply got caught in the net. The fix: an exception in the allowlist
(`@@||my-domain^`), and it was reachable again.

One thing I made a note of: AdGuard writes its `AdGuardHome.yaml` back from memory when it
stops. If you edit the file while the service is running, your change gets overwritten on the
next stop. The right order is always **stop → edit → start**.

So far, so quickly solved. The real mystery came afterwards.

## Episode 2: YouTube stutters — but only for me

For weeks I'd been getting interruptions on YouTube. Sometimes playback stalled, sometimes in
the middle of scrolling it said "**Connect to the internet — You're offline**". The annoying
part: I have YouTube Premium, so I don't get ads at all. My first reflex was: "Then I'll just
unblock YouTube in AdGuard, maybe that helps." I had even tried that already — it did nothing.

Before tinkering blindly any further, I narrowed the problem down properly. And that's the
real lesson of this post.

### Measure first, then tinker

I went through it step by step:

- **Resolution:** YouTube and the video CDN domains resolved cleanly — real Google IPs, no
  `0.0.0.0`. So YouTube wasn't blocked at the DNS level at all. My "unblocking" couldn't help,
  because there was nothing to unblock.
- **Uplink:** Ping to Google's CDN over IPv4 _and_ IPv6 — zero packet loss, \~16 ms, clean
  path MTU. The internet connection was perfectly healthy.
- **Scope:** Only one device affected. Wired. Only YouTube — Netflix, Twitch and co. ran
  smoothly.

That eliminated a whole series of suspects: no DNS block, no Wi-Fi, no uplink, no
network-wide problem. I was about to blame the browser — until I reproduced it in incognito
mode _and_ in a second browser. So it was system-wide, not the browser.

### The red herring: IPv6

My working hypothesis was a broken IPv6 path. Modern clients prefer IPv6 (Happy Eyeballs),
and if it routes badly you get exactly these kinds of timeouts. So I tested directly on the
PC: `ping -6` to YouTube — and it ran flawlessly, 0% loss, even while the problem was
happening. Hypothesis refuted. Good thing I measured instead of guessing.

But if IPv6 works and you still get "offline" even though the ping goes through — then a
_specific domain_ that YouTube needs to function is being blocked.

### The query log doesn't lie

Instead of guessing further, I looked at the **AdGuard query log** and, with AI assistance,
filtered my client IP's entries for blocked Google/YouTube domains. The result was a punch in
the face:

| Domain | blocked |
| --- | --- |
| `www.youtube.com` | several thousand times |
| `accounts.youtube.com` | over a thousand times |
| the `googlevideo.com` streaming servers | massively |

More than 26,000 blocks in total. These weren't the ad domains — this was YouTube's **core
functionality**: feed, login, thumbnails, the actual video stream. The AI showed me the exact
rule in the log that triggered it, and the truth came out.

### The punchline: my own old "fix"

The rules causing it looked like this:

```plain
||www.youtube.com^$dnstype=AAAA
||googlevideo.com^$dnstype=AAAA
||ytimg.com^$dnstype=AAAA
```

These were **AAAA block rules** — at some point I had added them myself to force YouTube onto
IPv4 (a well-known anti-buffering trick). The idea: suppress IPv6 for YouTube. The catch: my
client _wanted_ IPv6 (which worked perfectly), but no longer got AAAA answers for the video
and feed domains. Mixed with the optimistic DNS cache, that led to dropped connections —
exactly the interruptions and "offline" messages.

My well-meant fix from back then had become the cause. And the best part: my original
instinct — "unblock YouTube" — was actually right. The block just wasn't where I first looked.

## Where a quick test almost fooled me

An honest point I don't want to hide: early in the process, I'd used a single `nslookup` to
check whether the AAAA rules were taking effect — and got real IPv6 addresses back. From that
I concluded the rules were ineffective. Wrong. The query log proved the opposite: they were
blocking by the tens of thousands. The single lookup had fooled me through caching.

**Lesson:** To verify whether something is being blocked, the query log is the truth — not a
handful of spot checks. Spot checks can lie because of caches.

## What's left

I removed the five AAAA rules (dutifully via stop → edit → start), the YouTube domains have
resolved cleanly over IPv4 _and_ IPv6 ever since, and on the client side I flushed the DNS
cache once (`ipconfig /flushdns` plus the browser's internal DNS cache).

Three things I'd take away:

1. **Aggressive blocklists catch bycatch.** Blocking an entire TLD or the AAAA records of a
   legitimate site has side effects that only show up weeks later.
2. **"Offline" despite a working ping = DNS or a single domain.** If ICMP works but the app
   reports "no connection", a very specific endpoint is usually missing.
3. **Measuring beats guessing — and the right tool beats the quick one.** The query log
   cleared up in five minutes what I had misjudged for weeks.

Sometimes the most stubborn bug in the homelab isn't the vendor's, but your own workaround
from half a year ago that you'd long forgotten.
