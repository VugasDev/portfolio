---
title: Your Own Google OAuth App for rclone — No 7-Day Tokens, No Rate Limits
description: Why rclone with Google Drive needs its own OAuth app, which scope is the right one, why "Testing" stops your backup after seven days, and how to get the token on a server without a browser.
date: 2026-10-04
difficulty: Fortgeschritten
tags:
  - rclone
  - google-drive
  - oauth
  - backup
  - security
series: ''
order: null
draft: false
---

> **Note:** The client ID, client secret and token in this guide are placeholders. All three
> belong in your password manager and in an `rclone.conf` with `0600` permissions — never in a Git
> repo, never in a chat, and ideally never on the command line.

My off-site backup runs via **rclone** to Google Drive: first for Vaultwarden, later also for
syncing my Obsidian vault. Twice the Google side tripped me up, and both times it wasn't rclone's
fault but the **OAuth app** behind it. This guide shows how to set it up so the backup doesn't
grind to a halt after a week.

## The two incidents

**May: the backup dies on day seven.** For the Vaultwarden backup I had created my own OAuth app
but left it in *Testing* status. For a week everything worked, then the nightly run failed every
single day:

```
rclone: invalid_grant: maybe token expired? - try refreshing with "rclone config reconnect gdrive:"
```

The cause is a Google rule: for apps in *Testing* status, refresh tokens expire after **seven
days**. An `rclone config reconnect` buys you exactly one more week. The only permanent fix is to
publish the app.

**September: rate limit on the shared client ID.** For the new vault sync I had conveniently used
rclone's built-in client ID. It's shared by every rclone user who doesn't configure their own, and
accordingly it's often stuck in a rate limit. My restic backup via Drive failed two days in a row.
On top of that, rclone now warns on every call that this shared ID will be switched off during
2026. With my own app, the same backup job then ran in 14 seconds instead of 22 minutes.

## 1. Project and Drive API

In the [Google Cloud Console](https://console.cloud.google.com), create a dedicated project, for
example `homelab-rclone`. Then enable the **Google Drive API** under *APIs & Services → Library*.
Without the API enabled, every request later fails with a 403, even with a valid token.

## 2. Choosing the right scope

The scope decides what the app may see in your Drive. Two are relevant for rclone:

| Scope | Sees | Consequence for publishing |
|---|---|---|
| `drive.file` | only files this app created itself | uncritical, no review by Google |
| `drive` | the entire Drive | "restricted" scope: branding required, warning at login without verification |

**For a pure backup, `drive.file` is enough.** rclone creates the files itself and doesn't need to
see anything else. It's also the safer choice: a leaked token only exposes the backup folder, not
your whole Drive.

**For a sync, it isn't.** As soon as other programs write to the folder too — in my case Drive for
Desktop on my work laptop — rclone can't see their files with `drive.file`. Then you need `drive`,
and the rules from step 3 apply.

## 3. Consent screen and publishing

The settings live in the console under *Google Auth Platform* (formerly the "OAuth consent screen"):

1. **Branding:** app name, support email, contact. For the `drive` scope, additionally a **home
   page** and a **privacy policy** as public URLs.
2. **Audience:** user type *External*, add your own account as a test user.
3. **Data access:** add the scope from step 2.
4. **Publish:** under *Audience*, click **"Publish app"**; the status is then *In production*.
   This is the step that lifts the 7-day limit.

With `drive.file`, you're done. With `drive`, the app stays **unverified**: at login you'll see
"Google hasn't verified this app", which you confirm via *Advanced*. For personal use that's fine;
Google exempts apps with very few users from review. The tokens still no longer expire, because
the status is *In production*.

For the privacy URL I didn't build a separate page; instead I added a section to my
[privacy policy](/datenschutz) (in German): which app it is, that only I use it, which data it
accesses, and that this data is neither shared nor used for advertising or AI training.

## 4. An OAuth client of type "Desktop"

Under *Clients*, create a new OAuth client with application type **Desktop app**. Put the client
ID and client secret straight into your password manager. For desktop clients the secret isn't
technically a real secret, but there's no reason to leave it lying around.

## 5. Getting the token on a server without a browser

rclone fetches the token via a short-lived local web server on port **53682**: after login, Google
redirects back there. On a server or in a container without a browser, this works through an SSH
tunnel — and the client ID and secret come from environment variables instead of the command
line, so they don't end up in the process list or the shell history:

```bash
# On the server: load the client from the password manager into the environment
# (variables, not arguments – otherwise they show up in `ps` and the history)
export RCLONE_DRIVE_CLIENT_ID="…"
export RCLONE_DRIVE_CLIENT_SECRET="…"

# Empty config so nothing existing gets overwritten
rclone --config /tmp/empty.conf authorize drive --auth-no-open-browser
```

```bash
# On your own machine: forward the server's port 53682 to localhost
ssh -N -L 53682:127.0.0.1:53682 user@server
```

Then open the URL rclone prints in your local browser and sign in. At the end, rclone outputs a
JSON block with `access_token` and `refresh_token`. That goes into the `rclone.conf`:

```ini
[gdrive]
type = drive
scope = drive
client_id = …
client_secret = …
token = {"access_token":"…","refresh_token":"…","expiry":"…"}
```

A crypt remote on top stays unchanged; it only points to `gdrive:`. How this fits into the backup
concept is covered in the guide [Backups That Survive the Real Thing](/en/guides/backup-konzept-3-2-1).

## 6. Checking

```bash
rclone lsd gdrive:                 # access works
rclone about gdrive:               # quota is shown
```

If the warning about the shared client ID is gone and the next backup run goes through, the switch
is done. The real test only comes on day eight, though: if the backup still runs then, you've
safely avoided the 7-day trap.

## Learnings

- **"Testing" is not a harmless in-between state.** It's a time bomb with a seven-day fuse, and it
  goes off at night in the backup job, not while you're setting things up.
- **Shared credentials share their limits too.** The built-in client ID is meant for trying things
  out, not for jobs you rely on.
- **Use the smallest scope that works.** `drive.file` for backups, `drive` only when rclone needs
  to see other programs' files.
- **Keep secrets off the command line.** Environment variables instead of arguments — and write
  down the token renewal procedure while you still remember it. You'll need it when you least
  expect it.
