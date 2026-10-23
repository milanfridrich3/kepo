import { appUrl, landingUrl, resetTokenTtlMs, verificationCodeTtlMs } from '../config';
import { sendEmail } from './resend';
import type { SendResult } from './resend';
import { renderEmail } from './templates';
import type { EmailData, EmailEnv, EmailKind } from './templates';
import type { Language } from '../types';

/**
 * The four transactional emails Kepo sends, addressed to a user in their saved
 * language. Delivery goes through `sendEmail` (Resend). Each function reports
 * success or failure and never throws, so callers can degrade gracefully.
 */

export interface Recipient {
  email: string;
  name: string;
  language: Language;
}

function env(): EmailEnv {
  const logo = process.env.EMAIL_LOGO_URL?.trim();
  return { appUrl: appUrl(), logoUrl: logo || `${landingUrl()}/apple-touch-icon.png` };
}

function deliver(kind: EmailKind, to: Recipient, data: Omit<EmailData, 'name'>, idempotencyKey: string): Promise<SendResult> {
  const message = renderEmail(kind, to.language, { name: to.name, ...data }, env());
  return sendEmail({ to: to.email, ...message, idempotencyKey, kind });
}

/** `userId` + `registrationId` make a retry of the same registration collapse into one message at the provider. */
export const sendWelcomeEmail = (to: Recipient, userId: number) =>
  deliver('welcome', to, {}, `welcome/${userId}`);

/** `codeId` is the auth_codes row, so every newly issued code is its own message but a retry of one is not duplicated. */
export const sendVerificationEmail = (to: Recipient, code: string, codeId: number) =>
  deliver('verify_email', to, { code, ttlMinutes: Math.round(verificationCodeTtlMs() / 60_000) }, `verify/${codeId}`);

export const sendPasswordResetEmail = (to: Recipient, token: string, codeId: number) =>
  deliver(
    'reset_password',
    to,
    { resetUrl: `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`, ttlMinutes: Math.round(resetTokenTtlMs() / 60_000) },
    `reset/${codeId}`
  );

/** Security notice after a password change. `changeId` is unique per change (the user's password_changed_at in ms). */
export const sendPasswordChangedEmail = (to: Recipient, userId: number, changeId: number) =>
  deliver('password_changed', to, {}, `pwchanged/${userId}/${changeId}`);

/** Daily reminders digest. `day` (YYYY-MM-DD) makes a retry the same day collapse into one message at the provider. */
export const sendReminderDigestEmail = (to: Recipient, userId: number, day: string, lines: string[]) =>
  deliver('reminder_digest', to, { lines }, `digest/${userId}/${day}`);
