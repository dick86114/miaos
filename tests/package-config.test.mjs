import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/build-dmg.yml', import.meta.url), 'utf8');
const mainProcess = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const postbuild = readFileSync(new URL('../scripts/postbuild.js', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

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


test('发布配置仅面向 macOS 12+ Apple Silicon，且构建会严格验证签名与架构', () => {
  assert.equal(pkg.build?.mac?.minimumSystemVersion, '12.0.0');
  const targetArchitectures = pkg.build.mac.target.flatMap((target) => target.arch);
  assert.deepEqual([...new Set(targetArchitectures)], ['arm64']);
  assert.match(readme, /macOS 12[+＋]（Apple Silicon(?:，arm64)?）/);
  assert.doesNotMatch(readme, /Intel/i);

  assert.doesNotMatch(mainProcess, /verifyUpdateCodeSignature\s*=\s*false/);
  assert.match(postbuild, /Electron Framework\.framework/);
  assert.match(postbuild, /Mantle\.framework/);
  assert.match(postbuild, /ReactiveObjC\.framework/);
  assert.match(postbuild, /Squirrel\.framework/);
  assert.match(postbuild, /miaos Helper\.app/);
  assert.match(postbuild, /miaos Helper \(GPU\)\.app/);
  assert.match(postbuild, /miaos Helper \(Plugin\)\.app/);
  assert.match(postbuild, /miaos Helper \(Renderer\)\.app/);
  assert.match(postbuild, /--verify[\s\S]*--deep[\s\S]*--strict/);
  assert.doesNotMatch(postbuild, /return e\.stderr \|\| e\.stdout \|\| ''/);

  assert.match(workflow, /codesign --verify --deep --strict release\/mac-arm64\/miaos\.app/);
  assert.match(workflow, /file release\/mac-arm64\/miaos\.app\/Contents\/MacOS\/miaos \| grep arm64/);
});
