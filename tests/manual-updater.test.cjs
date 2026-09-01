const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareVersions,
  selectDmgAsset,
  buildInstallScript,
} = require('../src/main/services/manual-updater');

test('手动更新器正确比较版本并选择 DMG 资产', () => {
  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
  assert.equal(compareVersions('1.1.9', '1.2.0'), -1);
  assert.deepEqual(selectDmgAsset({ assets: [
    { name: 'miaos.zip', browser_download_url: 'https://example.invalid/a.zip' },
    { name: 'miaos.dmg', browser_download_url: 'https://example.invalid/a.dmg' },
  ] }), { name: 'miaos.dmg', browser_download_url: 'https://example.invalid/a.dmg' });
});

test('更新安装脚本先等待旧进程退出，再复制、校验并回滚替换', () => {
  const script = buildInstallScript({
    dmgPath: '/tmp/miaos.dmg',
    appPath: '/Applications/miaos.app',
    pid: 123,
    version: '2.0.0',
    scriptPath: '/tmp/miaos-update.sh',
  });
  assert.match(script, /while kill -0/);
  assert.match(script, /ditto/);
  assert.match(script, /plutil -extract CFBundleShortVersionString/);
  assert.match(script, /EXPECTED='2\.0\.0'/);
  assert.match(script, /if \[ "\$ACTUAL" != "\$EXPECTED" \]/);
  assert.match(script, /if ! mv/);
  assert.match(script, /TMP="\$APP\.new-\$PID"/);
});
