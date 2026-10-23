import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb } from './pgTestEnv';
import { PgError } from './miniPg';

test('mini client: parameters, types, errors and transactions behave like the app expects', { skip: !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)' }, async t => {
  const db = await freshDb('t_minipg');
  t.after(() => db.end());
  const u = await db.query("INSERT INTO users (email, password_hash, name) VALUES ($1,'h',$2) RETURNING id, created_at", ["o'brien@x.cz", 'Zoë "Z" \\ Ž']);
  assert.equal(typeof u.rows[0].id, 'number');
  assert.ok(u.rows[0].created_at instanceof Date);
  const back = await db.query('SELECT name FROM users WHERE id = $1', [u.rows[0].id]);
  assert.equal(back.rows[0].name, 'Zoë "Z" \\ Ž');
  const misc = await db.query("SELECT $1::date AS d, $2::numeric AS n, $3::bool AS b, $4::text[] AS a, NULL::text AS z", ['2026-02-03', '10.10', true, ['a b', 'c"d']]);
  assert.deepEqual(misc.rows[0], { d: '2026-02-03', n: '10.10', b: true, a: ['a b', 'c"d'], z: null });
  await assert.rejects(() => db.query('INSERT INTO users (email) VALUES ($1)', ['x']), (e: unknown) => e instanceof PgError && e.code === '23502');
  await assert.rejects(() => db.withTransaction(async d => { await d.query("INSERT INTO categories (name) VALUES ('Zzz')"); throw new Error('boom'); }), /boom/);
  assert.equal((await db.query("SELECT 1 FROM categories WHERE name = 'Zzz'")).rows.length, 0);
});
