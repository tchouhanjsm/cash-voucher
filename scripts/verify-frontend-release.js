'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function normalize(file) {
  return file.replace(/^\.\//, '').replace(/\\/g, '/');
}

function staticImports(source) {
  const matches = [
    ...source.matchAll(/\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ];

  return [...new Set(matches.map((match) => match[1]))];
}

function resolveModule(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const target = path.normalize(path.join(path.dirname(from), specifier));
  if (path.extname(target)) return normalize(path.relative(root, target));
  return normalize(path.relative(root, target + '.js'));
}

function collectModuleGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  const missing = [];

  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);

    if (!exists(file)) {
      missing.push(file);
      continue;
    }

    for (const specifier of staticImports(read(file))) {
      const resolved = resolveModule(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }

  return { files: [...seen].sort(), missing };
}

function indexModuleEntrypoints() {
  const source = read('index.html');
  return [
    ...source.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/gi),
  ].map((match) => normalize(match[1]));
}

function verifyContentSecurityPolicy() {
  const source = read('index.html');
  const metaTags = [...source.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\bhttp-equiv\s*=\s*["']content-security-policy["']/i.test(tag));
  const failures = [];

  if (metaTags.length !== 1) {
    return ['CSP meta tag count: ' + metaTags.length + '.'];
  }

  const contentMatch = metaTags[0].match(/\bcontent\s*=\s*"([^"]*)"/i);
  if (!contentMatch) {
    return ['Content-Security-Policy must have a double-quoted content attribute.'];
  }

  const directives = new Map();
  contentMatch[1]
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean)
    .forEach((directive) => {
      const [name, ...sources] = directive.split(/\s+/);
      const key = name.toLowerCase();
      if (directives.has(key)) {
        failures.push('Duplicate CSP directive: ' + key + '.');
      } else {
        directives.set(key, sources);
      }
    });

  const required = new Map([
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['script-src', ["'self'"]],
    ['script-src-attr', ["'none'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    [
      'connect-src',
      ["'self'", 'https://script.google.com', 'https://script.googleusercontent.com'],
    ],
    ['manifest-src', ["'self'"]],
    ['worker-src', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-src', ["'none'"]],
  ]);

  for (const [name, allowedSources] of required) {
    const actual = directives.get(name);
    if (
      !actual ||
      actual.length !== allowedSources.length ||
      allowedSources.some((source) => !actual.includes(source))
    ) {
      failures.push('Invalid or missing CSP directive: ' + name + '.');
    }
  }

  for (const [name, sources] of directives) {
    if (sources.includes('*')) failures.push('CSP wildcard source is not allowed: ' + name + '.');
    if (sources.includes("'unsafe-eval'")) {
      failures.push('CSP unsafe-eval source is not allowed: ' + name + '.');
    }
  }

  const inlineScripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((match) => !/\bsrc\s*=/i.test(match[1]) && match[2].trim());
  if (inlineScripts.length) {
    failures.push('The active HTML shell must not include executable inline script blocks.');
  }
  if (/\s+on[a-z]+\s*=/i.test(source)) {
    failures.push('The active HTML shell must not use inline event-handler attributes.');
  }

  return failures;
}

function serviceWorkerShell() {
  const source = read('sw.js');
  const match = source.match(/const\s+[^;]*\bF\s*=\s*\[((?:.|\n)*?)\];/s);
  if (!match) throw new Error('Could not find service-worker shell list F in sw.js.');

  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => normalize(m[1]));
}

function manifestIcons() {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  return (manifest.icons || []).map((icon) => normalize(icon.src));
}

const entrypoints = indexModuleEntrypoints();
if (entrypoints.length !== 1 || entrypoints[0] !== 'frontend/main.js') {
  console.error(
    `Expected exactly one active frontend entry point at frontend/main.js; found: ${
      entrypoints.join(', ') || '(none)'
    }`,
  );
  process.exit(1);
}

const graph = collectModuleGraph('frontend/main.js');
const shell = new Set(serviceWorkerShell());
const requiredShell = new Set([
  'index.html',
  'style.css',
  'config.js',
  'manifest.webmanifest',
  ...graph.files,
  ...manifestIcons(),
]);

const missingModules = graph.missing;
const missingShell = [...requiredShell].filter((file) => !shell.has(file));
const missingShellFiles = [...shell].filter((file) => file !== '.' && !exists(file));
const duplicates = serviceWorkerShell().filter((file, index, all) => all.indexOf(file) !== index);
const retiredAppReference =
  shell.has('app.js') || /<script\b[^>]*src=["']app\.js["']/i.test(read('index.html'));
const cspFailures = verifyContentSecurityPolicy();

if (
  missingModules.length ||
  missingShell.length ||
  missingShellFiles.length ||
  duplicates.length ||
  retiredAppReference ||
  cspFailures.length
) {
  console.error('Frontend release integrity FAILED.');

  if (missingModules.length) console.error('Missing imported modules:', missingModules);
  if (missingShell.length) console.error('Module/shell assets missing from sw.js:', missingShell);
  if (missingShellFiles.length) console.error('sw.js references missing files:', missingShellFiles);
  if (duplicates.length)
    console.error('Duplicate service-worker shell entries:', [...new Set(duplicates)]);
  if (retiredAppReference) console.error('Retired app.js is still referenced by the active shell.');
  if (cspFailures.length) {
    console.error('Content Security Policy verification FAILED:', cspFailures);
  }

  process.exit(1);
}

console.log(`Frontend release integrity OK — ${graph.files.length} modules and CSP verified.`);
