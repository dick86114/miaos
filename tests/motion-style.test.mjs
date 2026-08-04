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
  let result = '';
  let mode = 'normal';
  let quote = '';
  let escaped = false;

  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    const nextCharacter = css[index + 1];

    if (mode === 'comment') {
      if (character === '*' && nextCharacter === '/') {
        result += ' ';
        mode = 'normal';
        index += 1;
      } else if (character === '\n' || character === '\r') {
        result += character;
      }
      continue;
    }

    if (mode === 'string') {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        mode = 'normal';
        quote = '';
      }
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      result += ' ';
      mode = 'comment';
      index += 1;
    } else if (character === '"' || character === "'") {
      result += character;
      mode = 'string';
      quote = character;
    } else {
      result += character;
    }
  }

  return result;
}

function splitCssList(value) {
  const values = [];
  let depth = 0;
  let quote = '';
  let escaped = false;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      values.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  values.push(value.slice(start).trim());
  return values.filter(Boolean);
}

function findStructuralCharacter(css, target, start = 0, end = css.length) {
  let quote = '';
  let escaped = false;

  for (let index = start; index < end; index += 1) {
    const character = css[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === target) {
      return index;
    }
  }
  return -1;
}

function findClosingBrace(css, openingBrace) {
  let depth = 1;
  let quote = '';
  let escaped = false;

  for (let index = openingBrace + 1; index < css.length; index += 1) {
    const character = css[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitDeclarations(content) {
  const declarations = [];
  let quote = '';
  let escaped = false;
  let start = 0;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ';') {
      declarations.push(content.slice(start, index));
      start = index + 1;
    }
  }

  declarations.push(content.slice(start));
  return declarations;
}

function findDeclarationColon(content) {
  let quote = '';
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ':') {
      return index;
    }
  }
  return -1;
}

function getDirectDeclarations(content) {
  const declarations = [];

  for (const fragment of splitDeclarations(content)) {
    const colon = findDeclarationColon(fragment);
    if (colon < 0) continue;
    const rawProperty = fragment.slice(0, colon).trim();
    const property = rawProperty.toLowerCase();
    const value = fragment.slice(colon + 1).trim();
    if (!value) continue;
    if (rawProperty.includes('\\')) {
      declarations.push({ property, value, hasPropertyEscape: true });
    } else if (/^[a-z-]+$/u.test(property)) {
      declarations.push({ property, value, hasPropertyEscape: false });
    }
  }

  return declarations;
}

function findLastSemicolon(content) {
  let quote = '';
  let escaped = false;
  let lastSemicolon = -1;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ';') {
      lastSemicolon = index;
    }
  }
  return lastSemicolon;
}

function splitRuleContent(content) {
  const directFragments = [];
  const blocks = [];
  let cursor = 0;
  let nextOpeningBrace = findStructuralCharacter(content, '{', cursor);

  while (nextOpeningBrace >= 0) {
    const closingBrace = findClosingBrace(content, nextOpeningBrace);
    if (closingBrace < 0) break;

    const beforeBlock = content.slice(cursor, nextOpeningBrace);
    const lastSemicolon = findLastSemicolon(beforeBlock);
    directFragments.push(beforeBlock.slice(0, lastSemicolon + 1));
    const header = beforeBlock.slice(lastSemicolon + 1).trim();
    if (header) blocks.push({ header, content: content.slice(nextOpeningBrace + 1, closingBrace) });

    cursor = closingBrace + 1;
    nextOpeningBrace = findStructuralCharacter(content, '{', cursor);
  }

  directFragments.push(content.slice(cursor));
  return {
    directContent: directFragments.join('\n'),
    blocks,
  };
}

function parseRuleNode(header, content, contexts, result) {
  const normalizedHeader = header.trim().toLowerCase();
  if (!normalizedHeader) return;

  const keyframeMatch = header.match(/^@(?:-[a-z]+-)?keyframes\s+([\w-]+)/iu);
  if (keyframeMatch) {
    result.keyframes.push({ name: keyframeMatch[1], block: content });
    return;
  }

  const { directContent, blocks } = splitRuleContent(content);
  if (normalizedHeader.startsWith('@')) {
    for (const block of blocks) parseRuleNode(block.header, block.content, [...contexts, normalizedHeader], result);
    return;
  }

  result.rules.push({
    header: header.trim(),
    contexts,
    declarations: getDirectDeclarations(directContent),
  });
  for (const block of blocks) parseRuleNode(block.header, block.content, contexts, result);
}

function parseCss(css) {
  const result = { rules: [], keyframes: [] };
  const { blocks } = splitRuleContent(css);
  for (const block of blocks) parseRuleNode(block.header, block.content, [], result);
  return result;
}

function getCssRules(css) {
  return parseCss(css).rules;
}

function getExactReducedMotionRule(rules, selector) {
  return rules.find((rule) => rule.header === selector && isReduceMotionRule(rule));
}

const particleReducedMotionChildSelectors = [
  '.composer-particle-field.is-optimizing::before',
  '.composer-particle-field.is-optimizing::after',
  '.composer-particle-field.is-optimizing .composer-particle',
];

function assertParticleRootVisibleInReducedMotion(rules) {
  const rootRule = getExactReducedMotionRule(rules, '.composer-particle-field.is-optimizing');
  assert.notEqual(rootRule, undefined, '粒子效果必须提供精确的根层减少动态效果覆盖');
  assert.equal(
    rootRule.declarations.some(({ property, value }) => property === 'animation' && value === 'none !important'),
    true,
    '粒子根层必须停止动画',
  );
  assert.equal(
    rootRule.declarations.some(({ property, value }) => property === 'opacity' && value === '1'),
    true,
    '粒子根层必须保持可见',
  );
}

function assertParticleChildAnimationsStoppedInReducedMotion(rules) {
  for (const selector of particleReducedMotionChildSelectors) {
    const childRule = getExactReducedMotionRule(rules, selector);
    assert.notEqual(childRule, undefined, `粒子子层 ${selector} 必须提供精确的减少动态效果覆盖`);
    assert.equal(
      childRule.declarations.some(({ property, value }) => property === 'animation' && value === 'none !important'),
      true,
      `粒子子层 ${selector} 必须停止动画`,
    );
    assert.equal(
      childRule.declarations.some(({ property, value }) => property === 'transform' && value === 'none'),
      true,
      `粒子子层 ${selector} 必须重置 transform: none`,
    );
  }
}

function assertParticleReducedMotionContract(rules) {
  assertParticleRootVisibleInReducedMotion(rules);
  assertParticleChildAnimationsStoppedInReducedMotion(rules);
}

function getAtRuleBlock(css, atRule) {
  const start = css.toLowerCase().indexOf(atRule.toLowerCase());
  if (start < 0) return '';
  const openingBrace = findStructuralCharacter(css, '{', start);
  if (openingBrace < 0) return '';
  const closingBrace = findClosingBrace(css, openingBrace);
  return closingBrace < 0 ? '' : css.slice(openingBrace + 1, closingBrace);
}

function getKeyframes(css) {
  return parseCss(css).keyframes;
}

function isReduceMotionRule(rule) {
  return rule.contexts.some((context) => /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u.test(context));
}

function getRuleSelector(rule) {
  return rule.header.replace(/^[^:\n]+\.css:\s*/u, '');
}

function isGlobalReduceMotionRule(rule) {
  return getRuleSelector(rule).replace(/\s+/gu, '') === '*,*::before,*::after';
}

function isSafeReducedMotionAnimationDeclaration(rule, declaration) {
  if (!isReduceMotionRule(rule)) return false;
  if (isGlobalReduceMotionRule(rule)) {
    return (
      (declaration.property === 'animation-duration' && declaration.value === '1ms !important')
      || (declaration.property === 'animation-delay' && declaration.value === '0ms !important')
      || (declaration.property === 'animation-iteration-count' && declaration.value === '1 !important')
    );
  }
  const selector = getRuleSelector(rule);
  const isParticleLayer = selector === '.composer-particle-field.is-optimizing';
  const isParticleDecoration = [
    '.composer-particle-field.is-optimizing::before',
    '.composer-particle-field.is-optimizing::after',
    '.composer-particle-field.is-optimizing .composer-particle',
  ].includes(selector);

  if (declaration.property !== 'animation' || declaration.value !== 'none !important') return false;
  if (selector === '.composer-wave-bar::before') {
    return rule.declarations.some(({ property, value }) => property === 'transform' && value === 'translateX(0)');
  }
  if (isParticleLayer) {
    return rule.declarations.some(({ property, value }) => property === 'opacity' && value === '1');
  }
  return isParticleDecoration;
}

function getReducedMotionOverrideProblems(rules) {
  const problems = [];
  const protectedProperties = new Set([
    'animation', ...animationLonghandProperties,
    'transition', 'transition-property', 'transition-timing-function',
    'transition-duration', 'transition-delay',
  ]);

  for (const rule of rules) {
    if (!isReduceMotionRule(rule)) continue;
    for (const declaration of rule.declarations) {
      if (!protectedProperties.has(declaration.property)) continue;
      const isSafeGlobalTransition = isGlobalReduceMotionRule(rule) && (
        (declaration.property === 'transition-duration' && declaration.value === '1ms !important')
        || (declaration.property === 'transition-delay' && declaration.value === '0ms !important')
      );
      if (!isSafeReducedMotionAnimationDeclaration(rule, declaration) && !isSafeGlobalTransition) {
        problems.push(`${rule.header}: reduced-motion 中存在未批准的 ${declaration.property}`);
      }
    }
  }

  return problems;
}

function getEscapedPropertyProblems(rules) {
  return rules.flatMap((rule) => rule.declarations
    .filter(({ hasPropertyEscape }) => hasPropertyEscape)
    .map(({ property }) => `${rule.header}: 属性名不能包含 CSS escape ${property}`));
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
        if (/\bvar\s*\(/iu.test(declaration.value)) {
          problems.push(`${rule.header}: transition-property 不得使用 var`);
          continue;
        }
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
    const animationDeclarations = rule.declarations
      .filter(({ property }) => property === 'animation' || animationLonghandProperties.has(property))
      .filter((declaration) => !isSafeReducedMotionAnimationDeclaration(rule, declaration));
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
  const problems = [
    ...getEscapedPropertyProblems(rules),
    ...getTransitionProblems(rules),
  ];

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

test('嵌套容器中的全部关键帧步骤仍受合成属性白名单约束', () => {
  const css = stripCssComments(`
    @layer motion {
      @keyframes nested-safe { from { opacity: 0; } 50% { transform: translateY(0); } }
      @keyframes nested-unsafe { to { filter: blur(2px); } }
    }
  `);

  assert.deepEqual(getKeyframeProblems(css), [
    '@keyframes nested-unsafe 修改了不允许的属性 filter',
  ]);
});

test('减少动态效果容器只保留明确安全的动画与过渡覆盖', async () => {
  const files = await readCssFiles();
  const rules = files.flatMap(({ fileName, content }) => {
    return getCssRules(content).map((rule) => ({ ...rule, header: `${fileName}: ${rule.header}` }));
  });

  assert.deepEqual(getReducedMotionOverrideProblems(rules), []);
});

test('旧波浪减少动态效果只豁免精确动画覆盖并保持其他门禁', () => {
  const validCss = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      .composer-wave-bar::before {
        animation: none !important;
        transform: translateX(0);
      }
    }
  `);
  const validRules = getCssRules(validCss);
  const validKeyframeNames = new Set(getKeyframes(validCss).map(({ name }) => name.toLowerCase()));

  assert.deepEqual(getAnimationProblems(validRules, validKeyframeNames), []);
  assert.deepEqual(getReducedMotionOverrideProblems(validRules), []);

  const unsafeCss = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      .composer-wave-bar::before {
        animation: none !important;
        transform: translateX(0);
        transition-duration: 1ms !important;
        animation-duration: 1ms !important;
      }
    }
  `);
  const unsafeRules = getCssRules(unsafeCss);

  assert.deepEqual(getReducedMotionOverrideProblems(unsafeRules), [
    '.composer-wave-bar::before: reduced-motion 中存在未批准的 transition-duration',
    '.composer-wave-bar::before: reduced-motion 中存在未批准的 animation-duration',
  ]);
});

test('粒子减少动态效果白名单拒绝非粒子选择器与根层缺少可见性声明', () => {
  const css = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      .composer-particle-field.is-optimizing { animation: none !important; opacity: 1; }
      .composer-particle-field.is-optimizing::before { animation: none !important; }
      .composer-particle-field.is-optimizing::after { animation: none !important; }
      .composer-particle-field.is-optimizing .composer-particle { animation: none !important; }
      .missing-opacity { animation: none !important; }
      .unexpected { animation: none !important; }
    }
  `);
  const rules = getCssRules(css);
  const keyframeNames = new Set(getKeyframes(css).map(({ name }) => name.toLowerCase()));

  assert.deepEqual(getAnimationProblems(rules, keyframeNames), [
    '.missing-opacity: animation: none 只能用于减少动态效果规则',
    '.unexpected: animation: none 只能用于减少动态效果规则',
  ]);
  assert.deepEqual(getReducedMotionOverrideProblems(rules), [
    '.missing-opacity: reduced-motion 中存在未批准的 animation',
    '.unexpected: reduced-motion 中存在未批准的 animation',
  ]);
});

test('减少动态效果模式会精确停止粒子根层和三个子层动画', async () => {
  const pagesCss = stripCssComments(await readFile(path.join(cssDirectory, 'pages.css'), 'utf8'));

  assertParticleReducedMotionContract(getCssRules(pagesCss));
});

test('减少动态效果模式不能用粒子伪元素规则伪造根层可见性', () => {
  const css = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      .composer-particle-field.is-optimizing::before { animation: none !important; transform: none; }
      .composer-particle-field.is-optimizing::after { animation: none !important; transform: none; }
      .composer-particle-field.is-optimizing .composer-particle { animation: none !important; transform: none; }
    }
  `);

  assert.throws(
    () => assertParticleReducedMotionContract(getCssRules(css)),
    /根层减少动态效果覆盖/u,
    '只有伪元素或粒子规则时必须判定缺少根层规则',
  );
});

test('减少动态效果模式不能用根层规则替代任一粒子子层', () => {
  const css = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      .composer-particle-field.is-optimizing { animation: none !important; opacity: 1; }
      .composer-particle-field.is-optimizing::before { animation: none !important; transform: none; }
      .composer-particle-field.is-optimizing::after { animation: none !important; transform: none; }
    }
  `);

  assert.throws(
    () => assertParticleReducedMotionContract(getCssRules(css)),
    /\.composer-particle-field\.is-optimizing \.composer-particle 必须提供精确/u,
    '缺少任一粒子子层规则时不得仍通过减少动态效果契约',
  );
});

test('减少动态效果模式要求每个粒子子层同时停止动画并重置变换', () => {
  const missingTransformCss = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      .composer-particle-field.is-optimizing { animation: none !important; opacity: 1; }
      .composer-particle-field.is-optimizing::before { animation: none !important; }
      .composer-particle-field.is-optimizing::after { animation: none !important; transform: none; }
      .composer-particle-field.is-optimizing .composer-particle { animation: none !important; transform: none; }
    }
  `);
  const missingAnimationCss = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      .composer-particle-field.is-optimizing { animation: none !important; opacity: 1; }
      .composer-particle-field.is-optimizing::before { animation: none !important; transform: none; }
      .composer-particle-field.is-optimizing::after { transform: none; }
      .composer-particle-field.is-optimizing .composer-particle { animation: none !important; transform: none; }
    }
  `);

  assert.throws(
    () => assertParticleReducedMotionContract(getCssRules(missingTransformCss)),
    /::before 必须重置 transform: none/u,
    '缺少 transform: none 时不得仍通过减少动态效果契约',
  );
  assert.throws(
    () => assertParticleReducedMotionContract(getCssRules(missingAnimationCss)),
    /::after 必须停止动画/u,
    '缺少 animation: none !important 时不得仍通过减少动态效果契约',
  );
});

test('全局减少动态效果模式会缩短过渡并停止循环动画', async () => {
  const themeCss = stripCssComments(await readFile(path.join(cssDirectory, 'theme.css'), 'utf8'));
  const reduceMotion = getAtRuleBlock(themeCss, '@media (prefers-reduced-motion: reduce)');

  assert.notEqual(reduceMotion, '', '必须提供 prefers-reduced-motion 全局覆盖');
  assert.match(reduceMotion, /transition-duration:\s*1ms\s*!important\s*;/u);
  assert.match(reduceMotion, /animation-duration:\s*1ms\s*!important\s*;/u);
  assert.match(reduceMotion, /animation-iteration-count:\s*1\s*!important\s*;/u);
});

test('字符串中的注释起始符不会吞掉后续 transition-property 规则', () => {
  const css = stripCssComments(`
    .content::before { content: "/*"; }
    .escaped::before { content: "已转义 \\" /*"; }
    .after { transition-property: ALL; }
    /* 实际注释 */
  `);
  const problems = getTransitionProblems(getCssRules(css));

  assert.equal(problems.some((problem) => problem.includes('transition-property 使用 all')), true);
});

test('通用容器 at-rule 内的硬编码 animation 与 transition-property all 都会被发现', () => {
  const css = stripCssComments(`
    @supports (display: grid) {
      .bad-animation { animation: pulse 120ms ease; }
    }
    @container card (width > 20rem) {
      .bad-transition { transition-property: all; }
    }
    @keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
  `);
  const rules = getCssRules(css);
  const keyframeNames = new Set(getKeyframes(css).map(({ name }) => name.toLowerCase()));

  assert.equal(rules.some((rule) => rule.header === '.bad-animation'), true);
  assert.equal(rules.some((rule) => rule.header === '.bad-transition'), true);
  assert.equal(getAnimationProblems(rules, keyframeNames).some((problem) => problem.includes('必须使用运动时长变量')), true);
  assert.equal(getTransitionProblems(rules).some((problem) => problem.includes('transition-property 使用 all')), true);
});

test('嵌套容器内受控 animation longhand 通过且无尾分号仍会解析', () => {
  const css = stripCssComments(`
    @layer motion {
      @supports (display: grid) {
        .valid {
          animation-name: pulse;
          animation-duration: var(--motion-fast);
          animation-timing-function: var(--motion-ease)
        }
      }
    }
    @keyframes pulse { from { opacity: 0; } to { transform: translateY(0); } }
  `);
  const rules = getCssRules(css);
  const keyframeNames = new Set(getKeyframes(css).map(({ name }) => name.toLowerCase()));

  assert.equal(rules.some((rule) => rule.header === '.valid'), true);
  assert.deepEqual(getAnimationProblems(rules, keyframeNames), []);
});

test('嵌套 selector 保持独立规则，不会被父规则当作 declaration', () => {
  const css = stripCssComments(`
    .parent {
      color: var(--ink);
      & .child { transition-property: all; }
    }
  `);
  const rules = getCssRules(css);

  assert.equal(rules.some((rule) => rule.header === '.parent'), true);
  assert.equal(rules.some((rule) => rule.header === '& .child'), true);
  assert.equal(getTransitionProblems(rules).some((problem) => problem.includes('transition-property 使用 all')), true);
});

test('nested reduced-motion 只豁免明确安全覆盖，非法 animation 仍失败', () => {
  const css = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      @supports (display: grid) {
        .bad { animation: pulse 999ms linear infinite; }
      }
    }
    @keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
  `);
  const rules = getCssRules(css);
  const keyframeNames = new Set(getKeyframes(css).map(({ name }) => name.toLowerCase()));

  assert.equal(getAnimationProblems(rules, keyframeNames).some((problem) => problem.includes('必须使用运动时长变量')), true);
});

test('声明属性名中的 CSS escape 不得绕过 transition 与 animation 门禁', () => {
  const css = stripCssComments(`
    .bad {
      transition\\2d property: all;
      animation\\2d name: pulse;
    }
    .normal { transition-property: opacity; animation-name: pulse; }
  `);
  const rules = getCssRules(css);

  assert.equal(rules.some((rule) => rule.header === '.normal'), true);
  assert.equal(getEscapedPropertyProblems(rules).length, 2);
});

test('transition-property 不能通过 var 值间接指定 all 或布局属性', () => {
  const css = stripCssComments(`
    .all { --unsafe: all; transition-property: var(--unsafe); }
    .width { --unsafe: width; transition-property: var(--unsafe); }
  `);
  const problems = getTransitionProblems(getCssRules(css));

  assert.equal(problems.filter((problem) => problem.includes('不得使用 var')).length, 2);
});

test('nested reduced-motion 中的 transition 简写不能绕过覆盖白名单', () => {
  const css = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      @supports (display: grid) {
        .bad-transition {
          transition: opacity var(--motion-slow) var(--motion-ease) !important;
        }
      }
    }
  `);

  assert.equal(
    getReducedMotionOverrideProblems(getCssRules(css)).some((problem) => problem.includes('未批准的 transition')),
    true,
  );
});

test('合法全局 reduced-motion transition 覆盖保持允许', () => {
  const css = stripCssComments(`
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        transition-duration: 1ms !important;
        transition-delay: 0ms !important;
      }
    }
  `);

  assert.deepEqual(getReducedMotionOverrideProblems(getCssRules(css)), []);
});
