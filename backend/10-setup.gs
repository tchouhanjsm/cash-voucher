/* ============ one-time setup (run from the editor) ============ */
/** Script Properties needed once: OWNER_EMAIL, OWNER_PASSWORD (8–128 characters), optional OWNER_NAME. */
// eslint-disable-next-line no-unused-vars
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SS_ID')) {
    const a = SpreadsheetApp.getActiveSpreadsheet();
    if (!a)
      throw new Error(
        'This script is not bound to a Sheet. Open it from the Sheet (Extensions > Apps Script) or add Script property SS_ID = your Sheet ID.',
      );
    p.setProperty('SS_ID', a.getId());
  }
  if (!p.getProperty('PEPPER')) p.setProperty('PEPPER', Utilities.getUuid() + Utilities.getUuid());
  Object.keys(CFG.H).forEach(ensureSheet_);
  if (!p.getProperty('RECEIPT_FOLDER_ID'))
    p.setProperty('RECEIPT_FOLDER_ID', DriveApp.createFolder('Cash Voucher Receipts').getId());
  ensureBackupInfrastructure_();
  const set = settings_();
  if (set.propertyName === undefined) setSetting_('propertyName', 'My Property');
  if (set.propertyAddress === undefined) setSetting_('propertyAddress', '');
  if (set.categories === undefined)
    setSetting_('categories', JSON.stringify(CFG.DEFAULT_CATEGORIES));
  if (set.nextVoucherNo === undefined) setSetting_('nextVoucherNo', '201');
  if (set.nextReceiptNo === undefined) setSetting_('nextReceiptNo', '1');
  if (set.openingBalance === undefined) setSetting_('openingBalance', '0');
  if (set.receiptCategories === undefined)
    setSetting_('receiptCategories', JSON.stringify(CFG.DEFAULT_RCATS));
  if (!readAll_('Users').length) {
    const email = String(p.getProperty('OWNER_EMAIL') || '')
      .trim()
      .toLowerCase();
    const password = String(p.getProperty('OWNER_PASSWORD') || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Set Script Property OWNER_EMAIL first.');
    if (!passwordOk_(password))
      throw new Error('Set Script Property OWNER_PASSWORD to a 8+ character password (not 123456 / 111111 etc.).');
    addUser_(p.getProperty('OWNER_NAME') || 'Owner', email, 'owner', password, true);
    p.deleteProperty('OWNER_PASSWORD');
    audit_({ email: 'system' }, 'SETUP', '', 'Owner created: ' + email);
  }
  Logger.log('Setup complete. Now deploy as a Web app.');
}
