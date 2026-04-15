// webhook/server.js
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const SECRET   = process.env.WEBHOOK_SECRET || '';
const APP_DIR  = process.env.APP_DIR || '/app';
const PORT     = parseInt(process.env.PORT || '9000', 10);

function runCmd(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${result.status}`);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    return res.end();
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    if (SECRET) {
      const sig      = req.headers['x-hub-signature-256'] || '';
      const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      const sigBuf   = Buffer.from(sig.padEnd(expected.length));
      const expBuf   = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        res.writeHead(401);
        return res.end('Unauthorized');
      }
    }

    let payload;
    try { payload = JSON.parse(body.toString()); }
    catch { res.writeHead(400); return res.end('Bad JSON'); }

    if (payload.ref !== 'refs/heads/main') {
      res.writeHead(200);
      return res.end('Ignored');
    }

    console.log('[webhook] Rebuild triggered');
    try {
      runCmd('git', ['pull', '--ff-only'], APP_DIR);
      runCmd('npm', ['run', 'build'], APP_DIR);
      runCmd('nginx', ['-s', 'reload'], APP_DIR);
      console.log('[webhook] Rebuild done');
      res.writeHead(200);
      res.end('OK');
    } catch (err) {
      console.error('[webhook] Build failed:', err.message);
      res.writeHead(500);
      res.end('Build failed');
    }
  });
});

server.listen(PORT, () => console.log(`Webhook server on :${PORT}`));
