---
title: 'Pitfall: One AdGuard Rate Limit for an Entire VLAN'
description: 'I wanted to harden my DNS server against abuse and ended up giving every device on a network one shared bucket of 30 queries per second. The result: Wi-Fi yes, internet no.'
date: 2026-05-21
tags:
  - stolperstein
  - adguard
  - dns
  - homelab
draft: false
---

> **Pitfalls** are short posts about mistakes that cost me time, with the cause and the fix,
> so they don't cost you the same time.

## What happened

My DNS runs network-wide on **AdGuard Home**, and it's reachable on the go via
DNS-over-HTTPS (DoH). While hardening that access, I wanted to prevent abuse and set a rate
limit in `AdGuardHome.yaml`:

```yaml
dns:
  ratelimit: 30
  ratelimit_subnet_len_ipv4: 24
```

Sounds reasonable: at most 30 queries per second, then throttle. Shortly after, it started:
devices were connected to Wi-Fi but had "no internet". Pages loaded forever, domains
wouldn't resolve. Local services reached by IP, on the other hand, kept working.

I noticed it myself, and there was no hint of the cause anywhere: AdGuard reported no
error, the devices just showed "no internet".

## The cause

The important part is the second line. `ratelimit_subnet_len_ipv4: 24` tells AdGuard to
**group clients by /24 subnet** for the limit. The limit then applies per network, not per
device.

In a segmented home network, though, a /24 is typically an entire VLAN. All clients, or all
IoT devices, were sharing **one** bucket of 30 queries per second. A single phone running
TikTok or a streaming box starting up can use that up on its own. After that, the whole VLAN
stopped getting answers.

The nasty part: AdGuard drops the excess queries **silently**. They don't show up as errors
in the query log; the clients just run into timeouts. To users, it looks exactly like the
internet connection is down.

## The fix

For the internal network, I turned the limit off:

```yaml
dns:
  ratelimit: 0
```

The reasoning: the clients on the LAN are my own devices, and the resolver doesn't need to
defend itself against them. A rate limit belongs where outside queries come in, i.e. on the
public DoH path at the reverse proxy, not on the DNS server the whole house relies on.

If you do need the limit in AdGuard, keep two things in mind:

- **Count per IP instead of per subnet**, i.e. set the subnet length to `32`.
- **Exempt your own LAN**, so internal devices never get throttled in the first place.

## Takeaways

- A rate limit is only as good as the unit it counts. "30 per second" sounds generous until
  you realize twenty devices are sharing those 30.
- "Wi-Fi connected, but no internet" while IP connections still work is almost always DNS.
- Protective measures belong at the boundary where the threat appears. Pointed inward, they
  mostly hit you.
