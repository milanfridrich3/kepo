/**
 * Minimal PostgreSQL client for TESTS ONLY (no dependency, not used by the app).
 *
 * It speaks the PostgreSQL wire protocol (v3, extended query protocol with text
 * results) over a Unix socket to a throwaway local cluster using "trust"
 * authentication. It exists so route/service SQL can be run against a real
 * database in environments where the `pg` package cannot be installed.
 * Value conversion mirrors what the app expects from `pg` plus db/pool.ts:
 * int2/int4 -> number, int8 and numeric -> string, bool -> boolean, date ->
 * 'YYYY-MM-DD' string, timestamp(tz) -> Date, json(b) -> parsed, text[] -> string[].
 */
import net from 'node:net';

export interface MiniResult { rows: any[]; rowCount: number | null }
export interface MiniDb { query(text: string, values?: unknown[]): Promise<MiniResult> }

export class PgError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}

function parseTextArray(s: string): string[] {
  const out: string[] = [];
  let i = 1; // skip {
  while (i < s.length - 1) {
    if (s[i] === '"') {
      let v = ''; i++;
      while (s[i] !== '"') { if (s[i] === '\\') i++; v += s[i++]; }
      i++; out.push(v);
    } else {
      let v = '';
      while (i < s.length - 1 && s[i] !== ',') v += s[i++];
      out.push(v === 'NULL' ? (null as unknown as string) : v);
    }
    if (s[i] === ',') i++;
  }
  return out;
}

function convert(oid: number, raw: string): unknown {
  switch (oid) {
    case 21: case 23: case 26: return Number(raw);
    case 16: return raw === 't';
    case 17: return Buffer.from(raw.slice(2), 'hex'); // bytea arrives as \x... hex text
    case 1114: return new Date(raw.replace(' ', 'T') + 'Z');
    case 1184: return new Date(raw);
    case 114: case 3802: return JSON.parse(raw);
    case 1009: case 1015: return parseTextArray(raw);
    default: return raw; // text, varchar, numeric, int8, date, enums, bytea (hex text)...
  }
}

function encodeParam(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return '\\x' + v.toString('hex');
  if (Array.isArray(v)) return '{' + v.map(x => x === null ? 'NULL' : '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const i16 = (n: number) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
const msg = (type: string, body: Buffer) => Buffer.concat([Buffer.from(type), i32(body.length + 4), body]);

export class MiniPg implements MiniDb {
  private sock!: net.Socket;
  private buf = Buffer.alloc(0);
  private waiter: (() => void) | null = null;
  private closed = false;
  private lastError: PgError | null = null;

  static async connect(socketDir: string, port: number, database: string, user = 'postgres'): Promise<MiniPg> {
    const c = new MiniPg();
    c.sock = net.createConnection(`${socketDir}/.s.PGSQL.${port}`);
    c.sock.on('data', d => { c.buf = Buffer.concat([c.buf, d as Uint8Array]) as typeof c.buf; c.waiter?.(); });
    c.sock.on('close', () => { c.closed = true; c.waiter?.(); });
    await new Promise<void>((res, rej) => { c.sock.once('connect', () => res()); c.sock.once('error', rej); });
    const params = Buffer.concat([cstr('user'), cstr(user), cstr('database'), cstr(database), Buffer.from([0])]);
    c.sock.write(Buffer.concat([i32(params.length + 8), i32(196608), params]));
    await c.readUntilReady();
    return c;
  }

  private async next(): Promise<{ type: string; body: Buffer }> {
    for (;;) {
      if (this.buf.length >= 5) {
        const len = this.buf.readInt32BE(1);
        if (this.buf.length >= len + 1) {
          const type = String.fromCharCode(this.buf[0]);
          const body = this.buf.subarray(5, len + 1);
          this.buf = this.buf.subarray(len + 1);
          return { type, body };
        }
      }
      // A FATAL ErrorResponse (e.g. unknown role) is followed by a closed socket, never ReadyForQuery:
      // report the server's message instead of a bare 'connection closed'.
      if (this.closed) throw this.lastError ?? new Error('connection closed');
      await new Promise<void>(r => { this.waiter = r; });
    }
  }

  private async readUntilReady(): Promise<MiniResult> {
    let fields: { name: string; oid: number }[] = [];
    const rows: any[] = [];
    let rowCount: number | null = null;
    let error: PgError | null = null;
    for (;;) {
      const { type, body } = await this.next();
      if (type === 'T') {
        fields = []; let p = 2;
        const n = body.readInt16BE(0);
        for (let i = 0; i < n; i++) {
          const end = body.indexOf(0, p);
          const name = body.toString('utf8', p, end);
          p = end + 1;
          const oid = body.readInt32BE(p + 6);
          p += 18;
          fields.push({ name, oid });
        }
      } else if (type === 'D') {
        const n = body.readInt16BE(0); let p = 2;
        const row: any = {};
        for (let i = 0; i < n; i++) {
          const len = body.readInt32BE(p); p += 4;
          if (len === -1) row[fields[i].name] = null;
          else { row[fields[i].name] = convert(fields[i].oid, body.toString('utf8', p, p + len)); p += len; }
        }
        rows.push(row);
      } else if (type === 'C') {
        const tag = body.toString('utf8', 0, body.length - 1);
        const last = tag.split(' ').pop();
        rowCount = last !== undefined && /^\d+$/.test(last) ? Number(last) : null;
      } else if (type === 'E') {
        let code = ''; let message = ''; let p = 0;
        while (body[p] !== 0) {
          const f = String.fromCharCode(body[p]); const end = body.indexOf(0, p + 1);
          const v = body.toString('utf8', p + 1, end); p = end + 1;
          if (f === 'C') code = v; if (f === 'M') message = v;
        }
        error = new PgError(message, code);
        this.lastError = error;
      } else if (type === 'Z') {
        this.lastError = null;
        if (error) throw error;
        return { rows, rowCount };
      }
    }
  }

  /** Extended protocol: parameters are bound, never interpolated. */
  async query(text: string, values: unknown[] = []): Promise<MiniResult> {
    const parts = [
      msg('P', Buffer.concat([cstr(''), cstr(text), i16(0)])),
      msg('B', Buffer.concat([
        cstr(''), cstr(''), i16(0), i16(values.length),
        ...values.map(v => { const e = encodeParam(v); return e === null ? i32(-1) : Buffer.concat([i32(Buffer.byteLength(e)), Buffer.from(e)]); }),
        i16(0),
      ])),
      msg('D', Buffer.concat([Buffer.from('P'), cstr('')])),
      msg('E', Buffer.concat([cstr(''), i32(0)])),
      msg('S', Buffer.alloc(0)),
    ];
    this.sock.write(Buffer.concat(parts));
    return this.readUntilReady();
  }

  /** Simple protocol: several statements at once (migrations). No parameters. */
  async exec(sql: string): Promise<void> {
    this.sock.write(msg('Q', cstr(sql)));
    await this.readUntilReady();
  }

  /** Same contract as db/pool.ts withTransaction, on this one connection. */
  async withTransaction<T>(fn: (db: MiniDb) => Promise<T>): Promise<T> {
    await this.exec('BEGIN');
    try { const r = await fn(this); await this.exec('COMMIT'); return r; }
    catch (e) { await this.exec('ROLLBACK').catch(() => undefined); throw e; }
  }

  async end(): Promise<void> {
    this.sock.write(msg('X', Buffer.alloc(0)));
    this.sock.end();
  }
}
