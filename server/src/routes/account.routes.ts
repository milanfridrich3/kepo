import { Router } from 'express';
import { pool, withTransaction } from '../db/pool';
import { deleteAccount } from '../account/deleteAccount';
import { asyncHandler } from '../utils/asyncHandler';
import { badRequest, conflict, unauthorized } from '../utils/errors';
import { hashPassword, verifyPassword } from '../utils/password';
import { mapItemRow, mapUserRow, ITEM_SELECT, USER_SELECT_COLUMNS } from '../db/mappers';
import { rateLimit } from '../utils/rateLimit';
import { clearAuthCookie } from '../utils/cookies';
import { imageUpload, processUploadedImage } from '../utils/imageProcessing';
import { parseEmail, parseNewPassword, parseOptionalCurrency, parseOptionalLanguage, parseRequiredString } from '../utils/validation';
import { emailVerificationRequired, resendCooldownMs } from '../config';
import { createVerificationCode, deliverVerificationCode } from '../auth/emailFlows';
import { sendPasswordChangedEmail } from '../email/mailer';
import { buildAccountExport, exportFileName } from '../account/export';
import { itemsToCsv } from '../account/csv';
import type { User, VerificationInfo } from '../types';

export const accountRouter = Router();

const FIFTEEN_MIN = 15 * 60 * 1000;
const AVATAR_BOX = { width: 256, height: 256, fit: 'cover' as const };

// ---- Profile: display name ----

accountRouter.put('/profile', asyncHandler(async (req, res) => {
  const name = parseRequiredString(req.body?.name, 'Name', 120);

  const { rows } = await pool.query(
    `UPDATE users SET name = $1 WHERE id = $2 RETURNING ${USER_SELECT_COLUMNS}`,
    [name, req.user!.id]
  );
  res.json({ user: mapUserRow(rows[0]) });
}));

// ---- Preferences: language and currency ----
// Independent of each other. Changing the currency only sets the default for
// values entered from now on; amounts already stored keep their own currency
// (items.currency) and are never converted.

accountRouter.put('/preferences', asyncHandler(async (req, res) => {
  const language = parseOptionalLanguage(req.body?.language);
  const currency = parseOptionalCurrency(req.body?.currency);
  const reminderEmails = req.body?.reminderEmails;
  if (reminderEmails !== undefined && typeof reminderEmails !== 'boolean') throw badRequest('Reminders setting must be true or false');
  if (language === undefined && currency === undefined && reminderEmails === undefined) throw badRequest('Choose a language or a currency to save');

  const { rows } = await pool.query(
    `UPDATE users SET language = COALESCE($1, language), currency = COALESCE($2, currency),
                      reminder_emails = COALESCE($4::boolean, reminder_emails)
     WHERE id = $3 RETURNING ${USER_SELECT_COLUMNS}`,
    [language ?? null, currency ?? null, req.user!.id, reminderEmails ?? null]
  );
  res.json({ user: mapUserRow(rows[0]) });
}));

// ---- Email ----
// The change is gated behind the current password so an unlocked, left-open
// session cannot silently redirect the account to someone else's inbox — and,
// because that check is a password oracle, it is rate limited. The new
// address starts out unverified: a code is sent to it, and until it is
// entered the account is limited to the verification screen (requireVerified).
accountRouter.put('/email', asyncHandler(async (req, res) => {
  rateLimit(`email:${req.user!.id}`, 5, FIFTEEN_MIN);

  const { email, currentPassword } = req.body ?? {};
  const normalizedEmail = parseEmail(email);
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw badRequest('Current password is required');
  }

  const { rows: current } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  const ok = await verifyPassword(currentPassword, current[0].password_hash);
  if (!ok) throw unauthorized('Current password is incorrect');

  const existing = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [normalizedEmail, req.user!.id]);
  if (existing.rows.length > 0) throw conflict('An account with that email already exists');

  // Re-entering the current address changes nothing and must not un-verify it.
  if (normalizedEmail === req.user!.email) {
    res.json({ user: req.user, verification: { required: false, emailSent: false, retryAfterSeconds: 0 } satisfies VerificationInfo });
    return;
  }

  try {
    const mustVerify = emailVerificationRequired();
    const { user, issued } = await withTransaction(async client => {
      const { rows } = await client.query(
        `UPDATE users SET email = $1, email_verified_at = CASE WHEN $3::boolean THEN NULL ELSE now() END
         WHERE id = $2 RETURNING ${USER_SELECT_COLUMNS}`,
        [normalizedEmail, req.user!.id, mustVerify]
      );
      const updated = mapUserRow(rows[0]);
      const issued = mustVerify
        ? await createVerificationCode(client, { id: updated.id, email: updated.email, name: updated.name, language: updated.language })
        : null;
      return { user: updated, issued };
    });
    let emailSent = false;
    if (issued) {
      emailSent = await deliverVerificationCode({ id: user.id, email: user.email, name: user.name, language: user.language }, issued.code, issued.id);
    }
    const verification: VerificationInfo = {
      required: mustVerify,
      emailSent,
      retryAfterSeconds: emailSent ? Math.ceil(resendCooldownMs() / 1000) : 0,
    };
    res.json({ user, verification });
  } catch (err) {
    // Someone else registered the same address between the check and the update.
    if ((err as { code?: string }).code === '23505') throw conflict('An account with that email already exists');
    throw err;
  }
}));

// ---- Password ----

accountRouter.put('/password', asyncHandler(async (req, res) => {
  rateLimit(`password:${req.user!.id}`, 5, FIFTEEN_MIN);

  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw badRequest('Current password is required');
  }
  const validNew = parseNewPassword(newPassword, 'New password');

  const { rows: current } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  const ok = await verifyPassword(currentPassword, current[0].password_hash);
  if (!ok) throw unauthorized('Current password is incorrect');
  if (validNew === currentPassword) throw badRequest('Choose a new password that is different from the current one');

  const newHash = await hashPassword(validNew);
  // password_changed_at invalidates every token issued before this moment —
  // including sessions on other devices (see middleware/auth.ts, migration
  // 0005). This browser is signed out too and signs in with the new password.
  await pool.query('UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2', [newHash, req.user!.id]);

  // Security notice to the account's address (not awaited: delivery problems must not undo the change).
  void sendPasswordChangedEmail(
    { email: req.user!.email, name: req.user!.name, language: req.user!.language },
    req.user!.id,
    Date.now()
  );

  clearAuthCookie(res);
  res.status(204).end();
}));

// ---- Avatar ----

accountRouter.get('/avatar', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT avatar_data, avatar_mime FROM users WHERE id = $1', [req.user!.id]);
  if (rows.length === 0 || !rows[0].avatar_data) {
    res.status(404).json({ error: 'No avatar set' });
    return;
  }
  // The URL the client requests carries a `?v=<avatarUpdatedAt>` cache-buster
  // (see client/src/lib/avatar.ts), so the response itself can be cached
  // aggressively — a new upload always produces a new URL.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('Content-Type', rows[0].avatar_mime);
  res.send(rows[0].avatar_data);
}));

accountRouter.post('/avatar', imageUpload.single('avatar'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('No image file was uploaded');
  if (!file.mimetype.startsWith('image/')) throw badRequest('File must be an image');

  const output = await processUploadedImage(file.buffer, AVATAR_BOX);

  const { rows } = await pool.query(
    `UPDATE users SET avatar_data = $1, avatar_mime = 'image/webp', avatar_updated_at = now()
     WHERE id = $2 RETURNING ${USER_SELECT_COLUMNS}`,
    [output, req.user!.id]
  );
  res.json({ user: mapUserRow(rows[0]) });
}));

accountRouter.delete('/avatar', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE users SET avatar_data = NULL, avatar_mime = NULL, avatar_updated_at = NULL
     WHERE id = $1 RETURNING ${USER_SELECT_COLUMNS}`,
    [req.user!.id]
  );
  res.json({ user: mapUserRow(rows[0]) });
}));

// ---- Data export ----
// "Download my data": everything the account owns, as one JSON document
// (shape and exclusions: account/export.ts). Every query is scoped to the
// signed-in user, and they all run in one read-only REPEATABLE READ
// transaction so the file is a consistent snapshot even if the person edits
// something on another device while it is being built. Rate limited because
// it reads the account's whole data set.
async function loadAccountExport(user: User, now: Date) {
  return withTransaction(async db => {
    // Must be the first statement of the transaction.
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const locations = await db.query(
      'SELECT id, name, parent_id FROM locations WHERE user_id = $1 ORDER BY id',
      [user.id]
    );
    // Includes archived items (the "removed" ones); the open loan columns the
    // shared SELECT joins in are unused here, loans are exported in full below.
    const items = await db.query(`${ITEM_SELECT} WHERE i.user_id = $1 ORDER BY i.id`, [user.id]);
    // Both the loan and the item it belongs to must be the signed-in user's.
    const loans = await db.query(
      `SELECT b.id, b.item_id, b.borrower_name, b.lent_date, b.expected_return_date, b.returned, b.returned_date
       FROM borrowings b JOIN items i ON i.id = b.item_id
       WHERE b.user_id = $1 AND i.user_id = $1 ORDER BY b.id`,
      [user.id]
    );
    const moves = await db.query(
      `SELECT m.id, m.item_id, m.from_location_id, m.to_location_id, m.moved_at
       FROM item_moves m JOIN items i ON i.id = m.item_id
       WHERE i.user_id = $1 ORDER BY m.id`,
      [user.id]
    );

    return buildAccountExport(
      {
        user,
        locations: locations.rows.map(r => ({ id: r.id, name: r.name, parentId: r.parent_id })),
        items: items.rows.map(mapItemRow),
        loans: loans.rows.map(r => ({
          id: r.id,
          itemId: r.item_id,
          borrowerName: r.borrower_name,
          lentDate: r.lent_date,
          expectedReturnDate: r.expected_return_date,
          returned: r.returned,
          returnedDate: r.returned_date,
        })),
        moves: moves.rows.map(r => ({
          id: r.id,
          itemId: r.item_id,
          fromLocationId: r.from_location_id,
          toLocationId: r.to_location_id,
          movedAt: r.moved_at,
        })),
      },
      now
    );
  });
}

accountRouter.get('/export', asyncHandler(async (req, res) => {
  const user = req.user!;
  rateLimit(`export:${user.id}`, 5, FIFTEEN_MIN);

  const now = new Date();
  const document = await loadAccountExport(user, now);

  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(now)}"`);
  res.json(document);
}));

// Same data and the same limit as the JSON export, items only, as a CSV file
// for spreadsheets (account/csv.ts: formula-injection protection, BOM).
accountRouter.get('/export.csv', asyncHandler(async (req, res) => {
  const user = req.user!;
  rateLimit(`export:${user.id}`, 5, FIFTEEN_MIN);

  const now = new Date();
  const document = await loadAccountExport(user, now);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(now).replace(/\.json$/, '-items.csv')}"`);
  res.send(itemsToCsv(document));
}));

// ---- Account deletion ----
// Every table that references users.id (locations, items, borrowings) is
// declared ON DELETE CASCADE in migration 0001, and item_moves cascades
// from items the same way. Households are the exception (see account/deleteAccount.ts):
// the ones this account owns are deleted first so none is left without an owner.
accountRouter.delete('/', asyncHandler(async (req, res) => {
  rateLimit(`delete-account:${req.user!.id}`, 5, FIFTEEN_MIN);

  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password.length === 0) {
    throw badRequest('Your password is required to delete your account');
  }

  const { rows: current } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  const ok = await verifyPassword(password, current[0].password_hash);
  if (!ok) throw unauthorized('Incorrect password');

  await withTransaction(client => deleteAccount(client, req.user!.id));

  clearAuthCookie(res);
  res.status(204).end();
}));
