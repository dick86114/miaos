// 交互性能基线使用固定数据，避免真实本地数据、凭据或网络请求参与测量。
import { createKeyedListRenderer } from '../../src/js/ui.js';

class BaselineNode {
  constructor(documentRef, { fragment = false } = {}) {
    this.ownerDocument = documentRef;
    this.isFragment = fragment;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this._textContent = '';
  }

  appendChild(node) {
    if (node.isFragment) {
      [...node.children].forEach((child) => this.appendChild(child));
      return node;
    }
    node.remove();
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  set textContent(value) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this._textContent = String(value);
  }

  get textContent() {
    return this._textContent;
  }
}

function createBaselineDocument() {
  const documentRef = {
    fragmentCount: 0,
    createElement() { return new BaselineNode(documentRef); },
    createDocumentFragment() {
      documentRef.fragmentCount += 1;
      return new BaselineNode(documentRef, { fragment: true });
    },
  };
  return documentRef;
}

export function createInteractionBaselineFixture() {
  return {
    history: Array.from({ length: 200 }, (_, index) => ({
      id: `history-${index + 1}`,
      image: `data:image/png;base64,fixture-${index + 1}`,
      prompt: `历史图片提示词 ${index + 1}`,
      model: 'fixture-model',
      createdAt: 1_700_000_000_000 + index,
    })),
    projects: Array.from({ length: 50 }, (_, projectIndex) => ({
      id: `project-${projectIndex + 1}`,
      name: `性能基线项目 ${projectIndex + 1}`,
      versions: Array.from({ length: 2 }, (_, versionIndex) => ({
        id: `version-${projectIndex + 1}-${versionIndex + 1}`,
        parentId: null,
        images: [],
      })),
    })),
  };
}

// 在 Node 环境重复测量稳定列表的首轮批量构造；用于趋势对比，不代替 GUI 帧率验收。
export function measureInteractionBaseline(rounds = 20) {
  const fixture = createInteractionBaselineFixture();
  const samples = [];
  let historyNodeCount = 0;
  let fragmentCount = 0;

  for (let round = 0; round < rounds; round += 1) {
    const documentRef = createBaselineDocument();
    const container = documentRef.createElement('section');
    const renderer = createKeyedListRenderer(container, {
      getKey: (item) => item.id,
      createNode: (item) => {
        const card = documentRef.createElement('article');
        card.dataset.historyId = item.id;
        card.textContent = item.prompt;
        return card;
      },
      updateNode: (node, item) => { node.textContent = item.prompt; },
    });
    const startedAt = performance.now();
    renderer.render(fixture.history);
    samples.push(performance.now() - startedAt);
    historyNodeCount = container.children.length;
    fragmentCount = documentRef.fragmentCount;
  }

  const sortedSamples = [...samples].sort((left, right) => left - right);
  const medianMs = sortedSamples[Math.floor(sortedSamples.length / 2)];
  return {
    rounds,
    medianMs: Number(medianMs.toFixed(3)),
    historyNodeCount,
    fragmentCount,
    historyCount: fixture.history.length,
    projectCount: fixture.projects.length,
    versionCount: fixture.projects.reduce((count, project) => count + project.versions.length, 0),
  };
}
