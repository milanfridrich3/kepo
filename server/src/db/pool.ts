import { Pool, PoolClient, types } from 'pg';

// PostgreSQL DATE columns (purchase_date, warranty_expiration, lent_date,
// expected_return_date, returned_date) must stay plain "YYYY-MM-DD"
// calendar-date strings all the way through the API. node-postgres's
// default parser for DATE (OID 1082) converts them into JS Date objects
// at UTC midnight instead, which causes two real bugs once that Date
// object is later JSON-serialized or reformatted:
//   1. res.json() turns a Date into a full ISO timestamp
//      ("2026-08-12T00:00:00.000Z"), which native <input type="date">
//      elements reject as invalid, so editing an item shows a blank
//      purchase/warranty date field.
//   2. Any later `new Date(...)`/local-timezone formatting of that value
//      can shift the displayed calendar day by one for a viewer whose
//      timezone is behind UTC.
// Overriding the type parser here, once, at the pool/driver boundary,
// disables that conversion for every query in the app (not just items),
// so DATE columns are always returned exactly as PostgreSQL sent them:
// a plain calendar-date string.
const PG_TYPE_ID_DATE = 1082;
types.setTypeParser(PG_TYPE_ID_DATE, (value: string) => value);

// A single shared connection pool for the whole server process.
// DATABASE_URL is required — see .env.example.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  // Fail fast instead of hanging a request forever when the database is
  // unreachable or a query is stuck.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 15_000,
});

pool.on('error', (err) => {
  // Errors on idle clients (e.g. connection dropped) — log, don't crash.
  console.error('Unexpected error on idle PostgreSQL client', err);
});

/**
 * Runs `fn` inside a single transaction on one connection: commits if it
 * resolves, rolls back (and rethrows) if it throws. Use for any operation
 * that performs more than one write that must succeed or fail together.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}
