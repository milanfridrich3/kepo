import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MiniPg } from '../testing/miniPg';
import { pgAvailable, addUser } from '../testing/pgTestEnv';

const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';
const dir = path.resolve(__dirname, 'migrations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

test('migrations 0008+ apply on top of a database that already holds data, and keep it', { skip }, async t => {
  const socket = process.env.KEPO_PG_TEST_SOCKET!; const port = Number(process.env.KEPO_PG_TEST_PORT);
  const admin = await MiniPg.connect(socket, port, process.env.KEPO_PG_TEST_DB!);
  await admin.exec('DROP DATABASE IF EXISTS t_upgrade'); await admin.exec('CREATE DATABASE t_upgrade'); await admin.end();
  const db = await MiniPg.connect(socket, port, 't_upgrade');
  t.after(() => db.end());

  for (const f of files.filter(x => x < '0008')) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  const u = await addUser(db, 'old@x.cz');
  await db.query("INSERT INTO items (user_id, name, value, currency) VALUES ($1,'Old drill',100.50,'CZK'), ($1,'Old lamp',NULL,'EUR')", [u]);
  const before = (await db.query('SELECT id, name, value, currency, archived FROM items ORDER BY id')).rows;

  for (const f of files.filter(x => x >= '0008')) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));

  const after = (await db.query('SELECT id, name, value, currency, archived, quantity, brand, model, tags FROM items ORDER BY id')).rows;
  assert.deepEqual(after.map(r => [r.id, r.name, r.value, r.currency, r.archived]), before.map(r => [r.id, r.name, r.value, r.currency, r.archived]));
  assert.deepEqual(after.map(r => [r.quantity, r.brand, r.model, r.tags]), [[1, null, null, []], [1, null, null, []]]);
  const usr = (await db.query('SELECT reminder_emails, calendar_token_hash FROM users WHERE id = $1', [u])).rows[0];
  assert.deepEqual(usr, { reminder_emails: false, calendar_token_hash: null });

  // constraints
  await assert.rejects(() => db.query('UPDATE items SET quantity = 0'), /check constraint/);
  await assert.rejects(() => db.query('UPDATE items SET quantity = 10000'), /check constraint/);
  // deleting the account removes everything that hangs off it
  const it = (await db.query('SELECT id FROM items LIMIT 1')).rows[0].id;
  await db.query("INSERT INTO item_documents (item_id,user_id,kind,filename,mime,size_bytes,data) VALUES ($1,$2,'receipt','r.pdf','application/pdf',4,'\\x25504446')", [it, u]);
  await db.query("INSERT INTO item_photos (item_id,user_id,image_data,image_mime) VALUES ($1,$2,'\\x00','image/webp')", [it, u]);
  await db.query("INSERT INTO saved_searches (user_id,name,query) VALUES ($1,'a','{}')", [u]);
  await db.query('DELETE FROM users WHERE id = $1', [u]);
  for (const tbl of ['items', 'item_documents', 'item_photos', 'saved_searches']) {
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${tbl}`)).rows[0].n, 0, tbl);
  }
});

test('household and saved-search constraints', { skip }, async t => {
  const socket = process.env.KEPO_PG_TEST_SOCKET!; const port = Number(process.env.KEPO_PG_TEST_PORT);
  const admin = await MiniPg.connect(socket, port, process.env.KEPO_PG_TEST_DB!);
  await admin.exec('DROP DATABASE IF EXISTS t_constraints'); await admin.exec('CREATE DATABASE t_constraints'); await admin.end();
  const db = await MiniPg.connect(socket, port, 't_constraints');
  t.after(() => db.end());
  for (const f of files) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  const a = await addUser(db, 'a@x.cz'); const b = await addUser(db, 'b@x.cz');
  const h1 = (await db.query("INSERT INTO households (name) VALUES ('H1') RETURNING id")).rows[0].id;
  const h2 = (await db.query("INSERT INTO households (name) VALUES ('H2') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO household_members (household_id,user_id,role) VALUES ($1,$2,'owner')", [h1, a]);
  await assert.rejects(() => db.query("INSERT INTO household_members (household_id,user_id,role) VALUES ($1,$2,'member')", [h2, a]), /unique/);   // one household per person
  await assert.rejects(() => db.query("INSERT INTO household_members (household_id,user_id,role) VALUES ($1,$2,'owner')", [h1, b]), /unique/);   // one owner
  await assert.rejects(() => db.query("INSERT INTO household_members (household_id,user_id,role) VALUES ($1,$2,'boss')", [h1, b]), /check constraint/);
  await db.query("INSERT INTO saved_searches (user_id,name,query) VALUES ($1,'Garage','{}')", [a]);
  await assert.rejects(() => db.query("INSERT INTO saved_searches (user_id,name,query) VALUES ($1,'GARAGE','{}')", [a]), /unique/);            // case-insensitive
  await db.query("INSERT INTO saved_searches (user_id,name,query) VALUES ($1,'Garage','{}')", [b]);                                          // other user may reuse the name
});
