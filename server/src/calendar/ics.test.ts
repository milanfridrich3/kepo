import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, escapeIcsText, foldLine } from './ics';

const now = new Date('2026-10-15T10:20:30.456Z');

test('escapes text per RFC 5545', () => {
  // Expected values are built from char codes, so a mistake in JS string-literal escaping cannot hide here.
  const BS = String.fromCharCode(92);
  const input = ['a,b;c', BS, 'd', String.fromCharCode(10), 'e'].join('');          // a,b;c\d<LF>e
  const expected = ['a', BS, ',b', BS, ';c', BS, BS, 'd', BS, 'n', 'e'].join('');    // a\,b\;c\\d\ne
  assert.equal(escapeIcsText(input), expected);
  const out = escapeIcsText('x;y');
  assert.equal(out.length, 4);
  assert.equal(out.charCodeAt(1), 92);   // a real backslash ...
  assert.equal(out.charCodeAt(2), 59);   // ... immediately before the semicolon
  assert.equal(escapeIcsText('a\r\nb\rc'), 'a' + BS + 'nb' + BS + 'nc');
});

test('folds long lines at 75 octets without splitting characters', () => {
  const long = 'SUMMARY:' + 'ě'.repeat(100);
  const folded = foldLine(long);
  for (const [i, part] of folded.split('\r\n').entries()) {
    assert.ok(new TextEncoder().encode(part).length <= 75, `line ${i}`);
    if (i > 0) assert.ok(part.startsWith(' '));
  }
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.equal(foldLine('short'), 'short');
});

test('builds a valid all-day calendar with CRLF and skips malformed dates', () => {
  const ics = buildIcs([
    { uid: 'a@kepo', date: '2026-12-31', summary: 'Warranty ends: TV, 55"', description: 'x;y' },
    { uid: 'bad@kepo', date: '2026-13-1', summary: 'nope' },
  ], 'Kepo', now);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics));
  assert.match(ics, /DTSTAMP:20261015T102030Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);   // year rollover for the exclusive end
  assert.match(ics, /SUMMARY:Warranty ends: TV\\, 55"/);
  const descLine = ics.split('\r\n').find(l => l.startsWith('DESCRIPTION:'))!;
  assert.equal(descLine.charCodeAt('DESCRIPTION:x'.length), 92);   // literal backslash right before the semicolon
  assert.equal(descLine.charCodeAt('DESCRIPTION:x'.length + 1), 59);
  assert.equal(descLine.length, 'DESCRIPTION:'.length + 4);          // x \ ; y
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.ok(!ics.includes('bad@kepo'));
});

test('injected newlines in a name cannot create extra properties', () => {
  const ics = buildIcs([{ uid: 'a@kepo', date: '2026-01-01', summary: 'x\r\nATTENDEE:evil' }], 'Kepo', now);
  assert.ok(!/\r\nATTENDEE:/.test(ics));
});
