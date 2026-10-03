---
title: From a Flat Network to VLAN Segmentation
description: Why I freed my homelab from the ISP router, switched to OPNsense and split it into VLANs — and what went wrong along the way.
date: 2026-03-15
tags:
  - opnsense
  - vlan
  - proxmox
  - homelab
  - networking
draft: false
---

For a long time, my entire homelab ran in a single flat `/24` behind the ISP's router box.
One network, all devices, no boundaries in between — the smart TV in the same broadcast
segment as the Proxmox host and the password manager. I wanted to get rid of that.

## Starting point

- **One** flat subnet, DHCP from the ISP router
- No segmentation between servers, clients and IoT
- Port forwards directly on the router box — confusing and impossible to version

The goal: a router-on-a-stick setup with a real firewall, tagged VLANs and a topology I can
document and reproduce.

## The new topology

I flashed a Sophos appliance with **OPNsense** and made it the central firewall/router. Since
then, the ISP router only runs as a plain modem (a bridge-like transition phase). Behind it sit
a VLAN-capable switch and an access point that maps the Wi-Fi SSIDs to VLANs.

| VLAN | Name   | Purpose                            |
|------|--------|------------------------------------|
| 1    | MGMT   | OPNsense, switch, Proxmox host     |
| 10   | SRV    | Servers & VMs                      |
| 20   | CLIENT | Work PCs                           |
| 30   | IOT    | Smart home, everything untrusted   |
| 40   | GUEST  | Guests, fully isolated             |
| 50   | DMZ    | Services exposed to the outside    |

The Proxmox host is connected to a **trunk port**: VLAN 1 untagged for management, the
remaining VLANs tagged. Each VM/LXC gets its segment through a VLAN tag on the virtual bridge
port — no physical NICs needed.

## What went wrong

**The dumb-AP trap.** My first access point happily swallowed VLAN tags, but its management
interface suddenly sat in the wrong segment — I had locked myself out and had to get back in
via the serial console. Lesson: pin down the AP's management VLAN properly *before* tagging the
SSIDs.

**Duplicate DHCP.** For a while, both the ISP router *and* OPNsense handed out leases in
parallel, because I hadn't disabled the box's DHCP server. Result: sporadic duplicate IPs. It
only became stable once the ISP router really was just a modem.

**MCP as a documentation helper.** During the migration, I gave my AI assistant API access to
OPNsense (and even the ISP box) so it could read out and document the current state of the
rules. Sounds like a gimmick, but it sped up the inventory of the existing port forwards
enormously.

## What it achieved

With the VLANs as the foundation, I could then switch to **default deny** step by step: IoT no
longer sees the server network, guests see nothing but the internet, and every inter-VLAN
connection is now an explicit, documented rule instead of an implicit "everyone talks to
everyone".

How the segmentation turned into a real zero-trust firewall — default deny, DNS hijack block
and mandatory reverse proxy — deserves its own guide. Either way, the move itself was the
prerequisite for everything that came after.
