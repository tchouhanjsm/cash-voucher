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
// Best-effort counter in the script cache (max 6 h). Protects the mail quota of the owner's account.
function supportRateAllowed_(key, limit, ttlSeconds) {
  const cache = CacheService.getScriptCache();
  const used = Number(cache.get(key) || 0);
  if (used >= limit) return false;
  cache.put(key, String(used + 1), ttlSeconds);
  return true;
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
  if (
    !supportRateAllowed_('support:u:' + user.email, SUPPORT_USER_LIMIT_PER_HOUR, 3600) ||
    !supportRateAllowed_('support:w', SUPPORT_WORKSPACE_LIMIT_PER_6H, 21600)
  ) {
    throw err_('Too many reports sent recently. Please call your support contact.', 'RATE_LIMIT');
  }

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
