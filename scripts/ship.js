const { spawnSync } = require('child_process');
const readline = require('readline');

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

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const branch = capture('git', ['branch', '--show-current']);

  if (!branch) {
    console.error('SHIP ERROR: Could not determine the current Git branch.');
    process.exit(1);
  }

  if (branch === 'main') {
    console.error('SHIP STOPPED: Run this workflow from a feature/fix branch, not main.');
    console.error('Example: git switch -c feature/my-change');
    process.exit(1);
  }

  console.log(`Shipping branch: ${branch}`);

  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'fix']);
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check']);

  const changes = capture('git', ['status', '--short']);

  if (!changes) {
    console.log('\nSHIP STOPPED: No changes to commit.');
    process.exit(0);
  }

  console.log('\nFiles ready to commit:');
  console.log(changes);

  const message = await ask('\nCommit message: ');

  if (!message) {
    console.error('SHIP STOPPED: Commit message cannot be empty.');
    process.exit(1);
  }

  run('git', ['add', '-A']);
  run('git', ['diff', '--cached', '--check']);
  run('git', ['commit', '-m', message]);
  run('git', ['push', '--set-upstream', 'origin', branch]);

  console.log('\nSHIP COMPLETE: branch pushed successfully.');
  console.log(
    'Next step: open a Pull Request into main and let GitHub CI be the final quality gate.',
  );
}

main().catch((error) => {
  console.error(`\nSHIP ERROR: ${error.message}`);
  process.exit(1);
});
