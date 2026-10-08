'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const frontendRoot = path.join(root, 'frontend');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(dir, entry.name);

      if (entry.isDirectory()) return walk(target);

      return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
    })
    .sort();
}

function unique(values) {
  return [...new Set(values)].sort();
}

function inspect(file) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);

  const staticImports = [
    ...source.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?/gm),
  ].map((match) => match[1]);

  const dynamicImports = [...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
    (match) => match[1],
  );

  const exports = [
    ...source.matchAll(
      /^\s*export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/gm,
    ),
    ...source.matchAll(/^\s*export\s*\{([^}]+)\}\s*;?/gm),
  ].flatMap((match) => {
    if (match[1].includes(',')) {
      return match[1]
        .split(',')
        .map((value) => value.trim().split(/\s+as\s+/i)[1] || value.trim())
        .filter(Boolean);
    }

    return [match[1].trim()];
  });

  const factories = [
    ...source.matchAll(/^\s*export\s+function\s+(create[A-Z][A-Za-z0-9_$]*)\s*\(/gm),
  ].map((match) => match[1]);

  const listeners = source.match(/(?:addEventListener|\.onclick\s*=|\.onsubmit\s*=)/g)?.length || 0;

  const actions = [...source.matchAll(/data-act=["']([^"']+)["']/g)].map((match) => match[1]);

  return {
    file: relative,
    imports: unique(staticImports),
    dynamicImports: unique(dynamicImports),
    exports: unique(exports),
    factories: unique(factories),
    listeners,
    actions: unique(actions),
  };
}

const files = walk(frontendRoot);
const modules = files.map(inspect);
const actionNames = unique(modules.flatMap((module) => module.actions));

console.log('=== FRONTEND ENGINEERING INSPECTION ===');
console.log(`Root: ${path.relative(root, frontendRoot) || '.'}`);
console.log(`JavaScript modules: ${modules.length}`);

for (const module of modules) {
  console.log(`\n${module.file}`);
  console.log(`  imports: ${module.imports.join(', ') || '(none)'}`);
  console.log(`  dynamic imports: ${module.dynamicImports.join(', ') || '(none)'}`);
  console.log(`  exports: ${module.exports.join(', ') || '(none)'}`);
  console.log(`  factories: ${module.factories.join(', ') || '(none)'}`);
  console.log(`  listeners: ${module.listeners}`);
  console.log(`  data-act: ${module.actions.join(', ') || '(none)'}`);
}

console.log('\n=== DATA-ACT VOCABULARY ===');
console.log(actionNames.join(', ') || '(none)');
