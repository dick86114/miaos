import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cssDirectory = path.resolve(testDirectory, '../src/css');
const animationLonghandProperties = new Set([
  'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction',
  'animation-fill-mode', 'animation-play-state', 'animation-composition',
  'animation-timeline', 'animation-range', 'animation-range-start', 'animation-range-end',
]);
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
const allowedKeyframeProperties = new Set(['transform', 'opacity']);

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

function findClosingBrace(css, openingBrace) {
  let depth = 1;
  for (let index = openingBrace + 1; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function getDirectDeclarations(content) {
  const declarations = [];
  const pattern = /(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+?)(?=;|$)/giu;

  for (const match of content.matchAll(pattern)) {
    declarations.push({
      property: match[1].toLowerCase(),
      value: match[2].trim(),
    });
  }
  return declarations;
}

function getCssRules(css, start = 0, end = css.length, contexts = []) {
  const rules = [];
  let cursor = start;

  while (cursor < end) {
    const openingBrace = css.indexOf('{', cursor);
    if (openingBrace < 0 || openingBrace >= end) break;
    const closingBrace = findClosingBrace(css, openingBrace);
    if (closingBrace < 0 || closingBrace > end) break;

    const header = css.slice(cursor, openingBrace).trim();
    const content = css.slice(openingBrace + 1, closingBrace);
    const normalizedHeader = header.toLowerCase();

    if (/^@media\b/u.test(normalizedHeader)) {
      rules.push(...getCssRules(content, 0, content.length, [...contexts, normalizedHeader]));
    } else if (!/^@(?:-[a-z]+-)?keyframes\b/u.test(normalizedHeader) && header) {
      rules.push({
        header,
        contexts,
        declarations: getDirectDeclarations(content),
      });
    }

    cursor = closingBrace + 1;
  }

  return rules;
}

function getAtRuleBlock(css, atRule) {
  const start = css.indexOf(atRule);
  if (start < 0) return '';
  const openingBrace = css.indexOf('{', start);
  if (openingBrace < 0) return '';
  const closingBrace = findClosingBrace(css, openingBrace);
  return closingBrace < 0 ? '' : css.slice(openingBrace + 1, closingBrace);
}

function getKeyframes(css) {
  const keyframes = [];
  const pattern = /@(?:-[a-z]+-)?keyframes\s+([\w-]+)/giu;

  for (const match of css.matchAll(pattern)) {
    const openingBrace = css.indexOf('{', match.index);
    const closingBrace = openingBrace < 0 ? -1 : findClosingBrace(css, openingBrace);
    if (closingBrace < 0) continue;
    keyframes.push({
      name: match[1],
      block: css.slice(openingBrace + 1, closingBrace),
    });
  }
  return keyframes;
}

function isReduceMotionRule(rule) {
  return rule.contexts.some((context) => /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u.test(context));
}

function getTransitionProblems(rules) {
  const problems = [];

  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      if (declaration.property === 'transition') {
        if (/\ball\b/iu.test(declaration.value)) problems.push(`${rule.header}: transition 使用 all`);
        for (const property of forbiddenLayoutProperties) {
          const pattern = new RegExp(`(?:^|[\\s,])${property}(?=[\\s,]|$)`, 'iu');
          if (pattern.test(declaration.value)) problems.push(`${rule.header}: transition 过渡布局属性 ${property}`);
        }
      }

      if (declaration.property === 'transition-property') {
        for (const property of splitCssList(declaration.value)) {
          const normalized = property.trim().toLowerCase();
          if (normalized === 'all') problems.push(`${rule.header}: transition-property 使用 all`);
          if (forbiddenLayoutProperties.has(normalized)) {
            problems.push(`${rule.header}: transition-property 过渡布局属性 ${normalized}`);
          }
        }
      }
    }
  }

  return problems;
}

function getAnimationProblems(rules, keyframeNames) {
  const problems = [];

  for (const rule of rules) {
    if (isReduceMotionRule(rule)) continue;
    const animationDeclarations = rule.declarations.filter(({ property }) => property === 'animation' || animationLonghandProperties.has(property));
    if (animationDeclarations.length === 0) continue;

    const shorthandDeclarations = animationDeclarations.filter(({ property }) => property === 'animation');
    const longhandDeclarations = animationDeclarations.filter(({ property }) => property !== 'animation');

    for (const { value } of shorthandDeclarations) {
      if (/^none\s*!important$/iu.test(value)) {
        problems.push(`${rule.header}: animation: none 只能用于减少动态效果规则`);
        continue;
      }
      if (!/var\(--motion-(?:fast|normal|slow|loop|wave|pulse)\)/u.test(value)) {
        problems.push(`${rule.header}: animation 必须使用运动时长变量`);
      }
      if (!/var\(--motion-(?:ease|linear)\)/u.test(value)) {
        problems.push(`${rule.header}: animation 必须使用运动缓动变量`);
      }
    }

    if (longhandDeclarations.length === 0) continue;
    const longhands = new Map(longhandDeclarations.map(({ property, value }) => [property, value]));
    const animationName = longhands.get('animation-name');

    if (!animationName) {
      problems.push(`${rule.header}: animation longhand 必须与 animation-name 成组声明`);
      continue;
    }
    if (!longhands.has('animation-duration') || !longhands.has('animation-timing-function')) {
      problems.push(`${rule.header}: animation longhand 必须包含 duration 与 timing-function`);
    }

    for (const name of splitCssList(animationName)) {
      const normalized = name.toLowerCase();
      if (normalized !== 'none' && !keyframeNames.has(normalized)) {
        problems.push(`${rule.header}: animation-name 引用了未知关键帧 ${name}`);
      }
    }

    const duration = longhands.get('animation-duration');
    if (duration && !splitCssList(duration).every((value) => /^(?:var\(--motion-(?:fast|normal|slow|loop|wave|pulse)\)|0ms)$/u.test(value))) {
      problems.push(`${rule.header}: animation-duration 不得使用硬编码时长`);
    }

    const timingFunction = longhands.get('animation-timing-function');
    if (timingFunction && !splitCssList(timingFunction).every((value) => /^var\(--motion-(?:ease|linear)\)$/u.test(value))) {
      problems.push(`${rule.header}: animation-timing-function 必须使用统一缓动变量`);
    }

    const iterationCount = longhands.get('animation-iteration-count');
    if (iterationCount && !splitCssList(iterationCount).every((value) => /^(?:1|infinite|var\(--motion-[\w-]+\))$/iu.test(value))) {
      problems.push(`${rule.header}: animation-iteration-count 必须使用受控值`);
    }

    const delay = longhands.get('animation-delay');
    if (delay && !splitCssList(delay).every((value) => /^(?:0ms|var\(--motion-[\w-]+\))$/u.test(value))) {
      problems.push(`${rule.header}: animation-delay 不得使用硬编码延迟`);
    }
  }

  return problems;
}

function getKeyframeProblems(css) {
  const problems = [];
  for (const { name, block } of getKeyframes(css)) {
    for (const { property } of getDirectDeclarations(block.replace(/[{}]/gu, ';'))) {
      if (!allowedKeyframeProperties.has(property)) {
        problems.push(`@keyframes ${name} 修改了不允许的属性 ${property}`);
      }
    }
  }
  return problems;
}

function getLegacyAnimationShorthands(css) {
  return [...css.matchAll(/animation\s*:\s*([^;]+);/gu)].map((match) => match[1].trim());
}

function getLegacyKeyframeLayoutProblems(css) {
  const problems = [];
  for (const { name, block } of getKeyframes(css)) {
    for (const { property } of getDirectDeclarations(block.replace(/[{}]/gu, ';'))) {
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

  const problems = getTransitionProblems(getCssRules(css));
  assert.equal(problems.some((problem) => problem.includes('all')), true);
  assert.equal(problems.some((problem) => problem.includes('margin-inline-start')), true);
  assert.equal(problems.some((problem) => problem.includes('max-height')), true);
});

test('强化规则会捕捉旧扫描遗漏的大写和无尾分号 animation longhand', () => {
  const css = stripCssComments(`
    /* ANIMATION-NAME: ignored; ANIMATION-DURATION: 120ms; */
    .uppercase { ANIMATION-NAME: pulse; ANIMATION-DURATION: 120ms; ANIMATION-TIMING-FUNCTION: ease; }
    .no-semicolon { animation-name: pulse; animation-duration: 180ms; animation-timing-function: ease }
    @KEYFRAMES pulse { from { opacity: 0; } to { opacity: 1; } }
  `);
  const rules = getCssRules(css);
  const keyframeNames = new Set(getKeyframes(css).map(({ name }) => name.toLowerCase()));

  assert.deepEqual(getLegacyAnimationShorthands(css), [], '旧版只扫描 animation shorthand，会漏掉 longhand');
  const problems = getAnimationProblems(rules, keyframeNames);
  assert.equal(problems.filter((problem) => problem.includes('animation-duration')).length, 2);
  assert.equal(problems.filter((problem) => problem.includes('timing-function')).length, 2);
});

test('关键帧白名单会拒绝旧门禁遗漏的 background-position 与 box-shadow', () => {
  const css = stripCssComments(`
    /* @keyframes ignored { from { background-position: 0 0; } } */
    @KEYFRAMES texture { from { BACKGROUND-POSITION: 0 0; } to { box-shadow: 0 0 4px #000; } }
  `);

  assert.deepEqual(getLegacyKeyframeLayoutProblems(css), [], '旧版只拒绝布局属性，会遗漏非合成属性');
  assert.deepEqual(getKeyframeProblems(css), [
    '@keyframes texture 修改了不允许的属性 background-position',
    '@keyframes texture 修改了不允许的属性 box-shadow',
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
  const rules = files.flatMap(({ fileName, content }) => {
    return getCssRules(content).map((rule) => ({ ...rule, header: `${fileName}: ${rule.header}` }));
  });
  const problems = getTransitionProblems(rules);

  assert.deepEqual(problems, []);

  const transitions = rules.flatMap(({ declarations }) => declarations
    .filter(({ property }) => property === 'transition')
    .map(({ value }) => value));
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

test('非 reduce-motion 动画受统一变量与完整 longhand 组合约束', async () => {
  const files = await readCssFiles();
  const allCss = files.map(({ content }) => content).join('\n');
  const keyframeNames = new Set(getKeyframes(allCss).map(({ name }) => name.toLowerCase()));
  const rules = files.flatMap(({ fileName, content }) => {
    return getCssRules(content).map((rule) => ({ ...rule, header: `${fileName}: ${rule.header}` }));
  });
  const problems = getAnimationProblems(rules, keyframeNames);

  assert.deepEqual(problems, []);
});

test('所有关键帧仅修改 transform 或 opacity 合成属性', async () => {
  const files = await readCssFiles();
  const problems = files.flatMap(({ fileName, content }) => getKeyframeProblems(content)
    .map((problem) => `${fileName}: ${problem}`));

  assert.deepEqual(problems, []);
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
