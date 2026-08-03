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

test('pnpm 安装允许 Electron 构建脚本', () => {
  assert.deepEqual(pkg.pnpm?.onlyBuiltDependencies, ['electron']);
});


test('安装后验证会补齐 Electron 可执行入口', () => {
  assert.equal(pkg.scripts.postinstall, 'node scripts/ensure-electron-ready.mjs');
  assert.equal(existsSync(new URL('../scripts/ensure-electron-ready.mjs', import.meta.url)), true);
});
