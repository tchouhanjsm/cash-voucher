const actions = new Map();

export function registerAction(name, handler) {
  if (!name || typeof handler !== 'function') {
    throw new TypeError('Action name and handler are required.');
  }

  actions.set(name, handler);
  return () => actions.delete(name);
}

export function registerActions(definitions) {
  Object.entries(definitions).forEach(([name, handler]) => {
    registerAction(name, handler);
  });
}

export function getAction(name) {
  return actions.get(name);
}

export async function dispatchAction(element, event) {
  const name = element?.dataset?.act;
  const handler = name ? actions.get(name) : null;

  if (!handler) return false;

  await handler({
    element,
    event,
    id: element.dataset.id,
    key: element.dataset.k,
  });

  return true;
}

async function handleDelegatedAction(event) {
  const element = event.target.closest('[data-act]');

  if (!element) return;
  if (event.type === 'click' && element.tagName === 'SELECT') return;

  try {
    await dispatchAction(element, event);
  } catch (error) {
    console.error('Action failed:', element.dataset.act, error);
    throw error;
  }
}

export function installActionDelegation(root = document) {
  root.addEventListener('click', handleDelegatedAction);
  root.addEventListener('change', handleDelegatedAction);
}
