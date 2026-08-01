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
// 从 package.json 读取版本号，避免硬编码与实际版本不一致
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const DISPLAY_VERSION = PKG.version;
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

const ZIP_PATH = path.join(RELEASE, `miaos-${DISPLAY_VERSION}-arm64-mac.zip`);
const BLOCK_MAP_PATH = ZIP_PATH + '.blockmap';
const LATEST_YML = path.join(RELEASE, 'latest-mac.yml');

// Clean
step('🧹 清理旧构建');
if (fs.existsSync(MAC_DIR)) fs.rmSync(MAC_DIR, { recursive: true });
if (fs.existsSync(STAGING)) fs.rmSync(STAGING, { recursive: true });
if (fs.existsSync(DMG_PATH)) fs.rmSync(DMG_PATH);
[ZIP_PATH, BLOCK_MAP_PATH, LATEST_YML].forEach((p) => {
  if (fs.existsSync(p)) fs.rmSync(p);
});

// Build: dir (for DMG) + zip (for auto-update)
step('📦 构建应用 (electron-builder: dir + zip)');
process.chdir(ROOT);
run('npx electron-builder --mac dir zip --arm64', { cwd: ROOT });

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

// 签名后重新打包 ZIP（因为 postbuild.js 对 app 做了签名修改），然后重新生成 latest-mac.yml
step('📦 重新打包 ZIP + latest-mac.yml（签名后）');
(function repackZipAndYml() {
  const tmpZip = path.join(RELEASE, `miaos-${DISPLAY_VERSION}-arm64-mac.zip`);
  if (fs.existsSync(tmpZip)) fs.rmSync(tmpZip);
  if (fs.existsSync(tmpZip + '.blockmap')) fs.rmSync(tmpZip + '.blockmap');
  // 使用 ditto 打包 MAC_DIR 下的 miaos.app（保留资源分支和权限）
  run(`cd "${MAC_DIR}" && ditto -c -k --sequesterRsrc --keepParent miaos.app "${tmpZip}"`);

  // 生成 latest-mac.yml（electron-updater 需要）
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const zipStat = fs.statSync(tmpZip);
  // 计算 sha512
  const { createHash } = require('crypto');
  const hash = createHash('sha512');
  hash.update(fs.readFileSync(tmpZip));
  const sha512 = hash.digest('base64');

  const latestYml = `version: ${pkg.version}
files:
  - url: ${path.basename(tmpZip)}
    sha512: ${sha512}
    size: ${zipStat.size}
path: ${path.basename(tmpZip)}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;
  fs.writeFileSync(LATEST_YML, latestYml, 'utf8');
  console.log(`  写入: ${LATEST_YML}`);
})();

// Final verify
step('✅ 构建完成');
const stat = fs.statSync(DMG_PATH);
const zipStat = fs.existsSync(ZIP_PATH) ? fs.statSync(ZIP_PATH) : null;
console.log(`  DMG:   ${DMG_PATH}`);
console.log(`  大小:  ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
if (zipStat) {
  console.log(`  ZIP:   ${ZIP_PATH} (${(zipStat.size / 1024 / 1024).toFixed(1)} MB)`);
}
if (fs.existsSync(LATEST_YML)) {
  console.log(`  YML:   ${LATEST_YML}`);
}
console.log('');
console.log('  📋 安装说明:');
console.log('  1. 双击打开 DMG 文件');
console.log('  2. 双击「安装妙生.command」脚本');
console.log('  3. 在终端中按提示完成安装');
console.log('');
console.log('  🚀 发布到 GitHub Releases（用于自动更新）:');
console.log('     在 GitHub 创建 Release，将以下 3 个文件上传到同一 Release：');
console.log('       • ' + path.basename(ZIP_PATH));
console.log('       • ' + path.basename(ZIP_PATH) + '.blockmap（如有）');
console.log('       • ' + path.basename(LATEST_YML));
console.log('     并在「设置 → 更新源」中填入 your-username/your-repo');
console.log('');
