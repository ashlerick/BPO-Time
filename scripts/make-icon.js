// Draws the app icon (assets/icon.png, 256x256) from the same design as the tray icon in src/main.ts:
// a gold clock on a portal-green rounded square. electron-builder turns the PNG into the Windows .ico.
// Run: node scripts/make-icon.js     Replace assets/icon.png with real artwork whenever there is some.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 256;
const K = SIZE / 32; // the tray icon is drawn on a 32 px grid; everything here scales from it
const SS = 3;

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const c = SIZE / 2;
const inSquare = (x, y) => {
  const r = 9 * K;
  const dx = Math.max(r - x, 0, x - (SIZE - r));
  const dy = Math.max(r - y, 0, y - (SIZE - r));
  return dx * dx + dy * dy <= r * r;
};
const isGold = (x, y) => {
  const d = Math.hypot(x - c, y - c);
  if (d >= 10 * K && d <= 12.5 * K) return true; // ring
  if (d <= 2 * K) return true; // centre
  if (Math.abs(x - c) <= 1.1 * K && y <= c && y >= c - 8.5 * K) return true; // minute hand
  if (Math.abs(y - c) <= 1.1 * K && x >= c && x <= c + 6.5 * K) return true; // hour hand
  return false;
};

const rows = [];
for (let py = 0; py < SIZE; py++) {
  const row = Buffer.alloc(1 + SIZE * 4);
  for (let px = 0; px < SIZE; px++) {
    let bg = 0;
    let fg = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = px + (sx + 0.5) / SS;
        const y = py + (sy + 0.5) / SS;
        if (inSquare(x, y)) {
          bg++;
          if (isGold(x, y)) fg++;
        }
      }
    }
    const t = bg ? fg / bg : 0;
    const g = (px + py) / (2 * (SIZE - 1));
    const base = [0x1f + (0x0d - 0x1f) * g, 0xa7 + (0x47 - 0xa7) * g, 0x63 + (0x2e - 0x63) * g];
    const gold = [0xfb, 0xbf, 0x24];
    const o = 1 + px * 4;
    for (let k = 0; k < 3; k++) row[o + k] = Math.round(base[k] + (gold[k] - base[k]) * t);
    row[o + 3] = Math.round((bg / (SS * SS)) * 255);
  }
  rows.push(row);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
  chunk("IEND", Buffer.alloc(0)),
]);
const out = path.join(__dirname, "..", "assets", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log("wrote " + out + " (" + png.length + " bytes)");
