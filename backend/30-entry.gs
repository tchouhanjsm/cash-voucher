/* ============ web app entry ============ */
// eslint-disable-next-line no-unused-vars
function doGet() {
  return ContentService.createTextOutput('Cash Vouchers API is running.');
}
// eslint-disable-next-line no-unused-vars
function doPost(e) {
  let out;
  try {
    const raw = String((e && e.postData && e.postData.contents) || '');
    if (!raw) throw err_('Request body is required.', 'VALIDATION');
    if (raw.length > CFG.MAX_REQUEST) throw err_('Request is too large.', 'PAYLOAD');

    let req;
    try {
      req = JSON.parse(raw);
    } catch {
      throw err_('Invalid request format.', 'VALIDATION');
    }

    validateRequest_(req);
    out = { ok: true, data: route_(req) };
  } catch (err) {
    out = {
      ok: false,
      error: err.userMessage || 'Something went wrong. Please try again.',
      code: err.code || 'SERVER',
    };
    if (!err.userMessage) console.error((err && err.stack) || err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function validateRequest_(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) {
    throw err_('Invalid request.', 'VALIDATION');
  }

  const action = typeof req.action === 'string' ? req.action.trim() : '';
  if (!action) throw err_('Action is required.', 'VALIDATION');
  if (action.length > 50) throw err_('Invalid action.', 'VALIDATION');
  if (action !== 'login' && action !== 'logout' && typeof req.token !== 'string') {
    throw err_('Session token is required.', 'SESSION');
  }
}

function route_(req) {
  validateRequest_(req);
  if (req.action === 'login') return login_(req);
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, req.action)) {
    throw err_('Unknown action.', 'NOT_FOUND');
  }
  const fn = ACTIONS[req.action];

  if (!Object.prototype.hasOwnProperty.call(WRITES, req.action)) {
    const user = auth_(req.token);
    if (user.mustChange && req.action !== 'changePin' && req.action !== 'logout')
      throw err_('Please change your PIN first.', 'PIN_CHANGE');
    return fn(user, req);
  }

  return withScriptLock_(function () {
    const user = auth_(req.token);
    if (user.mustChange && req.action !== 'changePin' && req.action !== 'logout')
      throw err_('Please change your PIN first.', 'PIN_CHANGE');
    return fn(user, req);
  }, 'The service is busy. No changes were made. Please retry shortly.');
}
