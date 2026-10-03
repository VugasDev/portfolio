---
title: 'GPU Transcoding for Jellyfin: NVENC, Secure Boot and a Black Screen'
description: How I passed an old GTX 1050 through Proxmox, LXC and Docker all the way to Jellyfin — and why Secure Boot and a CPU without an iGPU turned it into an adventure.
date: 2026-06-11
tags:
  - jellyfin
  - proxmox
  - nvidia
  - lxc
  - homelab
draft: false
---

Since the setup, my Jellyfin had been running on pure CPU transcoding. That's just about enough
for a single 1080p stream, but as soon as a second client with reduced bandwidth joins, the
container goes down on its knees. And the solution had been sitting in the case all along: a
GeForce GTX 1050 from my old server that I had moved over during the rebuild — installed, but
never put into service. Time to change that.

## The chain: host → LXC → Docker → Jellyfin

On my setup, Jellyfin runs in a Docker container, which in turn sits in an LXC container on
Proxmox. For the GPU to arrive down there, every layer has to play along:

1. **Proxmox host:** install the NVIDIA kernel driver
2. **LXC:** pass through the device nodes and install the driver userland in the identical
   version
3. **Docker:** NVIDIA Container Toolkit with `runtime: nvidia`
4. **Jellyfin:** configure NVENC as hardware acceleration

An important decision up front: the GTX 1050 is a Pascal card, and NVIDIA ended Pascal support
with the 580 driver series — newer drivers simply don't know the card anymore. So I
deliberately took the last 580 driver as a .run installer and installed the same file on the
host (with DKMS) and in the LXC (userland only, without kernel modules). The host module and the
container libraries must have exactly the same version, or the driver refuses to work.

## Plot twist 1: "Key was rejected by service"

The first installation attempt ended on a sobering note: the freshly built kernel module
wouldn't load. With AI assistance, I went through the installer log, and there was the decisive
line: _Loading of unsigned module is rejected._ My hypervisor boots with **Secure Boot** — the
kernel only accepts signed modules, and the NVIDIA module wasn't one.

The solution is your own **MOK** (Machine Owner Key): generate a key pair, sign the module with
it and enroll the public key into the UEFI firmware once. Sounds simple, but there were three
pitfalls:

- **DKMS doesn't sign automatically.** Even though the key was in the default location, the
  modules came out of the build unsigned. I signed them manually once with the kernel's
  `sign-file` tool and then taught DKMS via a config file to sign future rebuilds (for example
  after kernel updates) itself.
- **`mokutil --root-pw` doesn't work everywhere.** The convenient option of using the root
  password for enrollment failed because of my system's more modern password hash. The detour
  via `--generate-hash` with a one-time password works just as well.
- **The MOK manager doesn't wait for you.** On the next boot, a blue dialog appears with a
  **10-second timeout**. If you miss it, the system simply keeps booting — without enrollment,
  and depending on the situation, the request is discarded afterwards.

## Plot twist 2: The server that looked dead

That very MOK dialog became the real problem: for the first time in months, I needed a monitor
and keyboard on the server — and got **no picture**. Neither from the motherboard output nor
from the graphics card.

The solution to the puzzle had two parts and was almost embarrassing in hindsight:

1. My CPU is an **F model without integrated graphics**. That makes the video outputs on the
   motherboard dead — not broken, just without function. I hadn't had the "F" in the name on
   my radar when plugging things in.
2. The GPU does output a picture — but only briefly during POST and in the UEFI. As soon as
   Linux takes over, the screen stays dark (no graphics driver for the console, since I had
   just blacklisted nouveau). On top of that, my host takes several minutes to become
   pingable because of the ZFS pool import. A dark screen plus minutes of radio silence
   together look deceptively like a dead server.

On the second attempt — monitor on the GPU, correct input preselected, watching from second one
— the MOK dialog was there. On the first try I had been too slow for the 10 seconds, on the
second it worked: Enroll MOK, one-time password, reboot.

## The rest was legwork

With the key enrolled, the module loaded right away. From there it went quickly:

- **Device nodes at boot:** a small systemd service on the host calls `nvidia-smi` and
  `nvidia-modprobe` _before_ the guests start — otherwise the LXCs are missing the
  `/dev/nvidia*` devices after every reboot.
- **LXC passthrough:** four `lxc.mount.entry` lines for the NVIDIA devices in the container
  config.
- **Container Toolkit in the LXC:** the most important setting is `no-cgroups = true` — in an
  unprivileged LXC, the host manages the device cgroups, not the container runtime. Without
  that flag, not a single GPU container starts.
- **Jellyfin:** NVENC enabled, hardware decode for H.264, HEVC, MPEG2, VC1, VP8 and VP9
  (including 10-bit), HEVC encode on, CUDA tone mapping for HDR material. AV1 stays off —
  Pascal simply can't do it.

## The result

The difference is dramatic. A 1080p H.264 transcode that used to max out the CPU now runs at
more than **eleven times real time** — decode and encode entirely on the GPU, leaving the CPU
free for the other services. Several simultaneous streams at different quality levels are no
longer an issue, and 4K HEVC material has only now become smoothly usable for weaker clients
at all.

## Lessons

- **Check the driver series before installing.** For older cards, support ends at some point —
  if you blindly pull the latest driver, you chase a phantom error. I've now documented the
  version, including a warning about the successor series.
- **Secure Boot isn't an enemy, but it demands respect.** With a MOK and automatic DKMS
  signing, the setup survives kernel updates too. Set it up properly once, and it stays quiet.
- **Hardware basics beat software debugging.** Half an hour of puzzling over a "dead" server
  whose CPU simply has no graphics output — that won't happen to me a second time.
- **Write down the host ↔ container version match.** My future self, applying a driver update
  a year from now, will be grateful for the documentation.
