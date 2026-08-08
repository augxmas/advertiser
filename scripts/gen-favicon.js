// Generates public/favicon.png and public/favicon.ico from scratch (no external deps)
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 32, H = 32;
const rgba = new Uint8Array(W * H * 4);

function px(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  rgba[i] = r; rgba[i+1] = g; rgba[i+2] = b; rgba[i+3] = a;
}

function fillRect(x1, y1, x2, y2, r, g, b) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      px(x, y, r, g, b);
}

// Thick line (perpendicular-distance based)
function drawLine(x0, y0, x1, y1, halfW, r, g, b) {
  const dx = x1-x0, dy = y1-y0;
  const lenSq = dx*dx + dy*dy;
  const len   = Math.sqrt(lenSq);
  const pad   = Math.ceil(halfW);
  for (let y = Math.floor(Math.min(y0,y1))-pad; y <= Math.ceil(Math.max(y0,y1))+pad; y++) {
    for (let x = Math.floor(Math.min(x0,x1))-pad; x <= Math.ceil(Math.max(x0,x1))+pad; x++) {
      const vx = x+.5-x0, vy = y+.5-y0;
      const t   = (vx*dx + vy*dy) / lenSq;
      if (t < 0 || t > 1) continue;
      const perp = Math.abs(vx*dy - vy*dx) / len;
      if (perp <= halfW) px(x, y, r, g, b);
    }
  }
}

// ── Blue rounded-square background (#2563eb = 37,99,235) ──────────────────
const [BR, BG, BB] = [37, 99, 235];
const RADIUS = 6;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const cx = x+.5, cy = y+.5;
    const dx = cx < RADIUS ? RADIUS-cx : cx > W-RADIUS ? cx-(W-RADIUS) : 0;
    const dy = cy < RADIUS ? RADIUS-cy : cy > H-RADIUS ? cy-(H-RADIUS) : 0;
    if (dx*dx + dy*dy <= RADIUS*RADIUS) px(x, y, BR, BG, BB);
  }
}

// ── White M lettermark ─────────────────────────────────────────────────────
// Stroke-based M: left bar (center x=8), right bar (center x=24), V at (16,15)
// Half stroke-width = 2.25 → use 2 for solid bars, 2.25 for diagonals
fillRect(6, 3, 9,  28, 255, 255, 255); // left bar
fillRect(22, 3, 25, 28, 255, 255, 255); // right bar
drawLine(8, 3, 16, 15, 2.25, 255, 255, 255); // left diagonal
drawLine(16, 15, 24, 3, 2.25, 255, 255, 255); // right diagonal

// ── PNG encoder ────────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function mkChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crc]);
}

const scan = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  scan[y * (1 + W*4)] = 0; // filter: None
  for (let x = 0; x < W; x++) {
    const si = (y*W + x)*4;
    const di = y*(1 + W*4) + 1 + x*4;
    scan[di]   = rgba[si];
    scan[di+1] = rgba[si+1];
    scan[di+2] = rgba[si+2];
    scan[di+3] = rgba[si+3];
  }
}
const compressed = zlib.deflateSync(scan);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

const pngBuf = Buffer.concat([
  Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
  mkChunk('IHDR', ihdr),
  mkChunk('IDAT', compressed),
  mkChunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(outDir, 'favicon.png'), pngBuf);
console.log('favicon.png created (%d bytes)', pngBuf.length);

// ── ICO (PNG-inside-ICO) ───────────────────────────────────────────────────
const icoHdr = Buffer.alloc(6);
icoHdr.writeUInt16LE(0, 0); icoHdr.writeUInt16LE(1, 2); icoHdr.writeUInt16LE(1, 4);
const icoEntry = Buffer.alloc(16);
icoEntry[0] = 32; icoEntry[1] = 32;
icoEntry.writeUInt16LE(1,  4); icoEntry.writeUInt16LE(32, 6);
icoEntry.writeUInt32LE(pngBuf.length, 8);
icoEntry.writeUInt32LE(22, 12); // offset = 6 (header) + 16 (entry)
const ico = Buffer.concat([icoHdr, icoEntry, pngBuf]);
fs.writeFileSync(path.join(outDir, 'favicon.ico'), ico);
console.log('favicon.ico created (%d bytes)', ico.length);
