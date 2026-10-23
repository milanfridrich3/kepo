import type { Db } from '../items/service';

/**
 * Deletes an account and everything that belongs to it. Run it inside a transaction.
 *
 * Households need an explicit step: `household_members.user_id` cascades from the user,
 * but the household row itself does not, so deleting an owner would leave an ownerless
 * household that the remaining members can neither manage nor invite to. Households
 * owned by this account are therefore deleted first (members and invitations cascade
 * from the household). Other members' accounts and items are never touched.
 * Everything else (locations, items, loans, ...) cascades from users.id as before.
 */
export async function deleteAccount(db: Db, userId: number): Promise<void> {
  await db.query(
    "DELETE FROM households WHERE id IN (SELECT household_id FROM household_members WHERE user_id = $1 AND role = 'owner')",
    [userId]
  );
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
}
