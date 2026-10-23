/**
 * Runtime settings read from the environment, with safe defaults.
 *
 * Everything is read lazily (on each call) rather than at import time so the
 * values can be exercised in tests and so a missing optional variable never
 * stops the API from starting.
 */

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Public origin of the web application (the one place links in emails point to).
 * `APP_URL` wins; otherwise `CLIENT_ORIGIN`, which is already the app's origin
 * and is mandatory in production. The localhost fallback is development-only.
 */
export function appUrl(): string {
  const configured = process.env.APP_URL?.trim() || process.env.CLIENT_ORIGIN?.trim();
  return stripTrailingSlash(configured || 'http://localhost:5173');
}

/** Origin of the public landing page (hosts the logo image used in emails). */
export function landingUrl(): string {
  return stripTrailingSlash(process.env.LANDING_URL?.trim() || 'https://kepo.is-cool.dev');
}

/**
 * Whether new accounts must confirm their email before using the app.
 * Always true in production; `EMAIL_VERIFICATION_REQUIRED=false` exists only so
 * local development works without an email provider.
 */
export function emailVerificationRequired(): boolean {
  if (isProduction()) return true;
  return process.env.EMAIL_VERIFICATION_REQUIRED?.trim().toLowerCase() !== 'false';
}

/** Lifetime of an emailed verification code. */
export const verificationCodeTtlMs = (): number => intFromEnv('VERIFICATION_CODE_TTL_MINUTES', 15, 5, 60) * 60_000;
/** Lifetime of a password-reset link. */
export const resetTokenTtlMs = (): number => intFromEnv('RESET_TOKEN_TTL_MINUTES', 60, 10, 24 * 60) * 60_000;
/** Minimum gap between two emails of the same kind to the same account. */
export const resendCooldownMs = (): number => intFromEnv('EMAIL_RESEND_COOLDOWN_SECONDS', 60, 30, 600) * 1000;

export interface EmailSettings {
  apiKey: string | null;
  /** RFC 5322 "From", e.g. `Kepo <no-reply@kepo.is-cool.dev>`. */
  from: string | null;
  replyTo: string | null;
}

export function emailSettings(): EmailSettings {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() || null,
    from: process.env.EMAIL_FROM?.trim() || null,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
  };
}

/**
 * Private mailbox that receives a notification for every feedback message (Settings → Feedback), set only as a server
 * environment variable (FEEDBACK_NOTIFY_EMAIL) so it never appears in the code, the websites or the legal pages.
 * Deliberately NOT EMAIL_REPLY_TO: that address is sent as the Reply-To of every email Kepo delivers. Null when unset or invalid.
 */
export function feedbackNotifyEmail(): string | null {
  const v = process.env.FEEDBACK_NOTIFY_EMAIL?.trim();
  return v && v.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v) ? v : null;
}

export function emailConfigured(settings: EmailSettings = emailSettings()): boolean {
  return Boolean(settings.apiKey && settings.from);
}

/** Problems worth shouting about at startup. Never throws: a misconfigured mailer must not take the API down. */
export function configurationWarnings(): string[] {
  const warnings: string[] = [];
  if (!emailConfigured()) {
    warnings.push(
      'RESEND_API_KEY and EMAIL_FROM are not both set: no email can be sent. New accounts will not receive verification codes and password recovery will not work.'
    );
  }
  if (!feedbackNotifyEmail() || !emailConfigured()) {
    warnings.push('FEEDBACK_NOTIFY_EMAIL is not set (or email is not configured): feedback from Settings is stored in the database, but nobody is notified. Privacy requests would go unseen.');
  }
  if (isProduction()) {
    if (/localhost|127\.0\.0\.1/.test(appUrl())) {
      warnings.push(`APP_URL/CLIENT_ORIGIN (${appUrl()}) points at localhost; links in emails would be unusable.`);
    }
    if (process.env.EMAIL_VERIFICATION_REQUIRED?.trim().toLowerCase() === 'false') {
      warnings.push('EMAIL_VERIFICATION_REQUIRED=false is ignored in production.');
    }
  }
  return warnings;
}
