/**
 * Minimal QR Code encoder (ISO/IEC 18004), written for Kepo labels so no dependency is needed.
 * Byte mode (UTF-8), error correction level M, versions 1 to 10 (up to 213 bytes). Pure functions.
 * Verified in qr.test.ts by decoding the rendered images with OpenCV's QRCodeDetector.
 */

// Level M tables, index = version - 1.
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const MAX_QR_VERSION = 10;

const size = (v: number) => v * 4 + 17;
function rawCodewords(v: number): number {
  let bits = 16 * v * v + 128 * v + 64;                // modules left after function patterns, version 1
  if (v >= 2) { const a = ALIGN[v - 1].length; bits -= (25 * a - 10) * a - 55; if (v >= 7) bits -= 36; }
  return bits >> 3;
}

// ---- Reed-Solomon over GF(256), polynomial 0x11D ----
const EXP = new Uint8Array(512); const LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= mul(poly[j], EXP[i]); }
    poly = next;
  }
  return poly; // highest degree first, leading 1
}
function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const rem = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ rem[0];
    rem.shift(); rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

// ---- bit helpers ----
function appendBits(bits: number[], value: number, len: number) { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); }
const utf8 = (s: string) => Array.from(new TextEncoder().encode(s));

export function chooseVersion(byteLength: number): number | null {
  for (let v = 1; v <= MAX_QR_VERSION; v++) {
    const dataCodewords = rawCodewords(v) - ECC_PER_BLOCK[v - 1] * NUM_BLOCKS[v - 1];
    const headerBits = 4 + (v >= 10 ? 16 : 8);
    if (headerBits + byteLength * 8 <= dataCodewords * 8) return v;
  }
  return null;
}

function buildCodewords(bytes: number[], v: number): number[] {
  const dataCodewords = rawCodewords(v) - ECC_PER_BLOCK[v - 1] * NUM_BLOCKS[v - 1];
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, v >= 10 ? 16 : 8);
  for (const b of bytes) appendBits(bits, b, 8);
  appendBits(bits, 0, Math.min(4, dataCodewords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < dataCodewords * 8; pad ^= 0xec ^ 0x11) appendBits(bits, pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  const nb = NUM_BLOCKS[v - 1]; const ecc = ECC_PER_BLOCK[v - 1];
  const raw = rawCodewords(v);
  const numShort = nb - (raw % nb); const shortLen = Math.floor(raw / nb);
  const blocks: number[][] = []; const eccs: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - ecc + (i < numShort ? 0 : 1);
    const d = data.slice(k, k + len); k += len;
    blocks.push(d); eccs.push(rsRemainder(d, ecc));
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[nb - 1].length; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecc; i++) for (const e of eccs) out.push(e[i]);
  return out;
}

// ---- matrix ----
type Grid = boolean[][];
function makeGrids(v: number) {
  const s = size(v);
  const modules: Grid = Array.from({ length: s }, () => new Array(s).fill(false));
  const isFunc: Grid = Array.from({ length: s }, () => new Array(s).fill(false));
  const set = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; isFunc[y][x] = true; };

  for (let i = 0; i < s; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }          // timing
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= s || y >= s) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(s - 4, 3); finder(3, s - 4);
  const pos = ALIGN[v - 1];
  for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  return { s, modules, isFunc, set };
}

function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;                 // ECC level M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function versionBits(v: number): number {
  let rem = v;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (v << 12) | rem;
}

function drawFormat(g: ReturnType<typeof makeGrids>, mask: number, v: number) {
  const { s, set } = g; const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(s - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, s - 15 + i, bit(i));
  set(8, s - 8, true);                              // always-dark module
  if (v >= 7) {
    const vb = versionBits(v);
    for (let i = 0; i < 18; i++) {
      const dark = ((vb >>> i) & 1) === 1; const a = s - 11 + (i % 3); const b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }
}

function placeData(g: ReturnType<typeof makeGrids>, codewords: number[]) {
  const { s, modules, isFunc } = g;
  let i = 0; const total = codewords.length * 8;
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < s; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j; const upward = ((right + 1) & 2) === 0; const y = upward ? s - 1 - vert : vert;
      if (!isFunc[y][x] && i < total) { modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalty(m: Grid): number {
  const s = m.length; let p = 0;
  const run = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < s; a++) {
      let len = 1;
      for (let b = 1; b < s; b++) {
        if (get(a, b) === get(a, b - 1)) { len++; if (len === 5) p += 3; else if (len > 5) p++; } else len = 1;
      }
      // finder-like patterns 1:1:3:1:1 with 4 light modules on either side
      for (let b = 0; b + 10 < s; b++) {
        const w = (k: number) => get(a, b + k);
        const core = w(0) && !w(1) && w(2) && w(3) && w(4) && !w(5) && w(6);
        if (core && ((!w(7) && !w(8) && !w(9) && !w(10)) )) p += 40;
        const core2 = w(4) && !w(5) && w(6) && w(7) && w(8) && !w(9) && w(10);
        if (core2 && !w(0) && !w(1) && !w(2) && !w(3)) p += 40;
      }
    }
  };
  run((y, x) => m[y][x]); run((x, y) => m[y][x]);
  for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  let dark = 0; for (const row of m) for (const c of row) if (c) dark++;
  p += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
  return p;
}

/** The QR matrix (true = dark) for `text`, or null when it does not fit in version 10 (213 bytes). */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = utf8(text);
  const v = chooseVersion(bytes.length);
  if (v === null) return null;
  const codewords = buildCodewords(bytes, v);
  let best: Grid | null = null; let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = makeGrids(v);
    drawFormat(g, 0, v);                       // reserve the format/version areas so data skips them
    placeData(g, codewords);
    for (let y = 0; y < g.s; y++) for (let x = 0; x < g.s; x++) if (!g.isFunc[y][x] && MASKS[mask](x, y)) g.modules[y][x] = !g.modules[y][x];
    drawFormat(g, mask, v);
    const p = penalty(g.modules);
    if (p < bestPenalty) { bestPenalty = p; best = g.modules; }
  }
  return best;
}

/** SVG markup (black on white, with the 4-module quiet zone the standard requires). */
export function qrSvg(matrix: boolean[][], pixelsPerModule = 4): string {
  const n = matrix.length; const q = 4; const total = n + q * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) d += `M${x + q},${y + q}h1v1h-1z`;
  const px = total * pixelsPerModule;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
