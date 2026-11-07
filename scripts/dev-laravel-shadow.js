'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SINGLE_FILES = new Set([
  'index.html',
  'config.js',
  'style.css',
  'frontend-ui-kit.css',
  'frontend-workspace.css',
  'manifest.webmanifest',
  'sw.js',
]);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function localTarget(value = 'http://127.0.0.1:8000') {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error('CV_LARAVEL_PROXY_TARGET must be a valid local HTTP URL.');
  }
  if (
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    throw new Error('Laravel dev proxy target must be plain HTTP on loopback only.');
  }
  return target;
}

function localHost(value = '127.0.0.1') {
  if (!['127.0.0.1', 'localhost', '::1'].includes(value)) {
    throw new Error('Laravel PWA dev server may bind to loopback only.');
  }
  return value;
}

function publicAssetPath(urlPath, rootDir = ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;

  const segments = decoded.replace(/^\/+/, '').split('/');
  if (segments.length === 1 && segments[0] === '') segments[0] = 'index.html';
  if (
    segments.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))
  ) {
    return null;
  }

  const isSingleFile = segments.length === 1 && SINGLE_FILES.has(segments[0]);
  const isAssetDirectory =
    segments.length >= 2 && ['frontend', 'icons'].includes(segments[0]);
  if (!isSingleFile && !isAssetDirectory) return null;

  const file = path.resolve(rootDir, ...segments);
  const relative = path.relative(path.resolve(rootDir), file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  try {
    return fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

function sendText(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(message);
}

function createLocalServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || ROOT);
  const host = localHost(options.host || '127.0.0.1');
  const target = localTarget(options.proxyTarget || 'http://127.0.0.1:8000');

  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');

    if (requestUrl.pathname === '/api/v1' || requestUrl.pathname.startsWith('/api/v1/')) {
      const headers = { ...request.headers };
      delete headers.connection;
      delete headers.host;
      delete headers['proxy-connection'];
      delete headers.upgrade;
      delete headers['transfer-encoding'];
      headers.host = target.host;
      headers['x-forwarded-host'] = request.headers.host || host;

      const upstream = http.request(
        {
          protocol: target.protocol,
          hostname: target.hostname.replace(/^\[|\]$/g, ''),
          port: target.port || 80,
          method: request.method,
          path: request.url,
          headers,
        },
        (upstreamResponse) => {
          const responseHeaders = { ...upstreamResponse.headers };
          delete responseHeaders.connection;
          delete responseHeaders['transfer-encoding'];
          responseHeaders['x-content-type-options'] = 'nosniff';
          response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
          upstreamResponse.pipe(response);
        },
      );
      upstream.on('error', () => {
        if (!response.headersSent) {
          response.writeHead(502, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
        }
        response.end(JSON.stringify({
          ok: false,
          error: {
            code: 'LOCAL_LARAVEL_UNAVAILABLE',
            message: 'The local Laravel server is unavailable. Start it on 127.0.0.1:8000.',
          },
        }));
      });
      request.pipe(upstream);
      return;
    }

    if (!['GET', 'HEAD'].includes(request.method || '')) {
      sendText(response, 405, 'Only static GET/HEAD requests are served here.');
      return;
    }

    const file = publicAssetPath(requestUrl.pathname, rootDir);
    if (!file) {
      sendText(response, 404, 'Not found.');
      return;
    }

    const extension = path.extname(file).toLowerCase();
    const noStore = ['index.html', 'config.js', 'sw.js'].includes(path.basename(file));
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': noStore ? 'no-store' : 'no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(file).pipe(response);
  });
}

if (require.main === module) {
  try {
    const host = localHost(process.env.CV_LOCAL_HOST || '127.0.0.1');
    const port = Number(process.env.CV_LOCAL_PORT || 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('CV_LOCAL_PORT must be an integer from 1 to 65535.');
    }
    const server = createLocalServer({
      host,
      proxyTarget: process.env.CV_LARAVEL_PROXY_TARGET || 'http://127.0.0.1:8000',
    });
    server.listen(port, host, () => {
      process.stdout.write(
        'Cash Voucher Laravel shadow dev server: http://'+host+':'+port+'\n'+
        'Laravel API proxy: /api/v1/* → '+(process.env.CV_LARAVEL_PROXY_TARGET || 'http://127.0.0.1:8000')+'\n'+
        'Local only. Do not enter production credentials or financial data.\n',
      );
    });
  } catch (error) {
    process.stderr.write(String(error.message || error)+'\n');
    process.exitCode = 1;
  }
}

module.exports = { createLocalServer, localHost, localTarget, publicAssetPath };
