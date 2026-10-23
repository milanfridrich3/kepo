import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from './errorHandler';

function run(err: unknown) {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    headersSent: false,
    status(code: number) { out.status = code; return this; },
    json(body: unknown) { out.body = body; return this; },
  };
  const origError = console.error;
  console.error = () => undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorHandler(err, { lang: 'en' } as any, res as any, () => undefined);
  } finally {
    console.error = origError;
  }
  return out;
}

test('a malformed %-escape in a path parameter (URIError, status 400) is a 400, not a 500', () => {
  const err = Object.assign(new URIError("Failed to decode param '%E0%A4%A'"), { status: 400, statusCode: 400 });
  const out = run(err);
  assert.equal(out.status, 400);
  assert.deepEqual(out.body, { error: 'The request could not be read.' });
});

test('an unexpected error is still a generic 500 that leaks nothing', () => {
  const out = run(new Error('secret internal detail'));
  assert.equal(out.status, 500);
  assert.ok(!JSON.stringify(out.body).includes('secret internal detail'));
});

test('a URIError without a 4xx status is not downgraded', () => {
  assert.equal(run(new URIError('x')).status, 500);
});
