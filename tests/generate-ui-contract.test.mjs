import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [generatePage, projectPage, icons, pagesCss] = await Promise.all([
  readFile(new URL('../src/js/pages/generate.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/pages/project.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/icons.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8'),
]);

test('生成入口使用向下箭头，明确结果会出现在编辑器下方', () => {
  assert.match(icons, /'arrow-down':/u);
  assert.match(generatePage, /icon\('arrow-down', 20\)/u);
  assert.match(projectPage, /icon\('arrow-down', 20\)/u);
  assert.doesNotMatch(generatePage, /icon\('arrow-up', 20\)/u);
  assert.doesNotMatch(projectPage, /icon\('arrow-up', 20\)/u);
});

test('没有活跃任务时，队列区的 hidden 属性必须压过默认 flex 布局', () => {
  assert.match(pagesCss, /\.queue-section\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/u);
});

function findMatchingBrace(source, openingBraceIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
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

function getEnclosedBlock(source, openingPattern, message) {
  const openingMatch = openingPattern.exec(source);
  assert.notEqual(openingMatch, null, message);
  const openingBraceIndex = source.indexOf('{', openingMatch.index);
  const closingBraceIndex = findMatchingBrace(source, openingBraceIndex);
  assert.notEqual(closingBraceIndex, -1, `${message}必须正确闭合`);
  return source.slice(openingBraceIndex + 1, closingBraceIndex);
}

function getComposerTextareaWrapMarkup(page, pageName) {
  const openingMatch = /<div\s+class="composer-textarea-wrap">/u.exec(page);
  assert.notEqual(openingMatch, null, `${pageName}必须包含 composer-textarea-wrap`);

  const tagPattern = /<\/?div\b[^>]*>/gu;
  tagPattern.lastIndex = openingMatch.index;
  let depth = 0;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(page)) !== null) {
    if (tagMatch[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return page.slice(openingMatch.index, tagMatch.index + tagMatch[0].length);
    } else {
      depth += 1;
    }
  }
  assert.fail(`${pageName}的 composer-textarea-wrap 必须正确闭合`);
}

function getExactCssRuleBody(css, selector) {
  const normalizedTarget = selector.replace(/\s+/gu, ' ').trim();
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const rulePattern = /([^{}]+)\{([^{}]*)\}/gu;
  let match;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    if (match[1].replace(/\s+/gu, ' ').trim() === normalizedTarget) return match[2];
  }
  return '';
}

function hasCssDeclaration(ruleBody, property, value) {
  return ruleBody.split(';').some((declaration) => {
    const [rawProperty, rawValue] = declaration.split(':');
    return rawProperty?.trim() === property && rawValue?.trim() === value;
  });
}

test('提示词优化使用位于输入区底层的粒子层并移除旧波浪层', () => {
  const pageContracts = [
    ['生成页', generatePage, 'prompt-input'],
    ['项目页', projectPage, 'version-prompt'],
  ];

  for (const [pageName, page, textareaId] of pageContracts) {
    const textareaWrap = getComposerTextareaWrapMarkup(page, pageName);
    const particleMatch = /<div\s+class="composer-particle-field"\s+aria-hidden="true">/u.exec(textareaWrap);
    const textareaMatch = new RegExp(`<textarea\\b[^>]*\\bid="${textareaId}"`, 'u').exec(textareaWrap);
    const particleNodes = [...textareaWrap.matchAll(/<span\s+class="composer-particle\s+particle-(?:one|two|three|four)"><\/span>/gu)];

    assert.notEqual(particleMatch, null, `${pageName}粒子层必须位于 composer-textarea-wrap 内并标记 aria-hidden`);
    assert.notEqual(textareaMatch, null, `${pageName}必须在 composer-textarea-wrap 内保留对应 textarea`);
    assert.ok(particleMatch.index < textareaMatch.index, `${pageName}粒子层必须位于对应 textarea 前`);
    assert.equal(particleNodes.length, 4, `${pageName}粒子层必须包含 4 个 composer-particle 节点`);

    const optimizeHandler = getEnclosedBlock(
      page,
      /btnOptimize\.addEventListener\('click', async \(\) => \{/u,
      `${pageName}必须定义提示词优化处理器`,
    );
    const finallyBlock = getEnclosedBlock(
      optimizeHandler,
      /finally\s*\{/u,
      `${pageName}提示词优化处理器必须包含 finally`,
    );

    assert.match(optimizeHandler, /particleField\.classList\.add\('is-optimizing'\)/u, `${pageName}优化开始时必须激活粒子层`);
    assert.match(finallyBlock, /particleField\.classList\.remove\('is-optimizing'\)/u, `${pageName}必须在 finally 中停用粒子层`);
    assert.doesNotMatch(page, /composer-wave-bar/u, `${pageName}不得继续使用旧波浪层`);
  }
});

test('粒子层 CSS 保持在文字下方且不会拦截交互', () => {
  const particleFieldRule = getExactCssRuleBody(pagesCss, '.composer-particle-field');
  const foregroundRule = getExactCssRuleBody(pagesCss, '.composer-textarea,\n.composer-source-preview');
  const pseudoElementsRule = getExactCssRuleBody(pagesCss, '.composer-particle-field::before,\n.composer-particle-field::after');
  const particleRule = getExactCssRuleBody(pagesCss, '.composer-particle');

  assert.notEqual(particleFieldRule, '', '粒子层必须拥有独立 CSS 规则');
  assert.equal(hasCssDeclaration(particleFieldRule, 'z-index', '0'), true, '粒子层必须位于 z-index: 0');
  assert.equal(hasCssDeclaration(particleFieldRule, 'pointer-events', 'none'), true, '粒子层不得拦截交互');

  assert.notEqual(foregroundRule, '', 'textarea 与参考图预览必须共享前景层规则');
  assert.equal(hasCssDeclaration(foregroundRule, 'z-index', '1'), true, 'textarea 与参考图预览必须位于 z-index: 1');

  assert.notEqual(pseudoElementsRule, '', '粒子层伪元素必须拥有精确规则');
  assert.equal(hasCssDeclaration(pseudoElementsRule, 'pointer-events', 'none'), true, '粒子层伪元素不得拦截交互');

  assert.notEqual(particleRule, '', '粒子节点必须拥有独立 CSS 规则');
  assert.equal(hasCssDeclaration(particleRule, 'pointer-events', 'none'), true, '粒子节点不得拦截交互');
});
