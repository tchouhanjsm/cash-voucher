const { execFileSync } = require('node:child_process');
const readline = require('node:readline');

function run(command, args = []) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
  });
}

function capture(command, args = []) {
  return execFileSync(command, args, {
    encoding: 'utf8',
  }).trim();
}

function fail(message) {
  console.error(`\nSHIP STOPPED: ${message}`);
  process.exit(1);
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
  console.log('=== Cash Voucher Ship ===');

  const branch = capture('git', ['branch', '--show-current']);

  if (!branch) {
    fail('You are not on a named Git branch.');
  }

  const beforeStatus = capture('git', ['status', '--porcelain']);

  if (beforeStatus) {
    console.error('\nUncommitted changes detected:\n');
    console.error(beforeStatus);
    fail(
      'Working tree must be clean before npm run ship. Commit or stash unrelated changes first.',
    );
  }

  console.log(`\nBranch: ${branch}`);

  console.log('\n1. Running automatic fixes...');
  run('npm', ['run', 'fix']);

  const changedFiles = capture('git', ['status', '--short']);

  if (!changedFiles) {
    console.log('\nNo changes were produced. Nothing to commit or push.');
    return;
  }

  console.log('\n2. Changed files:');
  console.log(changedFiles);

  console.log('\n3. Checking whitespace errors...');
  run('git', ['diff', '--check']);

  console.log('\n4. Change summary:');
  run('git', ['diff', '--stat']);

  const commitMessage = await ask('\nEnter commit message (leave blank to cancel): ');

  if (!commitMessage) {
    console.log('\nShip cancelled. No commit or push was performed.');
    return;
  }

  console.log('\n5. Staging changes...');
  run('git', ['add', '-A']);

  console.log('\n6. Staged files:');
  run('git', ['diff', '--cached', '--name-status']);

  console.log('\n7. Creating commit...');
  run('git', ['commit', '-m', commitMessage]);

  console.log('\n8. Pushing current branch...');
  run('git', ['push', '-u', 'origin', 'HEAD']);

  console.log('\n=== SHIP COMPLETE ===');
  console.log(`Branch: ${branch}`);
  console.log(`Commit: ${commitMessage}`);

  console.log('\nFinal Git status:');
  run('git', ['status', '--short', '--branch']);
}

main().catch((error) => {
  console.error('\nSHIP FAILED');
  console.error(error.message);
  process.exit(1);
});
