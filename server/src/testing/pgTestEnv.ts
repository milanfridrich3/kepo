import fs from 'node:fs';
import path from 'node:path';
import { MiniPg } from './miniPg';

/** True when scripts/with-test-pg.sh started a throwaway cluster for this run. */
export const pgAvailable = Boolean(process.env.KEPO_PG_TEST_SOCKET);

/** A fresh database with every migration applied, for one test file. Returns a connected client. */
export async function freshDb(name: string): Promise<MiniPg> {
  const socket = process.env.KEPO_PG_TEST_SOCKET!;
  const port = Number(process.env.KEPO_PG_TEST_PORT);
  const admin = await MiniPg.connect(socket, port, process.env.KEPO_PG_TEST_DB!);
  await admin.exec(`DROP DATABASE IF EXISTS ${name}`);
  await admin.exec(`CREATE DATABASE ${name}`);
  await admin.end();
  const db = await MiniPg.connect(socket, port, name);
  const dir = path.resolve(__dirname, '../db/migrations');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return db;
}

export async function addUser(db: MiniPg, email: string, currency = 'CZK'): Promise<number> {
  const r = await db.query(
    "INSERT INTO users (email, password_hash, name, currency, email_verified_at) VALUES ($1,'x',$2,$3, now()) RETURNING id",
    [email, email.split('@')[0], currency]
  );
  return r.rows[0].id as number;
}
