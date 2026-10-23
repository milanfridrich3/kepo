// Zero-dependency static build: copies src/ to dist/ and fails if index.html
// references a local file that does not exist.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
cpSync(src, dist, { recursive: true });

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const missing = [];
for (const [, , url] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
  if (/^(https?:|mailto:|#|data:)/.test(url)) continue;
  const file = url.split(/[?#]/)[0].replace(/^\//, '');
  if (file && !existsSync(join(dist, file))) missing.push(url);
}
if (missing.length) {
  console.error('Missing referenced files:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log('Built landing page to dist/');
