import test from 'node:test';
import assert from 'node:assert/strict';
import { appUrl, configurationWarnings, emailConfigured, emailVerificationRequired, feedbackNotifyEmail, landingUrl, resendCooldownMs, resetTokenTtlMs, verificationCodeTtlMs } from './config';
import { defaultCurrencyForLanguage, isCurrency, isLanguage } from './types';

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test('new-account currency follows the language, and both sets are closed', () => {
  assert.equal(defaultCurrencyForLanguage('cs'), 'CZK');
  assert.equal(defaultCurrencyForLanguage('en'), 'EUR');
  for (const c of ['CZK', 'EUR', 'USD', 'GBP']) assert.ok(isCurrency(c));
  for (const c of ['czk', 'JPY', '', null, 5]) assert.equal(isCurrency(c), false);
  assert.ok(isLanguage('en') && isLanguage('cs'));
  assert.equal(isLanguage('de'), false);
});

test('app URL prefers APP_URL, then CLIENT_ORIGIN, and drops trailing slashes', () => {
  withEnv({ APP_URL: 'https://app.kepo.is-cool.dev/', CLIENT_ORIGIN: 'https://other.example' }, () => assert.equal(appUrl(), 'https://app.kepo.is-cool.dev'));
  withEnv({ APP_URL: undefined, CLIENT_ORIGIN: 'https://app.kepo.is-cool.dev' }, () => assert.equal(appUrl(), 'https://app.kepo.is-cool.dev'));
  withEnv({ APP_URL: undefined, CLIENT_ORIGIN: undefined }, () => assert.equal(appUrl(), 'http://localhost:5173'));
});

test('landing URL is separate from the app URL', () => {
  withEnv({ LANDING_URL: undefined }, () => assert.equal(landingUrl(), 'https://kepo.is-cool.dev'));
});

test('verification is always required in production, optional-off only in development', () => {
  withEnv({ NODE_ENV: 'production', EMAIL_VERIFICATION_REQUIRED: 'false' }, () => assert.equal(emailVerificationRequired(), true));
  withEnv({ NODE_ENV: 'development', EMAIL_VERIFICATION_REQUIRED: 'false' }, () => assert.equal(emailVerificationRequired(), false));
  withEnv({ NODE_ENV: 'development', EMAIL_VERIFICATION_REQUIRED: undefined }, () => assert.equal(emailVerificationRequired(), true));
});

test('tunables are clamped to sane bounds', () => {
  withEnv({ VERIFICATION_CODE_TTL_MINUTES: '1', RESET_TOKEN_TTL_MINUTES: '99999', EMAIL_RESEND_COOLDOWN_SECONDS: 'abc' }, () => {
    assert.equal(verificationCodeTtlMs(), 5 * 60_000);
    assert.equal(resetTokenTtlMs(), 24 * 60 * 60_000);
    assert.equal(resendCooldownMs(), 60_000);
  });
  withEnv({ VERIFICATION_CODE_TTL_MINUTES: undefined, RESET_TOKEN_TTL_MINUTES: undefined, EMAIL_RESEND_COOLDOWN_SECONDS: undefined }, () => {
    assert.equal(verificationCodeTtlMs(), 15 * 60_000);
    assert.equal(resetTokenTtlMs(), 60 * 60_000);
  });
});

test('startup warnings: missing email config and localhost links in production', () => {
  withEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined, NODE_ENV: 'production', APP_URL: undefined, CLIENT_ORIGIN: 'http://localhost:5173' }, () => {
    assert.equal(emailConfigured(), false);
    const w = configurationWarnings().join('\n');
    assert.match(w, /RESEND_API_KEY/);
    assert.match(w, /localhost/);
    assert.ok(!w.includes('re_'), 'never prints a key');
  });
  withEnv({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'Kepo <a@b.c>', FEEDBACK_NOTIFY_EMAIL: 'inbox@example.org', NODE_ENV: 'production', CLIENT_ORIGIN: 'https://app.kepo.is-cool.dev', APP_URL: undefined, EMAIL_VERIFICATION_REQUIRED: undefined }, () => {
    assert.equal(emailConfigured(), true);
    assert.deepEqual(configurationWarnings(), []);
  });
  withEnv({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'Kepo <a@b.c>', FEEDBACK_NOTIFY_EMAIL: undefined, NODE_ENV: 'production', CLIENT_ORIGIN: 'https://app.kepo.is-cool.dev', APP_URL: undefined, EMAIL_VERIFICATION_REQUIRED: undefined }, () => {
    assert.match(configurationWarnings().join('\n'), /FEEDBACK_NOTIFY_EMAIL is not set/);
  });
  withEnv({ FEEDBACK_NOTIFY_EMAIL: 'not an address' }, () => assert.equal(feedbackNotifyEmail(), null));
  withEnv({ FEEDBACK_NOTIFY_EMAIL: ' inbox@example.org ' }, () => assert.equal(feedbackNotifyEmail(), 'inbox@example.org'));
});
