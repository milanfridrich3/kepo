import crypto from 'node:crypto';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { parseRequiredString } from '../utils/validation';
import type { Db } from '../items/service';

/**
 * Households: people who agree to let each other SEE (never change) their items.
 *
 * Rules, all enforced here and tested on a real PostgreSQL (service.pg.test.ts):
 *  - an item always belongs to exactly one account; nobody else can edit, move, lend or
 *    delete it. A household only adds a read-only list (`sharedItems`).
 *  - sharing is opt-in per member (`share_items`, default off) and can be switched off at
 *    any time; the list is computed live, so it takes effect immediately.
 *  - the shared view deliberately leaves out money, serial numbers, notes, loan details,
 *    photos and documents. Only what helps find things is shared.
 *  - a person is in at most one household; at most 6 members; one owner.
 *  - invitations are single-use codes that expire after 7 days; only a hash is stored.
 */

export const MAX_HOUSEHOLD_MEMBERS = 6;
export const MAX_ACTIVE_INVITES = 5;
export const INVITE_TTL_DAYS = 7;

// No 0/O, 1/I/L: codes are read aloud and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(randomBytes: (n: number) => Buffer = crypto.randomBytes): string {
  const out: string[] = [];
  while (out.length < 10) {
    for (const b of randomBytes(16)) {
      if (b < 248 && out.length < 10) out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]); // 248 = 8 * 31: no modulo bias
    }
  }
  return `${out.slice(0, 5).join('')}-${out.slice(5).join('')}`;
}

export function normalizeInviteCode(raw: unknown): string {
  if (typeof raw !== 'string') throw badRequest('Enter the invitation code');
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z2-9]{10}$/.test(code) || /[ILO]/.test(code)) throw badRequest('That invitation code is not valid');
  return code;
}

export const hashInviteCode = (normalized: string) => crypto.createHash('sha256').update(normalized).digest('hex');

export interface HouseholdView {
  id: number;
  name: string;
  role: 'owner' | 'member';
  shareItems: boolean;
  members: { userId: number; name: string; role: 'owner' | 'member'; shareItems: boolean; isYou: boolean }[];
  /** Owner only: invitations that can still be used (the code itself is only shown when created). */
  pendingInvites: { id: number; expiresAt: string }[];
}

export async function getHousehold(db: Db, userId: number): Promise<HouseholdView | null> {
  const me = await db.query(
    `SELECT h.id, h.name, m.role, m.share_items FROM household_members m JOIN households h ON h.id = m.household_id WHERE m.user_id = $1`,
    [userId]
  );
  if (me.rows.length === 0) return null;
  const h = me.rows[0];
  const members = await db.query(
    `SELECT m.user_id, u.name, m.role, m.share_items FROM household_members m JOIN users u ON u.id = m.user_id
      WHERE m.household_id = $1 ORDER BY (m.role = 'owner') DESC, m.joined_at, m.user_id`,
    [h.id]
  );
  let pending: { id: number; expiresAt: string }[] = [];
  if (h.role === 'owner') {
    const inv = await db.query(
      'SELECT id, expires_at FROM household_invites WHERE household_id = $1 AND used_at IS NULL AND expires_at > now() ORDER BY id',
      [h.id]
    );
    pending = inv.rows.map(r => ({ id: r.id, expiresAt: (r.expires_at as Date).toISOString() }));
  }
  return {
    id: h.id, name: h.name, role: h.role, shareItems: h.share_items,
    members: members.rows.map(r => ({ userId: r.user_id, name: r.name, role: r.role, shareItems: r.share_items, isYou: r.user_id === userId })),
    pendingInvites: pending,
  };
}

export async function createHousehold(db: Db, userId: number, rawName: unknown): Promise<void> {
  const name = parseRequiredString(rawName, 'Household name', 60);
  const existing = await db.query('SELECT 1 FROM household_members WHERE user_id = $1', [userId]);
  if (existing.rows.length > 0) throw conflict('You are already in a household');
  const h = await db.query('INSERT INTO households (name) VALUES ($1) RETURNING id', [name]);
  await db.query("INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')", [h.rows[0].id, userId]);
}

async function ownedHousehold(db: Db, userId: number): Promise<number> {
  const { rows } = await db.query("SELECT household_id FROM household_members WHERE user_id = $1 AND role = 'owner' FOR UPDATE", [userId]);
  if (rows.length === 0) throw forbidden('Only the owner of the household can do this');
  return rows[0].household_id as number;
}

/** Owner only. Returns the code ONCE; the database keeps only its hash. */
export async function createInvite(db: Db, userId: number, now: Date = new Date()): Promise<{ code: string; expiresAt: string }> {
  const householdId = await ownedHousehold(db, userId);
  const active = await db.query('SELECT count(*)::int AS n FROM household_invites WHERE household_id = $1 AND used_at IS NULL AND expires_at > now()', [householdId]);
  if (active.rows[0].n >= MAX_ACTIVE_INVITES) throw conflict(`There are already ${MAX_ACTIVE_INVITES} open invitations`);
  const code = generateInviteCode();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
  await db.query(
    'INSERT INTO household_invites (household_id, code_hash, created_by, expires_at) VALUES ($1, $2, $3, $4)',
    [householdId, hashInviteCode(normalizeInviteCode(code)), userId, expiresAt]
  );
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function revokeInvite(db: Db, userId: number, inviteId: number): Promise<void> {
  const householdId = await ownedHousehold(db, userId);
  const { rowCount } = await db.query('DELETE FROM household_invites WHERE id = $1 AND household_id = $2 AND used_at IS NULL', [inviteId, householdId]);
  if (!rowCount) throw notFound('Invitation not found');
}

export async function joinHousehold(db: Db, userId: number, rawCode: unknown): Promise<void> {
  const hash = hashInviteCode(normalizeInviteCode(rawCode));
  const already = await db.query('SELECT 1 FROM household_members WHERE user_id = $1', [userId]);
  if (already.rows.length > 0) throw conflict('You are already in a household');
  const inv = await db.query(
    `SELECT id, household_id FROM household_invites WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
    [hash]
  );
  // One message for unknown, used and expired codes, so a code cannot be probed.
  if (inv.rows.length === 0) throw badRequest('That invitation code is not valid');
  const householdId = inv.rows[0].household_id as number;
  await db.query('SELECT id FROM households WHERE id = $1 FOR UPDATE', [householdId]); // serialise concurrent joins
  const n = (await db.query('SELECT count(*)::int AS n FROM household_members WHERE household_id = $1', [householdId])).rows[0].n as number;
  if (n >= MAX_HOUSEHOLD_MEMBERS) throw conflict('This household is full');
  await db.query("INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')", [householdId, userId]);
  await db.query('UPDATE household_invites SET used_by = $1, used_at = now() WHERE id = $2', [userId, inv.rows[0].id]);
}

export async function leaveHousehold(db: Db, userId: number): Promise<void> {
  const { rows } = await db.query('SELECT household_id, role FROM household_members WHERE user_id = $1 FOR UPDATE', [userId]);
  if (rows.length === 0) throw notFound('You are not in a household');
  const { household_id: hid, role } = rows[0];
  if (role === 'owner') {
    const others = await db.query('SELECT count(*)::int AS n FROM household_members WHERE household_id = $1 AND user_id <> $2', [hid, userId]);
    if (others.rows[0].n > 0) throw conflict('Remove the other members first, or delete the household');
    await db.query('DELETE FROM households WHERE id = $1', [hid]);
    return;
  }
  await db.query('DELETE FROM household_members WHERE user_id = $1', [userId]);
}

export async function deleteHousehold(db: Db, userId: number): Promise<void> {
  const hid = await ownedHousehold(db, userId);
  await db.query('DELETE FROM households WHERE id = $1', [hid]); // members and invitations go with it; nobody's items are touched
}

export async function removeMember(db: Db, ownerId: number, memberUserId: number): Promise<void> {
  const hid = await ownedHousehold(db, ownerId);
  if (memberUserId === ownerId) throw badRequest('You cannot remove yourself; leave or delete the household instead');
  const { rowCount } = await db.query('DELETE FROM household_members WHERE household_id = $1 AND user_id = $2 AND role = \'member\'', [hid, memberUserId]);
  if (!rowCount) throw notFound('Member not found');
}

export async function setSharing(db: Db, userId: number, share: boolean): Promise<void> {
  const { rowCount } = await db.query('UPDATE household_members SET share_items = $2 WHERE user_id = $1', [userId, share]);
  if (!rowCount) throw notFound('You are not in a household');
}

export interface SharedItem {
  id: number;
  name: string;
  ownerName: string;
  ownerUserId: number;
  categoryName: string | null;
  brand: string | null;
  model: string | null;
  tags: string[];
  quantity: number;
  status: string;
  locationPath: string | null;
  warrantyExpiration: string | null;
}

function pathOf(locs: Map<number, { name: string; parent: number | null }>, id: number | null): string | null {
  if (id === null) return null;
  const chain: string[] = []; const seen = new Set<number>();
  let cur = locs.get(id); let curId: number | null = id;
  while (cur && curId !== null && !seen.has(curId)) { seen.add(curId); chain.unshift(cur.name); curId = cur.parent; cur = curId === null ? undefined : locs.get(curId); }
  return chain.length ? chain.join(' → ') : null;
}

/** Active items of the OTHER household members who switched sharing on. Never includes the caller's own items or anyone outside the household. */
export async function sharedItems(db: Db, userId: number, search?: string): Promise<SharedItem[]> {
  const params: unknown[] = [userId];
  let extra = '';
  if (search && search.trim()) {
    params.push(`%${search.trim().slice(0, 100).replace(/[\\%_]/g, c => `\\${c}`)}%`);
    extra = ` AND (i.name ILIKE $2 OR i.brand ILIKE $2 OR i.model ILIKE $2 OR EXISTS (SELECT 1 FROM unnest(i.tags) tg WHERE tg ILIKE $2))`;
  }
  const { rows } = await db.query(
    `SELECT i.id, i.name, i.user_id, u.name AS owner_name, c.name AS category_name, i.brand, i.model, i.tags, i.quantity,
            i.status, i.location_id, to_char(i.warranty_expiration, 'YYYY-MM-DD') AS warranty_expiration
       FROM household_members me
       JOIN household_members m ON m.household_id = me.household_id AND m.user_id <> me.user_id AND m.share_items = true
       JOIN items i ON i.user_id = m.user_id AND i.archived = false
       JOIN users u ON u.id = i.user_id
       LEFT JOIN categories c ON c.id = i.category_id
      WHERE me.user_id = $1${extra}
      ORDER BY i.name, i.id`,
    params
  );
  if (rows.length === 0) return [];
  const owners = [...new Set(rows.map(r => r.user_id as number))];
  const locRows = await db.query('SELECT id, name, parent_id FROM locations WHERE user_id = ANY($1::int[])', [owners]);
  const locs = new Map<number, { name: string; parent: number | null }>(locRows.rows.map(l => [l.id as number, { name: l.name as string, parent: l.parent_id as number | null }]));
  return rows.map(r => ({
    id: r.id, name: r.name, ownerName: r.owner_name, ownerUserId: r.user_id, categoryName: r.category_name,
    brand: r.brand, model: r.model, tags: r.tags, quantity: r.quantity, status: r.status,
    locationPath: pathOf(locs, r.location_id), warrantyExpiration: r.warranty_expiration,
  }));
}
