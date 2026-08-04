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

function getCompleteDivBlock(source, openingPattern, message) {
  const openingMatch = openingPattern.exec(source);
  assert.notEqual(openingMatch, null, message);

  const tagPattern = /<\/?div\b[^>]*>/gu;
  tagPattern.lastIndex = openingMatch.index;
  let depth = 0;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(source)) !== null) {
    if (tagMatch[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return {
          markup: source.slice(openingMatch.index, tagMatch.index + tagMatch[0].length),
          start: openingMatch.index,
        };
      }
    } else {
      depth += 1;
    }
  }
  assert.fail(`${message}必须正确闭合`);
}

function getComposerTextareaWrapMarkup(page, pageName) {
  return getCompleteDivBlock(
    page,
    /<div\s+class="composer-textarea-wrap">/u,
    `${pageName}必须包含 composer-textarea-wrap`,
  ).markup;
}

function getDirectChildTags(markup) {
  const tagPattern = /<\/?([a-z][\w-]*)\b[^>]*>/giu;
  const childTags = [];
  let depth = 0;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(markup)) !== null) {
    const isClosingTag = tagMatch[0].startsWith('</');
    if (isClosingTag) {
      depth -= 1;
      continue;
    }
    if (depth === 1) childTags.push(tagMatch[0]);
    if (!tagMatch[0].endsWith('/>')) depth += 1;
  }
  return childTags;
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


test('快速与项目生图均提供 1–4 张控件，并以独立批次任务入队', () => {
  const pageContracts = [
    ['快速生图页', generatePage],
    ['项目生图页', projectPage],
  ];

  for (const [pageName, page] of pageContracts) {
    assert.match(page, /id="quantity-chip"/u, `${pageName}必须提供数量选择控件`);
    assert.match(page, /id="quantity-chip-value"/u, `${pageName}必须展示当前数量`);
    assert.match(page, /data-quantity="\$\{quantity\}"/u, `${pageName}必须仅通过数量下拉选择批次`);
    assert.match(page, /currentQuantity = Number\(item\.getAttribute\('data-quantity'\)\)/u, `${pageName}必须更新当前数量`);
    assert.match(page, /queue\.enqueueBatch\(\{[\s\S]*?\}, currentQuantity\)/u, `${pageName}必须按数量创建独立任务`);
    assert.doesNotMatch(page, /\bn\s*:\s*currentQuantity\b/u, `${pageName}不得向 IPC 生图参数增加 n`);
  }
});

test('提示词优化复用共享状态绑定，快速页固定 quick 上下文且不再保留静态粒子 DOM', () => {
  const pageContracts = [
    ['生成页', generatePage, 'prompt-input'],
    ['项目页', projectPage, 'version-prompt'],
  ];

  for (const [pageName, page, textareaId] of pageContracts) {
    const textareaWrap = getComposerTextareaWrapMarkup(page, pageName);
    assert.match(textareaWrap, new RegExp(`<textarea\\b[^>]*\\bid="${textareaId}"`, 'u'), `${pageName}必须在 composer-textarea-wrap 内保留对应 textarea`);
    assert.doesNotMatch(textareaWrap, /composer-particle-field|composer-particle|particle-(?:one|two|three|four)/u, `${pageName}不得继续渲染旧粒子节点`);
    assert.doesNotMatch(page, /composer-wave-bar/u, `${pageName}不得继续使用旧波浪层`);
    assert.doesNotMatch(page, /withButtonLoading/u, `${pageName}不得再由页面局部 finally 管理优化生命周期`);
  }

  assert.match(generatePage, /createPromptOptimizationManager/u, '快速页必须创建可跨挂载保留状态的优化管理器');
  assert.match(generatePage, /createPromptFragmentOverlay/u, '快速页必须复用碎片覆盖层实现');
  assert.match(generatePage, /createPromptOptimizationPageBinding/u, '快速页必须通过统一绑定函数驱动 UI');
  assert.match(generatePage, /context:\s*'quick'/u, '快速页必须使用固定 quick 上下文');
  assert.match(projectPage, /createPromptOptimizationPageBinding/u, '项目页必须复用统一页面绑定函数');
  assert.match(projectPage, /project:\$\{projectId\}:\$\{curVer\.id\}/u, '项目页上下文必须同时包含项目和当前版本');
});

test('模型 chip 在宽屏可扩展，并为完整模型名称提供 title 语义', () => {
  const pageContracts = [
    ['生成页', generatePage],
    ['项目页', projectPage],
  ];

  for (const [pageName, page] of pageContracts) {
    assert.match(page, /class="composer-chip composer-chip--model" id="model-chip"/u, `${pageName}模型 chip 必须使用专用响应式类`);
    assert.match(page, /id="model-chip-value" title="选择模型"/u, `${pageName}模型值初始状态必须提供完整名称 title`);
    assert.match(
      page,
      /function setModelChipLabel\(label\) \{[\s\S]*?modelChipValue\.textContent = label;[\s\S]*?modelChipValue\.title = label;[\s\S]*?\}/u,
      `${pageName}模型变更必须同步更新可见文本和 title`,
    );
  }
});

test('优化中的输入文字会真实弱化，模型选择控件和下拉菜单按模型内容自然收紧', () => {
  const textareaRule = getExactCssRuleBody(pagesCss, '.composer-textarea.is-optimizing');
  const toolbarSpacerRule = getExactCssRuleBody(pagesCss, '.composer-toolbar-spacer');
  const modelChipRule = getExactCssRuleBody(pagesCss, '.composer-chip--model');
  const modelValueRule = getExactCssRuleBody(pagesCss, '.composer-chip--model .chip-value');
  const modelDropdownRule = getExactCssRuleBody(pagesCss, '.composer-chip--model .composer-dropdown--model');
  const pageContracts = [
    ['生成页', generatePage],
    ['项目页', projectPage],
  ];

  assert.notEqual(textareaRule, '', '优化中的 textarea 必须有独立视觉弱化规则');
  assert.equal(hasCssDeclaration(textareaRule, 'opacity', '0.28'), true, '真实提示词必须弱于碎片层');

  assert.notEqual(toolbarSpacerRule, '', '生成按钮前必须保留工具栏对齐占位节点');
  assert.equal(hasCssDeclaration(toolbarSpacerRule, 'flex', '0 0 auto'), true, 'spacer 不得参与模型选择控件的内容宽度分配');
  assert.equal(hasCssDeclaration(toolbarSpacerRule, 'margin-left', 'auto'), true, '生成按钮必须继续被推到工具栏右侧');

  assert.notEqual(modelChipRule, '', '模型 chip 必须定义独立宽度约束');
  assert.equal(hasCssDeclaration(modelChipRule, 'flex', '0 1 auto'), true, '模型 chip 必须按模型内容自然宽度显示，而不是吞掉整行剩余空间');
  assert.equal(hasCssDeclaration(modelChipRule, 'width', 'fit-content'), true, '模型 chip 必须贴合当前模型名称的内容宽度');
  assert.equal(hasCssDeclaration(modelChipRule, 'min-width', '0'), true, '模型 chip 必须允许在窄容器中收缩');
  assert.equal(hasCssDeclaration(modelValueRule, 'min-width', '0'), true, '模型名称必须允许在 chip 内收缩');
  assert.equal(hasCssDeclaration(modelValueRule, 'overflow', 'hidden'), true, '长模型名不得覆盖后续控件');
  assert.equal(hasCssDeclaration(modelValueRule, 'text-overflow', 'ellipsis'), true, '长模型名必须在 chip 内单行省略');
  assert.equal(hasCssDeclaration(modelValueRule, 'white-space', 'nowrap'), true, '长模型名不得换行挤压工具栏');
  assert.equal(hasCssDeclaration(modelValueRule, 'overflow', 'visible'), false, '模型名称不得以溢出方式显示');

  assert.notEqual(modelDropdownRule, '', '模型下拉菜单必须有独立宽度规则');
  assert.equal(hasCssDeclaration(modelDropdownRule, 'width', 'max-content'), true, '模型下拉菜单宽度必须由最长模型项内容决定');
  assert.equal(hasCssDeclaration(modelDropdownRule, 'min-width', '0'), true, '模型下拉菜单不得保留通用最小宽度造成冗余');
  assert.equal(hasCssDeclaration(modelDropdownRule, 'max-width', 'min(360px, calc(100vw - 24px))'), true, '超长模型名仍必须受视窗边界保护');

  for (const [pageName, page] of pageContracts) {
    assert.match(
      page,
      /openChipDropdown\(modelChip, buildModelDropdownHtml\(\), 'composer-dropdown--model'\)/u,
      `${pageName}模型下拉必须使用独立的内容宽度样式`,
    );
  }
});

test('项目页生成优先使用当前选中的供应商，不按模型 ID 跨供应商回退', () => {
  const doGenerateBlock = getEnclosedBlock(
    projectPage,
    /function doGenerate\(\) \{/u,
    '项目页必须包含 doGenerate',
  );
  const selectedProviderMatch = /providers\.find\(\(p\) => p\.id === currentProviderId\)/u.exec(doGenerateBlock);
  const modelIdFallbackMatch = /modelToProvider\.get\(editedModelId\)/u.exec(doGenerateBlock);

  assert.notEqual(selectedProviderMatch, null, '项目页生成必须优先使用下拉选中的供应商');
  assert.ok(
    !modelIdFallbackMatch || selectedProviderMatch.index < modelIdFallbackMatch.index,
    '项目页生成不得先按模型 ID 在供应商映射表中推导，避免同 ID 模型串到默认供应商',
  );
});

test('优化提示词时快速页与项目页会把其他工具栏控件交给绑定统一禁用', () => {
  const pageContracts = [
    ['生成页', generatePage],
    ['项目页', projectPage],
  ];
  for (const [pageName, page] of pageContracts) {
    const bindingBlock = getEnclosedBlock(
      page,
      /createPromptOptimizationPageBinding\(\{\s*manager: promptOptimizationManager/u,
      `${pageName}必须创建提示词优化绑定`,
    );
    assert.match(bindingBlock, /controls:\s*\[/u, `${pageName}必须把工具栏控件列表交给优化绑定`);
    assert.match(bindingBlock, /#btn-upload-image/u, `${pageName}必须禁用上传图片按钮`);
    assert.match(bindingBlock, /#model-chip/u, `${pageName}必须禁用模型选择控件`);
    assert.match(bindingBlock, /#btn-generate/u, `${pageName}必须禁用生成按钮`);
  }

  const disabledChipRule = getExactCssRuleBody(pagesCss, '.composer-chip.is-disabled');
  assert.notEqual(disabledChipRule, '', '禁用的选择控件必须拥有独立样式规则');
  assert.equal(hasCssDeclaration(disabledChipRule, 'pointer-events', 'none'), true, '禁用选择控件必须阻止点击');
  assert.equal(hasCssDeclaration(disabledChipRule, 'opacity', '0.5'), true, '禁用选择控件必须呈现置灰效果');
});

test('项目页详情预览为旧图片回退版本提示词，并携带完整衍生路径', () => {
  assert.match(
    projectPage,
    /prompt:\s*image\.prompt\s*\|\|\s*version\.prompt/u,
    '项目页详情必须回退到版本提示词，避免旧图片提示词缺失',
  );
  assert.match(
    projectPage,
    /promptChain:\s*buildProjectPromptChain\(project,\s*version\)/u,
    '项目页详情必须携带从根到父的完整衍生路径',
  );
  assert.match(
    projectPage,
    /export function buildProjectPromptChain\(project, version\)/u,
    '必须导出可独立测试的衍生路径构建函数',
  );
});

test('碎片动效在请求进行中循环经历碎裂与重组', () => {
  const fragmentRule = getExactCssRuleBody(pagesCss, `.composer-fragment,\n.prompt-fragment-overlay__fragment`);

  assert.match(fragmentRule, /animation:\s*composer-fragment-scatter\s+var\(--motion-wave\)\s+var\(--motion-ease\)\s+infinite/u);
  assert.match(pagesCss, /@keyframes\s+composer-fragment-scatter\s*\{[\s\S]*?0%,\s*100%\s*\{[\s\S]*?transform:[^;}]*translate3d\(0,\s*0,\s*0\)[\s\S]*?50%\s*\{[\s\S]*?transform:[^;}]*translate3d\(0,\s*-16px,\s*0\)/u);
});

test('碎片覆盖层裁剪在输入区内、位于交互内容下方且不拦截交互', () => {
  const fragmentOverlayRule = getExactCssRuleBody(pagesCss, `.composer-fragment-overlay,\n.prompt-fragment-overlay`);
  const foregroundRule = getExactCssRuleBody(pagesCss, `.composer-textarea,\n.composer-source-preview`);

  assert.notEqual(fragmentOverlayRule, '', '碎片覆盖层必须拥有独立 CSS 规则');
  assert.equal(hasCssDeclaration(fragmentOverlayRule, 'inset', '0'), true, '碎片覆盖层必须与输入区边界重合，不能向外扩展');
  assert.equal(hasCssDeclaration(fragmentOverlayRule, 'overflow', 'hidden'), true, '碎片覆盖层必须裁剪内部碎片，避免视觉越界');
  assert.equal(hasCssDeclaration(fragmentOverlayRule, 'z-index', '0'), true, '碎片覆盖层必须位于交互内容下方');
  assert.equal(hasCssDeclaration(fragmentOverlayRule, 'pointer-events', 'none'), true, '碎片覆盖层不得拦截交互');

  assert.notEqual(foregroundRule, '', 'textarea 与参考图预览必须共享前景层规则');
  assert.equal(hasCssDeclaration(foregroundRule, 'z-index', '1'), true, 'textarea 与参考图预览必须位于碎片覆盖层上方');
});

test('快速生图仅展示活跃队列与可分页的持久化快速历史', () => {
  assert.doesNotMatch(generatePage, /queue-result-preview/u, '生成页不得继续渲染主大图展示区');
  assert.doesNotMatch(generatePage, /data-queue-finished/u, '生成页不得继续渲染已完成任务队列');
  assert.doesNotMatch(generatePage, /finishedTaskRenderer|quickResultPreviewHtml|renderQuickResultPreview/u, '完成结果必须从队列视图中移除');

  assert.match(generatePage, /import \{ getPaginatedQuickHistory \} from '\.\.\/history-data\.js';/u, '生成页必须使用快速历史分页选择器');
  assert.match(generatePage, /getHistory,/u, '生成页必须读取持久化快速历史');
  assert.match(generatePage, /openImagePreview/u, '生成页必须复用共享图片预览组件');
  assert.match(generatePage, /data-quick-history-grid/u, '生成页必须提供快速历史卡片容器');
  assert.match(generatePage, /data-quick-history-pagination/u, '生成页必须提供快速历史分页容器');
  assert.match(generatePage, /getPaginatedQuickHistory\(getHistory\(\), \{ page: quickHistoryPage \}\)/u, '快速历史必须按选择器默认每页 12 条渲染');

  assert.match(generatePage, /const completedQuickTaskIds = new Set\(quick\.filter\(\(task\) => task\.status === 'done'\)/u, '队列完成态必须被识别以刷新历史');
  assert.match(generatePage, /renderQuickHistory\(\)/u, '发现新的完成任务后必须重新读取并渲染历史');
  assert.match(generatePage, /resultArea\.addEventListener\('click', async \(event\) =>/u, '快速历史操作必须通过结果区委托处理');
  assert.match(generatePage, /data-history-act/u, '快速历史卡片必须使用委托操作标识');
});

test('快速任务复用项目画廊占位卡片、显示批次并提供失败详情与再次生成入口', () => {
  const activeTaskCard = getEnclosedBlock(
    generatePage,
    /function activeTaskCardHtml\(task\) \{/u,
    '快速生图必须定义活跃任务卡片渲染函数',
  );

  assert.match(activeTaskCard, /gallery-item gallery-placeholder/u, '快速 queued/running 卡片必须复用项目画廊占位结构');
  assert.match(activeTaskCard, /placeholder-cover/u, '快速任务必须保留项目画廊同款占位封面');
  assert.match(activeTaskCard, /task\.batchIndex[\s\S]*task\.batchTotal/u, '快速任务卡片必须显示批次');
  assert.match(activeTaskCard, /task-failure-detail/u, '失败任务卡片必须提供查看失败详情操作');
  assert.match(activeTaskCard, /失败详情/u);
  assert.match(activeTaskCard, /task-retry/u, '失败任务卡片必须提供再次生成操作');
  assert.match(generatePage, /getQuickQueueViewState/u, '快速页必须用状态选择器区分生成中和生成失败');
  assert.match(generatePage, /queue\.retry/u, '再次生成必须复用队列重试能力');
  assert.match(generatePage, /openQuickTaskFailurePreview/u, '失败详情操作必须打开共享详情弹窗');
});
