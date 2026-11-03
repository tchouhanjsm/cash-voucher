'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const path = require('node:path');

const STATIC_FILES = [
  'index.html',
  'style.css',
  'frontend-ui-kit.css',
  'frontend-workspace.css',
  'manifest.webmanifest',
  'sw.js',
];

const SECURITY_HEADERS = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; manifest-src 'self'; worker-src 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'
`;

const APACHE_SECURITY_HEADERS = `<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()"
  Header always set Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; manifest-src 'self'; worker-src 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'"
</IfModule>
`;

const PAGES_CACHE_HEADERS = "/\n  Cache-Control: no-cache, no-store, must-revalidate\n/index.html\n  Cache-Control: no-cache, no-store, must-revalidate\n/sw.js\n  Cache-Control: no-cache, no-store, must-revalidate\n/config.js\n  Cache-Control: no-cache, no-store, must-revalidate\n/asset-manifest.json\n  Cache-Control: no-cache, no-store, must-revalidate\n/release-manifest.json\n  Cache-Control: no-cache, no-store, must-revalidate\n/frontend/*\n  Cache-Control: no-cache, must-revalidate\n/icons/*\n  Cache-Control: no-cache, must-revalidate\n/style.css\n  Cache-Control: no-cache, must-revalidate\n/frontend-ui-kit.css\n  Cache-Control: no-cache, must-revalidate\n/frontend-workspace.css\n  Cache-Control: no-cache, must-revalidate\n/manifest.webmanifest\n  Cache-Control: no-cache, must-revalidate\n";
const APACHE_CACHE_HEADERS = "<IfModule mod_headers.c>\n  <FilesMatch \"^(index\\.html|sw\\.js|config\\.js|asset-manifest\\.json|release-manifest\\.json)$\">\n    Header always set Cache-Control \"no-cache, no-store, must-revalidate\"\n    Header always set Pragma \"no-cache\"\n    Header always set Expires \"0\"\n  </FilesMatch>\n  <FilesMatch \"^(?!config\\.js$).+\\.(css|js|mjs|webmanifest|svg|png)$\">\n    Header always set Cache-Control \"no-cache, must-revalidate\"\n  </FilesMatch>\n</IfModule>\n";
function validateApiUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    throw new Error('CV_API_URL is required to build a customer client.');
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('CV_API_URL must be a valid Apps Script Web App URL.');
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'script.google.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)
  ) {
    throw new Error(
      'CV_API_URL must be an HTTPS Apps Script /exec URL without credentials or query parameters.',
    );
  }

  return url.toString();
}

function validateSecurityHeaders(source, format = 'apache') {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Generated security policy is empty.');
  }

  const apache = format === 'apache';
  const required = apache
    ? [
        'Header always set X-Content-Type-Options "nosniff"',
        'Header always set X-Frame-Options "DENY"',
        'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
        'Header always set Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()"',
        'Header always set Content-Security-Policy',
      ]
    : [
        'X-Content-Type-Options: nosniff',
        'X-Frame-Options: DENY',
        'Referrer-Policy: strict-origin-when-cross-origin',
        'Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()',
        'Content-Security-Policy:',
      ];

  for (const marker of required) {
    if (!source.includes(marker)) {
      throw new Error('Generated ' + format + ' security policy is missing: ' + marker);
    }
  }

  const csp = source.match(/Content-Security-Policy(?::|\s+)\s*"?([^"\n]+)"?/i);
  if (!csp) {
    throw new Error('Generated ' + format + ' security policy has no readable CSP.');
  }

  const directives = new Map(
    csp[1]
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const separator = directive.search(/\s/);
        return separator === -1
          ? [directive.toLowerCase(), '']
          : [directive.slice(0, separator).toLowerCase(), directive.slice(separator + 1).trim()];
      }),
  );

  const expectedDirectives = {
    'default-src': "'self'",
    'base-uri': "'self'",
    'object-src': "'none'",
    'script-src': "'self'",
    'script-src-attr': "'none'",
    'frame-src': "'none'",
    'frame-ancestors': "'none'",
  };

  for (const [name, expected] of Object.entries(expectedDirectives)) {
    if (directives.get(name) !== expected) {
      throw new Error('Generated ' + format + ' CSP must set ' + name + ' to ' + expected + '.');
    }
  }

  if (/\bunsafe-eval\b/i.test(csp[1]) || /\bscript-src\s+[^;]*(?:\*|https?:)/i.test(csp[1])) {
    throw new Error('Generated ' + format + ' CSP allows an unsafe or external script source.');
  }

  return true;
}

function validateCacheHeaders(source, format = 'apache') {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Generated cache policy is empty.');
  }

  const required = format === 'apache'
    ? [
        'Header always set Cache-Control "no-cache, no-store, must-revalidate"',
        'Header always set Pragma "no-cache"',
        'Header always set Expires "0"',
        'Header always set Cache-Control "no-cache, must-revalidate"',
        'css|js|mjs|webmanifest|svg|png',
      ]
    : [
        '/\\n  Cache-Control: no-cache, no-store, must-revalidate',
        '/index.html\\n  Cache-Control: no-cache, no-store, must-revalidate',
        '/sw.js\\n  Cache-Control: no-cache, no-store, must-revalidate',
        '/config.js\\n  Cache-Control: no-cache, no-store, must-revalidate',
        '/asset-manifest.json\\n  Cache-Control: no-cache, no-store, must-revalidate',
        '/release-manifest.json\\n  Cache-Control: no-cache, no-store, must-revalidate',
        '/frontend/*\\n  Cache-Control: no-cache, must-revalidate',
        '/icons/*\\n  Cache-Control: no-cache, must-revalidate',
        '/frontend-workspace.css\\n  Cache-Control: no-cache, must-revalidate',
      ];

  for (const marker of required) {
    if (!source.includes(marker)) {
      throw new Error('Generated ' + format + ' cache policy is missing: ' + marker);
    }
  }

  return true;
}
function buildWebSite(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const outDir = path.resolve(options.outDir || path.join(rootDir, 'dist'));
  const apiUrl = validateApiUrl(options.apiUrl ?? process.env.CV_API_URL);
  const environment = String(options.environment ?? process.env.CV_ENVIRONMENT ?? '')
    .trim()
    .toLowerCase();
  if (!['staging', 'production'].includes(environment)) {
    throw new Error(
      'CV_ENVIRONMENT must be explicitly set to staging or production for a customer build.',
    );
  }
  const deploymentId = new URL(apiUrl).pathname.split('/')[3];
  const rootFromOutput = path.relative(outDir, rootDir);
  const outputRelativeToRoot = path.relative(rootDir, outDir);
  const outputIsInsideRoot =
    outputRelativeToRoot !== '' &&
    !outputRelativeToRoot.startsWith('..') &&
    !path.isAbsolute(outputRelativeToRoot);

  if (
    rootFromOutput === '' ||
    (!rootFromOutput.startsWith('..') && !path.isAbsolute(rootFromOutput)) ||
    (outputIsInsideRoot && outputRelativeToRoot !== 'dist')
  ) {
    throw new Error(
      'Output must be outside the repository or use the dedicated repository dist/ directory.',
    );
  }

  const requiredPaths = [...STATIC_FILES, 'frontend', 'icons'];

  for (const relativePath of requiredPaths) {
    if (!fs.existsSync(path.join(rootDir, relativePath))) {
      throw new Error('Required static client asset is missing: ' + relativePath);
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of STATIC_FILES) {
    fs.copyFileSync(path.join(rootDir, file), path.join(outDir, file));
  }

  for (const directory of ['frontend', 'icons']) {
    fs.cpSync(path.join(rootDir, directory), path.join(outDir, directory), {
      recursive: true,
    });
  }

  const config = `// Generated customer config; do not commit this file.
const localApiOverride = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? new URLSearchParams(location.search).get('api')
  : '';

window.CV_CONFIG = {
  API_URL: localApiOverride || ${JSON.stringify(apiUrl)},
  ENVIRONMENT: ${JSON.stringify(environment)},
  DEPLOYMENT_ID: ${JSON.stringify(deploymentId)},
};
`;

  fs.writeFileSync(path.join(outDir, 'config.js'), config, 'utf8');
  fs.writeFileSync(path.join(outDir, '_headers'), SECURITY_HEADERS + PAGES_CACHE_HEADERS, 'utf8');
  fs.writeFileSync(path.join(outDir, '.htaccess'), APACHE_SECURITY_HEADERS + APACHE_CACHE_HEADERS, 'utf8');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

  const assetManifest = createAssetManifest(outDir);
  fs.writeFileSync(
    path.join(outDir, 'asset-manifest.json'),
    JSON.stringify(assetManifest, null, 2) + '\n',
    'utf8',
  );

  validateSecurityHeaders(fs.readFileSync(path.join(outDir, '_headers'), 'utf8'), 'pages');
  validateSecurityHeaders(fs.readFileSync(path.join(outDir, '.htaccess'), 'utf8'), 'apache');
  validateCacheHeaders(fs.readFileSync(path.join(outDir, '_headers'), 'utf8'), 'pages');
  validateCacheHeaders(fs.readFileSync(path.join(outDir, '.htaccess'), 'utf8'), 'apache');

  return {
    outDir,
    apiUrl,
    environment,
    deploymentId,
    assetManifest: assetManifest.summary,
    files:
      STATIC_FILES.length +
      5 +
      countFiles(path.join(outDir, 'frontend')) +
      countFiles(path.join(outDir, 'icons')),
  };
}

function collectRelativeFiles(directory, prefix) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix + '/' + entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectRelativeFiles(absolute, relative);
    return entry.isFile() ? [relative.split(path.sep).join('/')] : [];
  });
}

function createAssetManifest(outDir) {
  const publicFiles = [
    ...STATIC_FILES,
    ...collectRelativeFiles(path.join(outDir, 'frontend'), 'frontend'),
    ...collectRelativeFiles(path.join(outDir, 'icons'), 'icons'),
  ].sort();

  const assets = publicFiles.map((relativePath) => {
    const content = fs.readFileSync(path.join(outDir, relativePath));
    return {
      path: relativePath,
      bytes: content.length,
      gzipBytes: gzipSync(content, { level: 9 }).length,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    };
  });
  const summary = assets.reduce(
    (total, asset) => ({
      files: total.files + 1,
      bytes: total.bytes + asset.bytes,
      gzipBytes: total.gzipBytes + asset.gzipBytes,
    }),
    { files: 0, bytes: 0, gzipBytes: 0 },
  );

  return {
    schemaVersion: 1,
    scope: 'public-static-client-assets',
    summary,
    assets,
  };
}

function countFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((count, entry) => {
    const absolutePath = path.join(directory, entry.name);
    return count + (entry.isDirectory() ? countFiles(absolutePath) : 1);
  }, 0);
}

if (require.main === module) {
  try {
    const result = buildWebSite();
    console.log('Static customer client built at ' + result.outDir);
    console.log(
      'API target origin validated: ' + new URL(result.apiUrl).origin + ' (deployment ID omitted).',
    );
    console.log('Published asset files: ' + result.files);
    console.log('Generated CSP and host-header policies passed static security validation.');
  } catch (error) {
    console.error('Static customer client build failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildWebSite, validateApiUrl, validateSecurityHeaders, validateCacheHeaders };
