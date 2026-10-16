'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { validateStagingConfiguration } = require('./staging-preflight');

const ROOT = path.resolve(__dirname, '..');
const STATIC_ROOT_FILES = new Set([
  'index.html',
  'style.css',
  'frontend-ui-kit.css',
  'manifest.webmanifest',
  'ui-studio.html',
]);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function buildStagingConfig(apiUrl) {
  return 'window.CV_CONFIG = { API_URL: ' + JSON.stringify(apiUrl) + ' };\n';
}

function stagingServiceWorker() {
  return [
    "self.addEventListener('install', (event) => {",
    '  event.waitUntil(self.skipWaiting());',
    '});',
    "self.addEventListener('activate', (event) => {",
    '  event.waitUntil(self.clients.claim());',
    '});',
    '',
  ].join('\n');
}

function resolveStaticPath(urlPath, root = ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;

  if (decoded === '/' || decoded === '') decoded = '/index.html';
  if (decoded === '/config.js') return { generated: 'config' };
  if (decoded === '/sw.js') return { generated: 'service-worker' };

  const relative = decoded.replace(/^\/+/, '');
  if (relative.startsWith('.') || relative.split('/').some((part) => part === '..')) return null;
  const first = relative.split('/')[0];

  if (first === 'frontend') {
    if (!/^frontend\/[a-zA-Z0-9_./-]+$/.test(relative)) return null;
  } else if (first === 'icons') {
    if (!/^icons\/[a-zA-Z0-9_.-]+$/.test(relative)) return null;
  } else if (!STATIC_ROOT_FILES.has(relative)) {
    return null;
  }

  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  if (target.endsWith('.map') || (target.endsWith('.json') && relative !== 'manifest.webmanifest')) return null;
  return { path: target };
}

function createStagingServer(env = process.env, root = ROOT) {
  const preflight = validateStagingConfiguration(env, { mode: 'uat', root });
  if (!preflight.ok) {
    throw new Error('Staging web server preflight failed: ' + preflight.errors.join('; '));
  }
  const apiUrl = String(env.CV_STAGING_API_URL).trim();

  return http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    const method = request.method || 'GET';
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
    };

    if (pathname === '/__staging_health') {
      response.writeHead(method === 'GET' ? 200 : 405, {
        ...securityHeaders,
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(method === 'GET' ? JSON.stringify({ ok: true }) : '{}');
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, securityHeaders);
      response.end('Method not allowed');
      return;
    }

    const resolved = resolveStaticPath(pathname, root);
    if (!resolved) {
      response.writeHead(404, securityHeaders);
      response.end('Not found');
      return;
    }

    let body;
    let type = 'application/octet-stream';
    if (resolved.generated === 'config') {
      body = Buffer.from(buildStagingConfig(apiUrl));
      type = MIME['.js'];
    } else if (resolved.generated === 'service-worker') {
      body = Buffer.from(stagingServiceWorker());
      type = MIME['.js'];
      response.setHeader('Service-Worker-Allowed', '/');
    } else {
      body = fs.readFileSync(resolved.path);
      type = MIME[path.extname(resolved.path)] || 'application/octet-stream';
    }

    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': type,
    });
    response.end(method === 'HEAD' ? undefined : body);
  });
}

function main() {
  let server;
  try {
    const port = Number(process.env.STAGING_WEB_PORT || 8766);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error('STAGING_WEB_PORT must be an integer from 1024 to 65535.');
    }
    server = createStagingServer();
    server.listen(port, '127.0.0.1', () => {
      console.log('Staging test server listening on 127.0.0.1:' + port);
    });
  } catch (error) {
    console.error('STAGING WEB SERVER STOPPED: ' + String(error.message || error));
    process.exitCode = 1;
  }
  return server;
}

if (require.main === module) main();

module.exports = { buildStagingConfig, createStagingServer, resolveStaticPath, stagingServiceWorker };
