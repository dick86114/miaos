import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/build-dmg.yml', import.meta.url), 'utf8');

test('项目统一使用 pnpm', () => {
  assert.equal(pkg.packageManager, 'pnpm@10.33.3');
  assert.equal(pkg.scripts.test, 'node --test tests');
  assert.equal(pkg.scripts.check, 'pnpm test');
  assert.equal(existsSync(new URL('../package-lock.json', import.meta.url)), false);
  assert.equal(existsSync(new URL('../pnpm-lock.yaml', import.meta.url)), true);
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.doesNotMatch(workflow, /npm ci|npm run/);
});

test('pnpm 安装允许官方 Electron 构建脚本', () => {
  assert.deepEqual(pkg.pnpm?.onlyBuiltDependencies, ['electron']);
});

test('Electron 使用受支持稳定版本且不使用自定义 postinstall 兜底', () => {
  assert.equal(pkg.devDependencies.electron, '43.2.0');
  assert.equal('postinstall' in pkg.scripts, false);
  assert.equal(existsSync(new URL('../scripts/ensure-electron-ready.mjs', import.meta.url)), false);
});
