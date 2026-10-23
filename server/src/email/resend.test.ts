import test from 'node:test';
import assert from 'node:assert/strict';
import { createMailTransport } from './resend';
import type { OutgoingEmail } from './resend';

const settings = { apiKey: 're_test_key_123', from: 'Kepo <no-reply@kepo.is-cool.dev>', replyTo: null };
const email: OutgoingEmail = {
  to: 'user@example.com', subject: 'Subject', html: '<p>hi 482915</p>', text: 'hi 482915',
  idempotencyKey: 'verify/42', kind: 'verify_email',
};
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

type Call = { url: string; init: RequestInit };
function mockFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra call');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { calls, impl };
}

/** Captures console.error so the test can assert nothing sensitive is logged. */
function captureErrors() {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  return { lines, restore: () => { console.error = original; } };
}

test('sends the documented Resend request', async () => {
  const { calls, impl } = mockFetch([json(200, { id: 'msg_1' })]);
  const send = createMailTransport({ settings: { ...settings, replyTo: 'help@kepo.is-cool.dev' }, fetchImpl: impl, retryDelayMs: 0 });
  const result = await send(email);
  assert.deepEqual(result, { ok: true, id: 'msg_1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer re_test_key_123');
  assert.equal(headers['Idempotency-Key'], 'verify/42');
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.to, ['user@example.com']);
  assert.equal(body.from, settings.from);
  assert.equal(body.reply_to, 'help@kepo.is-cool.dev');
  assert.equal(body.html, email.html);
  assert.equal(body.text, email.text);
  assert.equal(calls[0].init.method, 'POST');
});

test('without configuration nothing is sent and the result says why', async () => {
  const { calls, impl } = mockFetch([]);
  const errors = captureErrors();
  try {
    const send = createMailTransport({ settings: { apiKey: null, from: null, replyTo: null }, fetchImpl: impl });
    assert.deepEqual(await send(email), { ok: false, reason: 'not_configured' });
  } finally { errors.restore(); }
  assert.equal(calls.length, 0);
});

test('a 4xx is final: no retry', async () => {
  const { calls, impl } = mockFetch([json(422, { message: 'domain not verified' })]);
  const errors = captureErrors();
  try {
    const send = createMailTransport({ settings, fetchImpl: impl, retryDelayMs: 0 });
    const result = await send(email);
    assert.deepEqual(result, { ok: false, reason: 'rejected', status: 422 });
  } finally { errors.restore(); }
  assert.equal(calls.length, 1);
});

test('a 5xx is retried once with the same idempotency key, then succeeds', async () => {
  const { calls, impl } = mockFetch([json(503), json(200, { id: 'msg_2' })]);
  const errors = captureErrors();
  try {
    const send = createMailTransport({ settings, fetchImpl: impl, retryDelayMs: 0 });
    assert.deepEqual(await send(email), { ok: true, id: 'msg_2' });
  } finally { errors.restore(); }
  assert.equal(calls.length, 2);
  const keys = calls.map(c => (c.init.headers as Record<string, string>)['Idempotency-Key']);
  assert.equal(keys[0], keys[1]);
});

test('persistent failure and network errors give up after two attempts', async () => {
  const errors = captureErrors();
  try {
    const a = mockFetch([json(500), json(502)]);
    assert.deepEqual(await createMailTransport({ settings, fetchImpl: a.impl, retryDelayMs: 0 })(email), { ok: false, reason: 'unavailable', status: 502 });
    const b = mockFetch([new Error('ECONNRESET'), new Error('ECONNRESET')]);
    assert.deepEqual(await createMailTransport({ settings, fetchImpl: b.impl, retryDelayMs: 0 })(email), { ok: false, reason: 'unavailable', status: undefined });
    assert.equal(b.calls.length, 2);
  } finally { errors.restore(); }
});

test('429 is retried (rate limited by the provider)', async () => {
  const { calls, impl } = mockFetch([json(429), json(200, { id: 'x' })]);
  const errors = captureErrors();
  try {
    assert.equal((await createMailTransport({ settings, fetchImpl: impl, retryDelayMs: 0 })(email)).ok, true);
  } finally { errors.restore(); }
  assert.equal(calls.length, 2);
});

test('a hung request is aborted by the timeout', async () => {
  const impl = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as unknown as typeof fetch;
  const errors = captureErrors();
  try {
    const result = await createMailTransport({ settings, fetchImpl: impl, timeoutMs: 20, retryDelayMs: 0 })(email);
    assert.equal(result.ok, false);
  } finally { errors.restore(); }
});

test('logs never contain the key, recipient, code or body', async () => {
  const errors = captureErrors();
  try {
    const a = mockFetch([json(500), json(500)]);
    await createMailTransport({ settings, fetchImpl: a.impl, retryDelayMs: 0 })(email);
    const b = mockFetch([json(403)]);
    await createMailTransport({ settings, fetchImpl: b.impl, retryDelayMs: 0 })(email);
    await createMailTransport({ settings: { apiKey: null, from: null, replyTo: null } })(email);
  } finally { errors.restore(); }
  assert.ok(errors.lines.length > 0);
  const all = errors.lines.join('\n');
  for (const secret of ['re_test_key_123', 'user@example.com', '482915', 'Subject', 'verify/42']) {
    assert.ok(!all.includes(secret), `log leaked ${secret}`);
  }
});
