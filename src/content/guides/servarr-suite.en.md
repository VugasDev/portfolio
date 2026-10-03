---
title: Setting Up the Servarr Suite
description: Set up a media server — Jellyfin + *arr automation, subtitles and quality profiles for your own library.
date: 2026-04-15
difficulty: Fortgeschritten
tags:
  - jellyfin
  - servarr
  - docker
series: ''
order: null
draft: false
---

> **Note:** This guide only covers building and automating a media server for content you created
> yourself or acquired legally (your own disc rips, your own productions, licensed downloads) —
> installation, reverse proxy, quality profiles, subtitles, transcoding and hardening. Obtaining
> content is not the subject of this guide.

Maintaining a growing media library by hand — looking up metadata, assigning covers, finding
subtitles, naming everything consistently — is tedious and error-prone. The *"Servarr"* suite
automates exactly this library management around **Jellyfin**.

## The components

| Service       | Role                                                        |
|---------------|-------------------------------------------------------------|
| **Jellyfin**  | Media server & player — streams your library in the browser, on TV and on mobile |
| **Sonarr**    | Management & organization of series (naming, seasons, gap detection) |
| **Radarr**    | The same for movies                                         |
| **Prowlarr**  | Central source/indexer management for Sonarr & Radarr       |
| **Bazarr**    | Automatic subtitles matching your content                   |
| **Recyclarr** | Syncs curated quality profiles into Sonarr/Radarr           |
| **SABnzbd**   | Download client for your own/legitimate sources             |

## Architecture

```
                    ┌─────────────┐
                    │  Prowlarr   │  source management
                    └──────┬──────┘
                  ┌────────┴────────┐
            ┌─────▼─────┐     ┌─────▼─────┐
            │  Sonarr   │     │  Radarr   │
            └─────┬─────┘     └─────┬─────┘
                  └────────┬────────┘
                    ┌──────▼──────┐
                    │  SABnzbd    │  fetches → names → moves
                    └──────┬──────┘
                    ┌──────▼──────┐    ┌──────────┐
                    │  /media     │◀───│  Bazarr  │ subtitles
                    └──────┬──────┘    └──────────┘
                    ┌──────▼──────┐
                    │  Jellyfin   │  streams to your devices
                    └─────────────┘
```

## 1. Compose skeleton

All services run as containers. The key is a **consistent folder structure** that every
container sees identically — otherwise hardlinks don't work and every file gets copied
needlessly.

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin
    volumes:
      - ./config/jellyfin:/config
      - /srv/media:/media
    devices:
      - /dev/dri:/dev/dri      # GPU for transcoding (Intel/AMD)
    restart: unless-stopped

  sonarr:
    image: lscr.io/linuxserver/sonarr
    environment: [PUID=1000, PGID=1000, TZ=Europe/Berlin]
    volumes:
      - ./config/sonarr:/config
      - /srv/media:/media       # same mount point everywhere!
    restart: unless-stopped

  # radarr, prowlarr, bazarr, sabnzbd likewise ...
```

> **The hardlink rule:** The download directory and the media library must live under **one**
> shared volume (e.g. `/srv/media/downloads` and `/srv/media/library`). Only then can
> Sonarr/Radarr import via hardlink instead of copying — that saves space and is instant.

## 2. Prowlarr as the single source of truth

Instead of maintaining each source separately in Sonarr *and* Radarr, you enter it once in
**Prowlarr**. Prowlarr then pushes the configuration to all "apps" (Sonarr, Radarr). Adding a new
source means: once in Prowlarr, done.

## 3. Quality profiles with Recyclarr

Building quality profiles by hand is detailed work. **Recyclarr** pulls curated profiles and
custom formats and writes them into Sonarr/Radarr via the API:

```bash
recyclarr sync
```

Run once a day via cron, your profiles stay reproducible — the entire configuration lives in a
versionable `recyclarr.yml` instead of being scattered across the web UI.

## 4. Subtitles with Bazarr

Bazarr hooks into Sonarr and Radarr and automatically fetches subtitles in your preferred
languages as soon as a new title lands in the library. Set a language profile, choose providers,
done.

## 5. Hardware transcoding in Jellyfin

If a client can't play a format directly, Jellyfin transcodes live — and that eats CPU. With an
iGPU (Intel QuickSync / AMD VAAPI), the graphics unit takes over:

1. Pass `/dev/dri` through to the Jellyfin container (see the Compose file above)
2. In Jellyfin, enable hardware acceleration (VAAPI/QSV) under *Dashboard → Playback*
3. Test with a client that forces transcoding and watch the GPU load

## 6. Hardening

- **No direct port to the outside.** Everything behind a reverse proxy with TLS; the *arr web UIs
  should stay internal-only wherever possible.
- **Its own VLAN/segment** for the media stack, separated from the rest of the network.
- **Unprivileged container/VM** — the stack doesn't need root privileges on the host.
- **Backups** of the `config` directories; the *arr services' databases are your real asset, not
  the media files.

## Conclusion

Once set up properly, library management runs in the background: new titles are named
consistently, get metadata and subtitles, and are ready in Jellyfin right away. The effort is in
setting up the folder structure and the profiles — after that, it's low-maintenance.
