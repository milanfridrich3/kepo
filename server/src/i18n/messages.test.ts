import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { translateMessage, translatedMessages } from './messages';

const SRC = path.resolve(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [full] : [];
  });
}

/** Messages raised with a plain string literal: badRequest('…'), conflict('…'), new HttpError(400, '…'), … */
function literalMessages(): string[] {
  const found = new Set<string>();
  const patterns = [
    /\b(?:badRequest|conflict|unauthorized|forbidden|notFound|sessionExpired)\(\s*'((?:[^'\\\n]|\\.)*)'/g,
    /new HttpError\(\s*\d+\s*,\s*'((?:[^'\\\n]|\\.)*)'/g,
    /\bRESET_LINK_INVALID\s*=\s*'((?:[^'\\\n]|\\.)*)'/g,
  ];
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of patterns) for (const m of text.matchAll(pattern)) found.add(m[1].replace(/\\'/g, "'"));
  }
  return [...found];
}

test('English passes through untouched', () => {
  assert.equal(translateMessage('Item not found', 'en'), 'Item not found');
  assert.equal(translateMessage('Something unknown', 'cs'), 'Something unknown');
});

test('every literal error message in the server has a Czech translation', () => {
  const messages = literalMessages();
  assert.ok(messages.length > 40, `scanner found only ${messages.length} messages`);
  const missing = messages.filter(m => translateMessage(m, 'cs') === m);
  assert.deepEqual(missing, [], `untranslated messages:\n${missing.join('\n')}`);
});

test('translations are real Czech sentences, not placeholders', () => {
  for (const message of translatedMessages()) {
    const cs = translateMessage(message, 'cs');
    assert.notEqual(cs, message);
    assert.ok(cs.length > 3 && !/\bundefined\b/.test(cs));
  }
});

test('field validation messages are translated with the field name', () => {
  assert.equal(translateMessage('Name is required', 'cs'), 'Pole „Jméno“ je povinné.');
  assert.equal(translateMessage('Item name must be 200 characters or fewer', 'cs'), 'Pole „Název předmětu“ může mít nejvýše 200 znaků.');
  assert.match(translateMessage('New password must be at least 8 characters', 'cs'), /Nové heslo/);
  assert.match(translateMessage('Value must be a number between 0 and 1,000,000,000', 'cs'), /Hodnota/);
});

test('plural forms follow Czech grammar', () => {
  const say = (n: number) => translateMessage(`Home still holds ${n} item${n === 1 ? '' : 's'}. Choose where to move ${n === 1 ? 'it' : 'them'} first.`, 'cs');
  assert.match(say(1), /1 předmět\b/);
  assert.match(say(3), /3 předměty/);
  assert.match(say(5), /5 předmětů/);
});
