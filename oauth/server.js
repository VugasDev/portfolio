#!/usr/bin/env node
// Schlanker GitHub-OAuth-Proxy für Decap CMS.
// Ablauf:
//   1. GET /auth?provider=github  -> Redirect zu GitHub mit client_id + state
//   2. GitHub redirected zu /callback?code=X&state=Y
//   3. Code gegen Access-Token tauschen
//   4. postMessage an das Opener-Fenster mit dem Token
//
// Environment:
//   OAUTH_CLIENT_ID
//   OAUTH_CLIENT_SECRET
//   REDIRECT_URL        (z.B. https://vugas.de/api/callback)
//   ORIGIN              (z.B. https://vugas.de) — erlaubter Ursprung für postMessage

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  REDIRECT_URL,
  ORIGIN,
} = process.env;

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !REDIRECT_URL || !ORIGIN) {
  console.error('Fehlende Env-Variablen. Erforderlich: OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, REDIRECT_URL, ORIGIN');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;
const SCOPE = 'repo,user';

function renderCallback(status, tokenOrError) {
  const payload = status === 'success'
    ? { token: tokenOrError, provider: 'github' }
    : { error: String(tokenOrError) };
  const msg = `authorization:github:${status}:${JSON.stringify(payload)}`;
  return `<!doctype html><html><body><script>
    (function() {
      var message = ${JSON.stringify(msg)};
      var origin  = ${JSON.stringify(ORIGIN)};
      var sent = false;
      function send(target) {
        if (!window.opener) return;
        try { window.opener.postMessage(message, target); sent = true; } catch (e) {}
      }
      function receiveMessage(e) {
        // Opener (Decap) sendet 'authorizing:github' — jetzt antworten
        if (typeof e.data === 'string' && e.data.indexOf('authorizing:') === 0) {
          send(e.origin);
        }
      }
      window.addEventListener('message', receiveMessage, false);

      // 1. Direkt senden (falls Opener bereits lauscht)
      send(origin);
      // 2. Handshake anstoßen (falls Opener erst auf authorizing:github wartet)
      if (window.opener) window.opener.postMessage('authorizing:github', '*');
      // 3. Retry-Loop für Race-Conditions
      var tries = 0;
      var iv = setInterval(function() {
        if (sent || tries++ > 20) clearInterval(iv);
        send(origin);
      }, 250);
    })();
  </script><p>Anmeldung abgeschlossen. Du kannst dieses Fenster schließen.</p></body></html>`;
}

async function exchangeCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/auth') {
      const state = crypto.randomBytes(16).toString('hex');
      const gh = new URL('https://github.com/login/oauth/authorize');
      gh.searchParams.set('client_id', OAUTH_CLIENT_ID);
      gh.searchParams.set('redirect_uri', REDIRECT_URL);
      gh.searchParams.set('scope', SCOPE);
      gh.searchParams.set('state', state);
      res.writeHead(302, { Location: gh.toString() });
      res.end();
      return;
    }
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(renderCallback('error', 'missing code'));
        return;
      }
      try {
        const token = await exchangeCode(code);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderCallback('success', token));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(renderCallback('error', err.message));
      }
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200); res.end('ok'); return;
    }
    res.writeHead(404); res.end('not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500); res.end('server error');
  }
});

server.listen(PORT, () => console.log(`oauth-proxy listening on :${PORT}`));
