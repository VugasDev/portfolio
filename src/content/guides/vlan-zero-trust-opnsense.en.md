---
title: VLAN Segmentation & Zero Trust with OPNsense
description: From a flat network to segmented VLANs with a default-deny firewall — interfaces, rules, enforced DNS and reverse proxy routing on OPNsense.
date: 2026-06-03
difficulty: Fortgeschritten
tags:
  - opnsense
  - vlan
  - firewall
  - networking
  - security
series: ''
order: null
draft: false
---

> **Note:** All IP addresses and VLAN IDs in this guide are example values. Adapt them to your
> own network and don't lock yourself out while switching over — always keep console or
> out-of-band access available.

A flat network in which the smart TV sits in the same segment as the hypervisor is convenient —
and a security problem. This guide shows how to split your network into VLANs on **OPNsense** and
move step by step to **zero trust** (default deny).

## Target picture

| VLAN | Name   | Subnet (example)   | Purpose                        |
|------|--------|--------------------|--------------------------------|
| 1    | MGMT   | 10.0.1.0/24        | Firewall, switch, hypervisor   |
| 10   | SRV    | 10.0.10.0/24       | Servers & VMs                  |
| 20   | CLIENT | 10.0.20.0/24       | Work PCs                       |
| 30   | IOT    | 10.0.30.0/24       | Smart home, untrusted          |
| 40   | GUEST  | 10.0.40.0/24       | Guests, fully isolated         |

## 1. Creating VLAN interfaces

Under *Interfaces → Other Types → VLAN*, create one VLAN per segment on your physical LAN
interface (e.g. `igb0`) — the VLAN ID is the tag used on the switch trunk. Then, under
*Interfaces → Assignments*, assign each VLAN as its own interface (opt1, opt2 …), enable it and
give it a static gateway IP (e.g. `10.0.10.1` for SRV).

On the switch, the uplink to OPNsense is a **trunk** (all VLANs tagged), the access ports are
access ports in their respective VLAN, and the hypervisor port is a trunk so VMs get their tag.

## 2. DHCP per VLAN

A separate DHCP range per interface (*Services → DHCPv4*). Important: **turn off** the DHCP
server on the old ISP router, otherwise two servers hand out leases in parallel and you end up
chasing sporadic duplicate IPs.

## 3. Default deny as the foundation

The decisive step: by default, OPNsense allows *nothing* on a fresh interface. That's exactly
what you want. Instead of a "LAN → any" allow rule, you build **explicit** rules for exactly the
flows that are needed. Rule of thumb per VLAN, in this order:

1. **Allow DNS** → only to the DNS server (see below)
2. **Required inter-VLAN services** → explicitly (e.g. CLIENT → SRV:443)
3. **Block RFC1918** → forbid the remaining traffic to other private networks
4. **Allow internet** → destination "!RFC1918", or only 80/443 for untrusted VLANs

```
# Example rule order on the CLIENT interface (opt2):
PASS   CLIENT-net → DNS-server:53           (udp/tcp)
PASS   CLIENT-net → SRV-server:443          (tcp)      # only what's needed
BLOCK  CLIENT-net → RFC1918                            # no other segments
PASS   CLIENT-net → !RFC1918                           # internet
```

IOT and GUEST get **no** inter-VLAN allow — only DNS and (for IOT) tightly limited internet.
GUEST sees only the internet, nothing else.

## 4. Enforcing DNS (anti-hijack)

Devices — IoT in particular — like to bring hard-coded DNS servers (8.8.8.8 &amp; co.) and bypass
your filtering that way. Two rules close the gap:

```
BLOCK  VLAN-net → !DNS-server : 53           # block everything except your own resolver
NAT    VLAN-net → any : 53  ⇒  DNS-server    # port forward (DNAT) to redirect hard-coded queries
```

The first rule forbids foreign DNS servers, the second (a port forward) transparently redirects
hard-coded queries to your own resolver. That way, *every* name resolution goes through your
filter — no matter what the device has configured.

## 5. Central routing via a reverse proxy

Instead of drilling inter-VLAN holes for each service individually, you only allow the VLANs to
access **one** reverse proxy (port 443) in the server network. The proxy terminates TLS and routes
internally. That drastically reduces the number of firewall rules and gives you a single, clean
entry and exit point for web services.

```
PASS   all VLANs → ReverseProxy:443   (tcp)
```

## 6. Switching over safely without locking yourself out

- Work via **console access** (or an interface you aren't currently reconfiguring).
- Use *Apply* with the **rollback function** — OPNsense can revert changes after a timeout.
- Switch **one** VLAN at a time to default deny and test each flow deliberately.
- Keep a short log: every allow rule with a note on *why* it exists. Your future self will thank
  you.

## Conclusion

Zero trust in the homelab isn't a switch, it's a mindset: every connection is forbidden until you
deliberately allow it. With clean VLANs, enforced DNS and a central reverse proxy, you get a
network you can document, audit and connect to the internet with a clear conscience.
