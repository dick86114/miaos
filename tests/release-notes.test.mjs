import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseReleaseNotes, renderReleaseNotes } from '../src/js/release-notes.js';

const require = createRequire(import.meta.url);
const { isAllowedExternalUrl } = require('../src/main/security/external-links.js');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toLowerCase();
    this.children = [];
    this.attributes = new Map();
    this.textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function withFakeDocument(run) {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
  try {
    return run();
  } finally {
    globalThis.document = originalDocument;
  }
}

function collectNodes(node, output = []) {
  output.push(node);
  for (const child of node.children || []) collectNodes(child, output);
  return output;
}

test('更新日志不保留脚本、HTML 和危险链接', () => {
  const blocks = parseReleaseNotes([
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '[脚本](javascript:alert(1))',
    '[数据](data:text/html;base64,PHNjcmlwdD4=)',
    '[本地](file:///tmp/key)',
    '[明文](http://github.com/dick86114/miaos)',
    '[安全](https://github.com/dick86114/miaos)',
  ].join('\n'));
  const serialized = JSON.stringify(blocks);

  assert.doesNotMatch(serialized, /onerror|<script|javascript:|data:|file:|http:\/\//i);
  assert.match(serialized, /https:\/\/github\.com\/dick86114\/miaos/);
});

test('解析常见 Markdown 标题、段落、列表、代码和 GitHub 链接', () => {
  const blocks = parseReleaseNotes([
    '# 1.0.2',
    '',
    '修复更新检查问题，详见 [GitHub Release](https://github.com/dick86114/miaos/releases/tag/v1.0.2)。',
    '',
    '- 修复启动失败',
    '- 优化任务队列',
    '',
    '```bash',
    'pnpm start',
    '```',
  ].join('\n'));

  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'paragraph', 'list', 'code']);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[2].items.length, 2);
  assert.equal(blocks[3].value, 'pnpm start');
  assert.deepEqual(blocks[1].content.find((part) => part.type === 'link'), {
    type: 'link',
    text: 'GitHub Release',
    url: 'https://github.com/dick86114/miaos/releases/tag/v1.0.2',
  });
});

test('渲染更新日志只创建安全节点，不创建注入节点', () => {
  withFakeDocument(() => {
    const container = new FakeElement('div');
    renderReleaseNotes(container, [
      '# 更新',
      '',
      '<img src=x onerror=alert(1)> [安全](https://github.com/dick86114/miaos)',
      '',
      '- 项目一',
      '',
      '```',
      '<script>alert(1)</script>',
      '```',
    ].join('\n'));

    const nodes = collectNodes(container);
    const tags = nodes.map((node) => node.tagName);
    assert.deepEqual(tags.filter((tag) => ['script', 'img', 'iframe', 'object'].includes(tag)), []);
    assert.equal(nodes.some((node) => [...node.attributes.keys()].some((name) => name.startsWith('on'))), false);

    const link = nodes.find((node) => node.tagName === 'a');
    assert.equal(link.getAttribute('href'), 'https://github.com/dick86114/miaos');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    assert.doesNotMatch(JSON.stringify(nodes), /onerror|javascript:/i);
  });
});

test('更新日志渲染器不使用 innerHTML', () => {
  const source = readFileSync(new URL('../src/js/release-notes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.innerHTML\b/);
});

test('渲染层 CSP 禁止内联脚本并限制页面能力', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /img-src 'self' data: blob: file:/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
});

test('外部链接仅允许精确白名单 HTTPS 主机', () => {
  for (const url of [
    'https://github.com/dick86114/miaos',
    'https://www.github.com/dick86114/miaos',
    'https://grsai.ai/',
    'https://www.grsai.ai/',
  ]) {
    assert.equal(isAllowedExternalUrl(url), true, url);
  }

  for (const url of [
    'http://github.com/dick86114/miaos',
    'javascript:alert(1)',
    'data:text/html,alert(1)',
    'file:///tmp/key',
    'https://evil.github.com/',
    'https://github.com.evil.example/',
    'https://github.com@evil.example/',
    'https://evil.example@github.com/',
    'https://github.com:444/',
    'https://github.com./',
    ' https://github.com/',
    'https:%2f%2fgithub.com/',
  ]) {
    assert.equal(isAllowedExternalUrl(url), false, url);
  }
});
