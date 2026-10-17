const ACTIONS = {
  bootstrap: bootstrap_,
  createVouchers: createVouchers_,
  updateVoucher: updateVoucher_,
  cancelVoucher: cancelVoucher_,
  approveVoucher: approveVoucher_,
  rejectVoucher: rejectVoucher_,
  addReceipt: addReceipt_,
  getReceipt: getReceipt_,
  saveVendor: saveVendor_,
  toggleVendor: toggleVendor_,
  listUsers: listUsers_,
  saveUser: saveUser_,
  resetPassword: resetPassword_,
  changePassword: changePassword_,
  saveSettings: saveSettings_,
  auditLog: auditLog_,
  backupStatus: backupStatus_,
  backupIntegrityReport: backupIntegrityReport_,
  deploymentReadiness: deploymentReadiness_,
  dataQualityReport: dataQualityReport_,
  recordedMovementReport: recordedMovementReport_,
  cashClosePreview: cashClosePreview_,
  createCashClose: createCashClose_,
  recordCashCloseCorrection: recordCashCloseCorrection_,
  logout: logout_,
};
const WRITES = {
  createVouchers: 1,
  updateVoucher: 1,
  cancelVoucher: 1,
  approveVoucher: 1,
  rejectVoucher: 1,
  addReceipt: 1,
  saveVendor: 1,
  toggleVendor: 1,
  saveUser: 1,
  resetPassword: 1,
  changePassword: 1,
  createCashClose: 1,
  recordCashCloseCorrection: 1,
  saveSettings: 1,
};


/**
 * Applies API route guards for active sessions. Legacy migrated accounts are already
 * marked MustChangePassword; only the password-change route and logout are allowed.
 */
function route_(req) {
  const action = req && req.action;
  const fn = ACTIONS[action];
  if (!fn) throw err_('Unknown action.', 'VALIDATION');

  if (!Object.prototype.hasOwnProperty.call(WRITES, action)) {
    const user = auth_(req.token);
    if (user.mustChange && action !== 'changePassword' && action !== 'logout') {
      throw err_('Please change your password first.', 'PASSWORD_CHANGE');
    }
    return fn(user, req);
  }

  return withScriptLock_(function () {
    const user = auth_(req.token);
    if (user.mustChange && action !== 'changePassword' && action !== 'logout') {
      throw err_('Please change your password first.', 'PASSWORD_CHANGE');
    }
    return fn(user, req);
  }, 'The service is busy. No changes were made. Please retry shortly.');
}
