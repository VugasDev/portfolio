---
name: "Zero-Trust Firewall"
description: "Default-deny segmentation with OPNsense: VLAN-isolated zones, explicit allow rules and documented inter-VLAN flows."
details: "Default deny on OPNsense: each VLAN sees only what is explicitly allowed. IoT and guests are isolated from the server network, inter-VLAN access is bundled through a central reverse proxy, and enforced DNS prevents bypassing the filters. Every rule is documented rather than implicit."
tags:
  - "opnsense"
  - "firewall"
  - "vlan"
  - "security"
status: "aktiv"
---

