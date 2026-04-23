---
description: Stage, commit, rebase, push — triggers auto-deploy via webhook.
argument-hint: [optional commit message]
allowed-tools: Bash(git:*)
---

Führe einen sauberen Push des Portfolios aus. Der GitHub-Webhook triggert danach automatisch den Rebuild des `portfolio`-Containers auf LXC 115.

## Schritte

1. Prüfe den Status parallel:
   - `git status --short`
   - `git diff --stat`
   - `git log --oneline -5`
2. Wenn **keine Änderungen** vorhanden sind (`git status` leer und kein unpushed commit): Antworte nur mit "Nichts zu pushen." und stopp.
3. Wenn Änderungen vorhanden sind:
   - Staged alle relevanten Dateien mit `git add -A` (keine globalen Secrets oder `.env`).
   - Wenn der User in `$ARGUMENTS` eine Commit-Message übergeben hat, nimm diese. Sonst: analysiere den Diff und formuliere eine prägnante deutsche Commit-Message nach Konvention `<typ>: <kurzbeschreibung>` (max. 72 Zeichen). Typen: `feat`, `fix`, `docs`, `refactor`, `config`, `style`, `content`.
   - `git commit -m "<message>"`
4. Rebase gegen remote um Push-Konflikte zu vermeiden:
   - `git fetch origin`
   - `git pull --rebase origin main` — bei Konflikt: stopp, Konflikte an den User melden.
5. `git push origin main`
6. Gib kurz zurück:
   - Commit-Hash
   - Commit-Message
   - Bestätigung dass der Webhook greifen wird ("→ LXC rebuildet automatisch in ~30-60 s")

## Regeln

- Niemals `--force`.
- Niemals `.env`, `*.key`, `*.secret` oder ähnliches committen.
- Wenn `git status` Dateien wie `.env` zeigt: warne und staged sie nicht.
- Wenn der Rebase Konflikte produziert: nicht automatisch auflösen, an den User übergeben.

## Context

- Projekt: `~/homelab-ai/projects/portfolio`
- Remote: `VugasDev/portfolio` (main)
- Deploy-Ziel: LXC 115 `/opt/portfolio` via GitHub-Webhook → nginx → `portfolio-webhook` → systemd-path
