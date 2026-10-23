import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb, addUser } from '../testing/pgTestEnv';
import { remindersFor, sendDigests } from './service';
import type { DigestRecipient } from './service';

const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';

test('reminders come from the user\'s own data only; the digest is opt-in, once a day, and retried after a failure', { skip }, async t => {
  const db = await freshDb('t_reminders'); t.after(() => db.end());
  const a = await addUser(db, 'a@x.cz'); const b = await addUser(db, 'b@x.cz'); const c = await addUser(db, 'c@x.cz');
  const today = (await db.query("SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d")).rows[0].d as string;
  const plus = async (days: number) => (await db.query("SELECT to_char((now() AT TIME ZONE 'UTC')::date + $1::int, 'YYYY-MM-DD') AS d", [days])).rows[0].d as string;
  const mk = async (u: number, name: string, warranty: string | null, archived = false) =>
    (await db.query('INSERT INTO items (user_id,name,warranty_expiration,archived) VALUES ($1,$2,$3,$4) RETURNING id', [u, name, warranty, archived])).rows[0].id as number;
  const drill = await mk(a, 'Drill', await plus(5));
  await mk(a, 'Far', await plus(200));
  await mk(a, 'Removed', await plus(5), true);
  await mk(b, 'Bobs', await plus(5));
  await mk(c, 'Cs', await plus(5));
  const book = await mk(a, 'Book', null);
  await db.query("INSERT INTO borrowings (item_id,user_id,borrower_name,expected_return_date) VALUES ($1,$2,'Petr',$3)", [book, a, await plus(-2)]);

  const ra = await remindersFor(db, a, today);
  assert.deepEqual(ra.map(r => [r.kind, r.itemName, r.days]), [['loan_overdue', 'Book', -2], ['warranty_ending', 'Drill', 5]]);
  assert.deepEqual((await remindersFor(db, b, today)).map(r => r.itemName), ['Bobs']);                         // B never sees A's items

  // opt-in: nobody has switched it on yet
  const calls: string[] = [];
  const send = async (to: DigestRecipient, r: unknown[]) => { calls.push(`${to.email}:${r.length}`); return true; };
  assert.equal(await sendDigests(db, send, today), 0);
  await db.query('UPDATE users SET reminder_emails = true WHERE id IN ($1,$2)', [a, b]);
  await db.query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [b]);                              // unverified: never emailed
  assert.equal(await sendDigests(db, send, today), 1);
  assert.deepEqual(calls, ['a@x.cz:2']);
  assert.equal(await sendDigests(db, send, today), 0);                                                         // same day: nothing again
  assert.deepEqual(calls, ['a@x.cz:2']);

  // a failed send releases the claim so the next run retries it
  await db.query("DELETE FROM reminder_log");
  const failing = async () => false;
  assert.equal(await sendDigests(db, failing, today), 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reminder_log')).rows[0].n, 0);
  const throwing = async () => { throw new Error('mail down'); };
  assert.equal(await sendDigests(db, throwing, today), 0);
  assert.equal(await sendDigests(db, send, today), 1);

  // nothing to report: no email, no log row
  await db.query("UPDATE items SET warranty_expiration = NULL WHERE user_id = $1", [a]);
  await db.query("UPDATE borrowings SET returned = true");
  await db.query("DELETE FROM reminder_log");
  assert.equal(await sendDigests(db, send, today), 0);
  void drill;
});
