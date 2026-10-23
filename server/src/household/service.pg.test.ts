import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb, addUser } from '../testing/pgTestEnv';
import {
  createHousehold, createInvite, joinHousehold, leaveHousehold, deleteHousehold, removeMember, setSharing, sharedItems,
  getHousehold, revokeInvite, generateInviteCode, normalizeInviteCode, hashInviteCode, MAX_HOUSEHOLD_MEMBERS, MAX_ACTIVE_INVITES,
} from './service';

const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';
const status = (n: number) => (e: unknown) => (e as { status?: number }).status === n;

test('invite codes: unambiguous alphabet, normalisation, hash only', () => {
  for (let i = 0; i < 200; i++) assert.match(generateInviteCode(), /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  assert.equal(normalizeInviteCode(' abcde-fghjk '), 'ABCDEFGHJK');
  for (const bad of ['', 'short', 'ABCDE-FGHJ0', 'ABCDE-FGHJI', 'ABCDE-FGHJ!!', 5, null]) assert.throws(() => normalizeInviteCode(bad), status(400));
  assert.match(hashInviteCode('ABCDEFGHJK'), /^[0-9a-f]{64}$/);
});

test('household: membership rules, invitations, read-only shared view', { skip }, async t => {
  const db = await freshDb('t_household'); t.after(() => db.end());
  const a = await addUser(db, 'anna@x.cz'); const b = await addUser(db, 'bob@x.cz'); const c = await addUser(db, 'cyril@x.cz'); const d = await addUser(db, 'dora@x.cz');
  const loc = async (u: number, n: string, p: number | null = null) => (await db.query('INSERT INTO locations (user_id,name,parent_id) VALUES ($1,$2,$3) RETURNING id', [u, n, p])).rows[0].id as number;
  const mk = async (u: number, name: string, extra: Record<string, unknown> = {}) =>
    (await db.query(`INSERT INTO items (user_id,name,location_id,value,serial_number,notes,brand,tags,archived,photo_url,warranty_expiration)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11) RETURNING id`,
      [u, name, extra.loc ?? null, extra.value ?? 999, extra.serial ?? 'SECRET-SERIAL', extra.notes ?? 'private note', extra.brand ?? null, extra.tags ?? [], extra.archived ?? false, 'https://x/p.jpg', extra.warranty ?? null])).rows[0].id as number;
  const home = await loc(b, 'Home'); const shelf = await loc(b, 'Shelf', home);
  await mk(a, 'Annas item');
  await mk(b, 'Bobs drill', { loc: shelf, brand: 'Bosch', tags: ['garage'], warranty: '2099-01-01' });
  await mk(b, 'Bobs removed', { archived: true });
  await mk(c, 'Cyrils item');
  await mk(d, 'Doras item');

  // create / invite / join
  await createHousehold(db, a, '  The Novaks ');
  await assert.rejects(() => createHousehold(db, a, 'Another'), status(409));
  await assert.rejects(() => createHousehold(db, b, ''), status(400));
  await assert.rejects(() => createInvite(db, b), status(403));                                   // not in a household / not owner
  const inv = await createInvite(db, a);
  const stored = (await db.query('SELECT code_hash FROM household_invites')).rows;
  assert.equal(stored.length, 1);
  assert.ok(!JSON.stringify(stored).includes(inv.code.replace('-', '')));                        // the code itself is never stored
  assert.equal(stored[0].code_hash, hashInviteCode(normalizeInviteCode(inv.code)));
  await assert.rejects(() => joinHousehold(db, b, 'AAAAA-AAAAA'), status(400));                    // unknown code
  await joinHousehold(db, b, inv.code.toLowerCase().replace('-', ' '));                           // typed sloppily
  await assert.rejects(() => joinHousehold(db, c, inv.code), status(400));                         // single use
  await assert.rejects(() => joinHousehold(db, b, 'AAAAA-AAAAA'), status(409));                    // already a member beats code check
  const inv2 = await createInvite(db, a);
  await db.query("UPDATE household_invites SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL");
  await assert.rejects(() => joinHousehold(db, c, inv2.code), status(400));                        // expired
  for (let i = 0; i < MAX_ACTIVE_INVITES; i++) await createInvite(db, a);
  await assert.rejects(() => createInvite(db, a), status(409));
  const view0 = (await getHousehold(db, a))!;
  assert.equal(view0.pendingInvites.length, MAX_ACTIVE_INVITES);
  await revokeInvite(db, a, view0.pendingInvites[0].id);
  await assert.rejects(() => revokeInvite(db, b, view0.pendingInvites[1].id), status(403));        // members cannot manage invitations
  const inv3 = await createInvite(db, a);

  // sharing is opt-in and read-only
  assert.deepEqual(await sharedItems(db, a), []);                                                  // Bob has not shared anything yet
  await setSharing(db, b, true);
  const seen = await sharedItems(db, a);
  assert.deepEqual(seen.map(i => i.name), ['Bobs drill']);                                         // not Bob's removed item, not Anna's own
  assert.deepEqual(Object.keys(seen[0]).sort(), ['brand', 'categoryName', 'id', 'locationPath', 'model', 'name', 'ownerName', 'ownerUserId', 'quantity', 'status', 'tags', 'warrantyExpiration']);
  assert.equal(seen[0].locationPath, 'Home → Shelf');
  const leaked = JSON.stringify(seen);
  for (const secret of ['SECRET-SERIAL', 'private note', '999', 'https://x/p.jpg']) assert.ok(!leaked.includes(secret), secret);
  assert.deepEqual((await sharedItems(db, a, 'bosch')).map(i => i.name), ['Bobs drill']);
  assert.deepEqual(await sharedItems(db, a, '%'), []);
  assert.deepEqual(await sharedItems(db, b), []);                                                  // Anna has not shared, Bob never sees his own here
  assert.deepEqual(await sharedItems(db, c), []);                                                  // outside the household: nothing
  await joinHousehold(db, c, inv3.code);
  await setSharing(db, a, true);
  assert.deepEqual((await sharedItems(db, c)).map(i => i.name), ['Annas item', 'Bobs drill']);
  assert.deepEqual(await sharedItems(db, d), []);
  await setSharing(db, b, false);                                                                  // switching off takes effect at once
  assert.deepEqual((await sharedItems(db, c)).map(i => i.name), ['Annas item']);
  await assert.rejects(() => setSharing(db, d, true), status(404));

  // a second household is separate
  await createHousehold(db, d, 'Dora');
  assert.deepEqual(await sharedItems(db, d), []);

  // leaving, removing, deleting
  await assert.rejects(() => leaveHousehold(db, a), status(409));                                  // owner with members
  await assert.rejects(() => removeMember(db, b, c), status(403));
  await assert.rejects(() => removeMember(db, a, a), status(400));
  await assert.rejects(() => removeMember(db, a, d), status(404));                                 // other household
  await removeMember(db, a, c);
  assert.deepEqual(await sharedItems(db, c), []);
  await leaveHousehold(db, b);
  assert.equal(await getHousehold(db, b), null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM items WHERE user_id = $1', [b])).rows[0].n, 2);   // leaving never touches items
  await deleteHousehold(db, a);
  assert.equal(await getHousehold(db, a), null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM household_invites')).rows[0].n, 0);
  await leaveHousehold(db, d);                                                                       // sole owner leaving deletes it
  assert.equal((await db.query('SELECT count(*)::int AS n FROM households')).rows[0].n, 0);
});

test('household is limited to six members', { skip }, async t => {
  const db = await freshDb('t_household_full'); t.after(() => db.end());
  const owner = await addUser(db, 'o@x.cz');
  await createHousehold(db, owner, 'Big');
  for (let i = 1; i < MAX_HOUSEHOLD_MEMBERS; i++) {
    const u = await addUser(db, `m${i}@x.cz`);
    await joinHousehold(db, u, (await createInvite(db, owner)).code);
    await db.query("DELETE FROM household_invites WHERE used_at IS NOT NULL");
  }
  const extra = await addUser(db, 'late@x.cz');
  const lastCode = (await createInvite(db, owner)).code;
  await assert.rejects(() => joinHousehold(db, extra, lastCode), status(409));
  assert.equal((await getHousehold(db, owner))!.members.length, MAX_HOUSEHOLD_MEMBERS);
});
