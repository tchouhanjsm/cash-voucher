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
    if (!passwordOk_(String(req.password || '')))
      throw err_('Temporary password must contain 8–128 characters.');
    const created = addUser_(name, email, role, String(req.password), true);
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
      'User account created; password change required',
    );
    return { ok: true };
  }
  const t = all.filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  const active =
    req.active === undefined ? t.Active === true || t.Active === 'TRUE' : !!req.active;
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
function resetPassword_(user, req) {
  need_(user, 'users');
  const t = readAll_('Users').filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  if (!passwordOk_(String(req.password || '')))
    throw err_('Temporary password must contain 8–128 characters.');
  const salt = Utilities.getUuid();
  const previouslyRequiredChange =
    t.MustChangePassword === true || t.MustChangePassword === 'TRUE';
  updateRow_('Users', t._row, {
    Salt: salt,
    PasswordHash: hashPassword_(salt, String(req.password)),
    MustChangePassword: true,
  });
  const cache = CacheService.getScriptCache();
  cache.remove('f:' + String(t.Email).toLowerCase());
  cache.remove('pf:' + String(t.UserID));
  auditEvent_(
    user,
    'PASSWORD_RESET',
    t.Email,
    'USER_PASSWORD_RESET',
    'user',
    t.UserID,
    '',
    [{ field: 'mustChangePassword', before: previouslyRequiredChange, after: true }],
    'Temporary password reset; credential material intentionally excluded',
  );
  return { ok: true };
}
function changePassword_(user, req) {
  // route_ authenticates this session after acquiring the shared ScriptLock.
  const u = user._u,
    oldPassword = String(req.oldPassword || ''),
    newPassword = String(req.newPassword || ''),
    cache = CacheService.getScriptCache(),
    fk = 'pf:' + u.UserID;
  const fails = Number(cache.get(fk) || 0);
  if (fails >= CFG.MAX_FAILS)
    throw err_('Too many password-change attempts. Try again in 15 minutes.', 'LOCKED');
  if (!same_(hashPassword_(u.Salt, oldPassword), u.PasswordHash)) {
    cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
    audit_(user, 'PASSWORD_CHANGE_FAILED', '', '');
    throw err_('Current password is wrong.');
  }
  cache.remove(fk);
  if (!passwordOk_(newPassword))
    throw err_('New password must contain 8–128 characters.');
  if (newPassword === oldPassword) throw err_('New password must be different.');
  const salt = Utilities.getUuid();
  updateRow_('Users', u._row, {
    Salt: salt,
    PasswordHash: hashPassword_(salt, newPassword),
    MustChangePassword: false,
  });
  cache.remove('s:' + req.token);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('s:' + token, JSON.stringify({ email: user.email, salt: salt }), CFG.SESSION_TTL);
  audit_(user, 'PASSWORD_CHANGE', '', '');
  return { token: token };
}
