---
title: "Pitfall: My Backup Ran for Exactly Seven Days"
description: "A Google OAuth client in “Testing” mode loses its tokens after a week. How that caught me twice, and why my website now has a privacy policy for my own backup app."
date: 2026-09-27
tags:
  - stolperstein
  - google-drive
  - rclone
  - backup
  - homelab
draft: false
---

> **Pitfalls** are short posts about mistakes that cost me time, with the cause and the fix,
> so they don't cost you the same time.

## Part 1: The backup that gave up after a week

My password manager (Vaultwarden) backs itself up every night: briefly stop the container,
**restic** takes an encrypted snapshot that ends up in Google Drive via **rclone**, start the
container again. If the job fails, systemd sends me an email via `OnFailure` with the last
log lines.

For a week, everything worked. From day seven on, the same email arrived every morning:

```text
rclone: invalid_grant: maybe token expired?
  - try refreshing with "rclone config reconnect gdrive:"
```

The good news was in the same log: Vaultwarden had come back up cleanly every time. The
script uses a `trap` to restart the container even when the backup part fails. So the data
was safe; only the offsite backup was missing.

**The cause:** My OAuth client in the Google Cloud Console was still in the publishing status
**"Testing"**. For apps in that state, Google lets issued refresh tokens expire after
**seven days**. That's intentional, not a bug: testing apps aren't supposed to access user
data permanently.

In the short term, `rclone config reconnect gdrive:` with a fresh browser login helps. But
that only pushes the problem back by a week. The real fix was a single click: I switched the
app, a Google Cloud project dedicated to this backup, to **"In production"** in the console.
After that, the seven-day limit no longer applies.

## Part 2: The shared client ID

In September, the topic came up again, this time from the other side, and this time I already
knew the trap. My sync and backup jobs on the homelab host had been using **rclone's
built-in client ID**, which every rclone user shares. rclone had been warning on every run
for a while that this ID will be shut down in the course of 2026. Then it ran into an acute
rate limit, and the jobs slowed to a crawl.

The fix was obvious: an **app of my own**, this time set to "In production" from the start.
There was just one new hurdle: unlike the backup app, this one needs full access to Google
Drive, and for that Google requires branding before you can publish, meaning a homepage and a
privacy policy. That's why, since the end of September, the privacy policy on this website
has its own section about my private Google Drive app.

No review by Google was necessary. For an app used only by yourself, verification isn't
required. Instead, the login shows an "unverified app" warning, which I confirm once.

After that: client ID and secret into the password manager, rclone re-authorized on both
hosts, all jobs tested. A backup run that had taken **22 minutes** with the shared ID was done
after **14 seconds** with my own app.

## Takeaways

- **"Testing" means seven days.** If you build an OAuth client for a service that runs
  unattended, switch it to "In production" right away.
- **Shared credentials are borrowed.** A client ID that thousands of users share can be
  throttled or shut down at any time.
- **A backup job needs an alert.** Without the failure email, I would only have noticed the
  silent outage at the next restore test, or in an actual emergency.
