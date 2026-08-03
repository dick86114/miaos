// 更新日志只允许有限 Markdown 结构；所有文本均通过 textContent 渲染，绝不执行或拼接原始 HTML。

function normalizeMarkdown(markdown) {
  if (Array.isArray(markdown)) {
    return markdown
      .map((item) => (typeof item === 'string' ? item : item?.note || ''))
      .join('\n\n');
  }
  if (typeof markdown === 'string') return markdown;
  if (markdown === undefined || markdown === null) return '';
  try {
    return String(markdown);
  } catch {
    return '';
  }
}

function stripRawHtml(value) {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, '');
}

function parseHttpsUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || !/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function parseLinkDestination(value) {
  const source = String(value || '').trim();
  const destination = source.startsWith('<') && source.endsWith('>')
    ? source.slice(1, -1)
    : source.split(/\s+/, 1)[0];
  return parseHttpsUrl(destination);
}

function parseInline(value) {
  const text = stripRawHtml(value);
  const content = [];
  const linkPattern = /\[([^\]\n]+)\]\(([^\n)]*)\)/g;
  let cursor = 0;
  let match;

  while ((match = linkPattern.exec(text))) {
    if (match.index > cursor) {
      content.push({ type: 'text', value: text.slice(cursor, match.index) });
    }

    const label = stripRawHtml(match[1]);
    const url = parseLinkDestination(match[2]);
    if (url) {
      content.push({ type: 'link', text: label, url });
    } else if (label) {
      content.push({ type: 'text', value: label });
    }
    cursor = linkPattern.lastIndex;
  }

  if (cursor < text.length) {
    content.push({ type: 'text', value: text.slice(cursor) });
  }
  return content.filter((part) => (part.type === 'link' ? part.text : part.value));
}

/**
 * 将更新日志解析为可安全渲染的有限结构。
 * Block 类型只可能为 paragraph、heading、list、code；链接仅存在于文本内容中。
 */
export function parseReleaseNotes(markdown) {
  const lines = normalizeMarkdown(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let listItems = [];
  let codeLines = null;

  const closeList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems });
      listItems = [];
    }
  };

  const closeCode = () => {
    if (codeLines !== null) {
      blocks.push({ type: 'code', value: codeLines.join('\n') });
      codeLines = null;
    }
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (codeLines === null) {
        closeList();
        codeLines = [];
      } else {
        closeCode();
      }
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        content: parseInline(heading[2]),
      });
      continue;
    }

    const listItem = line.match(/^\s*(?:[-*+] |\d+\. )(.+)$/);
    if (listItem) {
      listItems.push(parseInline(listItem[1]));
      continue;
    }

    closeList();
    const content = parseInline(line);
    if (content.length > 0) blocks.push({ type: 'paragraph', content });
  }

  closeCode();
  closeList();
  return blocks;
}

function appendInlineContent(element, content) {
  for (const part of content) {
    if (part.type === 'link') {
      const href = parseHttpsUrl(part.url);
      if (!href) continue;
      const anchor = document.createElement('a');
      anchor.textContent = part.text;
      anchor.setAttribute('href', href);
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
      element.appendChild(anchor);
      continue;
    }

    const text = document.createElement('span');
    text.textContent = part.value;
    element.appendChild(text);
  }
}

/**
 * 使用 DOM API 安全渲染更新日志，不接受原始 HTML。
 */
export function renderReleaseNotes(container, markdown) {
  if (!container || typeof container.replaceChildren !== 'function') return;
  const nodes = [];

  for (const block of parseReleaseNotes(markdown)) {
    if (block.type === 'heading') {
      const heading = document.createElement(`h${Math.min(Math.max(block.level, 1), 6)}`);
      appendInlineContent(heading, block.content);
      nodes.push(heading);
    } else if (block.type === 'paragraph') {
      const paragraph = document.createElement('p');
      appendInlineContent(paragraph, block.content);
      nodes.push(paragraph);
    } else if (block.type === 'list') {
      const list = document.createElement('ul');
      for (const item of block.items) {
        const listItem = document.createElement('li');
        appendInlineContent(listItem, item);
        list.appendChild(listItem);
      }
      nodes.push(list);
    } else if (block.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = block.value;
      pre.appendChild(code);
      nodes.push(pre);
    }
  }

  container.replaceChildren(...nodes);
}
