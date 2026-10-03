---
title: Self-Hosted Firefly III — and the Import Odyssey Behind It
description: How I set up Firefly III for tracking my finances and why "import a CSV" turned into an hours-long debugging thriller about IBANs, 504 timeouts and an O(n) balance calculation.
date: 2026-06-05
tags:
  - firefly-iii
  - self-hosted
  - proxmox
  - docker
  - debugging
  - homelab
draft: false
---

I finally wanted an overview of my finances. I chose **Firefly III** — self-hosted, open
source, full data sovereignty. Setting it up took an hour. The actual CSV import of my account
transactions then cost me half the evening — and in hindsight it was the best lesson in
systematic debugging I've had in a long time.

## The setup

Firefly runs as its own unprivileged LXC on my Proxmox host in a separate server segment. The
stack is a lean Docker Compose setup:

- **Firefly III core** (the app)
- **PostgreSQL** as the database
- **Cron** for recurring transactions
- **Data Importer** for CSV and bank imports

Externally via a tunnel with SSO authentication in front, internally via my wildcard reverse
proxy. Backups via the weekly Proxmox vzdump. So far, so routine. Then came the import.

## Act 1: Nothing imported

First attempt: upload the CSV, map the columns, "Run" — and **nothing** happens. Not a single
transaction lands in Firefly. Instead of guessing, I looked at the logs. The answer was right
there as an HTTP 422:

> Could not find a valid source account when searching for ID "0" or name "Max Mustermann".

Firefly couldn't resolve my own account. The reason: Firefly **never** creates asset accounts
automatically, and my accounts had no IBAN stored. The CSV provides my IBAN on the "me" side —
without a match there's no valid source account, so every transaction gets rejected.

## Act 2: The 504

With IBANs in place, a small import ran cleanly. The **whole** file (a good 4,000 transactions
from four years), however, the importer answered with:

> AxiosError: Request failed with status code 504

A gateway timeout. The first reflex, "turn up the timeout", would have been wrong — measure
first. The logs showed: the **conversion** of the file ran through completely. It was the
**submission**, where each transaction goes to the API individually, that ran into the nginx
timeout. So: bypass the browser entirely and import headlessly via the importer's CLI. No more
web timeout — but now it got really interesting.

## Act 3: Why does a single insert take 11 seconds?

The CLI import ran, but painfully slowly: three, four transactions every 30 seconds.
Extrapolated, **hours**. The POST timestamps in the logs showed about 10 seconds between
transactions. Ten seconds is a suspiciously "timeout-shaped" number, so I ruled things out one
by one:

- **Webhooks?** Disabled (404). Ruled out.
- **Rules?** Zero of them. Ruled out.
- **External network call?** Outbound from the container was fast (GitHub 0.08 s). Ruled out.
- **The `apply_rules`/`fire_webhooks` flags?** A measurement matrix with all four combinations:
  about 11 s everywhere. Ruled out.

A single direct API POST also took 11 seconds — so it was Firefly itself, not the importer. The
decisive test was then simple: post the same transaction to an **empty** account instead of my
full main account.

| Target account | Transactions in the account | Duration of one insert |
| --- | --- | --- |
| Empty test account | 0 | **0.41 s** |
| Main account | several hundred | **11 s** |

That proved the cause: on every insert, Firefly recalculates the **account's running balance —
O(n)** over all transactions. Because almost every transaction touches my main account, each
further insert got more expensive. A classic scaling problem that never shows up with small
amounts of data.

## The fix: do the heavy lifting asynchronously

The solution was to take the expensive recalculation out of the request path: I temporarily
switched Firefly to a **database queue** and started a `queue:work` worker. That moves the
balance calculation into the background. Again, I first tested the hypothesis on **one**
transaction before running the big import:

> POST to the main account: **11 s → 0.54 s**.

Confirmed. Full import started — and thanks to "classic" duplicate detection, it cleanly
skipped the already imported transactions instead of creating duplicates. In the end, all
\~4,100 transactions were in: expenses, income and — correctly recognized — the many mini
transfers of my round-up savings between checking and savings account. Then one
`refresh-running-balance`, and back to the synchronous default. Because for everyday use, the
queue isn't needed at all: an insert dated **today** goes through in 0.5 s even without a
worker — only the one-time insertion of **back-dated** bulk data is expensive.

## Act 4: The balances still don't match

Done? Almost. The final balances were off — the main account showed a noticeably too-high
amount. The reason was home-made: when creating the account, I had entered the _current_
balance as the opening balance and then imported the _complete history_ on top. That doubles
up — the opening entry and the sum of the individual transactions both count.

On top of that came my own legacy effect: I used to have several sub-accounts whose transfers
are in the history but no longer exist as accounts. Instead of repairing hundreds of old
transactions, I chose the pragmatic route the **opening balance** exists for: setting it as a
balancing value so that today's balance matches to the cent. A bit of math —
`target balance − sum(transactions)` — and both accounts matched.

## Takeaways

- **Logs first, never guess.** Each of the four hurdles was in the log as a clear error message
  or measurement. The solution was almost always already there; you just had to look.
- **Test hypotheses in isolation.** Empty account vs. full account, one flag variable after the
  other — only clean measurement exposed the O(n) balance calculation, which I'd never have
  suspected otherwise.
- **Prove fixes, don't claim them.** Reproduce → fix → verify → clean up, every time.
- **The right tool for the job.** The browser importer for the monthly close, the CLI plus a
  temporary queue for the one-time four-year mountain.

Firefly is running now, the numbers are right, and along the way I documented the entire import
workflow including the performance trap — so the next import is a click, not an evening.
