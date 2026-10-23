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

const APACHE_SECURITY_HEADERS = `<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()"
  Header always set Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; manifest-src 'self'; worker-src 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'"
</IfModule>
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

  const csp = source.match(/Content-Security-Policy(?::|\\s+)\\s*"?([^"\\n]+)"?/i);
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
          : [
              directive.slice(0, separator).toLowerCase(),
              directive.slice(separator + 1).trim(),
            ];
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
      throw new Error(
        'Generated ' + format + ' CSP must set ' + name + ' to ' + expected + '.',
      );
    }
  }

  if (/\bunsafe-eval\b/i.test(csp[1]) || /\bscript-src\s+[^;]*(?:\*|https?:)/i.test(csp[1])) {
    throw new Error('Generated ' + format + ' CSP allows an unsafe or external script source.');
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
  fs.writeFileSync(path.join(outDir, '_headers'), SECURITY_HEADERS, 'utf8');
  fs.writeFileSync(path.join(outDir, '.htaccess'), APACHE_SECURITY_HEADERS, 'utf8');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

  validateSecurityHeaders(fs.readFileSync(path.join(outDir, '_headers'), 'utf8'), 'pages');
  validateSecurityHeaders(fs.readFileSync(path.join(outDir, '.htaccess'), 'utf8'), 'apache');

  return {
    outDir,
    apiUrl,
    environment,
    deploymentId,
    files:
      STATIC_FILES.length +
      4 +
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
    console.log('Generated CSP and host-header policies passed static security validation.');
  } catch (error) {
    console.error('Static customer client build failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildWebSite, validateApiUrl, validateSecurityHeaders };
