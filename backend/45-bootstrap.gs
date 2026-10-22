/* ============ bootstrap ============ */
function vOut_(o) {
  return {
    id: o.VoucherID,
    no: Number(o.VoucherNo),
    date: isoDate_(o.Date),
    vendor: String(o.Vendor),
    vendorId: String(o.VendorID || ''),
    paymentMethod: String(o.PaymentMethod || ''),
    amount: Number(o.Amount),
    category: String(o.Category || ''),
    notes: String(o.Notes || ''),
    type: o.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
    status: String(o.Status || 'ACTIVE'),
    createdBy: String(o.CreatedBy || ''),
    createdAt: tsStr_(o.CreatedAt),
    updatedBy: String(o.UpdatedBy || ''),
    updatedAt: tsStr_(o.UpdatedAt),
    receipts: o.Receipts ? String(o.Receipts).split(',').filter(Boolean) : [],
    cancelReason: String(o.CancelReason || ''),
    cashImpact: CASH_IMPACT_CHOICES.indexOf(o.CashImpact) >= 0 ? o.CashImpact : 'UNCLASSIFIED',
    approvalStatus: approvalStatus_(o),
    approvedBy: String(o.ApprovedBy || ''),
    approvedAt: tsStr_(o.ApprovedAt),
    approvalReason: String(o.ApprovalReason || ''),
  };
}
function bootstrap_(user) {
  const all = can_(user, 'viewAll');
  const canViewRegister = all || can_(user, 'viewOwn');
  const vouchers = canViewRegister
    ? readAll_('Vouchers')
        .filter(function (o) {
          return all || String(o.CreatedBy).toLowerCase() === user.email;
        })
        .sort(function (a, b) {
          return (
            tsStr_(b.CreatedAt).localeCompare(tsStr_(a.CreatedAt)) ||
            Number(b.VoucherNo || 0) - Number(a.VoucherNo || 0)
          );
        })
        .slice(0, READ_MODEL_BOOTSTRAP_LIMIT)
        .map(vOut_)
    : [];
  const st = settings_();
  const vendors = readAll_('Vendors').map(function (v) {
    return {
      id: v.VendorID,
      name: String(v.Name),
      company: String(v.Company || ''),
      mobile: mobileDisplay_(v.Mobile || ''),
      active: v.Active === true || v.Active === 'TRUE',
      defaultCategory: String(v.DefaultCategory || ''),
      defaultPaymentMethod: String(v.DefaultPaymentMethod || ''),
    };
  });
  const names = {};
  if (all)
    readAll_('Users').forEach(function (u) {
      names[String(u.Email).toLowerCase()] = u.Name;
    });
  else names[user.email] = user.name;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      perms: Object.prototype.hasOwnProperty.call(PERMS, user.role) ? PERMS[user.role] : {},
    },
    settings: {
      propertyName: st.propertyName || '',
      propertyAddress: st.propertyAddress || '',
      categories: categories_(),
      receiptCategories: receiptCategories_(),
      nextVoucherNo: Number(st.nextVoucherNo || 201),
      nextReceiptNo: Number(st.nextReceiptNo || 1),
      openingBalance: all ? Number(st.openingBalance || 0) : 0,
    },
    vouchers: vouchers,
    vendors: user.role === 'accountant' ? [] : vendors,
    names: names,
  };
}
