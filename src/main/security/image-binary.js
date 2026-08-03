const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_DECOMPRESSED_BYTES = 100 * 1024 * 1024;
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(buffers) {
  const table = getCrcTable();
  let value = 0xffffffff;
  for (const buffer of buffers) {
    for (let index = 0; index < buffer.length; index += 1) {
      value = table[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChannels(colorType) {
  return { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType] || 0;
}

function isValidPngBitDepth(colorType, bitDepth) {
  const valid = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  return valid[colorType] && valid[colorType].includes(bitDepth);
}

function isCompletePng(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false;

  let offset = PNG_SIGNATURE.length;
  let ihdr = null;
  let sawIdat = false;
  const idatChunks = [];
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) return false;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > buffer.length) return false;
    if (crc32([type, buffer.subarray(dataStart, dataEnd)]) !== buffer.readUInt32BE(dataEnd)) return false;

    const chunkType = type.toString('ascii');
    if (!ihdr) {
      if (chunkType !== 'IHDR' || length !== 13) return false;
      const width = buffer.readUInt32BE(dataStart);
      const height = buffer.readUInt32BE(dataStart + 4);
      const bitDepth = buffer[dataStart + 8];
      const colorType = buffer[dataStart + 9];
      const compression = buffer[dataStart + 10];
      const filter = buffer[dataStart + 11];
      const interlace = buffer[dataStart + 12];
      if (!width || !height || !isValidPngBitDepth(colorType, bitDepth)
        || compression !== 0 || filter !== 0 || interlace !== 0) {
        return false;
      }
      ihdr = { width, height, bitDepth, colorType };
    } else if (chunkType === 'IDAT') {
      if (!length) return false;
      sawIdat = true;
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (chunkType === 'IEND') {
      if (length !== 0 || chunkEnd !== buffer.length || !sawIdat) return false;
      const channels = pngChannels(ihdr.colorType);
      const rowBytes = Math.ceil((ihdr.width * channels * ihdr.bitDepth) / 8);
      const decompressedLength = (rowBytes + 1) * ihdr.height;
      if (!Number.isSafeInteger(decompressedLength) || decompressedLength > MAX_PNG_DECOMPRESSED_BYTES) return false;
      let decompressed;
      try {
        decompressed = zlib.inflateSync(Buffer.concat(idatChunks), { maxOutputLength: MAX_PNG_DECOMPRESSED_BYTES });
      } catch (_) {
        return false;
      }
      if (decompressed.length !== decompressedLength) return false;
      for (let row = 0; row < ihdr.height; row += 1) {
        if (decompressed[row * (rowBytes + 1)] > 4) return false;
      }
      return true;
    }
    offset = chunkEnd;
  }
  return false;
}

function isCompleteJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return false;

  let offset = 2;
  let sawSof = false;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return false;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) return false;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0x00 || marker === 0xd8) return false;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > buffer.length) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > buffer.length) return false;

    if (SOF_MARKERS.has(marker)) {
      if (segmentLength < 8 || !buffer.readUInt16BE(offset + 3) || !buffer.readUInt16BE(offset + 5)) return false;
      sawSof = true;
    }
    if (marker === 0xda) {
      if (!sawSof || segmentLength < 6) return false;
      let scanOffset = segmentEnd;
      let sawScanByte = false;
      while (scanOffset < buffer.length) {
        const value = buffer[scanOffset];
        scanOffset += 1;
        if (value !== 0xff) {
          sawScanByte = true;
          continue;
        }
        if (scanOffset >= buffer.length) return false;
        let markerValue = buffer[scanOffset];
        scanOffset += 1;
        while (markerValue === 0xff) {
          if (scanOffset >= buffer.length) return false;
          markerValue = buffer[scanOffset];
          scanOffset += 1;
        }
        if (markerValue === 0x00) {
          sawScanByte = true;
          continue;
        }
        if (markerValue >= 0xd0 && markerValue <= 0xd7) continue;
        return markerValue === 0xd9 && sawScanByte && scanOffset === buffer.length;
      }
      return false;
    }
    offset = segmentEnd;
  }
  return false;
}

function isCompleteWebp(buffer) {
  if (buffer.length < 12
    || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
    || buffer.readUInt32LE(4) !== buffer.length - 8) {
    return false;
  }

  let offset = 12;
  let sawImageChunk = false;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) return false;
    const chunkType = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const dataEnd = offset + 8 + chunkLength;
    const paddedEnd = dataEnd + (chunkLength % 2);
    if (dataEnd < offset + 8 || paddedEnd > buffer.length) return false;
    if (chunkType === 'VP8X') {
      if (chunkLength !== 10) return false;
    } else if (chunkType === 'VP8 ') {
      if (chunkLength < 10) return false;
      sawImageChunk = true;
    } else if (chunkType === 'VP8L') {
      if (chunkLength < 5) return false;
      sawImageChunk = true;
    }
    offset = paddedEnd;
  }
  return offset === buffer.length && sawImageChunk;
}

function isCompleteBmp(buffer) {
  if (buffer.length < 26 || buffer.subarray(0, 2).toString('ascii') !== 'BM') return false;
  const declaredSize = buffer.readUInt32LE(2);
  const pixelOffset = buffer.readUInt32LE(10);
  const dibHeaderSize = buffer.readUInt32LE(14);
  if (declaredSize !== buffer.length || (dibHeaderSize !== 12 && dibHeaderSize < 40) || 14 + dibHeaderSize > buffer.length) return false;

  let width;
  let height;
  let planes;
  let bitsPerPixel;
  let compression = 0;
  if (dibHeaderSize === 12) {
    width = buffer.readUInt16LE(18);
    height = buffer.readUInt16LE(20);
    planes = buffer.readUInt16LE(22);
    bitsPerPixel = buffer.readUInt16LE(24);
  } else {
    width = buffer.readInt32LE(18);
    height = buffer.readInt32LE(22);
    planes = buffer.readUInt16LE(26);
    bitsPerPixel = buffer.readUInt16LE(28);
    compression = buffer.readUInt32LE(30);
  }
  if (width <= 0 || height <= 0 || planes !== 1 || ![1, 4, 8, 16, 24, 32].includes(bitsPerPixel)) return false;
  if (compression !== 0 && !(compression === 3 && (bitsPerPixel === 16 || bitsPerPixel === 32))) return false;

  const rowStride = Math.floor(((width * bitsPerPixel + 31) / 32)) * 4;
  const pixelDataEnd = pixelOffset + rowStride * height;
  return Number.isSafeInteger(pixelDataEnd)
    && pixelOffset >= 14 + dibHeaderSize
    && pixelDataEnd <= buffer.length
    && pixelDataEnd <= declaredSize;
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
