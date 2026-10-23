import { emailSettings } from '../config';
import type { EmailSettings } from '../config';

/**
 * Minimal client for Resend's official REST API (POST https://api.resend.com/emails).
 * It uses the built-in `fetch` (Node 18+) rather than the SDK, which keeps the
 * API free of a new dependency; the request is exactly what the SDK sends.
 *
 * `sendEmail` never throws: callers decide what a failed delivery means.
 * Nothing sensitive is logged — not the recipient, subject, body, code or link.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable per logical message. Resend de-duplicates requests that reuse it, which makes the retry below safe. */
  idempotencyKey: string;
  /** Short label for logs only (e.g. "verify_email"). */
  kind: string;
}

export type SendResult = { ok: true; id: string | null } | { ok: false; reason: 'not_configured' | 'rejected' | 'unavailable'; status?: number };

export interface MailTransportOptions {
  settings?: EmailSettings;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
}

const RETRYABLE = (status: number) => status === 429 || status >= 500;

export function createMailTransport(options: MailTransportOptions = {}) {
  const baseUrl = options.baseUrl ?? 'https://api.resend.com';
  const timeoutMs = options.timeoutMs ?? 8000;
  const retryDelayMs = options.retryDelayMs ?? 600;

  return async function send(email: OutgoingEmail): Promise<SendResult> {
    const settings = options.settings ?? emailSettings();
    if (!settings.apiKey || !settings.from) {
      console.error(`[email] ${email.kind}: not sent, RESEND_API_KEY / EMAIL_FROM are not configured`);
      return { ok: false, reason: 'not_configured' };
    }
    const doFetch = options.fetchImpl ?? fetch;

    const body = JSON.stringify({
      from: settings.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
    });

    let lastStatus: number | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${baseUrl}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': email.idempotencyKey,
            'User-Agent': 'kepo-api/1.0',
          },
          body,
          signal: controller.signal,
        });
        if (res.ok) {
          let id: string | null = null;
          try {
            const json = (await res.json()) as { id?: unknown };
            id = typeof json.id === 'string' ? json.id : null;
          } catch {
            /* the message was accepted; the id is only informational */
          }
          return { ok: true, id };
        }
        lastStatus = res.status;
        if (!RETRYABLE(res.status)) {
          console.error(`[email] ${email.kind}: rejected by provider (HTTP ${res.status})`);
          return { ok: false, reason: 'rejected', status: res.status };
        }
        console.error(`[email] ${email.kind}: provider error (HTTP ${res.status}), attempt ${attempt}`);
      } catch (err) {
        const aborted = err instanceof Error && err.name === 'AbortError';
        console.error(`[email] ${email.kind}: ${aborted ? 'timed out' : 'network error'}, attempt ${attempt}`);
      } finally {
        clearTimeout(timer);
      }
      if (attempt === 1) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    return { ok: false, reason: 'unavailable', status: lastStatus };
  };
}

/** The transport used by the application (reads the environment on each send). */
export const sendEmail = createMailTransport();
