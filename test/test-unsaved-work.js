'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadGuard() {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/core/unsaved-work.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

function makeForm() {
  const children = [];
  const dataset = {};
  const classes = new Set();
  const saveButton = { disabled: false };
  const form = {
    isConnected: true,
    dataset,
    firstChild: null,
    classList: {
      contains: (name) => classes.has(name),
    },
    closest(selector) {
      if (selector === '.hidden' && classes.has('parent-hidden')) return { classList: classes };
      return null;
    },
    querySelector(selector) {
      if (selector === '#nsave') return saveButton;
      if (selector === '.unsaved-draft-notice') {
        return children.find((child) => child.className === 'unsaved-draft-notice') || null;
      }
      return null;
    },
    insertBefore(child) {
      child.parent = form;
      child.remove = () => {
        const index = children.indexOf(child);
        if (index >= 0) children.splice(index, 1);
        child.parent = null;
      };
      children.unshift(child);
      form.firstChild = children[0] || null;
      return child;
    },
  };
  return { form, saveButton, classes, children };
}

function makeEnvironment() {
  const { form, saveButton, classes, children } = makeForm();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const confirmCalls = [];
  let confirmAnswer = false;
  let blockedCalls = 0;
  const documentRef = {
    querySelector(selector) {
      return selector === '#nf' ? form : null;
    },
    createElement() {
      return {
        className: '',
        textContent: '',
        attributes: {},
        setAttribute(key, value) {
          this.attributes[key] = value;
        },
      };
    },
    addEventListener(type, callback) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(callback);
      documentListeners.set(type, listeners);
    },
    removeEventListener(type, callback) {
      documentListeners.set(
        type,
        (documentListeners.get(type) || []).filter((item) => item !== callback),
      );
    },
  };
  const windowRef = {
    addEventListener(type, callback) {
      windowListeners.set(type, callback);
    },
    removeEventListener(type, callback) {
      if (windowListeners.get(type) === callback) windowListeners.delete(type);
    },
  };
  const env = {
    form,
    saveButton,
    classes,
    children,
    documentListeners,
    windowListeners,
    confirmCalls,
    setConfirmAnswer(value) {
      confirmAnswer = value;
    },
    get blockedCalls() {
      return blockedCalls;
    },
  };
  env.guardOptions = {
    documentRef,
    windowRef,
    confirmFn(message) {
      confirmCalls.push(message);
      return confirmAnswer;
    },
    onBlocked() {
      blockedCalls += 1;
    },
  };
  env.dispatchDocument = (type, event) => {
    for (const callback of documentListeners.get(type) || []) callback(event);
  };
  env.dispatchBeforeUnload = () => {
    const event = {
      prevented: false,
      returnValue: 'unchanged',
      preventDefault() {
        this.prevented = true;
      },
    };
    windowListeners.get('beforeunload')?.(event);
    return event;
  };
  return env;
}

function eventTarget(form, action = '') {
  return {
    closest(selector) {
      if (selector === '#nf') return form;
      if (selector === '[data-act]' && action) return { dataset: { act: action } };
      return null;
    },
  };
}

(async () => {
  const { createUnsavedWorkGuard } = await loadGuard();
  const env = makeEnvironment();
  const guard = createUnsavedWorkGuard(env.guardOptions);

  assert.equal(guard.hasUnsavedWork(), false, 'a newly rendered entry form begins clean');
  env.dispatchDocument('input', { target: eventTarget(env.form) });
  assert.equal(guard.hasUnsavedWork(), true, 'editing any field marks the financial draft dirty');
  assert.equal(env.form.dataset.unsavedWork, 'true');
  assert.equal(
    env.form.querySelector('.unsaved-draft-notice').textContent,
    'Unsaved voucher draft — save it before leaving this screen.',
    'the dirty state has a visible, accessible notice',
  );

  const unload = env.dispatchBeforeUnload();
  assert.equal(unload.prevented, true, 'browser unload is guarded while the draft is unsaved');
  assert.equal(unload.returnValue, '', 'native browser confirmation is requested on unload');

  env.setConfirmAnswer(false);
  assert.equal(guard.confirmDiscard(), false, 'cancelling the discard prompt preserves the draft');
  assert.equal(guard.hasUnsavedWork(), true);
  assert.equal(env.form.querySelector('.unsaved-draft-notice') !== null, true);

  env.setConfirmAnswer(true);
  assert.equal(guard.confirmDiscard(), true, 'explicit discard confirmation permits navigation');
  assert.equal(guard.hasUnsavedWork(), false);
  assert.equal(env.form.dataset.unsavedWork, undefined);
  assert.equal(env.form.querySelector('.unsaved-draft-notice'), null);

  env.dispatchDocument('click', { target: eventTarget(env.form, 'addrow') });
  assert.equal(guard.hasUnsavedWork(), true, 'adding a payment row marks the draft dirty');
  env.setConfirmAnswer(false);
  assert.equal(guard.confirmDiscard(), false, 'a dynamic row cannot be discarded without consent');

  env.saveButton.disabled = true;
  assert.equal(guard.hasUnsavedWork(), true, 'an in-flight save remains protected');
  assert.equal(guard.confirmDiscard(), false, 'route changes cannot interrupt an in-flight save');
  assert.equal(
    env.blockedCalls,
    1,
    'a blocked save transition explains why navigation did not occur',
  );
  assert.equal(
    env.confirmCalls.length,
    3,
    'an in-flight save does not present a discard confirmation',
  );

  env.saveButton.disabled = false;
  env.classes.add('parent-hidden');
  assert.equal(guard.hasUnsavedWork(), false, 'a hidden form does not block unrelated navigation');

  guard.destroy();
  assert.equal(env.documentListeners.get('input').length, 0, 'destroy removes delegated listeners');
  assert.equal(env.windowListeners.has('beforeunload'), false, 'destroy removes the unload guard');

  console.log('Unsaved work guard tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
