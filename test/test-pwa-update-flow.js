'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadRegisterPwa() {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/core/pwa.js'), 'utf8');
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(moduleUrl);
}

function fakeElement(initiallyHidden = true) {
  const classes = new Set(initiallyHidden ? ['hidden'] : []);
  const listeners = new Map();
  return {
    disabled: false,
    textContent: '',
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    click() {
      listeners.get('click')?.();
    },
    isHidden() {
      return classes.has('hidden');
    },
  };
}

function fakePwaEnvironment({
  controller = { active: true },
  waiting = { postMessage() {} },
} = {}) {
  const notice = fakeElement();
  const apply = fakeElement(false);
  apply.textContent = 'Reload to update';
  const later = fakeElement(false);
  const elements = {
    appUpdateNotice: notice,
    appUpdateApply: apply,
    appUpdateLater: later,
  };
  const events = new Map();
  const registrationEvents = new Map();
  const installingEvents = new Map();
  const messages = [];
  let reloads = 0;
  let registerPath = '';

  const waitingWorker = waiting
    ? {
        postMessage(message) {
          messages.push(message);
        },
      }
    : null;
  const installingWorker = {
    state: 'installing',
    addEventListener(type, callback) {
      installingEvents.set(type, callback);
    },
  };
  const registration = {
    waiting: waitingWorker,
    installing: installingWorker,
    addEventListener(type, callback) {
      registrationEvents.set(type, callback);
    },
  };
  const serviceWorker = {
    controller,
    addEventListener(type, callback) {
      events.set(type, callback);
    },
    async register(pathname) {
      registerPath = pathname;
      return registration;
    },
  };
  const navigatorRef = { serviceWorker };
  const locationRef = {
    protocol: 'https:',
    reload() {
      reloads += 1;
    },
  };
  const documentRef = {
    getElementById(id) {
      return elements[id] || null;
    },
  };

  return {
    notice,
    apply,
    later,
    events,
    registration,
    registrationEvents,
    installingWorker,
    installingEvents,
    messages,
    navigatorRef,
    locationRef,
    documentRef,
    get reloads() {
      return reloads;
    },
    get registerPath() {
      return registerPath;
    },
  };
}

(async () => {
  const { registerPwa } = await loadRegisterPwa();

  const absent = await registerPwa({
    navigatorRef: {},
    locationRef: { protocol: 'file:' },
    documentRef: { getElementById: () => null },
  });
  assert.equal(absent, null, 'file previews without a service worker remain supported');

  const env = fakePwaEnvironment();
  const registered = await registerPwa({
    navigatorRef: env.navigatorRef,
    locationRef: env.locationRef,
    documentRef: env.documentRef,
  });
  assert.equal(registered, env.registration);
  assert.equal(env.registerPath, 'sw.js');
  assert.equal(
    env.notice.isHidden(),
    false,
    'a waiting update is announced to a controlled client',
  );

  env.later.click();
  assert.equal(
    env.notice.isHidden(),
    true,
    'Later dismisses the notice without activating the worker',
  );
  assert.equal(env.messages.length, 0, 'dismissing an update does not send an activation message');

  env.apply.click();
  assert.deepEqual(env.messages, [{ type: 'SKIP_WAITING' }]);
  assert.equal(env.apply.disabled, true, 'the activation control prevents repeated submissions');
  assert.equal(env.apply.textContent, 'Updating…');

  env.events.get('controllerchange')();
  env.events.get('controllerchange')();
  assert.equal(env.reloads, 1, 'a controller change reloads the old controlled page at most once');

  const discovered = fakePwaEnvironment({ controller: { active: true }, waiting: null });
  discovered.registration.waiting = null;
  await registerPwa({
    navigatorRef: discovered.navigatorRef,
    locationRef: discovered.locationRef,
    documentRef: discovered.documentRef,
  });
  assert.equal(discovered.notice.isHidden(), true, 'an update is not shown before it is installed');
  discovered.registrationEvents.get('updatefound')();
  discovered.installingWorker.state = 'installed';
  discovered.installingEvents.get('statechange')();
  assert.equal(
    discovered.notice.isHidden(),
    false,
    'a completed waiting install reveals the update action',
  );

  const firstInstall = fakePwaEnvironment({ controller: null, waiting: { postMessage() {} } });
  await registerPwa({
    navigatorRef: firstInstall.navigatorRef,
    locationRef: firstInstall.locationRef,
    documentRef: firstInstall.documentRef,
  });
  assert.equal(
    firstInstall.notice.isHidden(),
    true,
    'first installation does not demand an update reload',
  );
  firstInstall.events.get('controllerchange')();
  assert.equal(firstInstall.reloads, 0, 'first installation does not reload the application shell');

  const brokenEnvironment = fakePwaEnvironment();
  brokenEnvironment.navigatorRef.serviceWorker.register = async () => {
    throw new Error('registration unavailable');
  };
  const broken = await registerPwa({
    navigatorRef: brokenEnvironment.navigatorRef,
    locationRef: brokenEnvironment.locationRef,
    documentRef: brokenEnvironment.documentRef,
  });
  assert.equal(broken, null, 'registration failure leaves the online application available');
  assert.equal(brokenEnvironment.notice.isHidden(), true);

  console.log('PWA update-flow tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
