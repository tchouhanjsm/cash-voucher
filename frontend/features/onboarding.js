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
    description: 'Verify production separately and record operator evidence before enabling financial writes.',
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

  function renderError(message) {
    const root = $('#main-content');
    root.replaceChildren();

    const card = el('section', undefined, 'onboarding-page card');
    card.append(
      el('p', 'CLIENT LAUNCH', 'muted'),
      el('h1', 'Get Cash Voucher ready'),
      el('p', message, 'error'),
    );

    const retry = el('button', 'Retry server checks', 'btn primary');
    retry.type = 'button';
    retry.addEventListener('click', load);
    card.appendChild(retry);
    root.appendChild(card);
  }

  function render() {
    const root = $('#main-content');
    root.replaceChildren();

    if (!current) {
      return renderError(
        'Onboarding status is unavailable. Verify customer build and backend configuration. Financial writes remain protected on the server.',
      );
    }

    const stage = STAGES[current.stage] || STAGES.preflight;
    const card = el('section', undefined, 'onboarding-page card');
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
        String(current.environment || '').toUpperCase() +
          ' environment · progress saved on server',
        'muted',
      ),
    );
    card.appendChild(stageBox);

    const steps = current.steps || [];
    const passed = steps.filter((step) => step.status === 'pass').length;
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

      if (!step.automatic) {
        const evidenceLabel = el('label', 'Evidence note (12–500 characters)');
        const textarea = el('textarea', undefined, 'onboarding-evidence');
        textarea.rows = 3;
        textarea.minLength = 12;
        textarea.maxLength = 500;
        textarea.required = true;
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
        const fail = el('button', 'Record failure', 'btn danger');
        fail.type = 'button';
        fail.dataset.failStep = step.id;
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
      advance.disabled = !current.canAdvance;
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
    try {
      current = await api('onboardingState');
      S.onboardingStage = current.stage;
      S.onboardingEnvironment = current.environment;
      render();
    } catch (error) {
      current = null;
      renderError(error.message || 'Could not load server-verified onboarding state.');
    } finally {
      busy = false;
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
    try {
      current = await api('onboardingConfirm', { stepId, status, evidence: note });
      toast(
        status === 'pass'
          ? 'Owner evidence saved on the server.'
          : 'Failure recorded. Resolve it before continuing.',
      );
      render();
    } catch (error) {
      toast(error.message || 'Confirmation was not saved.', 'err');
    } finally {
      busy = false;
    }
  }

  async function advanceStage() {
    if (busy || !current) return;
    busy = true;
    try {
      current = await api('onboardingAdvance');
      S.onboardingStage = current.stage;
      toast('Onboarding progression saved on the server.');
      render();
    } catch (error) {
      toast(error.message || 'The stage still has blockers.', 'err');
    } finally {
      busy = false;
    }
  }

  function init() {
    $('#main-content').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.confirmStep) {
        confirm(button.dataset.confirmStep, 'pass');
      } else if (button.dataset.failStep) {
        confirm(button.dataset.failStep, 'fail');
      }
    });
  }

  return { render, load, init };
}
