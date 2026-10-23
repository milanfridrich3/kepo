import { feedbackNotifyEmail } from '../config';
import { sendEmail } from './resend';
import type { SendResult } from './resend';
import type { FeedbackCategory } from '../feedback/service';

/**
 * The notification the operator receives when feedback arrives: number, category, time and the message text itself.
 * It never contains anything that identifies the sender (no name, no email address, no account id); the operator
 * looks the sender up in the database when needed (docs/FEEDBACK.md). English only: it is addressed to the operator.
 */

const LABEL: Record<FeedbackCategory, string> = { bug: 'Bug report', idea: 'Idea', privacy: 'Privacy', other: 'Other' };

export interface FeedbackNotice { id: number; category: FeedbackCategory; createdAt: Date; message: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function buildFeedbackNotice(n: FeedbackNotice): { subject: string; text: string; html: string } {
  const label = LABEL[n.category];
  const subject = n.category === 'privacy' ? `[Kepo] Privacy request #${n.id}` : `[Kepo] New feedback #${n.id} (${label})`;
  const lines = [
    n.category === 'privacy' ? 'A privacy request was submitted in Kepo.' : 'New feedback was submitted in Kepo.',
    `Number: ${n.id}`,
    `Category: ${label}`,
    `Received: ${n.createdAt.toISOString()}`,
  ];
  const after = [
    'The sender is not included in this email. To see who sent it, query the database (see docs/FEEDBACK.md):',
    `SELECT f.id, f.category, f.message, f.created_at, u.email FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.id = ${n.id};`,
  ];
  if (n.category === 'privacy') after.push('', 'Privacy requests have legal deadlines (GDPR Art. 12: one month). Verify who is asking before acting.');
  const message = n.message.replace(/\r\n?/g, '\n');
  const text = [...lines, '', 'Message:', '----------', message, '----------', '', ...after].join('\n');
  const p = (l: string) => (l === '' ? '<br>' : `<p style="margin:0 0 6px">${esc(l)}</p>`);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#0F172A">${lines.map(p).join('')}`
    + `<p style="margin:12px 0 4px"><strong>Message:</strong></p>`
    + `<div style="white-space:pre-wrap;word-wrap:break-word;margin:0 0 12px;padding:10px 12px;background:#F1F5F9;border-left:3px solid #94A3B8">${esc(message)}</div>`
    + `${after.map(p).join('')}</div>`;
  return { subject, text, html };
}

/**
 * Sends the notice to FEEDBACK_NOTIFY_EMAIL (a server-only secret setting; see docs/FEEDBACK.md). When it is not set nothing is sent
 * (the message is still stored) and the caller learns that through `not_configured`. Never throws.
 */
export async function sendFeedbackNotice(n: FeedbackNotice, send: typeof sendEmail = sendEmail, to: string | null = feedbackNotifyEmail()): Promise<SendResult> {
  if (!to) {
    console.error('[feedback] stored, but no notification sent: FEEDBACK_NOTIFY_EMAIL is not set');
    return { ok: false, reason: 'not_configured' };
  }
  const m = buildFeedbackNotice(n);
  return send({ to, ...m, idempotencyKey: `feedback/${n.id}`, kind: 'feedback_notice' });
}
