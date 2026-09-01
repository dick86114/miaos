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

async function checkForUpdateFromAtom({ owner, repo, currentVersion, httpsImpl = https }) {
  const feed = await fetchText(`https://github.com/${owner}/${repo}/releases.atom`, { httpsImpl });
  const entry = feed.match(/<entry>[\s\S]*?<\/entry>/i)?.[0] || '';
  if (!entry) throw new Error('GitHub 更新订阅中没有 Release');
  const version = normalizeVersion(entry.match(/<id>[^<]*\/(v?[0-9][^<\s]*)<\/id>/i)?.[1] || entry.match(/<title>\s*([^<]*?)\s*<\/title>/i)?.[1]);
  if (!version || compareVersions(version, currentVersion) <= 0) return null;
  const releaseUrl = entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || `https://github.com/${owner}/${repo}/releases/tag/v${version}`;
  const content = decodeXmlText(entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || '');
  const assetName = content.match(/[A-Za-z0-9._-]+\.dmg/i)?.[0] || `miaos-${version}-arm64.dmg`;
  return {
    version,
    releaseNotes: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    releaseDate: entry.match(/<updated>([^<]+)<\/updated>/i)?.[1] || '',
    releaseUrl,
    downloadUrl: `https://github.com/${owner}/${repo}/releases/download/v${version}/${assetName}`,
    assetName,
    expectedSha256: '',
  };
}

function downloadFile(url, targetPath, { httpsImpl = https, fsImpl = fs, onProgress, expectedSha256 = '', timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsImpl.get(url, { headers: { 'User-Agent': 'miaos-updater' } }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400 && response.headers?.location) {
        downloadFile(response.headers.location, targetPath, { httpsImpl, fsImpl, onProgress, expectedSha256, timeoutMs }).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume?.();
        reject(new Error(`更新下载返回 HTTP ${status}`));
        return;
      }
      const total = Number(response.headers?.['content-length']) || 0;
      let received = 0;
      const hash = crypto.createHash('sha256');
      const output = fsImpl.createWriteStream(targetPath, { mode: 0o600 });
      const fail = (error) => {
        output.destroy?.();
        try { fsImpl.unlinkSync(targetPath); } catch (_) {}
        reject(error);
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
      reject(new Error('更新下载超时'));
    });
    request.on?.('error', reject);
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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

async function checkForUpdate({ owner, repo, currentVersion, httpsImpl = https }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  let release;
  try {
    release = await fetchJson(url, { httpsImpl });
  } catch (error) {
    if (error?.statusCode !== 403 && error?.statusCode !== 429) throw error;
    return checkForUpdateFromAtom({ owner, repo, currentVersion, httpsImpl });
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
    downloadUrl: asset.browser_download_url,
    assetName: asset.name,
    expectedSha256: typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7) : '',
  };
}

module.exports = {
  normalizeVersion,
  compareVersions,
  selectDmgAsset,
  fetchJson,
  downloadFile,
  buildInstallScript,
  checkForUpdate,
};
