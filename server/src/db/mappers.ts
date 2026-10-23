import { Item, User } from '../types';

// Shared SELECT for building a User response. Deliberately excludes
// password_hash and the avatar_data bytes (the avatar is served from its
// own endpoint, never inlined into a JSON response) — callers that also
// need password_hash (login) select it separately alongside this list.
export const USER_SELECT_COLUMNS = 'id, email, name, created_at, avatar_updated_at, language, currency, email_verified_at, reminder_emails';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapUserRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    avatarUpdatedAt: row.avatar_updated_at,
    language: row.language,
    currency: row.currency,
    emailVerified: row.email_verified_at !== null && row.email_verified_at !== undefined,
    reminderEmails: row.reminder_emails === true,
  };
}

// Shared SELECT used by both the item list and item detail queries, so the
// shape returned to the client is always identical.
export const ITEM_SELECT = `
  SELECT
    i.id, i.user_id, i.name, i.category_id, c.name AS category_name,
    i.photo_url, i.image_updated_at, i.location_id, i.status, i.purchase_date, i.value, i.currency,
    i.warranty_expiration, i.serial_number, i.notes, i.archived,
    i.quantity, i.brand, i.model, i.tags,
    (SELECT COUNT(*)::int FROM item_photos ip WHERE ip.item_id = i.id) AS extra_photo_count,
    (SELECT COUNT(*)::int FROM item_documents idoc WHERE idoc.item_id = i.id) AS document_count,
    i.created_at, i.updated_at,
    b.id AS borrowing_id, b.borrower_name, b.lent_date, b.expected_return_date
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN borrowings b ON b.item_id = i.id AND b.returned = false
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapItemRow(row: any): Item {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    photoUrl: row.photo_url,
    imageUpdatedAt: row.image_updated_at,
    locationId: row.location_id,
    status: row.status,
    purchaseDate: row.purchase_date,
    value: row.value === null ? null : Number(row.value),
    currency: row.currency,
    warrantyExpiration: row.warranty_expiration,
    serialNumber: row.serial_number,
    notes: row.notes,
    quantity: row.quantity ?? 1,
    brand: row.brand ?? null,
    model: row.model ?? null,
    tags: row.tags ?? [],
    extraPhotoCount: row.extra_photo_count ?? 0,
    documentCount: row.document_count ?? 0,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    borrower: row.borrowing_id
      ? {
          borrowingId: row.borrowing_id,
          borrowerName: row.borrower_name,
          lentDate: row.lent_date,
          expectedReturnDate: row.expected_return_date,
        }
      : null,
  };
}
