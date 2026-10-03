---
title: My Servarr Suite — How I Built It
description: Jellyfin + *arr automation as a self-hosted media server — setup, structure and learnings.
date: 2026-04-14
tags:
  - jellyfin
  - servarr
  - docker
  - homelab
draft: false
---

> **Note:** This post only covers building and automating a media server for content you
> created yourself or acquired legally (your own disc rips, your own productions, licensed
> downloads). Obtaining content is not the subject of this post.

My media library was a mess for a long time: files with cryptic names, missing covers, folder
structures sometimes in German, sometimes in English, subtitles scattered all over the place.
Streaming services solve that, but they also decide what stays available. I wanted both: the
convenience of Netflix *and* control over my own collection. The result is my **Servarr
Suite** built around Jellyfin.

## The stack at a glance

- **Jellyfin** — the media server I use in the browser, on the TV and on mobile
- **Sonarr / Radarr** — manage series and movies, name them consistently, detect gaps
- **Prowlarr** — one central place for all sources
- **Bazarr** — fetches matching subtitles automatically
- **Recyclarr** — keeps my quality profiles reproducible
- **SABnzbd** — download client for my legitimate sources

Everything runs in containers on a dedicated segment, separated from the rest of the network.

## The most important decision: the folder structure

Sounds unspectacular, but it's the foundation. All containers see **the same** mount point
(`/media`), with `downloads` and `library` underneath. Only then can Sonarr/Radarr import via
**hardlink** instead of copying every file — that saves space and is instant. My first attempt
with separate volumes hurt exactly here: every file existed twice, and the disk filled up faster
than the library grew.

## What the automation takes off my hands

When a new title comes in, this happens without me lifting a finger:

1. Sonarr/Radarr recognizes it and names it consistently
2. The file moves into the library via hardlink
3. Bazarr downloads matching subtitles
4. Jellyfin pulls metadata and covers and shows it right away

"Find the file, rename it, sort it, google for subtitles" becomes: nothing. That was exactly
the goal.

## Recyclarr — profiles as code

The part I underestimated at first: quality profiles. Clicked together by hand in the web UI,
they aren't documented anywhere and are gone after a rebuild. **Recyclarr** pulls curated
profiles into Sonarr/Radarr via cron — the entire configuration lives in a versionable
`recyclarr.yml`. Reproducible instead of clicked together.

## Transcoding: CPU for now, NVENC in preparation

My open pain point in operation: transcoding still runs in **software** on the CPU. As long as
a client plays the original format directly (Direct Play), everything is calm — but as soon as
live transcoding is needed, the CPU load goes up and parallel streams get tight.

The plan against that is ready: the box has an **NVIDIA GTX 1050** whose **NVENC** encoder is
made for exactly this. What's still missing is the NVIDIA driver on the Proxmox host plus the
NVIDIA container runtime to pass the GPU cleanly through to the Jellyfin container. That's the
next step — and a good example that "hardware present" and "hardware usable" are two different
tickets in a homelab.

## Learnings

- **Folder structure first.** Hardlinks fail silently on separate volumes. Setting this up
  correctly once saves a lot of moving around later.
- **Profiles as code.** Recyclarr makes the difference between "works on my machine" and
  "reproducible".
- **The backups are the databases, not the movies.** The `config` directories of the *arr
  services are the real asset — media files can be obtained again, the curated management
  can't.
- **Its own segment.** The media stack has no business with the rest of the network; its own
  VLAN and a reverse proxy in front are mandatory.

If you want to rebuild this step by step: I wrote up the details in the
[Servarr Suite guide](/en/guides/servarr-suite).
