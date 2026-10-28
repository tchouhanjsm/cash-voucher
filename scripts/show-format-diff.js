'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PRETTIER_CLI = path.join(ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
const FORMATTED_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.md',
  '.mjs',
  '.scss',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

function run(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function getChangedFiles() {
  const requestedBase = String(process.env.GITHUB_BASE_REF || '').trim();
  const baseBranch = /^[A-Za-z0-9._/-]+$/.test(requestedBase) ? requestedBase : 'client-main';
  const comparison = run('git', [
    'diff',
    '--name-only',
    '--diff-filter=ACMRT',
    'origin/' + baseBranch + '...HEAD',
  ]);

  if (comparison.status !== 0) {
    const fallback = run('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']);
    if (fallback.status !== 0) {
      throw new Error('Unable to determine changed files for formatting diagnostics.');
    }
    return fallback.stdout.split('\n').filter(Boolean);
  }

  return comparison.stdout.split('\n').filter(Boolean);
}

function formatWithPrettier(relativePath, source) {
  const result = spawnSync(process.execPath, [PRETTIER_CLI, '--stdin-filepath', relativePath], {
    cwd: ROOT,
    input: source,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Prettier could not format ' + relativePath);
  }
  return result.stdout;
}

function printDiff(relativePath, source, formatted, tempRoot) {
  fs.mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
  const originalPath = path.join(tempRoot, 'original');
  const formattedPath = path.join(tempRoot, 'formatted');
  fs.writeFileSync(originalPath, source, { mode: 0o600 });
  fs.writeFileSync(formattedPath, formatted, { mode: 0o600 });

  const diff = run('diff', [
    '-u',
    '--label',
    'a/' + relativePath,
    '--label',
    'b/' + relativePath,
    originalPath,
    formattedPath,
  ]);
  if (diff.status === 1) {
    process.stdout.write(diff.stdout);
  } else if (diff.status !== 0) {
    process.stdout.write('Could not render formatting diff for ' + relativePath + '.\n');
  }
}

function main() {
  if (!fs.existsSync(PRETTIER_CLI)) {
    process.stdout.write('Prettier CLI unavailable; formatting diff diagnostic skipped.\n');
    return;
  }

  let changedFiles;
  try {
    changedFiles = getChangedFiles();
  } catch (error) {
    process.stdout.write(String(error.message || error) + '\n');
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-format-diff-'));
  let changedCount = 0;
  try {
    for (const relativePath of changedFiles) {
      if (!FORMATTED_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) continue;
      const absolutePath = path.resolve(ROOT, relativePath);
      if (!absolutePath.startsWith(ROOT + path.sep) || !fs.existsSync(absolutePath)) continue;

      try {
        const source = fs.readFileSync(absolutePath, 'utf8');
        const formatted = formatWithPrettier(relativePath, source);
        if (formatted !== source) {
          changedCount += 1;
          process.stdout.write('\n--- Prettier diff: ' + relativePath + ' ---\n');
          printDiff(relativePath, source, formatted, path.join(tempRoot, String(changedCount)));
        }
      } catch (error) {
        process.stdout.write(
          'Formatting diagnostic could not inspect ' +
            relativePath +
            ': ' +
            String(error.message || error).split('\n')[0] +
            '\n',
        );
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  process.stdout.write(
    changedCount
      ? '\nFormatting diffs shown above. This diagnostic never modifies tracked files.\n'
      : 'No formatting diffs found in changed supported files.\n',
  );
}

if (require.main === module) main();

module.exports = { FORMATTED_EXTENSIONS, getChangedFiles, formatWithPrettier };
