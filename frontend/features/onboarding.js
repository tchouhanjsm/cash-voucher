import { $ } from '../core/dom.js';
import { S } from '../core/state.js';
import { toast } from '../core/ui.js';

const STAGES = {
  preflight: {
    number: '01',
    title: 'Initial setup & preflight',
    description: 'Verify customer-specific identity and configuration before transactions.',
  },
  stagingUat: {
    number: '02',
    title: 'Staging UAT',
    description: 'Test workflows with synthetic data on the isolated staging instance.',
  },
  productionAcceptance: {
    number: '03',
    title: 'Production acceptance',
    description:
      'Verify production separately and record operator evidence before enabling financial writes.',
  },
  complete: {
    number: '✓',
    title: 'Onboarding accepted',
    description: 'The server rechecks the release gate for protected writes.',
  },
};

const TITLES = {
  environmentMatch: 'Environment and customer identity',
  propertyConfigured: 'Property name and categories',
  accountsReady: 'Owner, Manager and Staff accounts',
  sheetSchemaReady: 'Spreadsheet tabs and headers',
  foldersAccessible: 'Receipt and backup folder access',
  backupTriggerReady: 'Scheduled backup trigger',
  recentBackup: 'Recent successful backup',
  loginAndRoles: 'Login and role restrictions',
  voucherAndReceipt: 'Voucher creation and receipt upload',
  highValueApproval: '₹10,000 payment approval and no self-approval',
  cashClose: 'Cash close and reconciliation',
  offlineSync: 'Offline queue sync and duplicate prevention',
  restoreDrill: 'Restore drill to separate recovery resources',
  ownerUatSignoff: 'Owner staging UAT sign-off',
  productionTargetMatch: 'Production deployment identity',
  serverReadiness: 'Production server readiness',
  offlineLimitations: 'Offline-data and backup limitations acknowledged',
  ownerAcceptance: 'Final owner production acceptance',
};

export function createOnboarding({ api }) {
  let current = null;
  let busy = false;

  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  function help(id) {
    const instructions = {
      environmentMatch:
        'Compare Script, deployment, Sheet, receipt folder and backup folder with the private instance register.',
      propertyConfigured:
        'Save the real property name and business categories in Settings. Placeholder defaults do not pass.',
      accountsReady:
        'Create Manager and Staff accounts. Each person must sign in and change the temporary password.',
      sheetSchemaReady:
        'Inspect required tabs and headers. Never run setup() on a populated Sheet; use a reviewed migration only.',
      foldersAccessible:
        'Verify folder identity and access with the operator account. Do not grant staff direct Sheet, script or Drive access.',
      backupTriggerReady:
        'Inspect Apps Script triggers. Do not rerun setup() to repair a populated instance.',
      recentBackup:
        'A backup timestamp is not restore proof. Restore into separate recovery resources and have the operator reconcile it.',
    };

    return (
      instructions[id] ||
      'Run the test on the dedicated staging instance. Note date, device/role and observed outcome. Never enter credentials, tokens or private resource IDs.'
    );
  }

  function calculateSummary(steps) {
    return steps.reduce(
      (counts, step) => {
        counts.total++;
        if (step.status === 'pass') counts.passed++;
        else if (step.status === 'blocked') counts.blocked++;
        else if (step.status === 'fail') counts.failed++;
        else if (step.status === 'pending') counts.pending++;
        return counts;
      },
      { total: 0, passed: 0, blocked: 0, failed: 0, pending: 0, attention: 0 },
    );
  }

  const BACKUP_ISSUE_LABELS = {
    NO_SUCCESS: 'No completed backup success is recorded.',
    INVALID_SUCCESS_TIMESTAMP: 'The last-success timestamp is missing or malformed.',
    SUCCESS_IN_FUTURE: 'The last-success timestamp is in the future.',
    SUCCESS_STALE: 'The last successful backup is outside the 36-hour preflight window.',
    NO_ATTEMPT: 'The latest backup-attempt timestamp is missing.',
    INVALID_ATTEMPT_TIMESTAMP: 'The latest backup-attempt timestamp is malformed.',
    ATTEMPT_AFTER_SUCCESS: 'The latest attempt is later than the last successful backup.',
    RECORDED_FAILURE: 'A backup failure is recorded and needs operator review.',
  };

  function renderBackupDetails(step) {
    if (step.id !== 'recentBackup' || !step.details || typeof step.details !== 'object') {
      return null;
    }

    const details = step.details;
    const panel = el('section', undefined, 'onboarding-backup-details');
    panel.setAttribute('aria-label', 'Backup marker validation details');
    panel.appendChild(el('h3', 'Backup marker checks'));

    const rows = [
      ['Last successful marker', details.lastSuccess || 'Not recorded'],
      ['Latest attempt marker', details.lastAttempt || 'Not recorded'],
      [
        'Success timestamp',
        details.successTimestampCanonical ? 'Canonical UTC ISO timestamp' : 'Missing or invalid',
      ],
      [
        'Attempt timestamp',
        details.attemptTimestampCanonical ? 'Canonical UTC ISO timestamp' : 'Missing or invalid',
      ],
      ['36-hour freshness window', details.freshWithin36Hours === true ? 'Pass' : 'Blocked'],
      [
        'Attempt chronology',
        details.noLaterAttempt === true ? 'Consistent' : 'Missing or inconsistent',
      ],
      ['Recorded backup failure', details.hasRecordedFailure ? 'Yes' : 'No'],
    ];
    const list = el('dl', undefined, 'onboarding-backup-details__list');
    rows.forEach(([label, value]) => {
      list.append(el('dt', label), el('dd', String(value)));
    });
    panel.appendChild(list);

    const issues = Array.isArray(details.issues)
      ? details.issues.filter((issue) => typeof issue === 'string')
      : [];
    if (issues.length) {
      const issueList = el('ul', undefined, 'onboarding-backup-details__issues');
      issues.forEach((issue) => {
        issueList.appendChild(
          el('li', BACKUP_ISSUE_LABELS[issue] || 'Backup marker validation needs attention.'),
        );
      });
      panel.append(el('h4', 'What needs attention'), issueList);
    } else if (details.ready === true) {
      panel.appendChild(
        el('p', 'Backup marker checks pass for preflight.', 'onboarding-backup-details__pass'),
      );
    }

    panel.appendChild(
      el(
        'p',
        'Marker checks do not inspect snapshot contents and are not proof of a successful restore. Complete the separate restore drill.',
        'muted',
      ),
    );
    return panel;
  }

  function setBusyPresentation() {
    const root = $('#view');
    if (!root) return;
    root.setAttribute('aria-busy', busy ? 'true' : 'false');
    root.querySelectorAll('button[data-onboarding-action]').forEach((button) => {
      button.disabled = busy || button.dataset.onboardingActionDisabled === 'true';
    });
    root.querySelectorAll('textarea[data-evidence-for]').forEach((textarea) => {
      textarea.disabled = busy;
    });
  }

  function updateStageState(state) {
    S.onboardingStage = state.stage;
    S.onboardingEnvironment = state.environment;
  }

  async function refreshAfterMutationFailure(error, fallback) {
    toast(error.message || fallback, 'err');
    try {
      current = await api('onboardingState');
      updateStageState(current);
      render();
    } catch {
      current = null;
      renderError(
        'The action failed and current server state could not be refreshed. Retry server checks before continuing.',
      );
    }
  }

  function renderError(message) {
    const root = $('#view');
    root.replaceChildren();

    const card = el('section', undefined, 'onboarding-page card');
    card.append(
      el('p', 'CLIENT LAUNCH', 'muted'),
      el('h1', 'Get Cash Voucher ready'),
      el('p', message, 'error'),
    );
    card.setAttribute('role', 'alert');
    card.setAttribute('aria-live', 'assertive');

    const retry = el('button', 'Retry server checks', 'btn primary');
    retry.type = 'button';
    retry.dataset.onboardingAction = 'retry';
    retry.addEventListener('click', load);
    card.appendChild(retry);
    root.appendChild(card);
  }

  function render() {
    const root = $('#view');
    root.replaceChildren();

    if (!current) {
      const loading = el('section', undefined, 'onboarding-page card');
      loading.append(
        el('p', 'CLIENT LAUNCH', 'muted'),
        el('h1', 'Get Cash Voucher ready'),
        el('p', 'Checking this customer’s configuration with the server…', 'muted'),
      );
      const retry = el('button', 'Retry server checks', 'btn primary');
      retry.type = 'button';
      retry.dataset.onboardingAction = 'retry';
      retry.disabled = busy;
      retry.addEventListener('click', load);
      loading.appendChild(retry);
      root.appendChild(loading);
      if (!busy) void load();
      return;
    }

    const stage = STAGES[current.stage] || STAGES.preflight;
    const card = el('section', undefined, 'onboarding-page card');
    card.setAttribute('aria-busy', busy ? 'true' : 'false');
    const header = el('header', undefined, 'onboarding-header');

    header.append(
      el('p', 'CLIENT LAUNCH', 'muted'),
      el('h1', 'Get Cash Voucher ready'),
      el('p', stage.description, 'onboarding-lede'),
    );
    card.appendChild(header);

    const stageBox = el('section', undefined, 'onboarding-stage');
    stageBox.append(
      el('span', stage.number, 'onboarding-stage__number'),
      el('div', stage.title, 'onboarding-stage__title'),
      el(
        'p',
        String(current.environment || '').toUpperCase() + ' environment · progress saved on server',
        'muted',
      ),
    );
    card.appendChild(stageBox);

    const steps = Array.isArray(current.steps) ? current.steps : [];
    const computedSummary = calculateSummary(steps);
    const summary =
      current.summary &&
      ['total', 'passed', 'blocked', 'failed', 'pending'].every(
        (key) => Number.isSafeInteger(current.summary[key]) && current.summary[key] >= 0,
      )
        ? current.summary
        : computedSummary;
    summary.attention = Number.isSafeInteger(summary.attention)
      ? summary.attention
      : summary.blocked + summary.failed + summary.pending;

    const summaryPanel = el('section', undefined, 'onboarding-summary');
    summaryPanel.setAttribute('aria-label', 'Current-stage readiness summary');
    summaryPanel.setAttribute('role', 'group');
    [
      ['passed', 'Passed', 'passed'],
      ['blocked', 'Blocked', 'blocked'],
      ['pending', 'Pending evidence', 'pending'],
      ['failed', 'Failed', 'failed'],
    ].forEach(([key, label, tone]) => {
      const item = el(
        'div',
        undefined,
        'onboarding-summary__item onboarding-summary__item--' + tone,
      );
      const value = el('strong', String(summary[key] || 0), 'onboarding-summary__count');
      value.dataset.onboardingCount = key;
      const caption = el('span', label, 'onboarding-summary__label');
      item.append(value, caption);
      summaryPanel.appendChild(item);
    });
    card.appendChild(summaryPanel);

    const attentionSteps = steps.filter((step) => step.status !== 'pass');
    const attentionPanel = el('section', undefined, 'onboarding-attention');
    attentionPanel.setAttribute('aria-label', 'Outstanding onboarding actions');
    if (attentionSteps.length) {
      const first = attentionSteps[0];
      const title = TITLES[first.id] || first.id;
      const status =
        first.status === 'fail'
          ? 'failed'
          : first.status === 'pending'
            ? 'pending evidence'
            : 'blocked';
      attentionPanel.append(
        el('h2', 'Next action'),
        el(
          'p',
          title +
            ' — ' +
            status +
            '. Work through the list in order; later stages stay locked while prerequisites remain unresolved.',
        ),
        el('p', summary.attention + ' outstanding item(s) in this stage.', 'muted'),
      );
    } else {
      attentionPanel.append(
        el('h2', 'All current-stage requirements pass'),
        el(
          'p',
          'Refresh checks before advancing so the server can re-evaluate the current environment.',
          'muted',
        ),
      );
    }
    card.appendChild(attentionPanel);

    const passed = Number.isSafeInteger(summary.passed) ? summary.passed : computedSummary.passed;
    const progress = el('section', undefined, 'onboarding-progress');
    progress.append(el('p', passed + ' of ' + steps.length + ' requirements passed', 'muted'));

    const meter = el('progress');
    meter.max = Math.max(steps.length, 1);
    meter.value = passed;
    meter.setAttribute('aria-label', 'Current-stage completion');
    progress.appendChild(meter);
    card.appendChild(progress);

    const list = el('div', undefined, 'onboarding-steps');
    steps.forEach((step, index) => {
      const item = el('article', undefined, 'onboarding-step');
      const statusLabel =
        step.status === 'pass'
          ? 'Passed'
          : step.status === 'fail'
            ? 'Failed'
            : step.status === 'pending'
              ? 'Needs confirmation'
              : 'Blocked';

      item.append(
        el('span', statusLabel, 'onboarding-status onboarding-status--' + step.status),
        el('h2', index + 1 + '. ' + (TITLES[step.id] || step.id)),
        el('p', step.message, 'onboarding-message'),
      );
      const backupDetails = renderBackupDetails(step);
      if (backupDetails) item.appendChild(backupDetails);

      if (!step.automatic) {
        const evidenceLabel = el('label', 'Evidence note (12–500 characters)');
        const textarea = el('textarea', undefined, 'onboarding-evidence');
        textarea.rows = 3;
        textarea.minLength = 12;
        textarea.maxLength = 500;
        textarea.required = true;
        textarea.disabled = busy;
        textarea.value = step.evidence || '';
        textarea.dataset.evidenceFor = step.id;
        evidenceLabel.appendChild(textarea);
        item.appendChild(evidenceLabel);

        if (step.actorEmail) {
          item.appendChild(
            el(
              'p',
              'Last recorded by ' +
                step.actorEmail +
                (step.completedAt ? ' · ' + step.completedAt : ''),
              'muted',
            ),
          );
        }

        const actions = el('div', undefined, 'actions');
        const pass = el('button', 'Record pass', 'btn primary');
        pass.type = 'button';
        pass.dataset.confirmStep = step.id;
        pass.dataset.onboardingAction = 'confirm';
        pass.disabled = busy;
        const fail = el('button', 'Record failure', 'btn danger');
        fail.type = 'button';
        fail.dataset.failStep = step.id;
        fail.dataset.onboardingAction = 'confirm';
        fail.disabled = busy;
        actions.append(pass, fail);
        item.appendChild(actions);
      } else if (step.status !== 'pass') {
        const details = el('details', undefined, 'onboarding-help');
        details.append(el('summary', 'What should I do?'), el('p', help(step.id)));
        item.appendChild(details);
      }

      list.appendChild(item);
    });
    card.appendChild(list);

    const footer = el('div', undefined, 'actions onboarding-footer');
    const refresh = el('button', 'Refresh checks', 'btn');
    refresh.type = 'button';
    refresh.dataset.onboardingAction = 'refresh';
    refresh.disabled = busy;
    refresh.addEventListener('click', load);
    footer.appendChild(refresh);

    if (current.stage !== 'complete') {
      const label =
        current.stage === 'preflight'
          ? current.environment === 'staging'
            ? 'Begin staging UAT'
            : 'Begin production acceptance'
          : 'Complete onboarding and enable release gate';
      const advance = el('button', label, 'btn primary');
      advance.type = 'button';
      advance.dataset.onboardingAction = 'advance';
      advance.dataset.onboardingActionDisabled = String(!current.canAdvance);
      advance.disabled = busy || !current.canAdvance;
      advance.addEventListener('click', advanceStage);
      footer.appendChild(advance);
    }

    const gateText = current.releaseAllowed
      ? 'Production acceptance complete. Server release gate currently passes.'
      : current.environment === 'production'
        ? 'Production financial writes remain blocked until all acceptance requirements pass.'
        : current.stage === 'stagingUat'
          ? 'Staging-only UAT writes are allowed on this instance.'
          : 'Financial writes are blocked until preflight passes.';
    const gate = el('p', gateText, 'onboarding-gate');
    gate.setAttribute('role', 'status');
    footer.appendChild(gate);
    card.appendChild(footer);
    root.appendChild(card);
  }

  async function load() {
    if (busy) return;
    busy = true;
    setBusyPresentation();
    try {
      current = await api('onboardingState');
      updateStageState(current);
      render();
    } catch (error) {
      current = null;
      renderError(error.message || 'Could not load server-verified onboarding state.');
    } finally {
      busy = false;
      setBusyPresentation();
    }
  }

  async function confirm(stepId, status) {
    if (busy || !current) return;
    const note = $('[data-evidence-for="' + stepId + '"]')?.value || '';
    if (note.trim().length < 12) {
      toast('Add a specific evidence note of at least 12 characters.', 'err');
      return;
    }

    busy = true;
    setBusyPresentation();
    try {
      current = await api('onboardingConfirm', { stepId, status, evidence: note });
      toast(
        status === 'pass'
          ? 'Owner evidence saved on the server.'
          : 'Failure recorded. Resolve it before continuing.',
      );
      render();
    } catch (error) {
      await refreshAfterMutationFailure(error, 'Confirmation was not saved.');
    } finally {
      busy = false;
      setBusyPresentation();
    }
  }

  async function advanceStage() {
    if (busy || !current) return;
    busy = true;
    setBusyPresentation();
    try {
      current = await api('onboardingAdvance');
      S.onboardingStage = current.stage;
      toast('Onboarding progression saved on the server.');
      render();
    } catch (error) {
      await refreshAfterMutationFailure(error, 'The stage still has blockers.');
    } finally {
      busy = false;
      setBusyPresentation();
    }
  }

  function init() {
    $('#view').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.confirmStep) {
        confirm(button.dataset.confirmStep, 'pass');
      } else if (button.dataset.failStep) {
        confirm(button.dataset.failStep, 'fail');
      }
    });
    setBusyPresentation();
  }

  return { render, load, init };
}
