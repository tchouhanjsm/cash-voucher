/* ============ users (owner) ============ */
function listUsers_(user) {
  need_(user, 'users');
  return readAll_('Users').map(pubUser_);
}
function activeOwners_() {
  return readAll_('Users').filter(function (u) {
    return u.Role === 'owner' && (u.Active === true || u.Active === 'TRUE');
  });
}
function saveUser_(user, req) {
  need_(user, 'users');
  const name = clean_(req.name, 80),
    email = String(req.email || '')
      .trim()
      .toLowerCase(),
    role = req.role;
  if (!name) throw err_('Name is required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw err_('Enter a valid email.');
  if (!Object.prototype.hasOwnProperty.call(PERMS, role)) throw err_('Invalid role.');
  const all = readAll_('Users'),
    dup = all.filter(function (u) {
      return String(u.Email).toLowerCase() === email && u.UserID !== req.id;
    })[0];
  if (dup) throw err_('That email is already a user.');
  if (!req.id) {
    if (!pinOk_(String(req.pin || '')))
      throw err_('Temporary PIN must be 6 digits and not too simple.');
    const created = addUser_(name, email, role, String(req.pin), true);
    auditEvent_(
      user,
      'USER_CREATE',
      email,
      'USER_CREATED',
      'user',
      created.UserID,
      '',
      [
        { field: 'name', before: null, after: name },
        { field: 'email', before: null, after: email },
        { field: 'role', before: null, after: role },
        { field: 'active', before: null, after: true },
      ],
      'User account created; PIN change required',
    );
    return { ok: true };
  }
  const t = all.filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  const active = req.active === undefined ? t.Active === true || t.Active === 'TRUE' : !!req.active;
  const owners = activeOwners_();
  if (t.Role === 'owner' && (role !== 'owner' || !active) && owners.length <= 1)
    throw err_('There must be at least one active owner.');
  const changes = [
    { field: 'name', before: String(t.Name || ''), after: name },
    { field: 'email', before: String(t.Email || ''), after: email },
    { field: 'role', before: String(t.Role || ''), after: role },
    {
      field: 'active',
      before: t.Active === true || t.Active === 'TRUE',
      after: active,
    },
  ].filter(function (change) {
    return change.before !== change.after;
  });
  updateRow_('Users', t._row, { Name: name, Email: email, Role: role, Active: active });
  auditEvent_(
    user,
    'USER_UPDATE',
    email,
    'USER_UPDATED',
    'user',
    t.UserID,
    '',
    changes,
    'User account updated',
  );
  return { ok: true };
}
function resetPin_(user, req) {
  need_(user, 'users');
  const t = readAll_('Users').filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  if (!pinOk_(String(req.pin || '')))
    throw err_('Temporary PIN must be 6 digits and not too simple.');
  const salt = Utilities.getUuid();
  const previouslyRequiredChange = t.MustChangePin === true || t.MustChangePin === 'TRUE';
  updateRow_('Users', t._row, {
    Salt: salt,
    PinHash: hashPin_(salt, String(req.pin)),
    MustChangePin: true,
  });
  const cache = CacheService.getScriptCache();
  cache.remove('f:' + String(t.Email).toLowerCase());
  cache.remove('pf:' + String(t.UserID));
  auditEvent_(
    user,
    'PIN_RESET',
    t.Email,
    'USER_PIN_RESET',
    'user',
    t.UserID,
    '',
    [{ field: 'mustChangePin', before: previouslyRequiredChange, after: true }],
    'Temporary PIN reset; credential material intentionally excluded',
  );
  return { ok: true };
}
function changePin_(user, req) {
  // route_ authenticates this session after acquiring the shared ScriptLock.
  const u = user._u,
    oldPin = String(req.oldPin || ''),
    newPin = String(req.newPin || ''),
    cache = CacheService.getScriptCache(),
    fk = 'pf:' + u.UserID;
  const fails = Number(cache.get(fk) || 0);
  if (fails >= CFG.MAX_FAILS)
    throw err_('Too many PIN-change attempts. Try again in 15 minutes.', 'LOCKED');
  if (!same_(hashPin_(u.Salt, oldPin), u.PinHash)) {
    cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
    audit_(user, 'PIN_CHANGE_FAILED', '', '');
    throw err_('Current PIN is wrong.');
  }
  cache.remove(fk);
  if (!pinOk_(newPin))
    throw err_('New PIN must be 6 digits and not too simple (e.g. 123456, 111111).');
  if (newPin === oldPin) throw err_('New PIN must be different.');
  const salt = Utilities.getUuid();
  updateRow_('Users', u._row, {
    Salt: salt,
    PinHash: hashPin_(salt, newPin),
    MustChangePin: false,
  });
  cache.remove('s:' + req.token);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('s:' + token, JSON.stringify({ email: user.email, salt: salt }), CFG.SESSION_TTL);
  audit_(user, 'PIN_CHANGE', '', '');
  return { token: token };
}
