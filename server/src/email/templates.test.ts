import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, greetingName, renderEmail } from './templates';
import type { EmailKind } from './templates';
import type { Language } from '../types';

const env = { appUrl: 'https://app.kepo.is-cool.dev', logoUrl: 'https://kepo.is-cool.dev/apple-touch-icon.png' };
const KINDS: EmailKind[] = ['welcome', 'verify_email', 'reset_password', 'password_changed'];
const LANGS: Language[] = ['en', 'cs'];
const data = {
  name: 'Jana Nováková',
  code: '482915',
  resetUrl: 'https://app.kepo.is-cool.dev/reset-password?token=abc_DEF-123',
  ttlMinutes: 15,
};

for (const lang of LANGS) {
  for (const kind of KINDS) {
    test(`${kind} / ${lang}: branded, html + text, no foreign branding`, () => {
      const mail = renderEmail(kind, lang, data, env);
      assert.ok(mail.subject.length > 0);
      assert.match(mail.html, /^<!DOCTYPE html>/);
      assert.match(mail.html, new RegExp(`<html lang="${lang}"`));
      assert.ok(mail.html.includes('Kepo') && mail.text.includes('Kepo'));
      for (const body of [mail.subject, mail.html, mail.text]) {
        assert.doesNotMatch(body, /project\s*pilot/i);
        assert.doesNotMatch(body, /undefined|NaN|\[object/);
      }
      assert.ok(mail.html.includes(env.logoUrl));
      assert.doesNotMatch(mail.html, /<script/i);
      assert.doesNotMatch(mail.html, /localhost/);
    });
  }
}

test('verification email carries the code in html and text, with the expiry', () => {
  for (const lang of LANGS) {
    const mail = renderEmail('verify_email', lang, data, env);
    assert.ok(mail.html.includes('482915'));
    assert.ok(mail.text.includes('482915'));
    assert.ok(mail.text.includes('15'));
  }
});

test('reset email links to the app origin and the link appears in both parts', () => {
  for (const lang of LANGS) {
    const mail = renderEmail('reset_password', lang, data, env);
    assert.ok(mail.html.includes(escapeHtml(data.resetUrl)));
    assert.ok(mail.text.includes(data.resetUrl));
    assert.ok(data.resetUrl.startsWith('https://app.kepo.is-cool.dev/'));
  }
});

test('welcome and security emails link to the app, not the landing page', () => {
  const welcome = renderEmail('welcome', 'en', data, env);
  assert.ok(welcome.text.includes('https://app.kepo.is-cool.dev'));
  const changed = renderEmail('password_changed', 'en', data, env);
  assert.ok(changed.text.includes('https://app.kepo.is-cool.dev/forgot-password'));
});

test('tagline is present in the right language', () => {
  assert.ok(renderEmail('welcome', 'en', data, env).text.includes('Know what you own. Know where it is.'));
  assert.ok(renderEmail('welcome', 'cs', data, env).text.includes('Vězte, co vlastníte. Vězte, kde to je.'));
});

test('English and Czech differ (nothing falls back untranslated)', () => {
  for (const kind of KINDS) {
    const en = renderEmail(kind, 'en', data, env);
    const cs = renderEmail(kind, 'cs', data, env);
    assert.notEqual(en.subject, cs.subject);
    assert.notEqual(en.text, cs.text);
  }
});

test('user-supplied text is escaped in html', () => {
  const evil = renderEmail('welcome', 'en', { name: '<img src=x onerror=alert(1)>' }, env);
  assert.ok(!evil.html.includes('<img src=x'));
  const url = renderEmail('reset_password', 'en', { ...data, resetUrl: 'https://x.test/?a=1&b="2"' }, env);
  assert.ok(!url.html.includes('b="2"'));
});

test('greetingName uses the first word, with a neutral fallback', () => {
  assert.equal(greetingName('  Jana  Nováková ', 'cs'), 'Jana');
  assert.equal(greetingName('', 'en'), 'there');
  assert.equal(greetingName('   ', 'cs'), 'uživateli');
});

test('reminder digest: both languages, lines are escaped, subject and footer are present', () => {
  const env = { appUrl: 'https://app.example', logoUrl: 'https://l.example/a.png' };
  for (const lang of ['en', 'cs'] as const) {
    const m = renderEmail('reminder_digest', lang, { name: 'Ana Nováková', lines: ['Warranty <b>x</b> ends today & more'] }, env);
    assert.ok(m.subject.length > 3);
    assert.ok(m.html.includes('&lt;b&gt;x&lt;/b&gt; ends today &amp; more'));
    assert.ok(!m.html.includes('<b>x</b>'));
    assert.ok(m.text.includes('- Warranty <b>x</b> ends today & more'));
    assert.ok(m.html.includes('https://app.example'));
  }
  assert.equal(renderEmail('reminder_digest', 'en', { name: 'A', lines: [] }, env).subject, 'Your Kepo reminders');
});
