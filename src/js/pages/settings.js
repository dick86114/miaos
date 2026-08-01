// 设置页面：版本、自动更新
import { icon } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog } from '../ui.js';

const UPDATE_STATE_TEXT = {
  idle: '尚未检查',
  checking: '正在检查更新…',
  available: '发现新版本',
  'not-available': '当前已是最新版本',
  downloading: '正在下载更新…',
  downloaded: '新版本已就绪，点击安装',
  error: '检查或下载时出错',
};

export function renderSettings(container) {
  let state = {
    current: null,
    latest: null,
    updateState: 'idle',
    updatePayload: null,
    offload: null,
  };

  const root = htmlToElement(`
    <div class="settings-wrap">
      <div class="page-header">
        <h1 class="page-title">设置</h1>
        <p class="page-subtitle">应用版本、自动更新及其他偏好设置</p>
      </div>

      <div class="settings-card">
        <div class="settings-section-header">
          <div class="settings-section-title">${icon('info', 16)}<span>关于 妙生</span></div>
        </div>
        <div class="settings-about">
          <div class="settings-about-logo">
            <img src="assets/logo.png" alt="妙生" />
          </div>
          <div class="settings-about-info">
            <div class="settings-about-name">妙生 · miaos</div>
            <div class="settings-about-version">
              当前版本：<span id="cur-ver">—</span>
            </div>
            <div class="settings-about-desc">本地运行的 AI 生图工具，支持 Grsai 与 OpenAI 兼容供应商。</div>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-section-header">
          <div class="settings-section-title">${icon('refresh-cw', 16)}<span>软件更新</span></div>
          <div id="update-state-chip" class="tag tag-soft">${UPDATE_STATE_TEXT.idle}</div>
        </div>

        <div id="update-panel" class="update-panel">
          <div class="update-row">
            <div class="update-latest-info">
              <div class="update-label">最新版本</div>
              <div id="latest-ver" class="update-ver">—</div>
              <div id="latest-date" class="update-hint"></div>
            </div>
            <div class="update-progress-wrap" id="progress-wrap" style="display:none;">
              <div class="update-progress-bar">
                <div id="progress-fill" class="update-progress-fill"></div>
              </div>
              <div class="update-progress-meta">
                <span id="progress-percent">0%</span>
                <span id="progress-speed">—</span>
              </div>
            </div>
            <div class="update-actions">
              <button class="btn btn-primary" id="btn-check" type="button">
                ${icon('refresh-cw', 14)}<span>检查更新</span>
              </button>
              <button class="btn btn-primary" id="btn-download" type="button" style="display:none;">
                ${icon('download', 14)}<span>下载更新</span>
              </button>
              <button class="btn btn-primary" id="btn-install" type="button" style="display:none;">
                ${icon('power', 14)}<span>重启并安装</span>
              </button>
            </div>
          </div>
          <div id="update-notes" class="update-notes" style="display:none;">
            <div class="update-notes-title">更新说明</div>
            <div id="update-notes-body" class="update-notes-body"></div>
          </div>
          <div id="update-error" class="update-error" style="display:none;">
            ${icon('alert-circle', 14)}<span id="update-error-msg">—</span>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-section-header">
          <div class="settings-section-title">${icon('sliders', 16)}<span>偏好设置</span></div>
        </div>
        <div class="form-group">
          <label class="form-label">快捷键</label>
          <div class="settings-hotkeys">
            <div class="hotkey-row"><span>快速生图</span><kbd>⌘</kbd><kbd>Enter</kbd></div>
            <div class="hotkey-row"><span>刷新页面</span><kbd>⌘</kbd><kbd>R</kbd></div>
          </div>
        </div>
      </div>
    </div>
  `);
  mountPage(container, root);

  // 获取当前版本
  loadCurrentVersion();
  // 监听更新事件
  bindUpdateEvents();
  // 按钮绑定
  bindButtons();

  function loadCurrentVersion() {
    if (!window.api || !window.api.updateGetCurrentVersion) return;
    window.api.updateGetCurrentVersion().then((info) => {
      state.current = info;
      root.querySelector('#cur-ver').textContent = info.version || '—';
      if (info.isPackaged === false) {
        root.querySelector('#cur-ver').insertAdjacentHTML('afterend', ' <span class="tag tag-soft">开发模式</span>');
      }
    });
  }

  function bindUpdateEvents() {
    if (!window.api || !window.api.onUpdateStatus) return;
    state.offload = window.api.onUpdateStatus((payload) => {
      handleUpdateEvent(payload);
    });
  }

  function handleUpdateEvent(payload) {
    const s = payload && payload.state;
    state.updateState = s;
    state.updatePayload = payload;

    const chip = root.querySelector('#update-state-chip');
    const progressWrap = root.querySelector('#progress-wrap');
    const errorEl = root.querySelector('#update-error');
    const notesEl = root.querySelector('#update-notes');
    const btnCheck = root.querySelector('#btn-check');
    const btnDownload = root.querySelector('#btn-download');
    const btnInstall = root.querySelector('#btn-install');
    const latestVer = root.querySelector('#latest-ver');
    const latestDate = root.querySelector('#latest-date');

    chip.textContent = UPDATE_STATE_TEXT[s] || s || UPDATE_STATE_TEXT.idle;
    chip.className = 'tag tag-soft';

    // 默认隐藏下载进度 / 错误 / 说明
    errorEl.style.display = 'none';
    notesEl.style.display = 'none';
    progressWrap.style.display = 'none';

    btnCheck.style.display = 'inline-flex';
    btnDownload.style.display = 'none';
    btnInstall.style.display = 'none';
    resetBtn(btnCheck);

    switch (s) {
      case 'checking':
        setBtnLoading(btnCheck, '检查中…');
        break;
      case 'available': {
        const ver = payload.version || '未知';
        latestVer.textContent = `v${ver}`;
        state.latest = ver;
        if (payload.releaseDate) {
          latestDate.textContent = '发布时间：' + formatDate(payload.releaseDate);
        }
        if (payload.releaseNotes) {
          notesEl.style.display = 'block';
          root.querySelector('#update-notes-body').innerHTML = formatNotes(payload.releaseNotes);
        }
        btnCheck.style.display = 'none';
        btnDownload.style.display = 'inline-flex';
        chip.className = 'tag tag-primary';
        break;
      }
      case 'not-available':
        latestVer.textContent = state.current ? `v${state.current.version}` : '—';
        latestDate.textContent = '当前已是最新版本';
        chip.className = 'tag tag-soft';
        break;
      case 'downloading': {
        progressWrap.style.display = 'block';
        const percent = Number(payload.percent || 0);
        root.querySelector('#progress-fill').style.width = percent + '%';
        root.querySelector('#progress-percent').textContent = percent.toFixed(1) + '%';
        const speed = payload.bytesPerSecond ? formatSize(payload.bytesPerSecond) + '/s' : '—';
        root.querySelector('#progress-speed').textContent = speed;
        setBtnLoading(btnCheck, '下载中…');
        btnCheck.style.display = 'none';
        btnDownload.style.display = 'inline-flex';
        setBtnLoading(btnDownload, '下载中…');
        btnDownload.disabled = true;
        chip.className = 'tag tag-soft';
        break;
      }
      case 'downloaded': {
        const ver = payload.version || '新版本';
        latestVer.textContent = `v${ver} · 已下载`;
        latestDate.textContent = payload.releaseDate ? '发布时间：' + formatDate(payload.releaseDate) : '';
        btnCheck.style.display = 'none';
        btnDownload.style.display = 'none';
        btnInstall.style.display = 'inline-flex';
        chip.className = 'tag tag-primary';
        toast('新版本已下载完成，可重启并安装', 'success');
        break;
      }
      case 'error': {
        errorEl.style.display = 'flex';
        root.querySelector('#update-error-msg').textContent = payload.message || '未知错误';
        chip.className = 'tag tag-danger';
        break;
      }
    }
  }

  function bindButtons() {
    root.querySelector('#btn-check').addEventListener('click', async () => {
      if (!window.api || !window.api.updateCheck) { toast('运行环境异常', 'error'); return; }
      const btn = root.querySelector('#btn-check');
      setBtnLoading(btn, '检查中…');
      try {
        const res = await window.api.updateCheck();
        if (res && res.ok === false) {
          handleUpdateEvent({ state: 'error', message: res.error });
        }
      } catch (e) {
        handleUpdateEvent({ state: 'error', message: e.message || '检查失败' });
      } finally {
        resetBtn(btn);
      }
    });

    root.querySelector('#btn-download').addEventListener('click', async () => {
      if (!window.api || !window.api.updateDownload) { toast('运行环境异常', 'error'); return; }
      const btn = root.querySelector('#btn-download');
      setBtnLoading(btn, '下载中…');
      btn.disabled = true;
      try {
        const res = await window.api.updateDownload();
        if (res && res.ok === false) {
          handleUpdateEvent({ state: 'error', message: res.error });
        }
      } catch (e) {
        handleUpdateEvent({ state: 'error', message: e.message || '下载失败' });
      } finally {
        btn.disabled = false;
        resetBtn(btn);
      }
    });

    root.querySelector('#btn-install').addEventListener('click', async () => {
      if (!confirmDialog('将重启妙生并安装新版本，是否继续？')) return;
      if (!window.api || !window.api.updateQuitAndInstall) { toast('运行环境异常', 'error'); return; }
      const btn = root.querySelector('#btn-install');
      setBtnLoading(btn, '重启中…');
      btn.disabled = true;
      try {
        await window.api.updateQuitAndInstall();
      } catch (e) {
        toast('重启安装失败：' + e.message, 'error');
        btn.disabled = false;
        resetBtn(btn);
      }
    });
  }
}

// ===== 工具函数 =====
function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

function formatSize(bytes) {
  if (!bytes || bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return v.toFixed(1) + ' ' + units[u];
}

function formatNotes(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) {
    return raw.map((x) => (typeof x === 'string' ? formatNotes(x) : formatNotes(x.note || ''))).join('');
  }
  if (typeof raw !== 'string') {
    try { raw = String(raw); } catch { return ''; }
  }
  // 如果内容已经包含 HTML 标签，直接渲染
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }
  return markdownToHtml(raw);
}

// 轻量 Markdown → HTML（无需第三方库，覆盖常见语法）
function markdownToHtml(md) {
  const lines = escapeHtml(md).split('\n');
  const html = [];
  let inList = false;
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };
  const inline = (text) => {
    return text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:6px;margin:6px 0" />')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块
    if (line.trim().startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
        codeLang = line.trim().slice(3);
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    // 空行
    if (!line.trim()) { closeList(); continue; }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // 分隔线
    if (/^(\*\*\*|---|___)\s*$/.test(line)) {
      closeList();
      html.push('<hr/>');
      continue;
    }

    // 引用
    if (line.startsWith('&gt; ')) {
      closeList();
      html.push(`<blockquote>${inline(line.slice(5))}</blockquote>`);
      continue;
    }

    // 列表项
    const li = line.match(/^[\s]*[-*+]\s+(.*)$/);
    if (li) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    // 数字列表
    const ol = line.match(/^[\s]*\d+\.\s+(.*)$/);
    if (ol) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // 普通段落
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  closeList();
  return html.join('');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function setBtnLoading(btn, text) {
  btn.disabled = true;
  btn._oldHTML = btn.innerHTML;
  btn.innerHTML = icon('loader', 14) + '<span>' + text + '</span>';
}
function resetBtn(btn) {
  btn.disabled = false;
  if (btn._oldHTML) btn.innerHTML = btn._oldHTML;
}
