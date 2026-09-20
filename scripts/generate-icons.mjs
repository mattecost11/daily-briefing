// Zero-dependency PNG icon generator.
// Produces solid-colour tri-band icons that echo the three dashboards:
//   top    → light blue  (#DBEAFE) — cloud
//   middle → light green (#DCFCE7) — geopolitics
//   bottom → light pink  (#FCE7F3) — investments
// A rounded dark square keeps the icon readable when tinted by iOS.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUT = resolve(__dirname, '..', 'docs', 'icons');
mkdirSync(OUT, { recursive: true });

const COLORS = {
  cloud:  [0xDB, 0xEA, 0xFE],
  geo:    [0xDC, 0xFC, 0xE7],
  invest: [0xFC, 0xE7, 0xF3],
  ink:    [0x0F, 0x17, 0x2A],
  paper:  [0xFF, 0xFF, 0xFF]
};

function pixelForFullBleed(x, y, w, h) {
  const t = y / h;
  if (t < 1 / 3) return COLORS.cloud;
  if (t < 2 / 3) return COLORS.geo;
  return COLORS.invest;
}

// Rounded-corner black plaque with white inner square containing the tri-bands.
function pixelForBadge(x, y, w, h, safePad = 0) {
  const nx = x + 0.5, ny = y + 0.5;
  // Safe area for maskable variant
  const inset = safePad * Math.min(w, h);
  const left = inset, top = inset, right = w - inset, bottom = h - inset;
  if (nx < left || nx > right || ny < top || ny > bottom) {
    return COLORS.paper;
  }
  const bw = right - left, bh = bottom - top;
  const bx = nx - left, by = ny - top;
  // Outer rounded plaque (ink)
  const r = 0.22 * Math.min(bw, bh);
  if (!inRoundedRect(bx, by, bw, bh, r)) return COLORS.paper;
  // Inner card
  const cardPad = 0.10 * Math.min(bw, bh);
  const cx1 = cardPad, cy1 = cardPad, cx2 = bw - cardPad, cy2 = bh - cardPad;
  if (bx < cx1 || bx > cx2 || by < cy1 || by > cy2) return COLORS.ink;
  const iw = cx2 - cx1, ih = cy2 - cy1;
  const ix = bx - cx1, iy = by - cy1;
  const ir = 0.14 * Math.min(iw, ih);
  if (!inRoundedRect(ix, iy, iw, ih, ir)) return COLORS.ink;
  // Tri-bands inside the card
  const t = iy / ih;
  if (t < 1 / 3) return COLORS.cloud;
  if (t < 2 / 3) return COLORS.geo;
  return COLORS.invest;
}

function inRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  if (x < r && y < r) return (r - x) ** 2 + (r - y) ** 2 <= r * r;
  if (x > w - r && y < r) return (x - (w - r)) ** 2 + (r - y) ** 2 <= r * r;
  if (x < r && y > h - r) return (r - x) ** 2 + (y - (h - r)) ** 2 <= r * r;
  if (x > w - r && y > h - r) return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r;
  return true;
}

// ---- minimal PNG encoder (RGB, 8-bit, no palette) ----

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'binary');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}
function encodePNG(width, height, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: truecolor RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // deflate/adaptive/no interlace
  const rows = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    rows[rowStart] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height);
      const i = rowStart + 1 + x * 3;
      rows[i] = r; rows[i + 1] = g; rows[i + 2] = b;
    }
  }
  const compressed = deflateSync(rows);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ---- outputs ----

function write(name, size, mode = 'badge') {
  const pixelFn =
    mode === 'fullbleed'
      ? (x, y, w, h) => pixelForFullBleed(x, y, w, h)
      : mode === 'maskable'
      ? (x, y, w, h) => pixelForBadge(x, y, w, h, 0.10)
      : (x, y, w, h) => pixelForBadge(x, y, w, h, 0);
  const buf = encodePNG(size, size, pixelFn);
  writeFileSync(resolve(OUT, name), buf);
  console.log('wrote', name, `${size}x${size}`);
}

write('icon-192.png', 192, 'badge');
write('icon-512.png', 512, 'badge');
write('icon-512-maskable.png', 512, 'maskable');
write('apple-touch-icon.png', 180, 'badge');
