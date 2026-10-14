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
        .toLowerCase(),
      pin = String(req.pin || '').trim();
    const cache = CacheService.getScriptCache(),
      fk = 'f:' + email;
    const fails = Number(cache.get(fk) || 0);
    if (fails >= CFG.MAX_FAILS) throw err_('Too many attempts. Try again in 15 minutes.', 'LOCKED');
    const u = findUserByEmail_(email);
    const active = u && (u.Active === true || u.Active === 'TRUE');
    if (!u || !active || !same_(hashPin_(u.Salt, pin), u.PinHash)) {
      cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
      if (u) audit_({ email: email }, 'LOGIN_FAILED', '', '');
      throw err_('Invalid email or PIN.');
    }
    cache.remove(fk);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('s:' + token, JSON.stringify({ email: email, salt: u.Salt }), CFG.SESSION_TTL);
    updateRow_('Users', u._row, { LastLogin: nowIso_() });
    audit_({ email: email }, 'LOGIN', '', '');
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
    mustChange: p.mustChangePin,
    _row: u._row,
    _u: u,
  };
}
function logout_(user, req) {
  CacheService.getScriptCache().remove('s:' + req.token);
  return { ok: true };
}
