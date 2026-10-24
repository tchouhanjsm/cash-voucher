/* ============ support: report a problem (any signed-in user) ============ */
const SUPPORT_CATEGORIES = {
  bug: 'Bug',
  question: 'Question',
  feature: 'Suggestion',
  other: 'Other',
};
const SUPPORT_USER_LIMIT_PER_HOUR = 5;
const SUPPORT_WORKSPACE_LIMIT_PER_6H = 20;

function supportRecipient_() {
  const value = String(props_().getProperty('SUPPORT_EMAIL') || '').trim();
  return /^\S+@\S+\.\S+$/.test(value) ? value : '';
}
// Keeps line breaks, drops every other control character (no header injection).
function supportText_(value, max) {
  return (
    String(value === undefined || value === null ? '' : value)
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, max)
  );
}
// Reserve both mail-quota counters under the shared ScriptLock. Never hold the lock
// while sending email; fail closed if the counters cannot be read or updated.
function reserveSupportReportSlot_(email) {
  const userKey = 'support:u:' + String(email || '').trim().toLowerCase();
  const workspaceKey = 'support:w';
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
  } catch {
    throw err_('Support reporting is busy. No report was sent; please retry shortly.', 'BUSY');
  }

  try {
    const cache = CacheService.getScriptCache();
    const readCount = function (key) {
      const raw = cache.get(key);
      if (raw === null || raw === undefined || raw === '') return 0;
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('The support rate-limit counter is invalid.');
      }
      return value;
    };

    let userCount;
    let workspaceCount;
    try {
      userCount = readCount(userKey);
      workspaceCount = readCount(workspaceKey);
    } catch {
      throw err_(
        'Support reporting is temporarily unavailable. No report was sent; please retry shortly.',
        'RATE_LIMIT_UNAVAILABLE',
      );
    }

    if (userCount >= SUPPORT_USER_LIMIT_PER_HOUR || workspaceCount >= SUPPORT_WORKSPACE_LIMIT_PER_6H) {
      throw err_('Too many reports sent recently. Please call your support contact.', 'RATE_LIMIT');
    }

    try {
      // A partial cache write can consume quota without sending an email, but cannot
      // permit an over-limit send. This is deliberately fail-closed.
      cache.put(userKey, String(userCount + 1), 3600);
      cache.put(workspaceKey, String(workspaceCount + 1), 21600);
    } catch {
      throw err_(
        'Support reporting is temporarily unavailable. No report was sent; please retry shortly.',
        'RATE_LIMIT_UNAVAILABLE',
      );
    }
  } finally {
    lock.releaseLock();
  }
}
function reportIssue_(user, req) {
  const category = Object.prototype.hasOwnProperty.call(SUPPORT_CATEGORIES, req.category)
    ? req.category
    : 'bug';
  const subject = supportText_(req.subject, 100).replace(/\n+/g, ' ');
  const message = supportText_(req.message, 2000);
  const context = supportText_(req.context, 300).replace(/\n+/g, ' ');
  if (subject.length < 3)
    throw err_('Enter a short subject (at least 3 characters).', 'VALIDATION');
  if (message.length < 10)
    throw err_('Describe the problem in at least 10 characters.', 'VALIDATION');

  const to = supportRecipient_();
  if (!to) {
    throw err_(
      'Problem reports are not set up for this workspace yet. Please call your support contact.',
      'SUPPORT_NOT_CONFIGURED',
    );
  }
  reserveSupportReportSlot_(user.email);

  const ref = Utilities.getUuid().slice(0, 8).toUpperCase();
  const property = supportText_(settings_().propertyName, 120) || 'Cash Voucher';
  let owner = '';
  try {
    owner = Session.getEffectiveUser().getEmail();
  } catch (e) {
    owner = '';
  }
  const body = [
    'Reference: ' + ref,
    'Type: ' + SUPPORT_CATEGORIES[category],
    'Workspace: ' + property,
    'Reported by: ' + user.name + ' <' + user.email + '> (' + user.role + ')',
    'Time: ' + nowIso_(),
    'Environment: ' + (supportText_(req.environment, 20) || 'unknown'),
    'Script: ' + ScriptApp.getScriptId() + (owner ? ' (owner account ' + owner + ')' : ''),
    'App context: ' + (context || '-'),
    '',
    message,
    '',
    '-- Reply to this email to answer the person who reported it.',
  ].join('\n');
  try {
    MailApp.sendEmail({
      to: to,
      replyTo: user.email,
      name: 'Cash Voucher',
      subject:
        '[CV ' + ref + '] ' + SUPPORT_CATEGORIES[category] + ' - ' + property + ' - ' + subject,
      body: body,
    });
  } catch (e) {
    audit_(user, 'SUPPORT_REPORT_FAILED', ref, category + ': ' + subject);
    throw err_('The report could not be sent. Please call your support contact.', 'MAIL_FAILED');
  }
  audit_(user, 'SUPPORT_REPORT', ref, category + ': ' + subject);
  return { ref: ref };
}
