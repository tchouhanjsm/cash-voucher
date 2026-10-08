const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const filePath = path.join(dir, entry.name);

      if (entry.isDirectory()) return walk(filePath);

      return entry.isFile() && entry.name.endsWith('.js') ? [filePath] : [];
    })
    .sort();
}

const files = [
  'app.js',
  'config.js',
  'sw.js',
  'backend/Code.gs',
  ...walk(path.resolve('frontend')).map((file) => path.relative(process.cwd(), file)),
];

for (const file of files) {
  const filePath = path.resolve(file);
  const source = fs.readFileSync(filePath, 'utf8');

  try {
    if (file.endsWith('.gs')) {
      new vm.Script(source, {
        filename: file,
      });
    } else {
      execFileSync(process.execPath, ['--check', filePath], {
        stdio: 'inherit',
      });
    }

    console.log(`Syntax OK: ${file}`);
  } catch {
    console.error(`Syntax ERROR: ${file}`);
    process.exitCode = 1;
  }
}
