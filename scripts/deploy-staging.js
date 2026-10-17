'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateStagingConfiguration } = require('./staging-preflight');

const ROOT = path.resolve(__dirname, '..');

function extractCredentialValues(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw || ''));
  } catch {
    return [];
  }

  const values = [];
  const sensitiveKey =
    /token|secret|client.?id|authorization|credential|password|password|email|private.?key|api.?key/i;
  const sensitiveContainer = /^(token|tokens|oauth2ClientSettings|credentials?)$/i;

  function visit(value, key = '', insideSensitiveContainer = false) {
    const inside = insideSensitiveContainer || sensitiveContainer.test(key);
    if (typeof value === 'string') {
      if (value && (inside || sensitiveKey.test(key))) values.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, inside));
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([childKey, childValue]) => {
      visit(childValue, childKey, inside);
    });
  }

  visit(parsed);
  return [...new Set(values)];
}

function sanitized(value, env = process.env) {
  let text = String(value || '');
  const hidden = [
    env.CLASPRC_JSON,
    ...extractCredentialValues(env.CLASPRC_JSON),
    env.CV_STAGING_UAT_OWNER_PASSWORD,
    env.CV_STAGING_UAT_MANAGER_PASSWORD,
    env.CV_STAGING_UAT_OWNER_EMAIL,
    env.CV_STAGING_UAT_MANAGER_EMAIL,
    env.CV_STAGING_API_URL,
    env.CV_STAGING_SCRIPT_ID,
    env.CV_STAGING_DEPLOYMENT_ID,
    env.CV_STAGING_SPREADSHEET_ID,
    env.CV_STAGING_RECEIPT_FOLDER_ID,
    env.CV_STAGING_BACKUP_FOLDER_ID,
    env.CV_PRODUCTION_SCRIPT_ID,
    env.CV_PRODUCTION_SPREADSHEET_ID,
    env.CV_PRODUCTION_RECEIPT_FOLDER_ID,
    env.CV_PRODUCTION_BACKUP_FOLDER_ID,
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const valueToHide of hidden) {
    text = text.split(String(valueToHide)).join('[redacted]');
  }
  return text.slice(0, 5000);
}

function runClasp(args, options = {}) {
  const root = options.root || ROOT;
  const tempHome = options.tempHome;
  const workspace = options.workspace;
  const env = { ...process.env, HOME: tempHome, USERPROFILE: tempHome };
  delete env.CLASPRC_JSON;

  const binary = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'clasp.cmd' : 'clasp',
  );
  if (!fs.existsSync(binary)) {
    throw new Error('Local Clasp executable not found. Run npm ci before deploying staging.');
  }

  const result = spawnSync(binary, args, {
    cwd: workspace,
    env,
    shell: false,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error('Clasp command could not start: ' + sanitized(result.error.message));
  }
  if (result.status !== 0) {
    const detail = sanitized([result.stderr, result.stdout].filter(Boolean).join('\n'));
    throw new Error('Clasp command failed (' + args[0] + '). ' + detail);
  }
  return String(result.stdout || '');
}

function deployStaging(env = process.env, root = ROOT) {
  const preflight = validateStagingConfiguration(env, { mode: 'deploy', root });
  if (!preflight.ok) {
    throw new Error('Staging deployment preflight failed:\n- ' + preflight.errors.join('\n- '));
  }
  if (String(env.CV_STAGING_DEPLOY_CONFIRMATION || '') !== 'STAGING-ONLY') {
    throw new Error('Staging deployment requires the exact STAGING-ONLY confirmation.');
  }

  const sourceBackend = path.join(root, 'backend');
  if (!fs.existsSync(path.join(sourceBackend, 'appsscript.json'))) {
    throw new Error('Expected backend/appsscript.json was not found.');
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-staging-project-'));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-staging-home-'));
  try {
    const projectRoot = path.join(workspace, 'project');
    fs.mkdirSync(projectRoot, { recursive: true, mode: 0o700 });
    fs.cpSync(sourceBackend, path.join(projectRoot, 'backend'), {
      recursive: true,
      errorOnExist: true,
    });

    fs.writeFileSync(
      path.join(projectRoot, '.clasp.json'),
      JSON.stringify(
        {
          scriptId: String(env.CV_STAGING_SCRIPT_ID).trim(),
          rootDir: 'backend',
          fileExtension: 'gs',
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(tempHome, '.clasprc.json'),
      JSON.stringify(JSON.parse(String(env.CLASPRC_JSON))),
      { mode: 0o600 },
    );

    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    try {
      process.env.HOME = tempHome;
      process.env.USERPROFILE = tempHome;
      const deploymentOutput = runClasp(['list-deployments'], {
        root,
        tempHome,
        workspace: projectRoot,
      });
      const expectedDeploymentId = String(env.CV_STAGING_DEPLOYMENT_ID).trim();
      if (!deploymentOutput.includes(expectedDeploymentId)) {
        throw new Error(
          'Configured staging deployment ID was not found in the configured staging Script project. ' +
            'Provision the first staging Web App deployment manually, verify its URL, and retry.',
        );
      }

      runClasp(['push', '--force'], {
        root,
        tempHome,
        workspace: projectRoot,
      });
      runClasp(
        [
          'create-deployment',
          '--deploymentId',
          expectedDeploymentId,
          '--description',
          'Cash Voucher staging UAT ' + String(env.GITHUB_SHA || 'manual').slice(0, 12),
        ],
        {
          root,
          tempHome,
          workspace: projectRoot,
        },
      );
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
    }

    console.log(
      'Staging deployment updated. The deployment ID and URL were intentionally not printed.',
    );
    return { ok: true };
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function main() {
  try {
    deployStaging();
  } catch (error) {
    console.error('STAGING DEPLOYMENT STOPPED: ' + sanitized(error.message));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { deployStaging, runClasp, sanitized };
