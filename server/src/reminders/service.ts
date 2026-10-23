import type { Db } from '../items/service';
import { computeReminders } from './reminders';
import type { Reminder } from './reminders';

/** The reminders for one user, from their active items and open loans. `today` = UTC calendar date. */
export async function remindersFor(db: Db, userId: number, today: string): Promise<Reminder[]> {
  // Sequential on purpose: a Db may be one connection, which runs one statement at a time.
  const items = await db.query(
    `SELECT id, name, to_char(warranty_expiration, 'YYYY-MM-DD') AS warranty_expiration
       FROM items WHERE user_id = $1 AND archived = false AND warranty_expiration IS NOT NULL`, [userId]);
  const loans = await db.query(
    `SELECT b.item_id, i.name AS item_name, to_char(b.expected_return_date, 'YYYY-MM-DD') AS expected_return_date
       FROM borrowings b JOIN items i ON i.id = b.item_id
      WHERE b.user_id = $1 AND i.user_id = $1 AND b.returned = false AND i.archived = false AND b.expected_return_date IS NOT NULL`, [userId]);
  return computeReminders(
    items.rows.map(r => ({ id: r.id, name: r.name, warrantyExpiration: r.warranty_expiration })),
    loans.rows.map(r => ({ itemId: r.item_id, itemName: r.item_name, expectedReturnDate: r.expected_return_date })),
    today
  );
}

export interface DigestRecipient { userId: number; email: string; name: string; language: 'en' | 'cs' }
export type DigestSender = (to: DigestRecipient, reminders: Reminder[]) => Promise<boolean>;

/**
 * Sends the daily digest to every verified account that switched it on and has
 * something to report, at most once per account per day. The (account, day) row in
 * reminder_log is claimed BEFORE sending (so two server instances cannot both
 * send) and released again if the send fails, so a failure is retried on the
 * next run. Returns how many digests were sent.
 */
export async function sendDigests(db: Db, send: DigestSender, today: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT id, email, name, language FROM users
      WHERE reminder_emails = true AND email_verified_at IS NOT NULL ORDER BY id`
  );
  let sent = 0;
  for (const u of rows) {
    const reminders = await remindersFor(db, u.id, today);
    if (reminders.length === 0) continue;
    const claim = await db.query(
      `INSERT INTO reminder_log (user_id, reminder_key, sent_on) VALUES ($1, 'digest', $2::date)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [u.id, today]
    );
    if (claim.rows.length === 0) continue; // already sent (or being sent) today
    let ok = false;
    try { ok = await send({ userId: u.id, email: u.email, name: u.name, language: u.language }, reminders); } catch { ok = false; }
    if (ok) sent++;
    else await db.query("DELETE FROM reminder_log WHERE user_id = $1 AND reminder_key = 'digest' AND sent_on = $2::date", [u.id, today]);
  }
  return sent;
}
