---
title: A Firewall Audit via API — When the GUI Lies and pfctl Tells the Truth
description: A complete audit of my OPNsense zero-trust rules via the API. How a supposedly critical DNS bug turned out to be a display artifact — and why you always have to cross-check firewall rules in the live kernel.
date: 2026-06-04
tags:
  - opnsense
  - homelab
  - security
  - firewall
  - dns
draft: false
---

In the post about the [network upgrade](/en/blog/netzwerk-upgrade), I teased it: the VLAN
segmentation turned into a real zero-trust firewall with default deny and a DNS hijack block. A
few weeks later, I wanted to know whether everything still works as intended — and ran a
complete audit of my OPNsense, with an AI as my assistant at the terminal. Via the API, not the
GUI. The result was more instructive than expected.

## The setup: API instead of clicking around

OPNsense can be controlled entirely through a REST API. Credentials live in an `.env`, the
rest is `curl`:

```bash
curl -sk -u "$KEY:$SEC" https://<opnsense>/api/firewall/filter/searchRule | jq
```

That let me read out all \~70 filter rules, the DNAT redirects and the NAT configuration and
compare them against my documentation. First finding: the docs were outdated in several
places — one rule still referenced an old domain name, and a WireGuard rule was hanging around
dead on a long-disabled interface.

## The supposed worst case

Then the shock: the DNAT rules that carry my DNS hijack protection showed
`destination_port: null` and `enabled: null` in the API. These rules are meant to force every
device — even a smart TV with a hard-coded `8.8.8.8` — to be transparently redirected to my
AdGuard resolver. If they're broken, half of my security concept falls flat.

Only a cross-check via a different API endpoint (`getRule` instead of `searchRule`) and a look
at the raw config XML gave the all-clear: the rules are **active and correct**. The search API
simply doesn't return certain fields — negations (`!`) and ports don't show up there.

**Lesson 1:** Never blindly trust a single API view. Different endpoints show different partial
truths.

## The only source of truth: pfctl

To be absolutely sure, I needed a look into the running packet filter in the kernel. And this
is where it got interesting: SSH access to OPNsense normally lands in the interactive menu (the
famous "option 8 for shell"). Useless for automation — or so I thought.

It turns out the menu **only appears for interactive logins**. An SSH call _with_ a command
goes straight through:

```bash
ssh root@<opnsense> '/bin/sh -c "pfctl -sr | grep vlan04"'
```

A small trap: the root shell is `csh`, which doesn't understand bash-style redirections like
`2>/dev/null` ("Ambiguous output redirect"). The fix: wrap everything in `sh -c '...'`.

With `pfctl -vvsr` (rules including hit counters), `pfctl -sn` (NAT/redirects) and `pfctl -ss`
(state table), I finally had the actual truth. And it looked different from what the rule names
suggested.

## The real surprise: a rule-order puzzle

In the live rule set, I saw this for the IoT VLAN:

```plain
@141 block drop in quick on vlan04 inet from <iot-subnet> to 10.0.0.0/8       [Packets: 122]
@163 pass  in       quick on vlan04 inet ... to <adguard-ip> port = domain    [Packets: 0]
```

My AdGuard resolver sits **inside** the RFC1918 range `10.0.0.0/8`. The RFC1918 isolation rule
(`block … to 10/8`) is `quick` and comes **before** the DNS allow rule. By pf logic ("first match
wins"), it should swallow every DNS query to AdGuard. The counter confirmed it: the DNS allow
rule had let **zero packets** through.

Panic? Briefly. Because my network demonstrably worked. The answer lay in DHCP: Kea doesn't hand
out AdGuard directly as the DNS server, but the **gateway IP of each VLAN** (i.e. the VLAN's own
firewall address). Devices ask their gateway — the firewall itself — and the DNAT redirect
transparently steers the `:53` packet to AdGuard. That's why the explicit allow rules
effectively never match, and the system works anyway.

The 122 blocked packets? Not DNS, but correctly isolated IoT broadcasts and cross-VLAN attempts
by a smart home device. Exactly what zero trust is supposed to filter out.

**Lesson 2:** A rule can have the right effect, but for a completely different reason than its
name suggests. Without looking at the state table and the hit counters, I'd never have
understood that — and in the worst case "fixed" something that wasn't broken.

## What actually got improved

After all the detective work, real, clean changes remained:

- **Removed four dead/redundant rules** — including two that allowed DNS to `any:53` and
  thereby (coming before the hijack block in evaluation order) undermined the actual
  protection. Now the DNS hijack block is a _real_ enforcer, not just decoration.
- **Tightened DMZ isolation:** the (still empty) DMZ VLAN had no RFC1918 blocks. Added them
  proactively, so a future host there is isolated from day one.
- **Documented everything** — including the gateway DNS path, so I don't trip over the same
  puzzle at the next audit.

Every change went through the API, was applied and then verified again in the live pf kernel.
With a backup beforehand, of course.

## Conclusion

Three things I'm taking away. First: management APIs are convenient, but they show a curated
view — the packet filter in the kernel is the only source of truth. Second: rule names are
statements of intent, not proof of behavior; hit counters don't lie. And third: an AI at the
terminal speeds up an audit like this enormously — as long as I verify each of its findings
empirically myself instead of believing the first impression. Exactly this moment of
"🔴 critical → just a display artifact after all" taught me more about my own network than any
green status page.
