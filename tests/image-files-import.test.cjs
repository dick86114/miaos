const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createImageFileAccess } = require('../src/main/security/image-files');
const { REAL_IMAGE_BYTES } = require('./image-fixtures.cjs');

test('导入选中的参考图后返回 generated 目录内的持久化副本', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-image-import-'));
  const externalPath = path.join(home, 'reference.png');
  fs.writeFileSync(externalPath, REAL_IMAGE_BYTES.png);

  try {
    const access = createImageFileAccess({
      fsImpl: fs,
      pathImpl: path,
      getUserDataPath: () => fs.realpathSync(home),
      decodeImageBuffer: async () => null,
    });

    const importedPath = await access.importPickedImage(externalPath);

    assert.ok(importedPath.startsWith(fs.realpathSync(path.join(home, 'generated')) + path.sep));
    assert.notEqual(importedPath, externalPath);
    assert.deepEqual(fs.readFileSync(importedPath), REAL_IMAGE_BYTES.png);
    assert.match(await access.readSourceImageAsDataUrl(importedPath), /^data:image\/png;base64,/u);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
