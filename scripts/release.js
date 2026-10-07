const { spawnSync } = require('child_process');

function run(command, args = []) {
  console.log(`\n$ ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function capture(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }

  return result.stdout.trim();
}

function main() {
  const branch = capture('git', ['branch', '--show-current']);

  if (branch !== 'main') {
    console.error('RELEASE STOPPED: Releases must be created from main.');
    process.exit(1);
  }

  const status = capture('git', ['status', '--porcelain']);

  if (status) {
    console.error('RELEASE STOPPED: Working tree must be clean.');
    process.exit(1);
  }

  const version = JSON.parse(
    capture('node', ['-e', "console.log(require('./package.json').version)"]),
  );

  const tag = `v${version}`;

  const existingTag = capture('git', ['tag', '--list', tag]);

  if (existingTag === tag) {
    console.error(`RELEASE STOPPED: Tag ${tag} already exists.`);
    process.exit(1);
  }

  run('npm', ['run', 'check']);
  run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);
  run('git', ['push', 'origin', tag]);

  console.log(`\nRELEASE CREATED: ${tag}`);
}

main();
