// 全局悬浮说明：统一渲染工具栏、模型问号等元素的详细帮助文本。

let tooltipElement = null;
let activeTarget = null;
let showTimer = null;
let hideTimer = null;
let pinnedUntil = 0;

function clearTimers() {
  if (showTimer) clearTimeout(showTimer);
  if (hideTimer) clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
}

function hideTooltip() {
  clearTimers();
  activeTarget = null;
  pinnedUntil = 0;
  if (!tooltipElement) return;
  tooltipElement.classList.remove('is-visible');
  const element = tooltipElement;
  tooltipElement = null;
  setTimeout(() => element.remove(), 120);
}

function ensureTooltipElement(documentRef) {
  if (tooltipElement?.isConnected) return tooltipElement;
  tooltipElement = documentRef.createElement('div');
  tooltipElement.className = 'app-tooltip';
  tooltipElement.setAttribute('role', 'tooltip');
  documentRef.body.appendChild(tooltipElement);
  return tooltipElement;
}

function positionTooltip(element, target) {
  const rect = target.getBoundingClientRect?.();
  if (!rect) return;
  const gap = 9;
  element.style.maxWidth = 'min(320px, calc(100vw - 24px))';
  const tooltipRect = element.getBoundingClientRect?.() || { width: 240, height: 44 };
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  let top = rect.top - tooltipRect.height - gap;
  if (top < 8) top = rect.bottom + gap;
  left = Math.min(window.innerWidth - tooltipRect.width - 12, Math.max(12, left));
  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
}

function showTooltip(target, { pin = false } = {}) {
  const text = target?.getAttribute?.('data-tooltip');
  if (!text) return;
  const documentRef = target.ownerDocument || document;
  const element = ensureTooltipElement(documentRef);
  activeTarget = target;
  element.textContent = text;
  element.classList.add('is-visible');
  positionTooltip(element, target);
  if (pin) {
    pinnedUntil = Date.now() + 3200;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideTooltip, 3200);
  }
}

function isHoverTooltipBlocked(target, documentRef) {
  if (target?.hasAttribute?.('data-tooltip-click')) return true;
  return Boolean(documentRef.querySelector?.('.composer-chip.is-open'));
}

export function initGlobalTooltips(documentRef = document) {
  const onPointerOver = (event) => {
    const target = event.target?.closest?.('[data-tooltip]');
    if (!target || target === activeTarget) return;
    if (isHoverTooltipBlocked(target, documentRef)) {
      if (Date.now() >= pinnedUntil) hideTooltip();
      return;
    }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => showTooltip(target), 180);
  };

  const onPointerOut = (event) => {
    const target = event.target?.closest?.('[data-tooltip]');
    if (!target || target !== activeTarget) return;
    if (Date.now() < pinnedUntil) return;
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    hideTimer = setTimeout(hideTooltip, 90);
  };

  const onFocusIn = (event) => {
    const target = event.target?.closest?.('[data-tooltip]');
    if (!target) return;
    if (isHoverTooltipBlocked(target, documentRef)) {
      if (Date.now() >= pinnedUntil) hideTooltip();
      return;
    }
    showTooltip(target);
  };

  const onFocusOut = (event) => {
    if (event.target?.closest?.('[data-tooltip]') === activeTarget) hideTooltip();
  };

  const onClick = (event) => {
    const target = event.target?.closest?.('[data-tooltip-click]');
    if (target) showTooltip(target, { pin: true });
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') hideTooltip();
  };

  documentRef.addEventListener('mouseover', onPointerOver);
  documentRef.addEventListener('mouseout', onPointerOut);
  documentRef.addEventListener('focusin', onFocusIn);
  documentRef.addEventListener('focusout', onFocusOut);
  documentRef.addEventListener('click', onClick);
  documentRef.addEventListener('keydown', onKeyDown);
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);

  return () => {
    hideTooltip();
    documentRef.removeEventListener('mouseover', onPointerOver);
    documentRef.removeEventListener('mouseout', onPointerOut);
    documentRef.removeEventListener('focusin', onFocusIn);
    documentRef.removeEventListener('focusout', onFocusOut);
    documentRef.removeEventListener('click', onClick);
    documentRef.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('scroll', hideTooltip, true);
    window.removeEventListener('resize', hideTooltip);
  };
}
