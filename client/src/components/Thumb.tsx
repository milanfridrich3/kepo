import { useState } from 'react';
import type { Item } from '../types';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/Icon';
import { isOwnItemImage, itemImageUrl } from '../lib/itemImage';

const CATEGORY_ICON: Record<string, IconName> = {
  Electronics: 'laptop',
  Tools: 'wrench',
  Clothing: 'shirt',
  Sports: 'activity',
  Books: 'book',
  Accessories: 'watch',
  Household: 'home',
  Collectibles: 'star',
  Other: 'items',
};

export function categoryIcon(categoryName: string | null): IconName {
  return (categoryName && CATEGORY_ICON[categoryName]) || 'items';
}

const BOX = {
  sm: 'h-8 w-8 rounded-control',
  md: 'h-10 w-10 rounded-control',
  lg: 'h-[72px] w-[72px] rounded-card',
  fill: 'aspect-[4/3] w-full',
} as const;

const GLYPH = {
  sm: 'h-4 w-4',
  md: 'h-[18px] w-[18px]',
  lg: 'h-7 w-7',
  fill: 'h-8 w-8',
} as const;

/** Item image when available; otherwise a calm category glyph on a sunken tile. */
export function Thumb({ item, size = 'md' }: { item: Item; size?: keyof typeof BOX }) {
  const [failed, setFailed] = useState(false);
  const src = itemImageUrl(item);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        // Only our own /api/items/:id/image endpoint needs the auth
        // cookie sent cross-site; a legacy external photoUrl must NOT get
        // this attribute, since requesting an arbitrary third-party image
        // with credentials mode turns it into a CORS request that most
        // ordinary image hosts never opt into, which would break the
        // image instead of just loading it anonymously.
        crossOrigin={isOwnItemImage(item) ? 'use-credentials' : undefined}
        onError={() => setFailed(true)}
        className={`${BOX[size]} shrink-0 bg-sunken object-cover`}
      />
    );
  }
  return (
    <span className={`${BOX[size]} inline-flex shrink-0 items-center justify-center bg-sunken text-muted`}>
      <Icon name={categoryIcon(item.categoryName)} className={GLYPH[size]} strokeWidth={1.6} />
    </span>
  );
}
