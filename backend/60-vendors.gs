function vendorIsActive_(vendor) {
  return !!vendor && (vendor.Active === true || String(vendor.Active || '').toUpperCase() === 'TRUE');
}

function vendorIdLookup_() {
  const byName = Object.create(null);
  const ambiguous = Object.create(null);
  const byId = Object.create(null);
  const ambiguousIds = Object.create(null);

  readAll_('Vendors').forEach(function (vendor) {
    const id = String(vendor.VendorID || '').trim();
    const name = String(vendor.Name || '').trim();
    const key = name.toLowerCase();

    if (id && !ambiguousIds[id]) {
      if (Object.prototype.hasOwnProperty.call(byId, id)) {
        delete byId[id];
        ambiguousIds[id] = true;
      } else {
        byId[id] = vendor;
      }
    }

    // Inactive records remain addressable by ID for history, but never appear as new-entry choices.
    if (!vendorIsActive_(vendor) || !key || ambiguous[key]) return;
    if (Object.prototype.hasOwnProperty.call(byName, key)) {
      delete byName[key];
      ambiguous[key] = true;
    } else {
      byName[key] = id;
    }
  });

  return { byName: byName, ambiguous: ambiguous, byId: byId, ambiguousIds: ambiguousIds };
}

function vendorIdForName_(name, lookup) {
  const key = String(name || '').trim().toLowerCase();
  const index = lookup || vendorIdLookup_();
  if (!key || index.ambiguous[key]) return '';
  return String(index.byName[key] || '');
}

function resolveVendorIdentity_(name, suppliedId, suppliedType, lookup) {
  const displayName = String(name || '').trim();
  const normalizedName = displayName.toLowerCase();
  const id = String(suppliedId || '').trim();
  const type = String(suppliedType || '').trim().toUpperCase();
  const index = lookup || vendorIdLookup_();

  if (type && type !== 'REGISTERED' && type !== 'ONE_TIME') {
    throw err_('Choose a registered vendor or a one-time payee.', 'VALIDATION');
  }

  if (type === 'ONE_TIME') {
    if (id) throw err_('A one-time payee cannot include a registered vendor ID.', 'VALIDATION');
    return { vendor: displayName, vendorId: '', vendorType: 'ONE_TIME' };
  }

  if (type === 'REGISTERED' || id) {
    if (!id || index.ambiguousIds[id] || !index.byId[id]) {
      throw err_('The selected vendor no longer exists. Refresh vendors and choose an active vendor or a one-time payee.', 'VENDOR_INVALID');
    }
    const vendor = index.byId[id];
    if (!vendorIsActive_(vendor)) {
      throw err_('This vendor is inactive. Choose another active vendor or enter a one-time payee.', 'VENDOR_INACTIVE');
    }
    const canonicalName = String(vendor.Name || '').trim();
    if (!canonicalName || canonicalName.toLowerCase() !== normalizedName) {
      throw err_('The selected vendor identity does not match the payee name. Select the vendor again.', 'VENDOR_MISMATCH');
    }
    return { vendor: displayName, vendorId: id, vendorType: 'REGISTERED' };
  }

  const matchedId = vendorIdForName_(displayName, index);
  if (matchedId) {
    const vendor = index.byId[matchedId];
    return {
      vendor: displayName,
      vendorId: matchedId,
      vendorType: 'REGISTERED',
    };
  }
  return { vendor: displayName, vendorId: '', vendorType: 'ONE_TIME' };
}
/* ============ vendors ============ */
function saveVendor_(user, req) {
  need_(user, 'vendors');
  const name = nameText_(req.name, 'Vendor name', 120),
    company = nameText_(req.company, 'Company name', 120, true),
    mobile = mobileText_(req.mobile),
    defaultCategory = clean_(req.defaultCategory, 40),
    defaultPaymentMethod = clean_(req.defaultPaymentMethod, 20);
  const validDefaultCategories = categories_().concat(receiptCategories_());
  if (defaultCategory && validDefaultCategories.indexOf(defaultCategory) < 0)
    throw err_('Choose a valid default category.', 'VALIDATION');
  if (defaultPaymentMethod && ['CASH', 'UPI', 'BANK_TRANSFER'].indexOf(defaultPaymentMethod) < 0)
    throw err_('Choose a valid default payment method.', 'VALIDATION');
  if (!name) throw err_('Vendor name is required.');

  const list = readAll_('Vendors'),
    dup = list.filter(function (v) {
      return String(v.Name).toLowerCase() === name.toLowerCase() && v.VendorID !== req.id;
    })[0];
  if (dup) throw err_('This vendor already exists.');
  let savedVendorId = req.id || '';
  if (req.id) {
    const vendor = list.filter(function (item) {
      return item.VendorID === req.id;
    })[0];
    if (!vendor) throw err_('Vendor not found.');
    const changes = [
      { field: 'name', before: String(vendor.Name || ''), after: name },
      { field: 'company', before: String(vendor.Company || ''), after: company },
      {
        field: 'mobile',
        before: mobileDisplay_(vendor.Mobile),
        after: mobileDisplay_(mobile),
      },
      {
        field: 'defaultCategory',
        before: String(vendor.DefaultCategory || ''),
        after: defaultCategory,
      },
      {
        field: 'defaultPaymentMethod',
        before: String(vendor.DefaultPaymentMethod || ''),
        after: defaultPaymentMethod,
      },
    ].filter(function (change) {
      return change.before !== change.after;
    });
    updateRow_('Vendors', vendor._row, {
      Name: name,
      Company: company,
      Mobile: mobile,
      DefaultCategory: defaultCategory,
      DefaultPaymentMethod: defaultPaymentMethod,
    });
    auditEvent_(
      user,
      'VENDOR_UPDATE',
      vendor.VendorID,
      'VENDOR_UPDATED',
      'vendor',
      vendor.VendorID,
      '',
      changes,
      'Vendor details updated',
    );
  } else {
    const vendor = {
      VendorID: Utilities.getUuid(),
      Name: name,
      Company: company,
      Mobile: mobile,
      Active: true,
      DefaultCategory: defaultCategory,
      DefaultPaymentMethod: defaultPaymentMethod,
      CreatedBy: user.email,
      CreatedAt: nowIso_(),
    };
    savedVendorId = vendor.VendorID;
    appendRows_('Vendors', [vendor]);
    auditEvent_(
      user,
      'VENDOR_CREATE',
      vendor.VendorID,
      'VENDOR_CREATED',
      'vendor',
      vendor.VendorID,
      '',
      [
        { field: 'name', before: null, after: name },
        { field: 'company', before: null, after: company },
        { field: 'mobile', before: null, after: mobileDisplay_(mobile) },
        { field: 'defaultCategory', before: null, after: defaultCategory },
        { field: 'defaultPaymentMethod', before: null, after: defaultPaymentMethod },
        { field: 'active', before: null, after: true },
      ],
      'Vendor created',
    );
  }
  return { ok: true, vendorId: savedVendorId };
}
function toggleVendor_(user, req) {
  need_(user, 'vendors');
  const v = readAll_('Vendors').filter(function (x) {
    return x.VendorID === req.id;
  })[0];
  if (!v) throw err_('Vendor not found.');
  const now = !(v.Active === true || v.Active === 'TRUE');
  updateRow_('Vendors', v._row, { Active: now });
  auditEvent_(
    user,
    now ? 'VENDOR_ON' : 'VENDOR_OFF',
    v.VendorID,
    now ? 'VENDOR_ACTIVATED' : 'VENDOR_DEACTIVATED',
    'vendor',
    v.VendorID,
    '',
    [{ field: 'active', before: !now, after: now }],
    now ? 'Vendor activated' : 'Vendor deactivated',
  );
  return { ok: true };
}
