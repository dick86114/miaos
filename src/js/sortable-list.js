// 通用纵向拖拽排序：拖动项会抬升为固定层，原位置保留占位槽，其余项位移让出空间。

const DRAG_THRESHOLD = 5;
const AUTO_SCROLL_EDGE = 36;
const AUTO_SCROLL_MAX_SPEED = 14;
const CLICK_SUPPRESS_MS = 320;
const PLACEHOLDER_CLASS = 'sortable-item--placeholder';

export function moveIdToIndex(ids, sourceId, targetIndex) {
  const next = Array.isArray(ids) ? ids.slice() : [];
  const sourceIndex = next.indexOf(sourceId);
  if (sourceIndex < 0) return next;
  const [moved] = next.splice(sourceIndex, 1);
  const numericIndex = Number(targetIndex);
  const safeIndex = Number.isFinite(numericIndex)
    ? Math.min(Math.max(Math.trunc(numericIndex), 0), next.length)
    : sourceIndex;
  next.splice(safeIndex, 0, moved);
  return next;
}

function findScrollContainer(list) {
  let node = list;
  while (node && node !== document.body) {
    const styles = getComputedStyle(node);
    const scrollableY = /(auto|scroll|overlay)/u.test(styles.overflowY);
    if (scrollableY && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}

function removeClickSuppressor(state) {
  if (!state.clickSuppressor) return;
  const { handler, timer } = state.clickSuppressor;
  document.removeEventListener('click', handler, true);
  clearTimeout(timer);
  state.clickSuppressor = null;
}

function suppressNextClick(state) {
  removeClickSuppressor(state);
  const expiresAt = Date.now() + CLICK_SUPPRESS_MS;
  const remove = () => removeClickSuppressor(state);
  const handler = (event) => {
    if (Date.now() > expiresAt) {
      remove();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    remove();
  };
  const timer = setTimeout(remove, CLICK_SUPPRESS_MS + 40);
  state.clickSuppressor = { handler, timer };
  document.addEventListener('click', handler, true);
}

export function createSortableList({
  list,
  itemSelector,
  getKey,
  onReorder,
  onError,
  threshold = DRAG_THRESHOLD,
}) {
  if (!list || !itemSelector || typeof getKey !== 'function') {
    return { destroy() {} };
  }

  const state = {
    active: null,
    clickSuppressor: null,
    destroyed: false,
  };
  const dragThreshold = Math.max(2, Number(threshold) || DRAG_THRESHOLD);

  function getItems() {
    return Array.from(list.children).filter((node) => node.matches(itemSelector));
  }

  function markItems() {
    getItems().forEach((item) => item.setAttribute('data-sortable-item', 'true'));
  }

  function updateGhost(drag, clientX, clientY) {
    const offsetX = clientX - drag.startX;
    const offsetY = clientY - drag.startY;
    drag.ghost.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(1.025)`;
  }

  function updateTarget(drag, clientY) {
    const listRect = list.getBoundingClientRect();
    const pointerContentY = clientY - listRect.top + list.scrollTop;
    const remaining = drag.items.filter((item) => item !== drag.item);
    let targetIndex = remaining.length;
    for (let index = 0; index < remaining.length; index += 1) {
      if (pointerContentY < drag.metrics.get(remaining[index])) {
        targetIndex = index;
        break;
      }
    }
    drag.targetIndex = targetIndex;

    const shift = drag.sourceHeight + drag.gap;
    drag.items.forEach((item, index) => {
      if (item === drag.item) return;
      let offset = 0;
      if (targetIndex > drag.sourceIndex && index > drag.sourceIndex && index <= targetIndex) {
        offset = -shift;
      } else if (targetIndex < drag.sourceIndex && index >= targetIndex && index < drag.sourceIndex) {
        offset = shift;
      }
      item.style.setProperty('--sortable-shift', `${offset}px`);
    });
  }

  function updateAutoScroll(drag, clientY) {
    const container = drag.scrollContainer;
    if (!container) {
      drag.scrollSpeed = 0;
      return;
    }
    const rect = container.getBoundingClientRect();
    let intensity = 0;
    if (clientY < rect.top + AUTO_SCROLL_EDGE) {
      intensity = Math.min(1, (rect.top + AUTO_SCROLL_EDGE - clientY) / AUTO_SCROLL_EDGE);
      drag.scrollSpeed = -Math.ceil(AUTO_SCROLL_MAX_SPEED * intensity);
    } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE) {
      intensity = Math.min(1, (clientY - (rect.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE);
      drag.scrollSpeed = Math.ceil(AUTO_SCROLL_MAX_SPEED * intensity);
    } else {
      drag.scrollSpeed = 0;
    }
  }

  function startAutoScroll(drag) {
    const tick = () => {
      if (!drag.started || state.active !== drag) return;
      if (drag.scrollSpeed && drag.scrollContainer) {
        const previousScrollTop = drag.scrollContainer.scrollTop;
        drag.scrollContainer.scrollTop += drag.scrollSpeed;
        if (drag.scrollContainer.scrollTop !== previousScrollTop && Number.isFinite(drag.lastClientY)) {
          updateTarget(drag, drag.lastClientY);
        }
      }
      drag.frame = requestAnimationFrame(tick);
    };
    drag.frame = requestAnimationFrame(tick);
  }

  function beginDrag(drag, event) {
    const itemRect = drag.item.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const listStyles = getComputedStyle(list);
    drag.started = true;
    drag.sourceRect = itemRect;
    drag.sourceHeight = itemRect.height;
    drag.gap = Number.parseFloat(listStyles.rowGap) || 0;
    drag.metrics = new Map();
    drag.items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      drag.metrics.set(item, rect.top - listRect.top + list.scrollTop + rect.height / 2);
    });
    drag.sourceIndex = drag.items.indexOf(drag.item);
    drag.targetIndex = drag.sourceIndex;
    drag.scrollContainer = findScrollContainer(list);
    drag.scrollSpeed = 0;

    const ghost = drag.item.cloneNode(true);
    ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    ghost.querySelectorAll('input, button, a, select, textarea').forEach((node) => {
      node.setAttribute('tabindex', '-1');
    });
    ghost.classList.remove(PLACEHOLDER_CLASS);
    ghost.classList.add('sortable-drag-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = `${itemRect.left}px`;
    ghost.style.top = `${itemRect.top}px`;
    ghost.style.width = `${itemRect.width}px`;
    ghost.style.height = `${itemRect.height}px`;
    drag.ghost = ghost;
    document.body.appendChild(ghost);

    drag.item.classList.add(PLACEHOLDER_CLASS);
    drag.item.setAttribute('aria-grabbed', 'true');
    list.classList.add('is-sorting');
    document.body.classList.add('is-sortable-dragging');
    window.getSelection()?.removeAllRanges();

    try {
      drag.item.setPointerCapture?.(drag.pointerId);
    } catch (_) {}

    updateGhost(drag, event.clientX, event.clientY);
    updateTarget(drag, event.clientY);
    updateAutoScroll(drag, event.clientY);
    startAutoScroll(drag);
  }

  function teardownDragEvents(drag) {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp, true);
    document.removeEventListener('pointercancel', handlePointerCancel, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('blur', handleWindowBlur);
    if (drag?.frame) cancelAnimationFrame(drag.frame);
    if (drag?.item?.hasPointerCapture?.(drag.pointerId)) {
      try {
        drag.item.releasePointerCapture(drag.pointerId);
      } catch (_) {}
    }
  }

  function restoreList(drag) {
    drag.items.forEach((item) => item.style.removeProperty('--sortable-shift'));
    drag.item.classList.remove(PLACEHOLDER_CLASS);
    drag.item.removeAttribute('aria-grabbed');
    list.classList.remove('is-sorting');
    document.body.classList.remove('is-sortable-dragging');
  }

  function animateGhost(drag, targetRect, fade = true) {
    const ghost = drag.ghost;
    if (!ghost) return;
    const offsetX = targetRect.left - drag.sourceRect.left;
    const offsetY = targetRect.top - drag.sourceRect.top;
    ghost.classList.add('is-dropping');
    requestAnimationFrame(() => {
      ghost.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(1)`;
      if (fade) ghost.style.opacity = '0';
    });
    setTimeout(() => ghost.remove(), 240);
  }

  function finishDrag(drag, { canceled = false } = {}) {
    if (!drag?.started) {
      state.active = null;
      teardownDragEvents(drag);
      return;
    }

    let accepted = !canceled;
    let nextOrder = drag.ids;
    if (accepted && drag.targetIndex !== drag.sourceIndex) {
      nextOrder = moveIdToIndex(drag.ids, drag.key, drag.targetIndex);
      try {
        const result = onReorder?.(nextOrder, {
          sourceId: drag.key,
          sourceIndex: drag.sourceIndex,
          targetIndex: drag.targetIndex,
          item: drag.item,
          list,
        });
        accepted = result !== false;
      } catch (error) {
        accepted = false;
        onError?.(error);
      }
    }

    restoreList(drag);
    teardownDragEvents(drag);

    if (accepted && drag.targetIndex !== drag.sourceIndex) {
      const remaining = drag.items.filter((item) => item !== drag.item);
      const reference = remaining[drag.targetIndex] || null;
      list.insertBefore(drag.item, reference);
    }

    const targetRect = drag.item.getBoundingClientRect();
    animateGhost(drag, targetRect, true);
    suppressNextClick(state);
    state.active = null;
  }

  function handlePointerDown(event) {
    if (state.destroyed || event.button !== 0 || event.isPrimary === false) return;
    const item = event.target.closest?.(itemSelector);
    if (!item || item.parentElement !== list) return;
    const key = getKey(item);
    const items = getItems();
    if (key == null || items.length < 2) return;

    const drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastClientY: event.clientY,
      item,
      key: String(key),
      items,
      ids: items.map((node) => String(getKey(node))),
      sourceIndex: items.indexOf(item),
      targetIndex: items.indexOf(item),
      started: false,
      ghost: null,
      frame: 0,
      scrollSpeed: 0,
    };
    state.active = drag;
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleWindowBlur);
  }

  function handlePointerMove(event) {
    const drag = state.active;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < dragThreshold) return;
      event.preventDefault();
      beginDrag(drag, event);
    }
    if (!drag.started) return;
    event.preventDefault();
    drag.lastClientY = event.clientY;
    updateGhost(drag, event.clientX, event.clientY);
    updateTarget(drag, event.clientY);
    updateAutoScroll(drag, event.clientY);
  }

  function handlePointerUp(event) {
    const drag = state.active;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    if (drag.started && event.cancelable) event.preventDefault();
    finishDrag(drag);
  }

  function handlePointerCancel(event) {
    const drag = state.active;
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    finishDrag(drag, { canceled: true });
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape') return;
    const drag = state.active;
    if (!drag) return;
    event.preventDefault();
    finishDrag(drag, { canceled: true });
  }

  function handleWindowBlur() {
    const drag = state.active;
    if (drag) finishDrag(drag, { canceled: true });
  }

  function handleNativeDragStart(event) {
    event.preventDefault();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    list.removeEventListener('pointerdown', handlePointerDown);
    list.removeEventListener('dragstart', handleNativeDragStart);
    const drag = state.active;
    if (drag) {
      state.active = null;
      restoreList(drag);
      teardownDragEvents(drag);
      drag.ghost?.remove();
    }
    removeClickSuppressor(state);
  }

  list.classList.add('sortable-list');
  markItems();
  list.addEventListener('pointerdown', handlePointerDown);
  list.addEventListener('dragstart', handleNativeDragStart);

  return { destroy };
}
