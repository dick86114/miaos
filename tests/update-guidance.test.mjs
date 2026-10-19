import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [renderer, settings, css, icons, preload, restartNotice] = await Promise.all([
  readFile(new URL('../src/js/renderer.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/pages/settings.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/icons.js', import.meta.url), 'utf8'),
  readFile(new URL('../preload.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/update-restart-notice.js', import.meta.url), 'utf8'),
]);

test('自动更新提示可点击进入设置里的关于与更新页签', () => {
  assert.match(renderer, /发现新版本 v\$\{payload\.version\}，点击前往「关于与更新」/u);
  assert.match(renderer, /onClick:\s*\(\)\s*=>\s*\{?\s*navigate\('\/settings\?section=about'\)/u);
  assert.doesNotMatch(renderer, /openReleasePage/u);
  assert.match(settings, /query\.section/u);
  assert.match(settings, /section === 'about'/u);
});

test('设置关于页提供可关闭的 GitHub Star 引导并打开项目主页', () => {
  assert.match(settings, /github-star-guide/u);
  assert.match(settings, /如果 妙生 帮到了你，请在 GitHub 点个 Star/u);
  assert.match(settings, /去点 Star/u);
  assert.match(settings, /https:\/\/github\.com\/dick86114\/miaos/u);
  assert.match(settings, /data-star-guide-dismiss/u);
  assert.match(settings, /GithubStarGuideDismissed/u);
  assert.match(icons, /github:/u);
  assert.match(icons, /star:/u);
  assert.match(css, /\.github-star-guide/u);
  assert.match(css, /\.github-star-guide-action/u);
});

test('更新下载支持手动取消，并始终提供 GitHub 手动下载入口', () => {
  assert.match(settings, /id="btn-cancel-download"/u);
  assert.match(settings, /window\.api\.updateCancel/u);
  assert.match(settings, /id="btn-open-release"/u);
  assert.match(settings, /GitHub 手动下载/u);
  assert.match(settings, /window\.api\.openReleasePage/u);
  assert.match(preload, /updateCancel:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('update-cancel'\)/u);
  assert.match(preload, /openReleasePage:\s*\(url\)\s*=>\s*ipcRenderer\.invoke\('update-open-release-page',\s*url\)/u);
});

test('自动更新重启后展示本次版本和更新日志', () => {
  assert.match(renderer, /updateGetRestartNotice/u);
  assert.match(renderer, /showUpdateRestartNotice/u);
  assert.match(restartNotice, /妙生已更新到 v/u);
  assert.match(restartNotice, /renderReleaseNotes/u);
  assert.match(restartNotice, /查看完整更新内容/u);
  assert.match(css, /\.update-restart-overlay/u);
  assert.match(css, /\.update-restart-notes/u);
});
