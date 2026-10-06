const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = ['app.js', 'config.js', 'sw.js', 'backend/Code.gs'];

for (const file of files) {
  const filePath = path.resolve(file);
  const source = fs.readFileSync(filePath, 'utf8');

  try {
    if (file.endsWith('.gs')) {
      new vm.Script(source, {
        filename: file,
      });
    } else {
      require('child_process').execFileSync(process.execPath, ['--check', filePath], {
        stdio: 'inherit',
      });
    }

    console.log(`Syntax OK: ${file}`);
  } catch {
    console.error(`Syntax ERROR: ${file}`);
    process.exitCode = 1;
  }
}
