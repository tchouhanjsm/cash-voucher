/* ============ auth ============ */
function findUserByEmail_(email) {
  return readAll_('Users').filter(function (u) {
    return String(u.Email).toLowerCase() === email;
  })[0];
}
function withScriptLock_(work, busyMessage) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch {
    throw err_(
      busyMessage || 'The service is busy. No changes were made. Please retry shortly.',
      'BUSY',
    );
  }

  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}
function login_(req) {
  return withScriptLock_(function () {
    const email = String(req.email || '')
      .trim()
      .toLowerCase()
      .slice(0, 254);
    const password = String(
      req.password === undefined || req.password === null ? '' : req.password,
    );
    const cache = CacheService.getScriptCache();
    const fk = 'f:' + email;
    const fails = Number(cache.get(fk) || 0);
    if (fails >= CFG.MAX_FAILS) {
      audit_(
        { email: clean_(email || '(empty)', 254) },
        'LOGIN_LOCKED',
        '',
        'Attempt refused by temporary lockout',
      );
      throw err_('Too many attempts. Try again in 15 minutes.', 'LOCKED');
    }

    const u = email ? findUserByEmail_(email) : null;
    const active = u && (u.Active === true || u.Active === 'TRUE');
    const mustChange = u && (u.MustChangePassword === true || u.MustChangePassword === 'TRUE');
    const migrationEnabled =
      props_().getProperty('AUTH_SCHEMA_PASSWORD_MIGRATION') === 'PIN_TO_PASSWORD_V1';
    // Legacy credentials shorter than eight characters are accepted only while the explicit
    // migration marker is present and the account is marked for mandatory password change.
    const legacyShortCredential = Boolean(
      migrationEnabled && mustChange && password.length > 0 && password.length < 8,
    );
    const acceptableLength = passwordOk_(password) || legacyShortCredential;
    const passwordMatches = Boolean(
      u && active && acceptableLength && same_(hashPassword_(u.Salt, password), u.PasswordHash),
    );

    if (!u || !active || !acceptableLength || !passwordMatches) {
      cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
      audit_(
        { email: clean_(email || '(empty)', 254) },
        'LOGIN_FAILED',
        '',
        'Invalid credentials; password value intentionally excluded.',
      );
      throw err_('Invalid email or password.');
    }

    cache.remove(fk);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('s:' + token, JSON.stringify({ email: email, salt: u.Salt }), CFG.SESSION_TTL);
    updateRow_('Users', u._row, { LastLogin: nowIso_() });
    audit_({ email: email }, 'LOGIN_SUCCESS', '', 'role=' + String(u.Role || 'unknown'));
    return { token: token, user: pubUser_(u) };
  }, 'Authentication is busy. No login attempt was recorded. Please retry shortly.');
}
function auth_(token) {
  const raw = token && CacheService.getScriptCache().get('s:' + token);
  if (!raw) throw err_('Session expired. Please sign in again.', 'SESSION');
  const s = JSON.parse(raw),
    u = findUserByEmail_(s.email);
  if (!u || !(u.Active === true || u.Active === 'TRUE') || u.Salt !== s.salt)
    throw err_('Session expired. Please sign in again.', 'SESSION');
  const p = pubUser_(u);
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    mustChange: p.mustChangePassword,
    _row: u._row,
    _u: u,
  };
}
function logout_(user, req) {
  CacheService.getScriptCache().remove('s:' + req.token);
  audit_({ email: user.email }, 'LOGOUT', '', '');
  return { ok: true };
}
