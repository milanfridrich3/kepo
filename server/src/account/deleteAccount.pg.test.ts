import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb, addUser } from '../testing/pgTestEnv';
import { createHousehold, createInvite, joinHousehold, getHousehold } from '../household/service';
import { deleteAccount } from './deleteAccount';

const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';
const count = async (db: { query: (t: string, v?: unknown[]) => Promise<{ rows: any[] }> }, sql: string, v: unknown[] = []) =>
  Number((await db.query(sql, v)).rows[0].n);

test('deleting a household owner removes the household, memberships and invitations only', { skip }, async t => {
  const db = await freshDb('t_delete_account'); t.after(() => db.end());
  const owner = await addUser(db, 'owner@x.cz');
  const member = await addUser(db, 'member@x.cz');
  const bystander = await addUser(db, 'bystander@x.cz');
  const item = async (u: number, name: string) =>
    (await db.query('INSERT INTO items (user_id, name) VALUES ($1, $2) RETURNING id', [u, name])).rows[0].id as number;
  const ownerItem = await item(owner, 'Owners drill');
  const memberItem = await item(member, 'Members saw');
  const bystanderItem = await item(bystander, 'Bystanders lamp');

  // A second household that the owner does not own must be unaffected.
  await createHousehold(db, bystander, 'Other home');

  await createHousehold(db, owner, 'The Owners');
  const { code } = await createInvite(db, owner);
  await joinHousehold(db, member, code);
  await createInvite(db, owner);                        // one invitation stays open
  const hid = (await getHousehold(db, owner))!.id;
  assert.equal(await count(db, 'SELECT count(*) AS n FROM household_members WHERE household_id = $1', [hid]), 2);
  assert.equal(await count(db, 'SELECT count(*) AS n FROM household_invites WHERE household_id = $1', [hid]), 2);

  // The real deletion logic, in a transaction the way the route runs it.
  await db.query('BEGIN');
  await deleteAccount(db, owner);
  await db.query('COMMIT');

  assert.equal(await count(db, 'SELECT count(*) AS n FROM users WHERE id = $1', [owner]), 0);
  assert.equal(await count(db, 'SELECT count(*) AS n FROM households WHERE id = $1', [hid]), 0);
  assert.equal(await count(db, 'SELECT count(*) AS n FROM household_members WHERE household_id = $1', [hid]), 0);
  assert.equal(await count(db, 'SELECT count(*) AS n FROM household_invites WHERE household_id = $1', [hid]), 0);

  // The other member keeps the account and the item, and is free to start or join a household again.
  assert.equal(await count(db, 'SELECT count(*) AS n FROM users WHERE id = $1', [member]), 1);
  const kept = (await db.query('SELECT user_id, name FROM items WHERE id = $1', [memberItem])).rows;
  assert.deepEqual(kept, [{ user_id: member, name: 'Members saw' }]);
  assert.equal(await getHousehold(db, member), null);
  await createHousehold(db, member, 'Fresh start');

  // Existing policy: the deleted account's own items go with the account.
  assert.equal(await count(db, 'SELECT count(*) AS n FROM items WHERE id = $1', [ownerItem]), 0);

  // Unrelated people and households are untouched.
  assert.equal(await count(db, 'SELECT count(*) AS n FROM items WHERE id = $1', [bystanderItem]), 1);
  assert.notEqual(await getHousehold(db, bystander), null);
});

test('deleting a plain member leaves the household and its owner alone', { skip }, async t => {
  const db = await freshDb('t_delete_member'); t.after(() => db.end());
  const owner = await addUser(db, 'o@x.cz'); const member = await addUser(db, 'm@x.cz');
  await createHousehold(db, owner, 'Home');
  const { code } = await createInvite(db, owner);
  await joinHousehold(db, member, code);
  const hid = (await getHousehold(db, owner))!.id;

  await db.query('BEGIN'); await deleteAccount(db, member); await db.query('COMMIT');

  assert.equal(await count(db, 'SELECT count(*) AS n FROM households WHERE id = $1', [hid]), 1);
  assert.equal(await count(db, 'SELECT count(*) AS n FROM household_members WHERE household_id = $1', [hid]), 1);
  assert.equal(await count(db, 'SELECT count(*) AS n FROM users WHERE id = $1', [owner]), 1);
});
