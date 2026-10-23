-- Reminders and the calendar feed (Extensions 5 and 9).
--  * reminder_emails: opt-in daily digest of warranties ending and overdue loans (default off).
--  * reminder_log: one row per (account, reminder key, day) so a digest is never sent twice.
--  * calendar_token_hash: SHA-256 of a secret token that lets a calendar app read a
--    read-only .ics feed of this account's dates. Only the hash is stored; null = feed off.
ALTER TABLE users
  ADD COLUMN reminder_emails BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN calendar_token_hash TEXT UNIQUE;

CREATE TABLE reminder_log (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL,
  sent_on DATE NOT NULL,
  PRIMARY KEY (user_id, reminder_key, sent_on)
);
