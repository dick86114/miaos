#!/usr/bin/env node
/**
 * 妙生 DMG 构建脚本
 * 构建流程：electron-builder dir → 签名 → 组装 DMG 内容 → hdiutil 创建 DMG
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = path.join(ROOT, 'release');
const MAC_DIR = path.join(RELEASE, 'mac-arm64');
const APP_NAME = 'miaos.app';
const APP_PATH = path.join(MAC_DIR, APP_NAME);
const INSTALLER_SRC = path.join(ROOT, 'build/installer/安装妙生.command');
const STAGING = path.join(RELEASE, 'dmg-staging');
const DISPLAY_VERSION = '1.0.1';
const DMG_PATH = path.join(RELEASE, `miaos-${DISPLAY_VERSION}-arm64.dmg`);

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function step(msg) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${msg}`);
  console.log(`${'─'.repeat(50)}`);
}

// Clean
step('🧹 清理旧构建');
if (fs.existsSync(MAC_DIR)) fs.rmSync(MAC_DIR, { recursive: true });
if (fs.existsSync(STAGING)) fs.rmSync(STAGING, { recursive: true });
if (fs.existsSync(DMG_PATH)) fs.rmSync(DMG_PATH);

// Build
step('📦 构建应用 (electron-builder)');
process.chdir(ROOT);
run('npx electron-builder --mac dir --arm64', { cwd: ROOT });

// Sign
step('✍️  代码签名');
run(`node scripts/postbuild.js "${APP_PATH}"`, { cwd: ROOT });

// Verify app exists
if (!fs.existsSync(APP_PATH)) {
  console.error('❌ App not found at:', APP_PATH);
  process.exit(1);
}

// Assemble DMG contents
step('🗂  组装 DMG 内容');
fs.mkdirSync(STAGING, { recursive: true });

// Copy app
console.log('  复制 miaos.app...');
run(`cp -R "${APP_PATH}" "${STAGING}/"`);

// Copy installer script
console.log('  复制安装脚本...');
const installerDest = path.join(STAGING, '安装妙生.command');
fs.copyFileSync(INSTALLER_SRC, installerDest);
fs.chmodSync(installerDest, 0o755);

// Create Applications symlink
console.log('  创建 Applications 链接...');
fs.symlinkSync('/Applications', path.join(STAGING, 'Applications'));

// Create DMG
step('💿 创建 DMG');
console.log(`  输出: ${DMG_PATH}`);

// First create a read-write DMG
const RW_DMG = path.join(RELEASE, 'miaos-rw.dmg');
run(`hdiutil create -volname "妙生" -srcfolder "${STAGING}" -ov -format UDRW -fs HFS+ "${RW_DMG}"`);

// Mount it to set folder view options (optional, just convert to compressed)
run(`hdiutil convert "${RW_DMG}" -format UDZO -imagekey zlib-level=9 -o "${DMG_PATH}"`);

// Cleanup
fs.rmSync(RW_DMG);
fs.rmSync(STAGING, { recursive: true });

// Final verify
step('✅ 构建完成');
const stat = fs.statSync(DMG_PATH);
console.log(`  DMG: ${DMG_PATH}`);
console.log(`  大小: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
console.log('');
console.log('  📋 安装说明:');
console.log('  1. 双击打开 DMG 文件');
console.log('  2. 双击「安装妙生.command」脚本');
console.log('  3. 在终端中按提示完成安装');
console.log('');
