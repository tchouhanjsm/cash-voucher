export function registerPwa({
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  documentRef = globalThis.document,
  confirmDiscardUnsavedWork,
} = {}) {
  const serviceWorker = navigatorRef?.serviceWorker;
  if (!locationRef?.protocol?.startsWith('http') || !serviceWorker) return null;

  const notice = documentRef?.getElementById('appUpdateNotice');
  const applyButton = documentRef?.getElementById('appUpdateApply');
  const laterButton = documentRef?.getElementById('appUpdateLater');
  const hadController = Boolean(serviceWorker.controller);
  let registration = null;
  let reloading = false;

  const showNotice = () => notice?.classList.remove('hidden');
  const hideNotice = () => notice?.classList.add('hidden');

  laterButton?.addEventListener('click', hideNotice);
  applyButton?.addEventListener('click', () => {
    const waitingWorker = registration?.waiting;
    if (!waitingWorker) {
      hideNotice();
      return;
    }

    try {
      if (confirmDiscardUnsavedWork && !confirmDiscardUnsavedWork()) return;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      applyButton.disabled = true;
      applyButton.textContent = 'Updating…';
    } catch {
      applyButton.disabled = false;
      applyButton.textContent = 'Reload to update';
    }
  });

  serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    locationRef.reload();
  });

  return serviceWorker
    .register('sw.js')
    .then((nextRegistration) => {
      registration = nextRegistration;
      if (registration.waiting && hadController) showNotice();

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && serviceWorker.controller) {
            showNotice();
          }
        });
      });

      return registration;
    })
    .catch(() => {
      // The online app remains usable if service-worker registration is unavailable.
      return null;
    });
}
