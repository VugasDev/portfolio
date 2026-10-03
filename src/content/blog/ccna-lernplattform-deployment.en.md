---
title: 'A CCNA Learning Platform in the Homelab: Deployment and a Cookie That Wouldn''t Stay'
description: How I deployed my self-built Next.js learning platform as an LXC on Proxmox — and why the login still didn't work at first.
date: 2026-06-12
tags:
  - homelab
  - proxmox
  - nextjs
  - deployment
  - debugging
draft: false
---

For my CCNA exam preparation, I built my own learning platform: Next.js 15, Prisma with
SQLite, a question bank with a good 160 practice questions including exhibits, an exam mode and
statistics. Until now, it only ran locally in the dev environment. Time to deploy it properly —
on my Proxmox host, where my other services already run as containers.

## Reusing the deployment pattern

Instead of inventing something new, I adopted the pattern of my existing containers: an
unprivileged LXC with Debian 12, its own IP in the server VLAN, autostart, storage on the ZFS
pool. With AI assistance, I briefly cross-checked beforehand which IPs in the segment were
already taken and how the existing containers were configured — that keeps the setup
consistent, and the docs keep matching reality.

The actual deployment was then unspectacular, which is exactly how it should be:

1. Node 22 from the NodeSource packages into the container
2. Project copied over as a tarball (without `node_modules` and `.next` — those are built on
   the target)
3. `npm ci`, `prisma db push`, seed with the question import
4. Production build and a small systemd unit with `Restart=on-failure`

The seed ran cleanly, all questions imported, the app answered with HTTP 200. Done — or so I
thought.

## "I can't log in"

On the first real test in the browser: filled in the login form, submitted it — and landed back
on the login page. No error message, no crash, just no session.

The reflex would have been to doubt the password or the seed and change things on a hunch.
Instead, I first reproduced the problem outside the browser and went through the auth code with
the AI. A `curl` directly against the login API gave the answer in a single line:

```plain
HTTP/1.1 200 OK
set-cookie: session=…; Path=/; Secure; HttpOnly; SameSite=lax
```

The login worked perfectly on the server side. But the session cookie came with the `Secure`
flag — and at that point I was still accessing it over plain HTTP via the internal IP. Browsers
only ever store `Secure` cookies over HTTPS. So the server created the session correctly, the
browser silently threw the cookie away, and on the next request I was anonymous again.

The cause was in my own code: the flag was tied to `NODE_ENV === "production"`. An assumption
that's completely right in production behind a TLS-terminating proxy — but that implicitly
presumes "production" always means "HTTPS".

## The fix: a secure default, an explicit way out

Simply hard-disabling the `Secure` flag would have been the wrong fix — the platform was going
to be reachable via its own subdomain with TLS shortly afterwards anyway. Instead, I made the
behavior overridable via an environment variable: the default stays `Secure` in production, and
I only set the override in the container for the HTTP transition phase.

```ts
secure:
  process.env.NODE_ENV === "production" &&
  process.env.SECURE_COOKIES !== "false",
```

Once the subdomain with TLS was up, the override went back out, and I verified with `curl`
that the cookie is delivered with the `Secure` flag again. A nice side effect of this order:
internal access over HTTP now deliberately no longer works for logins — there's exactly one
clean way onto the platform.

## Takeaways

- **Proof first, then the fix.** A single targeted `curl` narrowed the problem down
  unambiguously before I touched anything. Without looking at the `Set-Cookie` header, I'd
  probably have suspected the password and the seed first — both were innocent.
- **`NODE_ENV=production` is not a synonym for HTTPS.** Tying cookie flags to it builds in a
  hidden assumption that strikes exactly when you "just quickly" test without TLS.
- **Keep overrides explicit and temporary.** The insecure mode was a deliberate, documented
  exception with an expiry date — not the new normal.
- **Deployment patterns pay off.** Because all containers follow the same scheme, the new
  service was in production in under an hour — debugging included.
