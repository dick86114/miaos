import { icon, renderIcons } from './icons.js';
import { renderReleaseNotes } from './release-notes.js';
import { escapeHtml, toast } from './ui.js';

function formatNoticeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * 展示自动更新完成后的版本说明弹窗。
 * 版本号通过转义写入静态结构，更新日志使用受限 DOM 渲染器，避免执行 Release 中的原始 HTML。
 */
export function showUpdateRestartNotice(notice, {
  documentRef = document,
  api = window.api,
} = {}) {
  if (!notice?.version || !documentRef?.body) return null;
  const existing = documentRef.getElementById?.('update-restart-notice');
  if (existing) return existing;

  const version = String(notice.version).replace(/^v/iu, '');
  const previousVersion = String(notice.previousVersion || '').replace(/^v/iu, '');
  const releaseDate = formatNoticeDate(notice.releaseDate);
  const previousFocus = documentRef.activeElement;
  const overlay = documentRef.createElement('div');
  overlay.id = 'update-restart-notice';
  overlay.className = 'modal-overlay update-restart-overlay';
  overlay.innerHTML = `
    <section class="modal-card update-restart-card" role="dialog" aria-modal="true" aria-labelledby="update-restart-title" aria-describedby="update-restart-subtitle">
      <header class="update-restart-header">
        <div class="update-restart-mark">${icon('sparkles', 24)}</div>
        <div class="update-restart-heading">
          <h2 class="update-restart-title" id="update-restart-title">妙生已更新到 v${escapeHtml(version)}</h2>
          <p class="update-restart-subtitle" id="update-restart-subtitle">${previousVersion ? `自 v${escapeHtml(previousVersion)} 以来的更新` : '本次更新的版本说明'}</p>
        </div>
        <button type="button" class="modal-close update-restart-close" data-update-restart-close title="关闭" aria-label="关闭更新说明">${icon('x', 18)}</button>
      </header>
      <div class="update-restart-body">
        <div class="update-restart-meta">
          <strong>v${escapeHtml(version)}</strong>
          ${releaseDate ? `<time datetime="${escapeHtml(notice.releaseDate)}">${escapeHtml(releaseDate)}</time>` : ''}
        </div>
        <div class="update-restart-notes update-notes-body" id="update-restart-notes"></div>
      </div>
      <footer class="modal-footer update-restart-footer">
        <button type="button" class="btn btn-secondary" data-update-restart-release>${icon('external-link', 14)}<span>查看完整更新内容</span></button>
        <button type="button" class="btn btn-primary" data-update-restart-close>知道了</button>
      </footer>
    </section>
  `;

  const notes = overlay.querySelector('#update-restart-notes');
  if (notice.releaseNotes) {
    renderReleaseNotes(notes, notice.releaseNotes);
  } else if (notes) {
    const empty = documentRef.createElement('p');
    empty.className = 'update-restart-empty';
    empty.textContent = '本次更新未提供详细更新日志，可前往 GitHub 查看完整内容。';
    notes.appendChild(empty);
  }

  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    documentRef.removeEventListener('keydown', onKeydown);
    overlay.remove();
    previousFocus?.focus?.();
  };
  const releaseButton = overlay.querySelector('[data-update-restart-release]');
  overlay.querySelectorAll('[data-update-restart-close]').forEach((button) => {
    button.addEventListener('click', close);
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  releaseButton?.addEventListener('click', async () => {
    if (!api?.openReleasePage) {
      toast('当前运行环境不支持打开 GitHub', 'error');
      return;
    }
    try {
      const result = await api.openReleasePage(notice.releaseUrl);
      if (result?.ok === false) toast(result.error || '打开 GitHub 发布页面失败', 'error');
    } catch (error) {
      toast(error?.message || '打开 GitHub 发布页面失败', 'error');
    }
  });
  documentRef.addEventListener('keydown', onKeydown);
  documentRef.body.appendChild(overlay);
  renderIcons(overlay);
  overlay.querySelector('.update-restart-footer .btn-primary')?.focus?.();
  return overlay;
}
