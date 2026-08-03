import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getElectronPlatformPath } from '../scripts/ensure-electron-ready.mjs';

test('Electron 平台可执行路径匹配 macOS 包结构', () => {
  assert.equal(getElectronPlatformPath('darwin'), 'Electron.app/Contents/MacOS/Electron');
});

test('Electron 平台可执行路径拒绝未知平台', () => {
  assert.throws(() => getElectronPlatformPath('unknown-os'), /Electron builds are not available/);
});


test('Electron 安装脚本入口使用顶层 await 等待异步修复完成', () => {
  const script = readFileSync(new URL('../scripts/ensure-electron-ready.mjs', import.meta.url), 'utf8');
  assert.match(script, /await ensureElectronReady\(\)/);
});


test('Electron 安装脚本在 macOS 下执行本地 ad-hoc 签名', () => {
  const script = readFileSync(new URL('../scripts/ensure-electron-ready.mjs', import.meta.url), 'utf8');
  assert.match(script, /codesign/);
  assert.match(script, /--sign', '-'/);
});
