import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cssDirectory = path.resolve(testDirectory, '../src/css');

async function readCssFiles() {
  const fileNames = (await readdir(cssDirectory)).filter((fileName) => fileName.endsWith('.css'));
  const files = await Promise.all(fileNames.map(async (fileName) => ({
    fileName,
    content: await readFile(path.join(cssDirectory, fileName), 'utf8'),
  })));
  return files;
}

function getDeclaration(css, selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\}`, 'u'));
  return match?.[1] || '';
}

function getAtRuleBlock(css, atRule) {
  const start = css.indexOf(atRule);
  if (start < 0) return '';
  const openingBrace = css.indexOf('{', start);
  if (openingBrace < 0) return '';

  let depth = 1;
  for (let index = openingBrace + 1; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(openingBrace + 1, index);
  }
  return '';
}

test('主题提供统一的运动时长与缓动变量', async () => {
  const themeCss = await readFile(path.join(cssDirectory, 'theme.css'), 'utf8');

  assert.match(themeCss, /--motion-fast:\s*120ms\s*;/u);
  assert.match(themeCss, /--motion-normal:\s*180ms\s*;/u);
  assert.match(themeCss, /--motion-slow:\s*240ms\s*;/u);
  assert.match(themeCss, /--motion-ease:\s*cubic-bezier\([^;]+\)\s*;/u);
});

test('样式只过渡明确的非布局属性', async () => {
  const files = await readCssFiles();
  const transitions = files.flatMap(({ fileName, content }) => [...content.matchAll(/transition\s*:\s*([^;]+);/gu)]
    .map((match) => ({ fileName, value: match[1] })));

  assert.equal(transitions.some(({ value }) => /\ball\b/u.test(value)), false, '不得保留 transition: all');
  assert.equal(
    transitions.some(({ value }) => /(?<![a-z-])(?:width|height|left|right|top|bottom|margin|padding|max-height)(?![a-z-])/u.test(value)),
    false,
    '不得过渡布局属性',
  );
  assert.equal(
    transitions.every(({ value }) => /var\(--motion-(?:fast|normal|slow)\)/u.test(value)),
    true,
    '所有过渡应使用统一运动时长变量',
  );
  assert.equal(
    transitions.every(({ value }) => /var\(--motion-ease\)/u.test(value)),
    true,
    '所有过渡应使用统一缓动变量',
  );
});

test('动画使用统一运动变量而非分散的字面时长', async () => {
  const files = await readCssFiles();
  const animations = files.flatMap(({ fileName, content }) => [...content.matchAll(/animation\s*:\s*([^;]+);/gu)]
    .map((match) => ({ fileName, value: match[1] })));

  assert.equal(
    animations.every(({ value }) => /var\(--motion-(?:fast|normal|slow|loop|wave|pulse)\)/u.test(value)),
    true,
    '所有动画应使用统一运动时长变量',
  );
  assert.equal(
    animations.every(({ value }) => /var\(--motion-(?:ease|linear)\)/u.test(value)),
    true,
    '所有动画应使用统一缓动变量',
  );
});

test('页面、Toast 与弹窗只使用 opacity 和 transform 进退场', async () => {
  const shellCss = await readFile(path.join(cssDirectory, 'shell.css'), 'utf8');
  const pagesCss = await readFile(path.join(cssDirectory, 'pages.css'), 'utf8');

  const pageEnter = getDeclaration(shellCss, '.page-enter');
  assert.match(pageEnter, /animation:\s*pageFade\s+var\(--motion-normal\)\s+var\(--motion-ease\)\s+both\s*;/u);
  assert.match(shellCss, /@keyframes\s+pageFade\s*\{[\s\S]*?opacity:[\s\S]*?translateY\(4px\)[\s\S]*?\}/u);

  for (const keyframe of ['toastIn', 'toastOut']) {
    const declaration = getDeclaration(shellCss, `@keyframes ${keyframe}`);
    assert.match(declaration, /opacity\s*:/u, `${keyframe} 必须使用 opacity`);
    assert.match(declaration, /transform\s*:/u, `${keyframe} 必须使用 transform`);
  }

  for (const keyframe of ['modal-fade-in', 'modal-slide-up']) {
    const declaration = getDeclaration(pagesCss, `@keyframes ${keyframe}`);
    assert.match(declaration, /opacity\s*:/u, `${keyframe} 必须使用 opacity`);
  }
  assert.match(getDeclaration(pagesCss, '@keyframes modal-slide-up'), /transform\s*:/u);
});

test('全局减少动态效果模式会缩短过渡并停止循环动画', async () => {
  const themeCss = await readFile(path.join(cssDirectory, 'theme.css'), 'utf8');
  const reduceMotion = getAtRuleBlock(themeCss, '@media (prefers-reduced-motion: reduce)');

  assert.notEqual(reduceMotion, '', '必须提供 prefers-reduced-motion 全局覆盖');
  assert.match(reduceMotion, /transition-duration:\s*1ms\s*!important\s*;/u);
  assert.match(reduceMotion, /animation-duration:\s*1ms\s*!important\s*;/u);
  assert.match(reduceMotion, /animation-iteration-count:\s*1\s*!important\s*;/u);
});
