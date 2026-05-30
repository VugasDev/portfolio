#!/usr/bin/env python3
"""Minimaler Mock der bw-serve Vault-Management-API für Tests von bw-sync-env.sh.

Fixtures via Env:
  MOCK_PORT     Port (default 8099)
  MOCK_STATUS   unlocked|locked|unauthenticated  (default unlocked)
  MOCK_MISSING  kommagetrennte VAR-Namen, die als fehlend (404) geliefert werden
"""
import json, os
from http.server import BaseHTTPRequestHandler, HTTPServer

STATUS = os.environ.get("MOCK_STATUS", "unlocked")
MISSING = set(filter(None, os.environ.get("MOCK_MISSING", "").split(",")))


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/status":
            return self._send(200, {"success": True, "data": {"template": {"status": STATUS}}})
        prefix = "/object/password/"
        if self.path.startswith(prefix):
            name = self.path[len(prefix):]
            var = name[len("portfolio-"):] if name.startswith("portfolio-") else name
            if var in MISSING:
                return self._send(404, {"success": False, "message": "Not found."})
            return self._send(200, {"success": True, "data": f"val-{var}"})
        self._send(404, {"success": False})

    def do_POST(self):
        if self.path == "/sync":
            return self._send(200, {"success": True, "data": True})
        self._send(404, {"success": False})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("MOCK_PORT", "8099"))
    HTTPServer(("127.0.0.1", port), H).serve_forever()
