import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [renderer, settings, css, icons] = await Promise.all([
  readFile(new URL('../src/js/renderer.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/pages/settings.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/icons.js', import.meta.url), 'utf8'),
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
