// webhook/server.js
// GitHub push webhook -> git pull into shared /app mount -> write trigger file.
// A systemd path-unit on the host watches the trigger and rebuilds the portfolio container.
const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');

const SECRET  = process.env.WEBHOOK_SECRET || '';
const APP_DIR = process.env.APP_DIR || '/app';
const PORT    = parseInt(process.env.PORT || '9000', 10);
const BRANCH  = process.env.BRANCH || 'main';
const TRIGGER = `${APP_DIR}/.deploy-trigger`;

// Fail closed: ohne Secret keine Signaturprüfung möglich -> nicht starten,
// statt jeden unsignierten Request zu akzeptieren.
if (!SECRET) {
  console.error('[webhook] FATAL: WEBHOOK_SECRET nicht gesetzt — Start abgebrochen.');
  process.exit(1);
}

function log(...a) { console.log('[webhook]', ...a); }

function verifySignature(sig, body) {
  if (!SECRET) return false; // defense-in-depth; Start ist oben bereits abgebrochen
  if (!sig) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200); return res.end('ok');
  }
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404); return res.end();
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const sig  = req.headers['x-hub-signature-256'] || '';

    if (!verifySignature(sig, body)) {
      log('invalid signature');
      res.writeHead(401); return res.end('unauthorized');
    }

    const event = req.headers['x-github-event'];
    if (event === 'ping') {
      log('ping');
      res.writeHead(200); return res.end('pong');
    }
    if (event !== 'push') {
      res.writeHead(204); return res.end();
    }

    let payload;
    try { payload = JSON.parse(body.toString()); }
    catch { res.writeHead(400); return res.end('bad json'); }

    if (payload.ref !== `refs/heads/${BRANCH}`) {
      log('ignore ref', payload.ref);
      res.writeHead(200); return res.end('ignored');
    }

    log('push on', BRANCH, '→', (payload.after || '').slice(0, 7));
    // Kein git im Container (privates Repo -> keine Credentials hier). Nur Trigger
    // schreiben; der Host-Deploy (deploy/deploy.sh, hat SSH-Key) macht fetch/reset + build.
    try {
      fs.writeFileSync(TRIGGER, `${payload.after || ''}\n${new Date().toISOString()}\n`);
      log('trigger written');
      res.writeHead(202); res.end('queued');
    } catch (e) {
      log('trigger write failed:', e.message);
      res.writeHead(500); res.end('trigger failed');
    }
  });
});

server.listen(PORT, () => log(`listening on :${PORT} (branch=${BRANCH})`));
