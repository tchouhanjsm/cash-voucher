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
    `Expected exactly one active frontend entry point at frontend/main.js; found: ${entrypoints.join(
      ', ',
    ) || '(none)'}`,
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
const duplicates = serviceWorkerShell().filter(
  (file, index, all) => all.indexOf(file) !== index,
);
const retiredAppReference = shell.has('app.js') || /<script\b[^>]*src=["']app\.js["']/i.test(read('index.html'));

if (missingModules.length || missingShell.length || missingShellFiles.length || duplicates.length || retiredAppReference) {
  console.error('Frontend release integrity FAILED.');

  if (missingModules.length) console.error('Missing imported modules:', missingModules);
  if (missingShell.length) console.error('Module/shell assets missing from sw.js:', missingShell);
  if (missingShellFiles.length) console.error('sw.js references missing files:', missingShellFiles);
  if (duplicates.length) console.error('Duplicate service-worker shell entries:', [...new Set(duplicates)]);
  if (retiredAppReference) console.error('Retired app.js is still referenced by the active shell.');

  process.exit(1);
}

console.log(`Frontend release integrity OK — ${graph.files.length} local modules + shell assets verified.`);
