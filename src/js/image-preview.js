// 统一图片预览：供历史、快速生图和项目工作台复用。
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

function createElement(documentRef, tagName, className, textContent = '') {
  const element = documentRef.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function appendInfoRow(documentRef, container, label, value) {
  if (!value) return;
  const row = createElement(documentRef, 'div', 'image-preview-info-row');
  row.appendChild(createElement(documentRef, 'span', 'image-preview-info-label', label));
  row.appendChild(createElement(documentRef, 'span', 'image-preview-info-value', value));
  container.appendChild(row);
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(1))));
}

/**
 * 打开通用图片预览。
 *
 * record 至少提供 image；其余元数据会按需显示。返回关闭函数，调用多次安全。
 */
export function openImagePreview(record, options = {}) {
  const {
    documentRef = document,
    triggerElement = documentRef.activeElement,
    onClose,
    onDownload,
    onCopyPrompt,
    onNavigateToProject,
  } = options;
  const imageSource = record?.image;
  if (!imageSource) return () => {};

  let closed = false;
  let fullscreen = null;
  const overlay = createElement(documentRef, 'div', 'image-preview-overlay');
  overlay.setAttribute('data-image-preview', '');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '图片预览');

  const panel = createElement(documentRef, 'section', 'image-preview-panel');
  const closeButton = createElement(documentRef, 'button', 'image-preview-close', '关闭');
  closeButton.type = 'button';
  closeButton.setAttribute('data-image-preview-close', '');
  closeButton.setAttribute('aria-label', '关闭图片预览');

  const image = createElement(documentRef, 'img', 'image-preview-image');
  image.src = imageSource;
  image.alt = record.alt || '生成结果';
  image.setAttribute('data-image-preview-image', '');
  image.title = '再次点击可进入全屏查看';

  const info = createElement(documentRef, 'div', 'image-preview-info');
  appendInfoRow(documentRef, info, '模型', [record.providerName, record.modelId].filter(Boolean).join(' / '));
  appendInfoRow(documentRef, info, '版本', record.versionName || record.contextLabel || '');
  appendInfoRow(documentRef, info, '参数', [record.ratio, record.quality].filter(Boolean).join(' · '));
  appendInfoRow(documentRef, info, '提示词', record.prompt || '');

  const actions = createElement(documentRef, 'div', 'image-preview-actions');
  const imageId = record.imageId || record.id || null;
  if (typeof onNavigateToProject === 'function' && record.projectId) {
    const projectButton = createElement(documentRef, 'button', 'btn btn-ghost btn-sm', '前往项目');
    projectButton.type = 'button';
    projectButton.setAttribute('data-image-preview-project', '');
    projectButton.addEventListener('click', () => {
      onNavigateToProject({ projectId: record.projectId, versionId: record.versionId || null, imageId });
    });
    actions.appendChild(projectButton);
  }
  if (typeof onDownload === 'function') {
    const downloadButton = createElement(documentRef, 'button', 'btn btn-secondary btn-sm', '保存');
    downloadButton.type = 'button';
    downloadButton.addEventListener('click', () => onDownload(record));
    actions.appendChild(downloadButton);
  }
  if (typeof onCopyPrompt === 'function' && record.prompt) {
    const copyButton = createElement(documentRef, 'button', 'btn btn-ghost btn-sm', '复制提示词');
    copyButton.type = 'button';
    copyButton.addEventListener('click', () => onCopyPrompt(record.prompt, record));
    actions.appendChild(copyButton);
  }

  panel.append(closeButton, image);
  if (info.children.length) panel.appendChild(info);
  if (actions.children.length) panel.appendChild(actions);
  overlay.appendChild(panel);
  documentRef.body.appendChild(overlay);

  function closeFullscreen() {
    fullscreen?.remove();
    fullscreen = null;
  }

  function close() {
    if (closed) return;
    closed = true;
    closeFullscreen();
    overlay.remove();
    documentRef.removeEventListener('keydown', onKeydown);
    if (triggerElement?.isConnected !== false && typeof triggerElement?.focus === 'function') triggerElement.focus();
    onClose?.();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      if (fullscreen) closeFullscreen();
      else close();
    }
  }

  function openFullscreen() {
    if (fullscreen || closed) return;
    let zoom = MIN_ZOOM;
    let panX = 0;
    let panY = 0;
    let pointer = null;
    fullscreen = createElement(documentRef, 'div', 'image-preview-fullscreen');
    fullscreen.setAttribute('data-image-preview-fullscreen', '');
    fullscreen.setAttribute('role', 'dialog');
    fullscreen.setAttribute('aria-modal', 'true');
    fullscreen.setAttribute('aria-label', '全屏图片预览');

    const fullscreenImage = createElement(documentRef, 'img', 'image-preview-fullscreen-image');
    fullscreenImage.src = imageSource;
    fullscreenImage.alt = record.alt || '生成结果';
    fullscreenImage.setAttribute('data-image-preview-fullscreen-image', '');
    fullscreenImage.draggable = false;
    fullscreen.appendChild(fullscreenImage);
    documentRef.body.appendChild(fullscreen);

    const renderTransform = () => {
      fullscreenImage.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    };
    renderTransform();

    fullscreen.addEventListener('wheel', (event) => {
      event.preventDefault?.();
      zoom = clampZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
      renderTransform();
    });
    fullscreen.addEventListener('click', (event) => {
      if (event.target === fullscreen) closeFullscreen();
    });
    fullscreenImage.addEventListener('click', () => closeFullscreen());
    fullscreenImage.addEventListener('pointerdown', (event) => {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: panX, startY: panY };
      fullscreenImage.setPointerCapture?.(event.pointerId);
    });
    fullscreenImage.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      panX = pointer.startX + event.clientX - pointer.x;
      panY = pointer.startY + event.clientY - pointer.y;
      renderTransform();
    });
    const stopDragging = (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      fullscreenImage.releasePointerCapture?.(event.pointerId);
      pointer = null;
    };
    fullscreenImage.addEventListener('pointerup', stopDragging);
    fullscreenImage.addEventListener('pointercancel', stopDragging);
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  image.addEventListener('click', openFullscreen);
  documentRef.addEventListener('keydown', onKeydown);
  closeButton.focus?.();

  return close;
}
