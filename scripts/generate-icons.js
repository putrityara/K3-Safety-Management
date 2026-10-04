import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal PNG generator using pure Node.js (zlib + Buffer)
function createPng(width, height, drawPixelFn) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression method: 0 (deflate)
  ihdrData[11] = 0; // Filter method: 0
  ihdrData[12] = 0; // Interlace: 0 (None)
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = createChunk('IDAT', deflated);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const buffer = Buffer.alloc(4 + 4 + length + 4);
  buffer.writeUInt32BE(length, 0);
  buffer.write(type, 4, 4, 'ascii');
  data.copy(buffer, 8);

  const crcTarget = buffer.subarray(4, 8 + length);
  const crc = crc32(crcTarget);
  buffer.writeInt32BE(crc, 8 + length);
  return buffer;
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) | 0;
}

function drawK3Icon(x, y, w, h, isMaskable = false) {
  const nx = x / w;
  const ny = y / h;

  let r = 6, g = 26, b = 45, a = 255;
  const cx = 0.5, cy = 0.5;
  const dist = Math.hypot(nx - cx, ny - cy);

  if (!isMaskable) {
    const cornerRadius = 0.22;
    const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - cornerRadius), 0);
    const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - cornerRadius), 0);
    if (Math.hypot(dx, dy) > cornerRadius) {
      return [0, 0, 0, 0];
    }
  }

  const inHorizArm = Math.abs(ny - 0.48) <= 0.06 && Math.abs(nx - 0.5) <= 0.18;
  const inVertArm = Math.abs(nx - 0.5) <= 0.06 && Math.abs(ny - 0.48) <= 0.18;
  const inShield = dist <= 0.38;
  const inRim = dist >= 0.34 && dist <= 0.38;

  if (inHorizArm || inVertArm) {
    return [255, 255, 255, 255];
  } else if (inRim) {
    return [16, 168, 117, 255];
  } else if (inShield) {
    return [7, 29, 50, 255];
  } else if (ny >= 0.82 && ny <= 0.90 && Math.abs(nx - 0.5) <= 0.28) {
    return [245, 181, 27, 255];
  }

  return [r, g, b, a];
}

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, (x, y, w, h) => drawK3Icon(x, y, w, h, false)));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, (x, y, w, h) => drawK3Icon(x, y, w, h, false)));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, (x, y, w, h) => drawK3Icon(x, y, w, h, true)));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, (x, y, w, h) => drawK3Icon(x, y, w, h, false)));
console.log('Successfully generated all PWA icons!');
