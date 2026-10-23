import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb, addUser } from '../testing/pgTestEnv';
import { rotateToken, revokeToken, feedForToken, feedEnabled, hashToken } from './service';

const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';

test('calendar feed: secret token, per-user isolation, rotate and revoke', { skip }, async t => {
  const db = await freshDb('t_calendar'); t.after(() => db.end());
  const a = await addUser(db, 'a@x.cz'); const b = await addUser(db, 'b@x.cz');
  await db.query("UPDATE users SET email_verified_at = now() WHERE id IN ($1,$2)", [a, b]);
  const item = async (u: number, name: string, days: number, archived = false) =>
    (await db.query(`INSERT INTO items (user_id,name,warranty_expiration,archived) VALUES ($1,$2,(now() AT TIME ZONE 'UTC')::date + $3::int,$4) RETURNING id`, [u, name, days, archived])).rows[0].id as number;
  const iA = await item(a, 'Anna TV', 10); await item(a, 'Anna old', -90); await item(a, 'Anna gone', 5, true); await item(b, 'Bob drill', 10);
  await db.query(`INSERT INTO borrowings (user_id,item_id,borrower_name,expected_return_date,returned) VALUES ($1,$2,'Eva',(now() AT TIME ZONE 'UTC')::date + 2,false)`, [a, iA]);

  assert.equal(await feedEnabled(db, a), false);
  assert.equal(await feedForToken(db, 'x'.repeat(43)), null);
  const token = await rotateToken(db, a);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await db.query('SELECT calendar_token_hash h FROM users WHERE id=$1', [a])).rows[0].h, hashToken(token));
  assert.ok(!JSON.stringify((await db.query('SELECT * FROM users')).rows).includes(token));   // token itself never stored
  assert.equal(await feedEnabled(db, a), true);

  const ics = (await feedForToken(db, token))!;
  assert.match(ics, /SUMMARY:Warranty ends: Anna TV/);
  assert.match(ics, /SUMMARY:Return due: Anna TV\r?\n/);
  assert.doesNotMatch(ics, /Eva/);
  for (const absent of ['Anna old', 'Anna gone', 'Bob drill']) assert.ok(!ics.includes(absent), absent);
  assert.equal(await feedForToken(db, token.slice(0, 42) + (token.endsWith('A') ? 'B' : 'A')), null);
  assert.equal(await feedForToken(db, "' OR 1=1 --"), null);

  const token2 = await rotateToken(db, a);                         // rotating kills the old address
  assert.equal(await feedForToken(db, token), null);
  assert.ok(await feedForToken(db, token2));
  await db.query("UPDATE users SET email_verified_at = NULL WHERE id = $1", [a]);
  assert.equal(await feedForToken(db, token2), null);              // unverified accounts have no feed
  await db.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [a]);
  await revokeToken(db, a);
  assert.equal(await feedForToken(db, token2), null);
  assert.equal(await feedEnabled(db, a), false);
  assert.ok(!(await feedForToken(db, await rotateToken(db, b)))!.includes('Anna'));   // other account sees only its own
});
