---
title: AdGuard Home as a Network-Wide DNS Filter
description: Block ads and trackers network-wide, resolve internal domains and prevent DNS bypassing — AdGuard Home as the central resolver in your homelab.
date: 2026-06-03
difficulty: Einsteiger
tags:
  - dns
  - adguard
  - network
  - self-hosting
series: ''
order: null
draft: false
---

> **Note:** IP addresses are example values. Plan a fallback (a second resolver or a short TTL)
> before you switch your whole network to a single DNS server — otherwise, if it fails, it feels
> like half the internet fails with it.

**AdGuard Home** is a self-hosted DNS resolver with filter lists: it blocks ads and trackers for
*all* devices on the network — including the ones you can't install an ad blocker on (smart TV,
console, IoT). This guide shows the setup as the central resolver.

## 1. Installation

Easiest as a container in a lightweight LXC or on a small host:

```yaml
services:
  adguardhome:
    image: adguard/adguardhome
    volumes:
      - ./work:/opt/adguardhome/work
      - ./conf:/opt/adguardhome/conf
    network_mode: host       # most convenient for DNS on port 53
    restart: unless-stopped
```

After starting it, go through the setup wizard at `http://<host>:3000`, create an admin account
and set the upstream DNS (e.g. a DoH/DoT provider of your choice for encrypted upstreams).

## 2. Rolling it out network-wide

There are two ways to make all devices use AdGuard:

- **Via DHCP (recommended):** In your DHCP server (router/OPNsense), set the DNS server for each
  subnet to the AdGuard IP (e.g. `10.0.1.254`). With its next lease, every device automatically
  uses AdGuard.
- **Manually:** Point individual devices directly at the AdGuard IP.

## 3. Resolving internal domains (split DNS)

The big advantage of your own resolver: you can assign internal names. Under *Filters → DNS
rewrites* (or DNS overrides), you resolve e.g. `*.lab.example.com` or individual hostnames to
internal IPs:

```
jellyfin.lab.example.com   →   10.0.10.14
vault.lab.example.com      →   10.0.10.30
```

That way you reach your services internally via meaningful names, while external queries are
resolved outside as usual — that's **split DNS**.

## 4. Preventing DNS bypassing

Many devices (IoT in particular) come with **hard-coded** DNS servers and ignore your DHCP
settings — and with them, your filters. You close that gap on the firewall (see the
[zero-trust guide](/en/guides/vlan-zero-trust-opnsense)):

1. **Block:** forbid all DNS queries (port 53) to *other* servers.
2. **Redirect (DNAT):** transparently redirect port 53 to your AdGuard IP.

This guarantees that every name resolution on the network goes through AdGuard — no matter what
the device has configured.

## 5. Sensible filter lists

Less is more: a few well-maintained lists block reliably without constantly producing false
positives. Proven choices:

- AdGuard DNS filter (the base)
- A reputable tracker/malware list
- If needed, an allowlist for services that break with overly aggressive lists

> **Tip:** AdGuard's query log is worth its weight in gold when debugging. If a service doesn't
> work, you immediately see which domain was blocked — and can allow it specifically.

## Conclusion

AdGuard Home is one of the most rewarding homelab projects: set up in half an hour, noticeable
right away (fewer ads on *every* device) and the foundation for clean split DNS. Combined with
enforced DNS on the firewall, it becomes a filter that no device on the network can bypass.
