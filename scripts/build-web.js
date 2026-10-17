'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATIC_FILES = [
  'index.html',
  'style.css',
  'frontend-ui-kit.css',
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

function buildWebSite(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const outDir = path.resolve(options.outDir || path.join(rootDir, 'dist'));
  const apiUrl = validateApiUrl(options.apiUrl ?? process.env.CV_API_URL);
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
};
`;

  fs.writeFileSync(path.join(outDir, 'config.js'), config, 'utf8');
  fs.writeFileSync(path.join(outDir, '_headers'), SECURITY_HEADERS, 'utf8');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

  return {
    outDir,
    apiUrl,
    files:
      STATIC_FILES.length +
      3 +
      countFiles(path.join(outDir, 'frontend')) +
      countFiles(path.join(outDir, 'icons')),
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
  } catch (error) {
    console.error('Static customer client build failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildWebSite, validateApiUrl };
