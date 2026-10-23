import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from './en';
import { cs } from './cs';
import { placeholdersOf, tagsOf, REQUIRED_PLURALS } from './core';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enKeys = Object.keys(en);
const csRecord = cs as Record<string, string>;
const enRecord = en as Record<string, string>;

test('Czech defines every English key and has no stray keys', () => {
  assert.deepEqual(enKeys.filter(k => !(k in csRecord)), [], 'missing in Czech');
  const base = (k: string) => k.replace(/_(one|few|other)$/, '');
  const enBases = new Set(enKeys.map(base));
  assert.deepEqual(Object.keys(csRecord).filter(k => !enBases.has(base(k))), [], 'Czech-only keys');
});

test('plural messages have every form each language needs', () => {
  const bases = new Set(enKeys.filter(k => k.endsWith('_other')).map(k => k.slice(0, -'_other'.length)));
  assert.ok(bases.size > 5);
  for (const b of bases) {
    for (const form of REQUIRED_PLURALS.en) assert.ok(`${b}_${form}` in enRecord, `en ${b}_${form}`);
    for (const form of REQUIRED_PLURALS.cs) assert.ok(`${b}_${form}` in csRecord, `cs ${b}_${form}`);
  }
});

test('placeholders and tags match between languages; no empty strings', () => {
  for (const key of enKeys) {
    const e = enRecord[key];
    const c = csRecord[key];
    assert.ok(e.trim() && c.trim(), `${key}: empty`);
    assert.deepEqual(placeholdersOf(c), placeholdersOf(e), `${key}: placeholders differ`);
    assert.deepEqual(tagsOf(c), tagsOf(e), `${key}: tags differ`);
  }
});

test('Czech is actually translated (not copied English) for ordinary sentences', () => {
  const same = enKeys.filter(k => enRecord[k] === csRecord[k] && /[a-z]{4,} [a-z]{3,}/i.test(enRecord[k]) && !k.startsWith('common.language.'));
  assert.deepEqual(same, [], 'identical multi-word strings in en and cs');
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'i18n' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [full] : [];
  });
}

test('no hard-coded currency symbol and no locale-less date formatting in the app code', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (/Kč/.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) offenders.push(`${file}: Kč literal`);
    if (/toLocale(Date|Time)?String\(/.test(text)) offenders.push(`${file}: toLocale*String`);
  }
  assert.deepEqual(offenders.map(o => o.replace(SRC, 'src')), []);
});

test('every key used in code exists (and plural bases resolve)', () => {
  const known = new Set(enKeys.map(k => k.replace(/_(one|few|other)$/, '')));
  const missing: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b(?:t|rich)\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!known.has(m[1])) missing.push(`${path.basename(file)}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});
