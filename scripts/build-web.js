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

function validateApiUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    throw new Error('CV_API_URL is required. Refusing to build a client without an API target.');
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
      'CV_API_URL must be an HTTPS https://script.google.com/macros/s/<deployment-id>/exec URL without credentials, query strings, or fragments.',
    );
  }

  return url.toString();
}

function buildWebSite(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const outDir = path.resolve(options.outDir || path.join(rootDir, 'dist'));
  const apiUrl = validateApiUrl(options.apiUrl ?? process.env.CV_API_URL);
  const rootFromOutput = path.relative(outDir, rootDir);

  if (
    rootFromOutput === '' ||
    (!rootFromOutput.startsWith('..') && !path.isAbsolute(rootFromOutput))
  ) {
    throw new Error('Output directory must not be the repository root or one of its parent directories.');
  }

  const requiredPaths = [
    ...STATIC_FILES,
    'frontend',
    'icons',
  ];

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

  const config = `// Generated for this customer deployment. Do not commit customer-specific output.
const localApiOverride = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? new URLSearchParams(location.search).get('api')
  : '';

window.CV_CONFIG = {
  API_URL: localApiOverride || ${JSON.stringify(apiUrl)},
};
`;

  fs.writeFileSync(path.join(outDir, 'config.js'), config, 'utf8');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

  return {
    outDir,
    apiUrl,
    files: STATIC_FILES.length + 2 + countFiles(path.join(outDir, 'frontend')) + countFiles(path.join(outDir, 'icons')),
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
    console.log('API target origin validated: ' + new URL(result.apiUrl).origin + ' (deployment ID omitted).');
    console.log('Published asset files: ' + result.files);
  } catch (error) {
    console.error('Static customer client build failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildWebSite, validateApiUrl };
