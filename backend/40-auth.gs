/* ============ password authentication ============ */
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
    const email = String(req.email || '').trim().toLowerCase().slice(0, 254);
    const password = typeof req.password === 'string' ? req.password : '';
    const cache = CacheService.getScriptCache();
    const fk = 'f:' + (email || '(empty)');
    const rawFails = cache.get(fk);

    if (rawFails === 'LOCKED') {
      throw err_('Too many attempts. Try again in 15 minutes.', 'LOCKED');
    }
    const fails = Number(rawFails || 0);
    if (fails >= CFG.MAX_FAILS) {
      cache.put(fk, 'LOCKED', CFG.LOCK_SECONDS);
      audit_({ email: email || '(empty)' }, 'LOGIN_LOCKED', email, 'Temporary lockout after repeated failed sign-in attempts.');
      throw err_('Too many attempts. Try again in 15 minutes.', 'LOCKED');
    }

    const u = email ? findUserByEmail_(email) : null;
    const active = u && (u.Active === true || u.Active === 'TRUE');
    const validPassword = passwordOk_(password);
    if (!u || !active || !validPassword || !same_(hashPassword_(u.Salt, password), u.PasswordHash)) {
      cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
      audit_(
        { email: email || '(empty)' },
        'LOGIN_FAILED',
        email || '(empty)',
        'Invalid credentials or inactive account. Password value intentionally excluded.',
      );
      throw err_('Invalid email or password.', 'AUTH');
    }

    cache.remove(fk);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('s:' + token, JSON.stringify({ email: email, salt: u.Salt }), CFG.SESSION_TTL);
    updateRow_('Users', u._row, { LastLogin: nowIso_() });
    audit_({ email: email }, 'LOGIN', '', 'Successful sign-in; role=' + String(u.Role || 'unknown') + '.');
    return { token: token, user: pubUser_(u) };
  }, 'Authentication is busy. No login attempt was recorded. Please retry shortly.');
}
function auth_(token) {
  const raw = token && CacheService.getScriptCache().get('s:' + token);
  if (!raw) throw err_('Session expired. Please sign in again.', 'SESSION');
  const s = JSON.parse(raw), u = findUserByEmail_(s.email);
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
  audit_(user, 'LOGOUT', '', 'Sign-out request received.');
  return { ok: true };
}
