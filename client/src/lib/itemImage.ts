import type { Item } from '../types';
import { API_URL, api } from './api';

/**
 * Builds the URL for an item's image: the real uploaded image when one
 * exists (cache-busted with `imageUpdatedAt`, mirroring
 * `client/src/lib/avatar.ts`), falling back to the legacy external
 * `photoUrl` link for any item that still only has one, or undefined when
 * neither is set (Thumb then falls back to a category glyph).
 */
export function itemImageUrl(item: Pick<Item, 'id' | 'imageUpdatedAt' | 'photoUrl'> | null | undefined): string | undefined {
  if (!item) return undefined;
  if (item.imageUpdatedAt) return `${API_URL}/items/${item.id}/image?v=${encodeURIComponent(item.imageUpdatedAt)}`;
  return item.photoUrl ?? undefined;
}

/** True only for the real-upload URL (our own API), which needs credentials to load. A legacy external photoUrl does not. */
export function isOwnItemImage(item: Pick<Item, 'imageUpdatedAt'> | null | undefined): boolean {
  return Boolean(item?.imageUpdatedAt);
}

/** What to do about an item's image when its form is saved, if anything. */
export type ImageAction = { file: File } | { remove: true } | null;

/**
 * Applies the image part of an item form submission *after* the item itself
 * was saved. It never throws: the item is already stored, so a failed photo
 * must not make the caller think the whole save failed (a retry would then
 * create a duplicate). Returns an error message to show, or null on success.
 */
export async function applyImageAction(itemId: number, action: ImageAction): Promise<string | null> {
  if (!action) return null;
  try {
    if ('file' in action) await api.uploadItemImage(itemId, action.file);
    else await api.removeItemImage(itemId);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'The photo could not be saved.';
  }
}
