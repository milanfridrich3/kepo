import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb, addUser } from '../testing/pgTestEnv';
import { createFeedback, markNotified, parseFeedback, FEEDBACK_CATEGORIES, FEEDBACK_DAILY_LIMIT, FEEDBACK_MAX_LENGTH } from './service';
import { buildFeedbackNotice, sendFeedbackNotice } from '../email/feedbackNotice';
import { deleteAccount } from '../account/deleteAccount';
import { translateMessage } from '../i18n/messages';

// The parsing and notification tests need no database, so they run in every `test:pg` run; the storage test needs the throwaway cluster.
const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';
const isHttp = (status: number) => (e: unknown) => (e as { status?: number }).status === status;

test('feedback: exactly four categories, validated on the server', () => {
  assert.deepEqual([...FEEDBACK_CATEGORIES], ['bug', 'idea', 'privacy', 'other']);
  for (const category of FEEDBACK_CATEGORIES) assert.deepEqual(parseFeedback({ category, message: '  Something to say.  ' }), { category, message: 'Something to say.' });
  for (const bad of [null, undefined, 'x', [], {}, { category: 'spam', message: 'long enough text' }, { category: 'bug' }, { category: 'bug', message: 42 },
    { category: 'bug', message: '   ' }, { category: 'bug', message: 'too short' }, { category: 'bug', message: 'x'.repeat(FEEDBACK_MAX_LENGTH + 1) }, { category: ['bug'], message: 'long enough text' }]) {
    assert.throws(() => parseFeedback(bad), isHttp(400));
  }
  assert.equal(parseFeedback({ category: 'idea', message: 'x'.repeat(FEEDBACK_MAX_LENGTH) }).message.length, FEEDBACK_MAX_LENGTH);
  // control characters are removed (a NUL would make PostgreSQL refuse the row), line breaks are kept and normalised
  assert.equal(parseFeedback({ category: 'idea', message: 'line one\u0000\r\nline two\u0007 ok' }).message, 'line one\nline two ok');
});

test('feedback: error messages have Czech translations', () => {
  for (const m of ['Choose a feedback category', 'Write your feedback first', 'Feedback must be at least 10 characters long', 'Feedback must be 4000 characters or fewer', 'You have sent a lot of feedback today. Please try again tomorrow.']) {
    assert.notEqual(translateMessage(m, 'cs'), m, m);
  }
});

test('feedback notification: recognisable category, includes the message, no sender data', () => {
  const at = new Date('2026-10-20T08:00:00Z');
  const p = buildFeedbackNotice({ id: 7, category: 'privacy', createdAt: at, message: 'Please erase my data.' });
  assert.match(p.subject, /Privacy request #7/);
  assert.match(buildFeedbackNotice({ id: 8, category: 'bug', createdAt: at, message: 'Crash on save' }).subject, /New feedback #8 \(Bug report\)/);
  for (const field of [p.subject, p.text, p.html]) assert.ok(!/@example\.cz/.test(field));
  assert.ok(!p.subject.includes('erase'));
  assert.match(p.text, /Number: 7/); assert.match(p.text, /Category: Privacy/); assert.match(p.text, /Received: 2026-10-20T08:00:00\.000Z/);
  assert.match(p.text, /Please erase my data\./); assert.match(p.html, /Please erase my data\./);
  assert.match(p.text, /GDPR Art\. 12/);
  assert.ok(!/GDPR/.test(buildFeedbackNotice({ id: 9, category: 'idea', createdAt: at, message: 'An idea for you' }).text));
});

test('feedback notification: message keeps its line breaks and HTML in it is encoded', () => {
  const msg = 'Line one\r\n\r\n  indented <script>alert("x")</script> & <img src=x onerror=alert(1)> \'quoted\'\nLast line';
  const m = buildFeedbackNotice({ id: 5, category: 'bug', createdAt: new Date('2026-10-20T08:00:00Z'), message: msg });
  assert.ok(m.text.includes('Line one\n\n  indented <script>alert("x")</script> & <img src=x onerror=alert(1)> \'quoted\'\nLast line'));
  assert.ok(!m.html.includes('<script') && !m.html.includes('<img'));
  assert.ok(m.html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img src=x onerror=alert(1)&gt; &#39;quoted&#39;'));
  assert.match(m.html, /white-space:pre-wrap/);
  assert.ok(m.html.includes('Line one\n\n  indented'));
});

test('feedback notification: sent to the configured address only, and reports when none is configured', async () => {
  const sent: Array<{ to: string; idempotencyKey: string; kind: string }> = [];
  const fake = (async (m: { to: string; idempotencyKey: string; kind: string }) => { sent.push(m); return { ok: true, id: 'x' } as const; }) as never;
  const n = { id: 3, category: 'other' as const, createdAt: new Date(), message: 'Hello there, Kepo' };
  assert.deepEqual(await sendFeedbackNotice(n, fake, null), { ok: false, reason: 'not_configured' });
  assert.equal(sent.length, 0);
  assert.equal((await sendFeedbackNotice(n, fake, 'inbox@example.org')).ok, true);
  assert.deepEqual(sent.map(s => [s.to, s.idempotencyKey, s.kind]), [['inbox@example.org', 'feedback/3', 'feedback_notice']]);
});

test('feedback: stored per account, daily cap, removed with the account', { skip }, async t => {
  const db = await freshDb('t_feedback'); t.after(() => db.end());
  const a = await addUser(db, 'a@x.cz'); const b = await addUser(db, 'b@x.cz');
  const one = await createFeedback(db, a, { category: 'privacy', message: 'Please erase my data.' }, 'cs');
  assert.ok(one.id > 0);
  const row = (await db.query('SELECT user_id, category, message, language, notified_at FROM feedback WHERE id=$1', [one.id])).rows[0];
  assert.deepEqual([row.user_id, row.category, row.message, row.language, row.notified_at], [a, 'privacy', 'Please erase my data.', 'cs', null]);
  await markNotified(db, one.id);
  assert.notEqual((await db.query('SELECT notified_at FROM feedback WHERE id=$1', [one.id])).rows[0].notified_at, null);

  // the database itself refuses bad rows, whatever the API does
  await assert.rejects(() => db.query("INSERT INTO feedback (user_id, category, message) VALUES ($1,'spam','long enough text')", [a]));
  await assert.rejects(() => db.query("INSERT INTO feedback (user_id, category, message) VALUES ($1,'bug','short')", [a]));

  // daily cap is per account
  for (let i = 1; i < FEEDBACK_DAILY_LIMIT; i++) await createFeedback(db, a, { category: 'bug', message: `Problem number ${i} here` }, 'en');
  await assert.rejects(() => createFeedback(db, a, { category: 'bug', message: 'One more than allowed' }, 'en'), isHttp(429));
  await createFeedback(db, b, { category: 'idea', message: 'A nice idea for Kepo' }, 'en');

  // deleting the account deletes what it sent, and only that
  await deleteAccount(db, a);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM feedback WHERE user_id=$1', [a])).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM feedback WHERE user_id=$1', [b])).rows[0].n, 1);
});
