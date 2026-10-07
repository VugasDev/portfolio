---
title: 'Pitfall: One Jellyfin Update, and the Apps Can No Longer Find the Server'
description: 'In the browser, Jellyfin worked perfectly; the apps on phone and tablet failed when away from home. An update had reset two settings behind the reverse proxy, and Jellyfin gave the apps its internal address.'
date: 2026-07-09
tags:
  - stolperstein
  - jellyfin
  - reverse-proxy
  - homelab
draft: false
---

> **Pitfalls** are short posts about mistakes that cost me time — with the cause and the fix,
> so they don't cost anyone else the same time.

## What happened

My Jellyfin is reachable from outside through a reverse proxy: Pangolin accepts the request, and
Traefik passes it on to the Jellyfin container in the server network. After an update, everything
looked normal at first. The web client in the browser worked from anywhere.

The **native apps** on iOS, iPad and Android, on the other hand, failed outside the home network:
login or playback broke off. At home on Wi-Fi, everything worked.

## The cause

Jellyfin tells its clients the address under which the server can be reached. The web client
doesn't need this; it works with relative paths and simply stays on the domain it was loaded
from. The apps, however, take the reported address and connect to it from then on.

Behind a reverse proxy, Jellyfin can only determine this address correctly if two settings in
`network.xml` are right:

- **`EnablePublishedServerUriByRequest`** makes Jellyfin derive the reported address from the
  request — that is, from the public domain the client came through.
- **`KnownProxies`** names the proxy's IP. Only requests from there may Jellyfin believe when they
  supply the original domain and protocol via `X-Forwarded-*` headers.

The update had reset both settings. Jellyfin therefore reported its **internal address** in the
server network to the apps, something like `http://10.0.10.20:8096`. That's reachable at home, but
of course not on the road.

## The fix

Set both values again — in the configuration file rather than only in the UI, so they can be
backed up and compared:

```xml
<!-- config/network.xml -->
<EnablePublishedServerUriByRequest>true</EnablePublishedServerUriByRequest>
<KnownProxies>
  <string>10.0.10.5</string>  <!-- IP of the reverse proxy in the server network -->
</KnownProxies>
```

Before the change I made a copy of the file (`network.xml.bak-…`), then restarted the container.
Since then, the apps connect via the public domain again.

At the next big update, the jump to Jellyfin 12 in September, I therefore checked `network.xml`
deliberately instead of assuming it was still correct. This time it had survived the update
unchanged.

## What I take away

- **"It works in the browser" is not a complete test.** Web clients and native apps talk to the
  server differently. After an update behind a proxy, always test an app from outside as well.
- **An application behind a proxy has to know it's behind a proxy.** Otherwise it reports
  addresses and protocols that are only correct from the inside.
- **Settings an update can overwrite belong on the checklist.** If you check them briefly after
  every update, you find the problem in a minute instead of after the first complaint.
