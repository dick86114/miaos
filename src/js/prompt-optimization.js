function createIdleState() {
  return {
    status: 'idle',
    prompt: null,
    startedAt: null,
    result: null,
    error: null,
  };
}

function copyState(state) {
  return {
    status: state.status,
    prompt: state.prompt,
    startedAt: state.startedAt,
    result: state.result,
    error: state.error,
  };
}

export function createPromptOptimizationManager({ optimize }) {
  if (typeof optimize !== 'function') {
    throw new TypeError('optimize 必须是函数');
  }

  const contexts = new Map();

  function getRecord(context) {
    let record = contexts.get(context);
    if (!record) {
      record = {
        token: 0,
        state: createIdleState(),
        listeners: new Set(),
      };
      contexts.set(context, record);
    }
    return record;
  }

  function notify(record) {
    for (const listener of record.listeners) {
      listener(copyState(record.state));
    }
  }

  function updateState(record, state) {
    record.state = state;
    notify(record);
  }

  function getState(context) {
    return copyState(getRecord(context).state);
  }

  function subscribe(context, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('listener 必须是函数');
    }

    const record = getRecord(context);
    record.listeners.add(listener);
    return () => record.listeners.delete(listener);
  }

  function start(context, prompt) {
    const record = getRecord(context);
    if (record.state.status === 'optimizing') {
      return { started: false, reason: 'optimizing' };
    }

    const token = record.token + 1;
    const startedAt = Date.now();
    record.token = token;
    updateState(record, {
      status: 'optimizing',
      prompt,
      startedAt,
      result: null,
      error: null,
    });

    const promise = Promise.resolve()
      .then(() => optimize(prompt, context))
      .then(
        (result) => {
          if (record.token === token) {
            updateState(record, {
              status: 'succeeded',
              prompt,
              startedAt,
              result,
              error: null,
            });
          }
          return result;
        },
        (error) => {
          if (record.token === token) {
            updateState(record, {
              status: 'failed',
              prompt,
              startedAt,
              result: null,
              error,
            });
          }
          throw error;
        },
      );

    return { started: true, promise };
  }

  function clear(context) {
    const record = getRecord(context);
    record.token += 1;
    updateState(record, createIdleState());
  }

  return { getState, subscribe, start, clear };
}

function getFragmentLimit(maxFragments) {
  const value = Number(maxFragments);
  if (!Number.isFinite(value)) return 36;
  return Math.min(36, Math.max(0, Math.floor(value)));
}

function splitPromptIntoFragments(prompt) {
  return String(prompt ?? '').match(/[\p{Script=Han}]|[\p{L}\p{N}_-]+|[^\s]/gu) ?? [];
}

export function createPromptFragmentOverlay({ container, textarea, prompt, maxFragments }) {
  let overlayNode = null;
  let fragmentNodes = [];
  let cleanupTimer = null;
  let finish = null;
  let destroyed = false;

  function removeFinishListeners() {
    if (!overlayNode || !finish) return;
    overlayNode.removeEventListener('transitionend', finish);
    overlayNode.removeEventListener('animationend', finish);
    finish = null;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    removeFinishListeners();
    if (overlayNode?.parentNode) overlayNode.parentNode.removeChild(overlayNode);
    overlayNode = null;
    fragmentNodes = [];
  }

  function mount() {
    if (overlayNode || destroyed) return;

    const documentRef = container?.ownerDocument ?? globalThis.document;
    if (!container || !documentRef) {
      throw new TypeError('container 必须是可挂载的 DOM 节点');
    }

    overlayNode = documentRef.createElement('div');
    overlayNode.className = 'prompt-fragment-overlay';
    overlayNode.setAttribute('aria-hidden', 'true');
    overlayNode.tabIndex = -1;
    overlayNode.style.pointerEvents = 'none';

    const sourcePrompt = prompt ?? textarea?.value ?? '';
    const fragments = splitPromptIntoFragments(sourcePrompt).slice(0, getFragmentLimit(maxFragments));
    fragmentNodes = fragments.map((fragment) => {
      const fragmentNode = documentRef.createElement('span');
      fragmentNode.className = 'prompt-fragment-overlay__fragment';
      fragmentNode.textContent = fragment;
      overlayNode.appendChild(fragmentNode);
      return fragmentNode;
    });

    container.appendChild(overlayNode);
  }

  function settle() {
    if (!overlayNode || destroyed || finish) return;

    overlayNode.className = `${overlayNode.className} prompt-fragment-overlay--settling`.trim();
    finish = () => destroy();
    overlayNode.addEventListener('transitionend', finish, { once: true });
    overlayNode.addEventListener('animationend', finish, { once: true });
    cleanupTimer = setTimeout(finish, 500);
  }

  return {
    mount,
    settle,
    destroy,
    get fragmentCount() {
      return fragmentNodes.length;
    },
  };
}
