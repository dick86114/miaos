function isCompletePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) return false;

  let offset = signature.length;
  let sawIhdr = false;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) return false;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buffer.length) return false;
    if (!sawIhdr) {
      if (type !== 'IHDR' || length !== 13) return false;
      sawIhdr = true;
    }
    if (type === 'IEND') return length === 0 && chunkEnd === buffer.length;
    offset = chunkEnd;
  }
  return false;
}

function isCompleteJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return false;

  let offset = 2;
  let sawSegment = false;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return false;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) return false;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9) return sawSegment && offset === buffer.length;
    if (marker === 0x00 || marker === 0xd8) return false;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > buffer.length) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return false;
    sawSegment = true;
    offset += segmentLength;
    if (marker === 0xda) {
      return sawSegment
        && buffer.length >= 2
        && buffer[buffer.length - 2] === 0xff
        && buffer[buffer.length - 1] === 0xd9;
    }
  }
  return false;
}

function isCompleteWebp(buffer) {
  if (buffer.length < 12
    || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    return false;
  }
  return buffer.readUInt32LE(4) === buffer.length - 8;
}

function isCompleteBmp(buffer) {
  if (buffer.length < 18 || buffer.subarray(0, 2).toString('ascii') !== 'BM') return false;
  const declaredSize = buffer.readUInt32LE(2);
  const pixelOffset = buffer.readUInt32LE(10);
  const dibHeaderSize = buffer.readUInt32LE(14);
  if (declaredSize !== buffer.length || dibHeaderSize < 12) return false;
  if (14 + dibHeaderSize > buffer.length) return false;
  return pixelOffset >= 14 + dibHeaderSize && pixelOffset <= buffer.length;
}

function detectImageMime(buffer, { allowBmp = false } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (isCompletePng(buffer)) return 'image/png';
  if (isCompleteJpeg(buffer)) return 'image/jpeg';
  if (isCompleteWebp(buffer)) return 'image/webp';
  if (allowBmp && isCompleteBmp(buffer)) return 'image/bmp';
  return null;
}

module.exports = {
  detectImageMime,
};
