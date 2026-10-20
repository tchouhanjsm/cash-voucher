function vendorIdLookup_() {
  const byName = Object.create(null);
  const ambiguous = Object.create(null);
  readAll_('Vendors').forEach(function (vendor) {
    const key = String(vendor.Name || '')
      .trim()
      .toLowerCase();
    if (!key || ambiguous[key]) return;
    if (Object.prototype.hasOwnProperty.call(byName, key)) {
      delete byName[key];
      ambiguous[key] = true;
    } else {
      byName[key] = String(vendor.VendorID || '');
    }
  });
  return { byName: byName, ambiguous: ambiguous };
}
function vendorIdForName_(name, lookup) {
  const key = String(name || '')
    .trim()
    .toLowerCase();
  const index = lookup || vendorIdLookup_();
  if (!key || index.ambiguous[key]) return '';
  return String(index.byName[key] || '');
}
/* ============ vendors ============ */
function saveVendor_(user, req) {
  need_(user, 'vendors');
  const name = clean_(req.name, 120),
    company = clean_(req.company, 120),
    mobile = clean_(req.mobile, 15),
    defaultCategory = clean_(req.defaultCategory, 40),
    defaultPaymentMethod = clean_(req.defaultPaymentMethod, 20);
  if (defaultCategory && categories_().indexOf(defaultCategory) < 0)
    throw err_('Choose a valid default category.', 'VALIDATION');
  if (defaultPaymentMethod && ['CASH', 'UPI', 'BANK_TRANSFER'].indexOf(defaultPaymentMethod) < 0)
    throw err_('Choose a valid default payment method.', 'VALIDATION');
  if (!name) throw err_('Vendor name is required.');
  if (mobile && !/^[0-9+\-\s]{7,15}$/.test(mobile)) throw err_('Enter a valid mobile number.');
  const list = readAll_('Vendors'),
    dup = list.filter(function (v) {
      return String(v.Name).toLowerCase() === name.toLowerCase() && v.VendorID !== req.id;
    })[0];
  if (dup) throw err_('This vendor already exists.');
  if (req.id) {
    const vendor = list.filter(function (item) {
      return item.VendorID === req.id;
    })[0];
    if (!vendor) throw err_('Vendor not found.');
    const changes = [
      { field: 'name', before: String(vendor.Name || ''), after: name },
      { field: 'company', before: String(vendor.Company || ''), after: company },
      { field: 'mobile', before: String(vendor.Mobile || ''), after: mobile },
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
        { field: 'mobile', before: null, after: mobile },
        { field: 'defaultCategory', before: null, after: defaultCategory },
        { field: 'defaultPaymentMethod', before: null, after: defaultPaymentMethod },
        { field: 'active', before: null, after: true },
      ],
      'Vendor created',
    );
  }
  return { ok: true };
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
