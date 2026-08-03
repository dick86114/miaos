const { app, nativeImage } = require('electron');
const { REAL_IMAGE_BYTES, FAKE_IMAGE_BYTES } = require('../image-fixtures.cjs');

const fixtures = {
  png: REAL_IMAGE_BYTES.png,
  baselineJpeg: REAL_IMAGE_BYTES.jpeg,
  progressiveJpeg: REAL_IMAGE_BYTES.progressiveJpeg,
  adam7Png: REAL_IMAGE_BYTES.adam7Png,
  webp: REAL_IMAGE_BYTES.webp,
  normalBmp: REAL_IMAGE_BYTES.bmp,
  topDownBmp: REAL_IMAGE_BYTES.topDownBmp,
  missingPltePng: FAKE_IMAGE_BYTES.missingPltePng,
  invalidSofSosJpeg: FAKE_IMAGE_BYTES.invalidSofSosJpeg,
  zeroVp8Webp: FAKE_IMAGE_BYTES.zeroVp8Webp,
  invalidBitfieldsBmp: FAKE_IMAGE_BYTES.invalidBitfieldsBmp,
};

const results = {};
for (const [name, buffer] of Object.entries(fixtures)) {
  const image = nativeImage.createFromBuffer(buffer);
  const size = image.getSize();
  results[name] = {
    empty: image.isEmpty(),
    width: size.width,
    height: size.height,
  };
}

process.stdout.write(`${JSON.stringify(results)}\n`);
app.quit();
