const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

function selectDmgAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  return assets.find((asset) => /\.dmg$/i.test(String(asset?.name || '')) && asset.browser_download_url)
    || null;
}

function fetchJson(url, { httpsImpl = https, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsImpl.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'miaos-updater',
      },
    }, (response) => {
      const status = Number(response.statusCode || 0);
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        if (status >= 300 && status < 400 && response.headers?.location) {
          fetchJson(response.headers.location, { httpsImpl, timeoutMs }).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          const error = new Error(`GitHub 更新接口返回 HTTP ${status}`);
          error.statusCode = status;
          reject(error);
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (_) { reject(new Error('GitHub 更新信息格式不正确')); }
      });
      response.on('error', reject);
    });
    request.setTimeout?.(timeoutMs, () => {
      request.destroy?.();
      reject(new Error('更新检查超时'));
    });
    request.on?.('error', reject);
  });
}

function fetchText(url, { httpsImpl = https, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsImpl.get(url, { headers: { Accept: 'application/atom+xml', 'User-Agent': 'miaos-updater' } }, (response) => {
      const status = Number(response.statusCode || 0);
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        if (status < 200 || status >= 300) {
          const error = new Error(`更新订阅返回 HTTP ${status}`);
          error.statusCode = status;
          reject(error);
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      response.on('error', reject);
    });
    request.setTimeout?.(timeoutMs, () => {
      request.destroy?.();
      reject(new Error('更新订阅读取超时'));
    });
    request.on?.('error', reject);
  });
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 将 Atom feed 中 GitHub 渲染后的 HTML 更新日志转换回有限 Markdown 结构，
 * 保留标题、列表、段落、链接和换行，确保前端 parseReleaseNotes 能正常分块。
 */
function htmlToMarkdown(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    // 标题 h1–h6 → 对应 # 前缀
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level, inner) => `\n${'#'.repeat(Number(level))} ${inner.trim()}\n`)
    // 列表项 li → "- " 前缀
    .replace(/<li[^>]*>([\s\S]*?)<\/li\s*>/gi, (_, inner) => `\n- ${inner.trim()}`)
    // 段落 p → 前后空行
    .replace(/<p[^>]*>([\s\S]*?)<\/p\s*>/gi, (_, inner) => `\n${inner.trim()}\n`)
    // <br> → 换行
    .replace(/<br\s*\/?\s*>/gi, '\n')
    // 链接 a → [text](url)
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a\s*>/gi, (_, href, text) => `[${text.trim()}](${href})`)
    // 代码块 pre → 围栏
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_, inner) => `\n\`\`\`\n${inner.trim()}\n\`\`\`\n`)
    // 剩余标签安全剥离
    .replace(/<[^>]*>/g, '')
    // 压缩连续空行但保留换行结构
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function checkForUpdateFromAtom({ owner, repo, currentVersion, httpsImpl = https, cdnPrefix = '' }) {
  const cdn = normalizeCdnPrefix(cdnPrefix);
  const feed = await fetchText(applyCdnPrefix(`https://github.com/${owner}/${repo}/releases.atom`, cdn), { httpsImpl });
  const entry = feed.match(/<entry>[\s\S]*?<\/entry>/i)?.[0] || '';
  if (!entry) throw new Error('GitHub 更新订阅中没有 Release');
  const version = normalizeVersion(entry.match(/<id>[^<]*\/(v?[0-9][^<\s]*)<\/id>/i)?.[1] || entry.match(/<title>\s*([^<]*?)\s*<\/title>/i)?.[1]);
  if (!version || compareVersions(version, currentVersion) <= 0) return null;
  const releaseUrl = entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || `https://github.com/${owner}/${repo}/releases/tag/v${version}`;
  const content = decodeXmlText(entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || '');
  const assetName = content.match(/[A-Za-z0-9._-]+\.dmg/i)?.[0] || `miaos-${version}-arm64.dmg`;
  return {
    version,
    releaseNotes: htmlToMarkdown(content),
    releaseDate: entry.match(/<updated>([^<]+)<\/updated>/i)?.[1] || '',
    releaseUrl,
    downloadUrl: applyCdnPrefix(`https://github.com/${owner}/${repo}/releases/download/v${version}/${assetName}`, cdn),
    assetName,
    expectedSha256: '',
  };
}

function downloadFile(url, targetPath, { httpsImpl = https, fsImpl = fs, onProgress, expectedSha256 = '', timeoutMs = 180000, maxRetries = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const options = { httpsImpl, fsImpl, onProgress, expectedSha256, timeoutMs, maxRetries, retriesLeft: maxRetries };
    attemptDownload(url, targetPath, options, resolve, reject);
  });
}

function attemptDownload(url, targetPath, options, resolve, reject) {
  const { httpsImpl, fsImpl, onProgress, expectedSha256, timeoutMs, retriesLeft } = options;
  let resumeFrom = 0;
  try {
    if (fsImpl.existsSync(targetPath)) {
      resumeFrom = fsImpl.statSync(targetPath).size;
      if (resumeFrom <= 0) resumeFrom = 0;
    }
  } catch (_) { resumeFrom = 0; }

  const headers = { 'User-Agent': 'miaos-updater' };
  if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`;

  const request = httpsImpl.get(url, { headers }, (response) => {
    const status = Number(response.statusCode || 0);
    if (status >= 300 && status < 400 && response.headers?.location) {
      attemptDownload(response.headers.location, targetPath, { ...options }, resolve, reject);
      return;
    }
    const isPartial = status === 206;
    if (status === 200 && resumeFrom > 0) resumeFrom = 0;
    if (status < 200 || status >= 300) {
      response.resume?.();
      retryOrFail(url, targetPath, options, resolve, reject, `更新下载返回 HTTP ${status}`);
      return;
    }
    const contentLength = Number(response.headers?.['content-length']) || 0;
    const total = isPartial ? resumeFrom + contentLength : contentLength;
    let received = isPartial ? resumeFrom : 0;
    const hash = crypto.createHash('sha256');
    if (isPartial && resumeFrom > 0) {
      try {
        hash.update(fsImpl.readFileSync(targetPath));
      } catch (_) {
        try { fsImpl.unlinkSync(targetPath); } catch (_) {}
        resumeFrom = 0;
        received = 0;
      }
    }
    const writeFlags = isPartial && resumeFrom > 0 ? 'a' : 'w';
    const output = fsImpl.createWriteStream(targetPath, { mode: 0o600, flags: writeFlags });
    const fail = (error) => {
      output.destroy?.();
      retryOrFail(url, targetPath, options, resolve, reject, error?.message || '下载中断');
    };
    response.on('data', (chunk) => {
      received += chunk.length;
      hash.update(chunk);
      onProgress?.(total > 0 ? Math.min(1, received / total) : null);
    });
    response.on('error', fail);
    output.on('error', fail);
    output.on('finish', () => {
      const sha256 = hash.digest('hex');
      if (expectedSha256 && sha256.toLowerCase() !== String(expectedSha256).toLowerCase()) {
        try { fsImpl.unlinkSync(targetPath); } catch (_) {}
        reject(new Error('更新包校验失败'));
        return;
      }
      resolve({ path: targetPath, bytes: received, sha256 });
    });
    response.pipe(output);
  });
  request.setTimeout?.(timeoutMs, () => {
    request.destroy?.();
    retryOrFail(url, targetPath, options, resolve, reject, '更新下载超时');
  });
  request.on?.('error', (error) => {
    retryOrFail(url, targetPath, options, resolve, reject, error?.message || '网络错误');
  });
}

function retryOrFail(url, targetPath, options, resolve, reject, message) {
  const { retriesLeft } = options;
  if (retriesLeft > 0) {
    setTimeout(() => {
      attemptDownload(url, targetPath, { ...options, retriesLeft: retriesLeft - 1 }, resolve, reject);
    }, 1000);
    return;
  }
  try { options.fsImpl.unlinkSync(targetPath); } catch (_) {}
  reject(new Error(message));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * 校验并规范化 CDN 前缀。仅允许 https 协议且不含路径的根 URL，确保不会注入任意目标。
 */
function normalizeCdnPrefix(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === 'direct') return '';
  if (!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(trimmed)) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function applyCdnPrefix(url, cdnPrefix) {
  const prefix = normalizeCdnPrefix(cdnPrefix);
  if (!prefix || !url.startsWith('https://')) return url;
  return `${prefix}${url}`;
}

function buildInstallScript({ dmgPath, appPath, pid, version, scriptPath }) {
  const mountPoint = path.join(os.tmpdir(), `miaos-update-mount-${process.pid}`);
  const backupPath = `${appPath}.backup-${process.pid}`;
  return `#!/bin/sh
set -eu
DMG=${shellQuote(dmgPath)}
APP=${shellQuote(appPath)}
PID=${Number(pid) || 0}
EXPECTED=${shellQuote(version)}
MOUNT=${shellQuote(mountPoint)}
BACKUP=${shellQuote(backupPath)}
SCRIPT=${shellQuote(scriptPath)}
while kill -0 "$PID" 2>/dev/null; do sleep 1; done
mkdir -p "$MOUNT"
cleanup() {
  /usr/bin/hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true
  rm -rf "$MOUNT" "$DMG" "$SCRIPT"
}
trap cleanup EXIT
/usr/bin/hdiutil attach "$DMG" -nobrowse -mountpoint "$MOUNT" >/dev/null
SOURCE="$MOUNT/miaos.app"
if [ ! -d "$SOURCE" ]; then exit 1; fi
TMP="$APP.new-$PID"
rm -rf "$TMP" "$BACKUP"
/usr/bin/ditto "$SOURCE" "$TMP"
ACTUAL=$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$TMP/Contents/Info.plist")
if [ "$ACTUAL" != "$EXPECTED" ]; then exit 1; fi
mv "$APP" "$BACKUP"
if ! mv "$TMP" "$APP"; then mv "$BACKUP" "$APP"; exit 1; fi
rm -rf "$BACKUP"
/usr/bin/open "$APP"
exit 0
`;
}

async function checkForUpdate({ owner, repo, currentVersion, httpsImpl = https, cdnPrefix = '', channel = 'stable' }) {
  const cdn = normalizeCdnPrefix(cdnPrefix);
  const isPrerelease = channel === 'prerelease';
  // 正式版走 releases/latest（不含预发布）；预发布走 /releases 列表（包含预发布）
  const url = applyCdnPrefix(
    isPrerelease
      ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=5`
      : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
    cdn,
  );
  let release;
  try {
    const result = await fetchJson(url, { httpsImpl });
    if (isPrerelease && Array.isArray(result)) {
      // /releases 返回数组，取第一条（GitHub 按创建时间倒序，已包含预发布）
      release = result[0] || null;
      if (!release) return null;
    } else {
      release = result;
    }
  } catch (error) {
    if (error?.statusCode !== 403 && error?.statusCode !== 429) throw error;
    return checkForUpdateFromAtom({ owner, repo, currentVersion, httpsImpl, cdnPrefix: cdn });
  }
  const version = normalizeVersion(release.tag_name || release.name);
  if (!version || compareVersions(version, currentVersion) <= 0) return null;
  const asset = selectDmgAsset(release);
  if (!asset) throw new Error('最新 Release 没有找到 macOS DMG 安装包');
  return {
    version,
    releaseNotes: release.body || '',
    releaseDate: release.published_at || release.created_at || '',
    releaseUrl: release.html_url || '',
    downloadUrl: applyCdnPrefix(asset.browser_download_url, cdn),
    assetName: asset.name,
    expectedSha256: typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7) : '',
    isPrerelease: Boolean(release.prerelease),
  };
}

module.exports = {
  normalizeVersion,
  compareVersions,
  selectDmgAsset,
  normalizeCdnPrefix,
  applyCdnPrefix,
  fetchJson,
  downloadFile,
  buildInstallScript,
  checkForUpdate,
};
