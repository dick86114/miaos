#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appPath = process.argv[2];
if (!appPath) {
  console.error('用法：node scripts/postbuild.js <miaos.app 路径>');
  process.exit(1);
}

const resolvedAppPath = path.resolve(appPath);
const entitlementsPath = path.join(process.cwd(), '.miaos-postbuild-entitlements.plist');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    fail(`${label}不存在：${targetPath}`);
  }
}

function run(command, args) {
  console.log(`  $ ${command} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) {
    fail(`${command} 无法执行：${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`${command} 失败（退出码 ${result.status}）${output ? `：\n${output}` : ''}`);
  }
  return result.stdout || '';
}

function signAndVerify(label, targetPath, { entitlements = false } = {}) {
  assertExists(targetPath, label);
  const signArgs = ['--force', '--sign', '-'];
  if (entitlements) signArgs.push('--entitlements', entitlementsPath);
  signArgs.push(targetPath);
  run('codesign', signArgs);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', targetPath]);
  console.log(`  ✅ ${label}`);
}

const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict></plist>`;

const frameworksDir = path.join(resolvedAppPath, 'Contents', 'Frameworks');
const frameworkBundles = [
  'Electron Framework.framework',
  'Mantle.framework',
  'ReactiveObjC.framework',
  'Squirrel.framework',
].map((name) => ({ label: name, targetPath: path.join(frameworksDir, name) }));
const helperApps = [
  'miaos Helper.app',
  'miaos Helper (GPU).app',
  'miaos Helper (Plugin).app',
  'miaos Helper (Renderer).app',
].map((name) => ({ label: name, targetPath: path.join(frameworksDir, name) }));

try {
  assertExists(resolvedAppPath, '主应用');
  assertExists(frameworksDir, 'Frameworks 目录');
  for (const framework of frameworkBundles) {
    assertExists(framework.targetPath, framework.label);
  }

  console.log('🔧 开始为 miaos 执行失败即停止的签名流程');
  console.log(`   主应用：${resolvedAppPath}`);

  run('xattr', ['-cr', resolvedAppPath]);
  fs.writeFileSync(entitlementsPath, entitlements, 'utf8');

  // 先签所有 Renderer/Plugin/GPU 等 Helper，再签全部 Framework，最后签主应用。
  for (const helper of helperApps) {
    signAndVerify(helper.label, helper.targetPath, { entitlements: true });
  }
  for (const framework of frameworkBundles) {
    signAndVerify(framework.label, framework.targetPath);
  }
  signAndVerify('miaos.app', resolvedAppPath, { entitlements: true });

  // 对主应用做最终整包校验，确保嵌套代码和外层签名共同有效。
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', resolvedAppPath]);
  console.log('✅ 签名与逐项验证完成');
} finally {
  fs.rmSync(entitlementsPath, { force: true });
}
