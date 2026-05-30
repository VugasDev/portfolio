#!/usr/bin/env bash
# bw-serve-wrapper.sh — startet bw serve auf 127.0.0.1:8087 mit Auto-Unlock.
# Aufgerufen vom System-Service /etc/systemd/system/bw-serve.service.
#   BW_BIN              Pfad zur bw-CLI (default: aus PATH)
#   BW_MASTER_PW_FILE   default /etc/portfolio/bw-master
#   BW_SERVE_PORT       default 8087
set -euo pipefail

BW_BIN="${BW_BIN:-$(command -v bw || true)}"
MASTER_PW_FILE="${BW_MASTER_PW_FILE:-/etc/portfolio/bw-master}"
SERVE_HOST="127.0.0.1"
SERVE_PORT="${BW_SERVE_PORT:-8087}"

if [ -z "$BW_BIN" ] || [ ! -x "$BW_BIN" ]; then
  echo "FATAL: bw CLI nicht gefunden (BW_BIN setzen)" >&2; exit 1
fi
if [ ! -f "$MASTER_PW_FILE" ]; then
  echo "FATAL: Master-Passwort-Datei fehlt: $MASTER_PW_FILE" >&2; exit 1
fi

# Sauberer State, dann unlock; --passwordfile statt Arg, damit das PW nicht im ps-Output leakt
"$BW_BIN" lock >/dev/null 2>&1 || true
SESSION="$("$BW_BIN" unlock --passwordfile "$MASTER_PW_FILE" --raw 2>/dev/null || true)"
if [ -z "$SESSION" ]; then
  echo "FATAL: bw unlock fehlgeschlagen — ggf. einmalig 'bw login ai-worker@vugas.de' ausführen" >&2
  exit 1
fi
export BW_SESSION="$SESSION"

"$BW_BIN" sync >/dev/null 2>&1 || true
exec "$BW_BIN" serve --port "$SERVE_PORT" --hostname "$SERVE_HOST"
