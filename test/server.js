// Serves web/ and exposes the real Code.gs (via mock) at POST /api — for local end-to-end tests.
const http = require('http'),
  fs = require('fs'),
  path = require('path'),
  { create } = require('./mock-gas');
const g = create();
g.props.OWNER_EMAIL = 'owner@test.com';
g.props.OWNER_PIN = '483921';
g.setup();
let droppedClientResponse = false,
  droppedClientResponses = 0,
  countedCreateRequests = 0,
  rejectedClientRequests = 0,
  droppedOnlineResponse = false,
  droppedOnlineResponses = 0,
  onlineDropCreateRequests = 0,
  sentMalformedOnlineResponse = false,
  malformedOnlineResponses = 0,
  onlineMalformedCreateRequests = 0;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url.split('?')[0] === '/test-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          droppedClientResponses,
          countedCreateRequests,
          rejectedClientRequests,
          droppedOnlineResponses,
          onlineDropCreateRequests,
          malformedOnlineResponses,
          onlineMalformedCreateRequests,
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url.split('?')[0] === '/test-backup-failure') {
      const lastSuccess = '2026-10-11T14:00:00.000Z';
      g.props.BACKUP_LAST_ATTEMPT = '2026-10-11T14:10:00.000Z';
      g.props.BACKUP_LAST_SUCCESS = lastSuccess;
      g.props.BACKUP_LAST_ERROR = 'Drive permission denied';
      g.props.BACKUP_LAST_ALERT_ERROR = 'Mail service unavailable';
      g.props.BACKUP_LAST_SUCCESS_METRICS = JSON.stringify({
        completedAt: lastSuccess,
        durationMs: 1250,
        receiptCount: 12,
        receiptBytes: 7340032,
        receiptBytesKnown: true,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && req.url.split('?')[0] === '/api') {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        let j;
        try {
          const requestUrl = new URL(req.url, 'http://127.0.0.1:8765');
          const o = JSON.parse(b);
          const dropVendor = requestUrl.searchParams.get('drop_vendor');
          const countVendor = requestUrl.searchParams.get('count_vendor');
          const failVendor = requestUrl.searchParams.get('fail_vendor');
          const directDropVendor = requestUrl.searchParams.get('direct_drop_vendor');
          const directMalformedVendor = requestUrl.searchParams.get('direct_malformed_vendor');
          const isDirectDropRequest =
            o.action === 'createVouchers' &&
            directDropVendor &&
            Array.isArray(o.entries) &&
            o.entries.some((entry) => String(entry.vendor || '') === directDropVendor);
          const isDirectMalformedRequest =
            o.action === 'createVouchers' &&
            directMalformedVendor &&
            Array.isArray(o.entries) &&
            o.entries.some((entry) => String(entry.vendor || '') === directMalformedVendor);
          if (isDirectDropRequest) onlineDropCreateRequests += 1;
          if (isDirectMalformedRequest) onlineMalformedCreateRequests += 1;
          const shouldFail =
            o.action === 'createVouchers' &&
            failVendor &&
            Array.isArray(o.entries) &&
            o.entries.some((entry) => String(entry.vendor || '') === failVendor);

          if (shouldFail) {
            rejectedClientRequests += 1;
            j = JSON.stringify({
              ok: false,
              error: 'Simulated validation failure for outbox isolation.',
              code: 'VALIDATION',
            });
          } else {
            j = JSON.stringify(g.call(o.action, o));
          }
          const shouldDrop =
            o.action === 'createVouchers' &&
            dropVendor &&
            Array.isArray(o.entries) &&
            o.entries.some((entry) => String(entry.vendor || '') === dropVendor);

          if (
            o.action === 'createVouchers' &&
            countVendor &&
            Array.isArray(o.entries) &&
            o.entries.some((entry) => String(entry.vendor || '') === countVendor)
          ) {
            countedCreateRequests += 1;
          }

          if (shouldDrop && !droppedClientResponse) {
            droppedClientResponse = true;
            droppedClientResponses += 1;
            req.socket.destroy();
            return;
          }

          // Simulate an online form save whose server write committed but whose response was lost.
          if (isDirectDropRequest && !droppedOnlineResponse) {
            droppedOnlineResponse = true;
            droppedOnlineResponses += 1;
            req.socket.destroy();
            return;
          }

          // Simulate a committed write followed by an unreadable response body.
          if (isDirectMalformedRequest && !sentMalformedOnlineResponse) {
            sentMalformedOnlineResponse = true;
            malformedOnlineResponses += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":');
            return;
          }
        } catch {
          j = '{"ok":false,"error":"bad"}';
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(j);
      });
      return;
    }
    let f = path.join(
      __dirname,
      fs.existsSync(path.join(__dirname, '../web')) ? '../web' : '..',
      req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0],
    );
    fs.readFile(f, (e, d) => {
      if (e) {
        res.writeHead(404);
        return res.end('nf');
      }
      let responseBody = d;
      if (path.basename(f) === 'index.html') {
        const html = d.toString('utf8');
        const testPolicy = html.replace("script-src 'self';", "script-src 'self' 'unsafe-eval';");
        if (testPolicy === html) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          return res.end('CSP test override failed.');
        }
        // Playwright's string-based wait_for_function uses eval; this exception exists only
        // in the mock E2E server. scripts/verify-frontend-release.js rejects it in source.
        responseBody = Buffer.from(testPolicy);
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      res.end(responseBody);
    });
  })
  .listen(8765, () => console.log('up'));
