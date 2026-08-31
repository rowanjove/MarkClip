const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const colors = {
  tile: [36, 98, 61, 255],
  page: [246, 247, 243, 255],
  excerpt: [231, 188, 105, 255],
};

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return ((x - cx) ** 2) + ((y - cy) ** 2) <= radius ** 2;
}

function createIcon(size, options = {}) {
  const scale = 4;
  const hiSize = size * scale;
  const pixels = Buffer.alloc(hiSize * hiSize * 4);
  const palette = { ...colors, ...options };
  // Design on a 16px grid: a page with its middle excerpt pulled to the right.
  // Two-pixel strokes keep the mark legible at its smallest installed size.
  const unit = size / 16;
  const inRect = (x, y, left, top, right, bottom, radius = 0) =>
    insideRoundedRect(x, y, left * unit, top * unit, right * unit, bottom * unit, radius * unit);

  for (let py = 0; py < hiSize; py += 1) {
    for (let px = 0; px < hiSize; px += 1) {
      const x = (px + .5) / scale;
      const y = (py + .5) / scale;
      let color = palette.background || null;
      if (inRect(x, y, 1, 1, 15, 15, 3)) color = palette.tile;
      const pageOutline = inRect(x, y, 4, 4, 11, 12, 0.75);
      const pageOpening = inRect(x, y, 6, 6, 12, 10);
      if (pageOutline && !pageOpening) color = palette.page;
      if (inRect(x, y, 7, 7, 13, 9, 0.25)) color = palette.excerpt;
      if (color) {
        const index = (py * hiSize + px) * 4;
        pixels[index] = color[0]; pixels[index + 1] = color[1]; pixels[index + 2] = color[2]; pixels[index + 3] = color[3];
      }
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  const sampleCount = scale * scale;
  for (let y = 0; y < size; y += 1) {
    raw[(size * 4 + 1) * y] = 0;
    for (let x = 0; x < size; x += 1) {
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const source = ((y * scale + sy) * hiSize + (x * scale + sx)) * 4;
          const sampleAlpha = pixels[source + 3];
          alpha += sampleAlpha;
          red += pixels[source] * sampleAlpha;
          green += pixels[source + 1] * sampleAlpha;
          blue += pixels[source + 2] * sampleAlpha;
        }
      }
      const target = (size * 4 + 1) * y + 1 + x * 4;
      const averageAlpha = Math.round(alpha / sampleCount);
      raw[target + 3] = averageAlpha;
      if (averageAlpha > 0) {
        raw[target] = Math.round(red / alpha);
        raw[target + 1] = Math.round(green / alpha);
        raw[target + 2] = Math.round(blue / alpha);
      }
    }
  }
  return encodePng(size, raw);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const body = Buffer.concat([typeBuffer, data]);
  const crc = crc32(body);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePng(size, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

if (require.main === module) {
  for (const size of [16, 48, 128]) {
    fs.writeFileSync(path.join(root, 'icons', `icon${size}.png`), createIcon(size));
  }

  console.log('Generated excerpt mark icons at 16, 48 and 128 pixels.');
}

module.exports = { createIcon };
