export function createUnsavedWorkGuard({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  confirmFn = (message) => windowRef.confirm(message),
  onBlocked = () => {},
} = {}) {
  const dirtyForms = new WeakSet();
  const protectedFormSelector = '#nf';
  const destructiveActions = new Set(['addrow', 'delrow', 'clrrec']);
  const confirmation =
    'This voucher draft has unsaved changes. Discard the entered amounts, details and ' +
    'attached receipt images?';
  const noticeText = 'Unsaved voucher draft — save it before leaving this screen.';

  function activeForm() {
    const form = documentRef?.querySelector(protectedFormSelector);
    if (
      !form ||
      !form.isConnected ||
      form.classList.contains('hidden') ||
      form.closest('.hidden')
    ) {
      return null;
    }
    return form;
  }

  function updateNotice(form, show) {
    if (!form) return;
    const existing = form.querySelector('.unsaved-draft-notice');
    if (!show) {
      existing?.remove();
      if (form.dataset) delete form.dataset.unsavedWork;
      return;
    }

    if (form.dataset) form.dataset.unsavedWork = 'true';
    if (existing) return;
    const notice = documentRef.createElement('p');
    notice.className = 'unsaved-draft-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = noticeText;
    form.insertBefore(notice, form.firstChild);
  }

  function markDirty(form) {
    if (!form || form !== activeForm()) return;
    dirtyForms.add(form);
    updateNotice(form, true);
  }

  function isSaving(form) {
    return Boolean(
      form &&
      (form.dataset.saving === 'true' ||
        (dirtyForms.has(form) && form.querySelector('#nsave')?.disabled)),
    );
  }

  function hasUnsavedWork() {
    const form = activeForm();
    return Boolean(form && (dirtyForms.has(form) || isSaving(form)));
  }

  function confirmDiscard() {
    const form = activeForm();
    if (!form) return true;

    if (isSaving(form)) {
      try {
        onBlocked();
      } catch {}
      return false;
    }

    if (!dirtyForms.has(form)) return true;

    let confirmed = false;
    try {
      confirmed = confirmFn(confirmation) === true;
    } catch {
      confirmed = false;
    }
    if (!confirmed) return false;

    dirtyForms.delete(form);
    updateNotice(form, false);
    return true;
  }

  function handleInput(event) {
    const form = event.target?.closest?.(protectedFormSelector);
    if (form) markDirty(form);
  }

  function handleClick(event) {
    const form = event.target?.closest?.(protectedFormSelector);
    const action = event.target?.closest?.('[data-act]')?.dataset?.act;
    if (form && destructiveActions.has(action)) markDirty(form);
  }

  function handleBeforeUnload(event) {
    if (!hasUnsavedWork()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  documentRef?.addEventListener('input', handleInput, true);
  documentRef?.addEventListener('change', handleInput, true);
  documentRef?.addEventListener('click', handleClick, true);
  windowRef?.addEventListener('beforeunload', handleBeforeUnload);

  return {
    hasUnsavedWork,
    confirmDiscard,
    destroy() {
      documentRef?.removeEventListener('input', handleInput, true);
      documentRef?.removeEventListener('change', handleInput, true);
      documentRef?.removeEventListener('click', handleClick, true);
      windowRef?.removeEventListener('beforeunload', handleBeforeUnload);
    },
  };
}
