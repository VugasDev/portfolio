---
title: 'Pitfall: After the Reboot, Every Domain Returned 404'
description: A kernel update, a reboot of the Proxmox host, and all my services were gone from the outside, even though every container was running. The culprit was the order in which they started.
date: 2026-09-24
tags:
  - stolperstein
  - proxmox
  - traefik
  - pangolin
  - dns
  - homelab
draft: false
---

> **Pitfalls** are short posts about mistakes that cost me time, with the cause and the fix,
> so they don't cost you the same time.

## What happened

Routine work: a kernel update on my Proxmox host, then a reboot. All containers came up,
and Proxmox reported each of them as "running". Even so, **every** one of my domains
returned nothing but `404 Not Found` from the outside.

The services themselves were running. The reverse proxy was running too. The requests just
weren't arriving anywhere.

## The cause

External access runs through **Pangolin**, with **Traefik** working inside it as the
reverse proxy. Pangolin hooks its authentication into Traefik as a plugin called `badger`.
Every route that is reachable from the outside passes through this middleware.

Traefik downloads its plugins from the internet at startup. That requires DNS, and on my
network DNS comes from **AdGuard Home**, which runs in a different container on the same
host. With no defined start order, Traefik was faster:

```text
lookup plugins.traefik.io ... server misbehaving
Plugins are disabled because an error has occurred
invalid middleware "badger@http"
```

So the sequence was:

1. Traefik starts before AdGuard answers DNS queries.
2. The plugin download fails, and Traefik then disables **all** plugins.
3. Every route that uses `badger` becomes invalid and is dropped.
4. Traefik keeps running without those routes and does **not** retry.

The result: a running proxy without a single valid route, i.e. 404 for everything.

In hindsight, I actually like one detail of this: Traefik **dropped** the routes without
authentication instead of serving them unprotected. Better everything offline than
everything open.

## The fix

The immediate fix was restarting Traefik once DNS was back. Afterwards, the log has to show
`Plugins loaded.`

For the long term, I defined a start order in Proxmox: DNS first, then the identity
provider (Authentik), and finally the container running Pangolin and Traefik.

```bash
pct set <adguard-id>   --startup order=1,up=15
pct set <authentik-id> --startup order=2
pct set <pangolin-id>  --startup order=3
```

`up=15` makes Proxmox wait 15 seconds after starting AdGuard before the next container gets
its turn. That's generous, because AdGuard needs a few seconds after a restart before it
answers on port 53 again.

After every reboot of the host, I also check once from the outside whether a protected domain
responds with a redirect to the login (HTTP `302`) rather than a `404`.

## Takeaways

- **"Running" doesn't mean "working".** Every container was green, and the service was dead
  anyway. A test from the outside after every reboot is mandatory.
- **Boot-time dependencies are invisible until they break.** That my proxy needs DNS at
  startup wasn't written down anywhere, until the first reboot without a defined order.
- **A start order beats none, but it isn't a health check.** `up=15` is a delay, not a
  guarantee. It would be more robust if Traefik retried the plugin download, or if a check
  stepped in after boot.
