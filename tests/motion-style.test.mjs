import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cssDirectory = path.resolve(testDirectory, '../src/css');
const forbiddenLayoutProperties = new Set([
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'left', 'right', 'top', 'bottom', 'inset', 'inset-inline', 'inset-block',
  'inset-inline-start', 'inset-inline-end', 'inset-block-start', 'inset-block-end',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-inline', 'margin-inline-start', 'margin-inline-end', 'margin-block',
  'margin-block-start', 'margin-block-end', 'padding', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'padding-inline', 'padding-inline-start',
  'padding-inline-end', 'padding-block', 'padding-block-start', 'padding-block-end',
]);

async function readCssFiles() {
  const fileNames = (await readdir(cssDirectory)).filter((fileName) => fileName.endsWith('.css'));
  return Promise.all(fileNames.map(async (fileName) => ({
    fileName,
    content: stripCssComments(await readFile(path.join(cssDirectory, fileName), 'utf8')),
  })));
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//gu, '');
}

function splitCssList(value) {
  const values = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth = Math.max(0, depth - 1);
    if (value[index] === ',' && depth === 0) {
      values.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  values.push(value.slice(start).trim());
  return values.filter(Boolean);
}

function getDeclarations(css, propertyName) {
  const pattern = new RegExp(`(?:^|[;{}])\\s*${propertyName}\\s*:\\s*([^;{}]+);`, 'giu');
  return [...css.matchAll(pattern)].map((match) => match[1].trim());
}

function getTransitionProblems(css) {
  const problems = [];
  const transitionValues = getDeclarations(css, 'transition');
  const propertyValues = getDeclarations(css, 'transition-property');

  for (const value of transitionValues) {
    if (/\ball\b/iu.test(value)) problems.push(`transition 使用 all：${value}`);
    for (const property of forbiddenLayoutProperties) {
      const pattern = new RegExp(`(?:^|[\\s,])${property}(?=[\\s,]|$)`, 'iu');
      if (pattern.test(value)) problems.push(`transition 过渡布局属性 ${property}：${value}`);
    }
  }

  for (const value of propertyValues) {
    for (const property of splitCssList(value)) {
      const normalized = property.trim().toLowerCase();
      if (normalized === 'all') problems.push(`transition-property 使用 all：${value}`);
      if (forbiddenLayoutProperties.has(normalized)) {
        problems.push(`transition-property 过渡布局属性 ${normalized}：${value}`);
      }
    }
  }

  return problems;
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

function getKeyframes(css) {
  const keyframes = [];
  const pattern = /@(?:-[a-z]+-)?keyframes\s+([\w-]+)/giu;

  for (const match of css.matchAll(pattern)) {
    const block = getAtRuleBlock(css.slice(match.index), match[0]);
    if (block) keyframes.push({ name: match[1], block });
  }
  return keyframes;
}

function getKeyframeLayoutProblems(css) {
  const problems = [];
  for (const { name, block } of getKeyframes(css)) {
    const declarations = [...block.matchAll(/(?:^|[;{}])\s*([a-z-]+)\s*:/giu)];
    for (const declaration of declarations) {
      const property = declaration[1].toLowerCase();
      if (forbiddenLayoutProperties.has(property)) {
        problems.push(`@keyframes ${name} 修改布局属性 ${property}`);
      }
    }
  }
  return problems;
}

test('静态规则会忽略注释并识别大写、longhand 与布局属性过渡', () => {
  const css = stripCssComments(`
    /* transition: ALL 120ms; @keyframes 注释 { from { left: 0; } } */
    .a { TRANSITION: ALL 120ms ease; }
    .b { transition-property: Margin-Inline-Start, opacity; }
    .c { transition: opacity 120ms ease, MAX-HEIGHT 180ms ease; }
  `);

  const problems = getTransitionProblems(css);
  assert.equal(problems.some((problem) => problem.includes('all')), true);
  assert.equal(problems.some((problem) => problem.includes('margin-inline-start')), true);
  assert.equal(problems.some((problem) => problem.includes('max-height')), true);
});

test('静态规则会拒绝关键帧中的旧式 left 动画', () => {
  const css = stripCssComments(`
    @KEYFRAMES wave-slide {
      0% { LEFT: -40%; }
      100% { left: 100%; }
    }
  `);

  const problems = getKeyframeLayoutProblems(css);
  assert.deepEqual(problems, [
    '@keyframes wave-slide 修改布局属性 left',
    '@keyframes wave-slide 修改布局属性 left',
  ]);
});

test('主题提供统一的运动时长与缓动变量', async () => {
  const themeCss = stripCssComments(await readFile(path.join(cssDirectory, 'theme.css'), 'utf8'));

  assert.match(themeCss, /--motion-fast:\s*120ms\s*;/u);
  assert.match(themeCss, /--motion-normal:\s*180ms\s*;/u);
  assert.match(themeCss, /--motion-slow:\s*240ms\s*;/u);
  assert.match(themeCss, /--motion-ease:\s*cubic-bezier\([^;]+\)\s*;/u);
});

test('样式只过渡明确的非布局属性', async () => {
  const files = await readCssFiles();
  const problems = files.flatMap(({ fileName, content }) => getTransitionProblems(content)
    .map((problem) => `${fileName}: ${problem}`));

  assert.deepEqual(problems, []);

  const transitions = files.flatMap(({ content }) => getDeclarations(content, 'transition'));
  assert.equal(
    transitions.every((value) => /var\(--motion-(?:fast|normal|slow)\)/u.test(value)),
    true,
    '所有过渡应使用统一运动时长变量',
  );
  assert.equal(
    transitions.every((value) => /var\(--motion-ease\)/u.test(value)),
    true,
    '所有过渡应使用统一缓动变量',
  );
});

test('动画使用统一运动变量且所有关键帧只修改合成属性', async () => {
  const files = await readCssFiles();
  const animations = files.flatMap(({ content }) => getDeclarations(content, 'animation'));
  const keyframeProblems = files.flatMap(({ fileName, content }) => getKeyframeLayoutProblems(content)
    .map((problem) => `${fileName}: ${problem}`));

  const isReducedMotionStaticState = (value) => /^none\s*!important$/iu.test(value);
  assert.equal(
    animations.every((value) => isReducedMotionStaticState(value) || /var\(--motion-(?:fast|normal|slow|loop|wave|pulse)\)/u.test(value)),
    true,
    '所有动画应使用统一运动时长变量，减少动态效果的静态状态除外',
  );
  assert.equal(
    animations.every((value) => isReducedMotionStaticState(value) || /var\(--motion-(?:ease|linear)\)/u.test(value)),
    true,
    '所有动画应使用统一缓动变量，减少动态效果的静态状态除外',
  );
  assert.deepEqual(keyframeProblems, []);
});

test('减少动态效果模式会让波浪进度保持可见且不循环', async () => {
  const pagesCss = stripCssComments(await readFile(path.join(cssDirectory, 'pages.css'), 'utf8'));
  const reduceMotion = getAtRuleBlock(pagesCss, '@media (prefers-reduced-motion: reduce)');
  const waveRule = getAtRuleBlock(reduceMotion, '.composer-wave-bar::before');

  assert.notEqual(waveRule, '', '波浪进度条必须提供减少动态效果覆盖');
  assert.match(waveRule, /animation:\s*none\s*!important\s*;/u);
  assert.match(waveRule, /transform:\s*translateX\(0\)\s*;/u);
});

test('全局减少动态效果模式会缩短过渡并停止循环动画', async () => {
  const themeCss = stripCssComments(await readFile(path.join(cssDirectory, 'theme.css'), 'utf8'));
  const reduceMotion = getAtRuleBlock(themeCss, '@media (prefers-reduced-motion: reduce)');

  assert.notEqual(reduceMotion, '', '必须提供 prefers-reduced-motion 全局覆盖');
  assert.match(reduceMotion, /transition-duration:\s*1ms\s*!important\s*;/u);
  assert.match(reduceMotion, /animation-duration:\s*1ms\s*!important\s*;/u);
  assert.match(reduceMotion, /animation-iteration-count:\s*1\s*!important\s*;/u);
});
