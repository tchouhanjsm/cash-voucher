const nonNegativeInteger = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

const queueSummary = (value) => {
  if (!value || value.available !== true) {
    return {
      available: false,
      pending: null,
      uploading: null,
      needsReview: null,
      scope: 'Current account and endpoint only; other and unbound records are not counted.',
    };
  }

  return {
    available: true,
    pending: nonNegativeInteger(value.pending),
    uploading: nonNegativeInteger(value.sending),
    needsReview: nonNegativeInteger(value.failed),
    scope: 'Current account and endpoint only; other and unbound records are not counted.',
  };
};

/**
 * Build a deliberately allowlisted support report. Never pass user/voucher records here.
 * The report is generated in this browser and is not sent to a server.
 */
export function createSupportReport({
  appVersion,
  theme,
  online,
  offlineMode,
  hasSessionToken,
  displayMode,
  viewport,
  serviceWorker,
  queue,
}) {
  const safeViewport = {
    width: nonNegativeInteger(viewport?.width),
    height: nonNegativeInteger(viewport?.height),
  };
  const workspace = offlineMode
    ? 'local-only-offline-workspace'
    : hasSessionToken
      ? 'session-token-present'
      : 'no-session-token';

  return {
    formatVersion: 1,
    app: {
      name: 'Cash Vouchers',
      version: typeof appVersion === 'string' ? appVersion : 'unknown',
      versionScope: 'Declared frontend source version; this does not verify the active deployment.',
    },
    generatedAt: new Date().toISOString(),
    runtime: {
      theme: ['light', 'dark'].includes(theme) ? theme : 'unknown',
      connectivity: online === true ? 'online' : 'offline',
      workspace,
      displayMode: ['browser-tab', 'installed-pwa'].includes(displayMode)
        ? displayMode
        : 'unknown',
      viewport: safeViewport,
      serviceWorker: ['controlling', 'not-controlling', 'unsupported'].includes(serviceWorker)
        ? serviceWorker
        : 'unknown',
    },
    synchronization: {
      queue: queueSummary(queue),
      note: 'Queue values are aggregate counts only. They do not prove that a voucher exists on the server.',
    },
    privacy: {
      sentAutomatically: false,
      included: [
        'Declared app version',
        'Generation time',
        'Theme, connectivity and workspace mode',
        'Display mode and viewport dimensions',
        'Service-worker control state',
        'Aggregate status counts for this account and endpoint only, when available',
      ],
      excluded: [
        'Names and email addresses',
        'Server URL, session tokens and credentials',
        'Voucher IDs, vendors, amounts, dates, categories and notes',
        'Receipt images, attachment contents and client IDs',
        'Raw server errors and rejected-entry details',
        'Browser user-agent and device identifiers',
      ],
    },
  };
}
