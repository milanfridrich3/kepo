import { pool } from '../db/pool';
import { sendDigests } from './service';
import type { DigestSender } from './service';
import { reminderLine } from './reminders';
import { sendReminderDigestEmail } from '../email/mailer';

/**
 * Daily reminder emails. OFF unless REMINDERS_ENABLED=true is set in the server
 * environment, and even then only for accounts that switched "daily reminders" on
 * in Settings. Checks once an hour and only acts from REMINDERS_HOUR_UTC (default
 * 6) onwards; reminder_log guarantees one email per account per day.
 */

export function reminderJobEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REMINDERS_ENABLED?.trim().toLowerCase() === 'true';
}

export function reminderHourUtc(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.REMINDERS_HOUR_UTC);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 6;
}

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

const sender: DigestSender = async (to, reminders) => {
  const lines = reminders.map(r => reminderLine(r, to.language));
  const result = await sendReminderDigestEmail({ email: to.email, name: to.name, language: to.language }, to.userId, utcDay(new Date()), lines);
  return result.ok;
};

/** Starts the hourly check. Returns a function that stops it. */
export function startReminderJob(): () => void {
  if (!reminderJobEnabled()) return () => undefined;
  const tick = async () => {
    const now = new Date();
    if (now.getUTCHours() < reminderHourUtc()) return;
    try {
      const n = await sendDigests(pool, sender, utcDay(now));
      if (n > 0) console.log(`[reminders] sent ${n} digest(s)`);
    } catch (err) {
      console.error('[reminders] run failed', err);
    }
  };
  const timer = setInterval(() => void tick(), 60 * 60 * 1000);
  timer.unref();
  void tick();
  console.log('[reminders] daily digest job enabled');
  return () => clearInterval(timer);
}
