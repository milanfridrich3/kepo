import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { qrMatrix, qrSvg, chooseVersion } from './qr';

test('version selection follows level M capacities', () => {
  assert.equal(chooseVersion(14), 1);     // v1-M holds 14 bytes
  assert.equal(chooseVersion(15), 2);
  assert.equal(chooseVersion(213), 10);   // v10-M holds 213 bytes
  assert.equal(chooseVersion(214), null);
});

test('matrix is square, has finder patterns and rejects oversize input', () => {
  const m = qrMatrix('kepo:i:1')!;
  assert.equal(m.length, 21);
  for (const [x, y] of [[0, 0], [14, 0], [0, 14]]) { assert.ok(m[y][x] && m[y + 6][x + 6] && m[y][x + 6] && m[y + 6][x]); assert.ok(!m[y + 1][x + 1]); assert.ok(m[y + 3][x + 3]); }
  assert.equal(qrMatrix('x'.repeat(214)), null);
});

const python = (() => { try { execFileSync('python3', ['-c', 'import cv2']); return true; } catch { return false; } })();

// Decode every rendered image with OpenCV's QRCodeDetectorAruco (independent of this encoder).
// The older cv2.QRCodeDetector fails on ~6% of perfectly valid codes (it decoded the same images at
// another scale or with the Aruco detector), so it is not used as the authority.
test('every length 1..213 plus Unicode decodes with OpenCV to exactly the encoded text', { skip: !python && 'python3 + cv2 not available' }, () => {
  const samples: string[] = ['kepo:i:1', 'https://app.kepo.is-cool.dev/items/12345', 'Příliš žluťoučký kůň úpěl ďábelské ódy', '日本語のテキスト', '🙂 emoji'];
  for (let len = 1; len <= 213; len++) {
    let t = ''; let x = len * 7919;
    while (t.length < len) { x = (x * 1103515245 + 12345) & 0x7fffffff; t += String.fromCharCode(33 + ((x >> 8) % 90)); }
    samples.push(t);
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'qr-'));
  try {
    const manifest: { file: string; text: string }[] = [];
    samples.forEach((text, i) => {
      const m = qrMatrix(text);
      assert.ok(m, text);
      const q = 4, scale = 8, n = m.length + 2 * q;
      const pix = Buffer.alloc(n * n * scale * scale, 255); // 8-bit PGM (P5): no image library needed
      for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x])
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pix[((y + q) * scale + dy) * n * scale + (x + q) * scale + dx] = 0;
      const file = path.join(dir, `q${i}.pgm`);
      writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${n * scale} ${n * scale}\n255\n`), pix]));
      manifest.push({ file, text });
    });
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    const script = `
import cv2, json, sys
d = cv2.QRCodeDetectorAruco()
bad = []
for e in json.load(open(sys.argv[1])):
    text = d.detectAndDecode(cv2.imread(e['file'], cv2.IMREAD_GRAYSCALE))[0]
    if text != e['text']: bad.append([len(e['text']), text[:30]])
print(json.dumps(bad))`;
    const out = execFileSync('python3', ['-I', '-c', script, path.join(dir, 'manifest.json')], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('svg is well formed and contains a path', () => {
  const svg = qrSvg(qrMatrix('kepo:i:1')!, 3);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29"/);
  assert.match(svg, /<path d="M/);
});
