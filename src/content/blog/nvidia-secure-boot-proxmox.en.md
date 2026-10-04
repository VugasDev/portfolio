---
title: 'Pitfall: NVIDIA Drivers on Proxmox with Secure Boot'
description: 'All I wanted was to set up the GPU for Jellyfin transcoding. In the end there were four pitfalls at once: a kernel that rejects the module, a DKMS that doesn’t sign, a password hash mokutil doesn’t understand, and a screen that waits ten seconds.'
date: 2026-06-11
tags:
  - stolperstein
  - proxmox
  - nvidia
  - secure-boot
  - homelab
draft: true
---

> **Pitfalls** are short posts about mistakes that cost me time — with the cause and the fix,
> so they don't cost anyone else the same time.

## What happened

My media server was finally supposed to transcode in hardware: a GTX 1050 in the Proxmox host,
passed through to the container running Jellyfin. Step one is the NVIDIA driver on the host —
the official `.run` installer with `--dkms`, so the kernel module survives kernel updates.

The installer built the module, tried to load it, and then rolled everything back. The kernel log
said:

```
Loading of unsigned module is rejected
Key was rejected by service
```

**Secure Boot** is active on the host. The kernel then only loads modules signed with a key the
firmware trusts. Only Proxmox's own key was enrolled, and the freshly built NVIDIA module wasn't
signed with anything at all.

## The cause: four pitfalls in a row

The fix is well known in principle: create your own key (MOK, *Machine Owner Key*), enroll it in
the firmware and sign the module with it. Four traps lay along the way.

**1. DKMS doesn't sign on its own.** DKMS had already created a key at `/var/lib/dkms/mok.key` and
`mok.pub`. But when building through the `.run` installer, DKMS 3.2 did **not** sign the module
with it. A key lying around doesn't mean it's being used.

**2. `mokutil` doesn't understand the password hash.** To enroll the key in the firmware,
`mokutil --import` asks for a one-time password. The convenient option `--root-pw` (use the root
password) failed with `Failed to get root password hash`: Proxmox stores passwords as yescrypt
hashes, and `mokutil` can't read them.

**3. The MOK screen waits ten seconds.** The key is enrolled on the next reboot in a blue menu, the
MOK Manager. It only waits about ten seconds for a key press, and if you miss them, the request is
partly discarded. Then you start over.

**4. The screen stays black.** The host has an i5-12400**F**. The F means: no integrated graphics.
The monitor on the mainboard's video output therefore never shows a picture — not even the MOK
Manager. If you have ten seconds to operate a blue menu, you should at least be able to see it.

## The fix

**Run the installer so it doesn't roll back.** Without the load attempt, the built module stays in
place and can be signed:

```bash
./NVIDIA-Linux-x86_64-580.159.04.run --silent --dkms --skip-module-load
```

**Sign the modules by hand:**

```bash
SIGN=/usr/lib/modules/$(uname -r)/build/scripts/sign-file
for m in nvidia nvidia-modeset nvidia-drm nvidia-uvm; do
  $SIGN sha256 /var/lib/dkms/mok.key /var/lib/dkms/mok.pub "$(modinfo -n $m)"
done
```

**Sign future builds automatically.** So this doesn't happen again after every kernel update, DKMS
is told about the key explicitly:

```bash
# /etc/dkms/framework.conf.d/signing.conf
mok_signing_key="/var/lib/dkms/mok.key"
mok_certificate="/var/lib/dkms/mok.pub"
```

**Enroll the key without `--root-pw`.** `mokutil` generates the hash for the one-time password
itself, and then the import works without prompting:

```bash
mokutil --generate-hash=<one-time-password> > /root/mok.hash
mokutil --import /var/lib/dkms/mok.pub --hash-file /root/mok.hash
```

You need the password exactly once, in the MOK Manager. After that it's worthless.

**Reboot with the monitor on the GPU.** Monitor on the GTX 1050 instead of the mainboard, fingers
on the keyboard, and press a key the moment the blue screen appears. Then *Enroll MOK*, enter the
one-time password, done. After that the kernel loads the module, and `nvidia-smi` shows the card.

The rest was legwork: creating the device nodes at boot before the containers start, passing the
devices through to the container and installing the same userland there in **exactly the same
version** as on the host. Since then, Jellyfin transcodes 1080p H.264 at around eleven times real
time instead of one to two times on the CPU.

## What I take away

- **Secure Boot isn't an obstacle, it's an order of operations.** Create the key, enroll it, sign,
  then load. Put the load attempt before the signing and you get a rollback.
- **"The key is there" doesn't mean "the key is used".** Configure auto-signing explicitly and
  check after the next kernel update that the module still loads.
- **On a server without an iGPU, figure out where the picture comes from before you reboot.**
  Interactive boot menus with a timeout don't forgive a monitor plugged into the wrong port.
- **Always update the driver on the host and in the container together.** If the versions differ,
  the container can no longer use the card. With the GTX 1050 there's an extra catch: the 580
  series is the last one that supports this generation.
