// 全局悬浮说明：进入控件 1 秒后显示；控件内移动不关闭，移出控件立即关闭。

const HOVER_SHOW_DELAY_MS = 1000;
const FADE_OUT_MS = 120;

let activeState = null;

function clearStateTimers(state) {
  state.timers.forEach((timer) => {
    clearTimeout(timer);
    clearInterval(timer);
  });
  state.timers = [];
}

function hideTooltip(state = activeState) {
  if (!state || state !== activeState) return;
  clearStateTimers(state);
  state.target = null;
  state.pinnedUntil = 0;
  activeState = null;
  if (!state.tooltipElement) return;
  state.tooltipElement.classList.remove('is-visible');
  const element = state.tooltipElement;
  setTimeout(() => element.remove(), FADE_OUT_MS);
}

function positionTooltip(state) {
  const element = state.tooltipElement;
  const target = state.target;
  const windowRef = state.windowRef;
  const rect = target.getBoundingClientRect?.();
  if (!rect) return;
  const gap = 9;
  element.style.maxWidth = 'min(320px, calc(100vw - 24px))';
  const tooltipRect = element.getBoundingClientRect?.() || { width: 240, height: 44 };
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  let top = rect.top - tooltipRect.height - gap;
  if (top < 8) top = rect.bottom + gap;
  left = Math.min(windowRef.innerWidth - tooltipRect.width - 12, Math.max(12, left));
  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
}

function createPendingState(target, documentRef, windowRef) {
  return {
    documentRef,
    windowRef,
    target,
    tooltipElement: null,
    pinnedUntil: 0,
    timers: [],
  };
}

function showTooltipState(state, { pin = false } = {}) {
  const target = state.target;
  const text = target?.getAttribute?.('data-tooltip');
  if (!text || target?.isConnected === false) {
    hideTooltip(state);
    return;
  }

  const tooltipElement = state.documentRef.createElement('div');
  tooltipElement.className = 'app-tooltip';
  tooltipElement.setAttribute('role', 'tooltip');
  tooltipElement.textContent = text;
  state.documentRef.body.appendChild(tooltipElement);

  state.tooltipElement = tooltipElement;
  positionTooltip(state);
  tooltipElement.classList.add('is-visible');

  state.timers.push(setInterval(() => {
    if (activeState === state && state.target?.isConnected === false) hideTooltip(state);
  }, 200));

  if (pin) {
    state.pinnedUntil = Date.now() + 3200;
    state.timers.push(setTimeout(() => hideTooltip(state), 3200));
  }
}

function showTooltip(target, documentRef, windowRef, { pin = false, delay = 0 } = {}) {
  hideTooltip();
  const state = createPendingState(target, documentRef, windowRef);
  activeState = state;
  if (!delay) {
    showTooltipState(state, { pin });
    return;
  }
  state.timers.push(setTimeout(() => {
    if (activeState === state) showTooltipState(state);
  }, delay));
}

function isHoverTooltipBlocked(target, documentRef) {
  if (target?.hasAttribute?.('data-tooltip-click')) return true;
  return Boolean(documentRef.querySelector?.('.composer-chip.is-open'));
}

export function initGlobalTooltips(documentRef = document, windowRef = documentRef.defaultView) {
  const onPointerOver = (event) => {
    const target = event.target?.closest?.('[data-tooltip]');
    if (!target) return;
    if (target.hasAttribute?.('data-tooltip-click')) return;
    if (target.closest?.('.composer-chip.is-open')) return;
    if (!target.getAttribute?.('data-tooltip')) return;
    if (activeState?.target === target) return;

    const ownerDocument = target.ownerDocument || documentRef;
    const ownerWindow = ownerDocument.defaultView || windowRef;
    showTooltip(target, ownerDocument, ownerWindow, { delay: HOVER_SHOW_DELAY_MS });
  };

  const onPointerOut = (event) => {
    const target = event.target?.closest?.('[data-tooltip]');
    const state = activeState;
    if (!target || !state || state.target !== target) return;
    if (event.relatedTarget && state.target.contains?.(event.relatedTarget)) return;
    hideTooltip(state);
  };

  const onFocusIn = (event) => {
    const target = event.target?.closest?.('[data-tooltip]');
    if (!target || target.matches?.(':focus-visible') !== true) return;
    if (isHoverTooltipBlocked(target, documentRef)) {
      if (Date.now() >= (activeState?.pinnedUntil || 0)) hideTooltip();
      return;
    }
    showTooltip(target, target.ownerDocument || documentRef, target.ownerDocument?.defaultView || windowRef);
  };

  const onFocusOut = (event) => {
    const target = event.target?.closest?.('[data-tooltip]');
    if (target && activeState?.target === target) hideTooltip();
  };

  const onClick = (event) => {
    const target = event.target?.closest?.('[data-tooltip-click]');
    if (target) {
      showTooltip(target, target.ownerDocument || documentRef, target.ownerDocument?.defaultView || windowRef, { pin: true });
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') hideTooltip();
  };

  if (!windowRef) {
    throw new Error('悬浮说明需要窗口环境');
  }

  documentRef.addEventListener('pointerover', onPointerOver);
  documentRef.addEventListener('pointerout', onPointerOut);
  documentRef.addEventListener('focusin', onFocusIn);
  documentRef.addEventListener('focusout', onFocusOut);
  documentRef.addEventListener('click', onClick);
  documentRef.addEventListener('keydown', onKeyDown);
  windowRef.addEventListener('scroll', hideTooltip, true);
  windowRef.addEventListener('resize', hideTooltip);

  return () => {
    hideTooltip();
    documentRef.removeEventListener('pointerover', onPointerOver);
    documentRef.removeEventListener('pointerout', onPointerOut);
    documentRef.removeEventListener('focusin', onFocusIn);
    documentRef.removeEventListener('focusout', onFocusOut);
    documentRef.removeEventListener('click', onClick);
    documentRef.removeEventListener('keydown', onKeyDown);
    windowRef.removeEventListener('scroll', hideTooltip, true);
    windowRef.removeEventListener('resize', hideTooltip);
  };
}
