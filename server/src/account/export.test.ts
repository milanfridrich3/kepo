// Dependency-free unit tests: run with `npm test -w server` (node:test via tsx).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountExport, exportFileName, exportablePhotoLink, EXPORT_FORMAT, EXPORT_VERSION } from './export';
import type { AccountExportInput } from './export';
import type { Item, User } from '../types';

const user: User = {
  id: 7,
  email: 'ana@example.com',
  name: 'Ana',
  createdAt: '2026-01-02T03:04:05.000Z',
  language: 'cs',
  currency: 'CZK',
  emailVerified: true,
  reminderEmails: false,
  avatarUpdatedAt: null,
};

function item(over: Partial<Item> & Pick<Item, 'id' | 'name'>): Item {
  return {
    userId: 7,
    categoryId: null,
    categoryName: null,
    photoUrl: null,
    imageUpdatedAt: null,
    locationId: null,
    status: 'with_me',
    purchaseDate: null,
    value: null,
    currency: 'CZK',
    warrantyExpiration: null,
    serialNumber: null,
    notes: null,
    quantity: 1,
    brand: null,
    model: null,
    tags: [],
    extraPhotoCount: 0,
    documentCount: 0,
    archived: false,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    borrower: null,
    ...over,
  };
}

const input: AccountExportInput = {
  user,
  locations: [
    { id: 1, name: 'Home', parentId: null },
    { id: 2, name: 'Garage', parentId: 1 },
    { id: 3, name: 'Shelf 2', parentId: 2 },
  ],
  items: [
    item({ id: 10, name: 'Drill', categoryName: 'Tools', locationId: 3, value: 1999.5, currency: 'CZK', imageUpdatedAt: '2026-03-01T00:00:00.000Z' }),
    item({ id: 11, name: 'Old lamp', archived: true, value: 12, currency: 'EUR', notes: 'řádek 1\nřádek 2' }),
  ],
  loans: [
    { id: 5, itemId: 10, borrowerName: 'Petr', lentDate: '2026-03-05', expectedReturnDate: null, returned: true, returnedDate: '2026-03-09' },
    { id: 6, itemId: 99, borrowerName: 'Eva', lentDate: '2026-03-10', expectedReturnDate: '2026-04-01', returned: false, returnedDate: null },
  ],
  moves: [{ id: 1, itemId: 10, fromLocationId: 1, toLocationId: 3, movedAt: new Date('2026-03-02T10:00:00.000Z') }],
};

const now = new Date('2026-10-12T12:00:00.000Z');

test('export carries the format marker, version and timestamp', () => {
  const out = buildAccountExport(input, now);
  assert.equal(out.format, EXPORT_FORMAT);
  assert.equal(out.version, EXPORT_VERSION);
  assert.equal(out.exportedAt, '2026-10-12T12:00:00.000Z');
});

test('account section has the profile but no credentials or internal ids', () => {
  const out = buildAccountExport(input, now);
  assert.deepEqual(out.account, {
    email: 'ana@example.com',
    name: 'Ana',
    language: 'cs',
    currency: 'CZK',
    emailVerified: true,
    createdAt: '2026-01-02T03:04:05.000Z',
    hasProfilePicture: false,
  });
  // No field anywhere in the document may carry a credential, a binary image or an internal user id.
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        keys.add(k.toLowerCase());
        walk(v);
      }
    }
  };
  walk(out);
  for (const forbidden of ['password', 'passwordhash', 'password_hash', 'secret_hash', 'token', 'userid', 'user_id', 'avatar_data', 'image_data', 'imagedata', 'imageupdatedat', 'avatarupdatedat']) {
    assert.ok(!keys.has(forbidden), `export must not contain a "${forbidden}" field`);
  }
  assert.ok(!('id' in out.account));
});

test('locations get their full path, and items resolve theirs', () => {
  const out = buildAccountExport(input, now);
  assert.deepEqual(out.locations.map(l => l.path), ['Home', 'Home → Garage', 'Home → Garage → Shelf 2']);
  assert.equal(out.items[0].locationPath, 'Home → Garage → Shelf 2');
  assert.equal(out.items[1].locationPath, null);
});

test('items keep their own currency and amount, and archived items are included', () => {
  const out = buildAccountExport(input, now);
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.items.map(i => [i.value, i.currency, i.archived]), [[1999.5, 'CZK', false], [12, 'EUR', true]]);
  assert.equal(out.items[1].notes, 'řádek 1\nřádek 2');
});

test('photos are reported as flags, never as data', () => {
  const out = buildAccountExport(input, now);
  assert.equal(out.items[0].hasUploadedPhoto, true);
  assert.equal(out.items[1].hasUploadedPhoto, false);
  assert.ok(!('imageUpdatedAt' in out.items[0]));
  const withAvatar = buildAccountExport({ ...input, user: { ...user, avatarUpdatedAt: '2026-04-01T00:00:00.000Z' } }, now);
  assert.equal(withAvatar.account.hasProfilePicture, true);
});

test('loans name their item; a loan whose item is unknown gets null instead of failing', () => {
  const out = buildAccountExport(input, now);
  assert.equal(out.loans[0].itemName, 'Drill');
  assert.equal(out.loans[1].itemName, null);
  assert.equal(out.loans[1].returned, false);
});

test('move timestamps are ISO text whether the driver gave a Date or a string', () => {
  const out = buildAccountExport(
    { ...input, moves: [...input.moves, { id: 2, itemId: 10, fromLocationId: 3, toLocationId: null, movedAt: '2026-03-03T00:00:00.000Z' }] },
    now
  );
  assert.deepEqual(out.moves.map(m => m.movedAt), ['2026-03-02T10:00:00.000Z', '2026-03-03T00:00:00.000Z']);
});

test('a location cycle in bad data terminates instead of looping', () => {
  const out = buildAccountExport(
    { ...input, locations: [{ id: 1, name: 'A', parentId: 2 }, { id: 2, name: 'B', parentId: 1 }], items: [], loans: [], moves: [] },
    now
  );
  assert.equal(out.locations.length, 2);
  assert.ok(out.locations.every(l => l.path.length > 0));
});

test('an empty account still exports a valid, complete document', () => {
  const out = buildAccountExport({ user, locations: [], items: [], loans: [], moves: [] }, now);
  assert.deepEqual([out.locations, out.items, out.loans, out.moves], [[], [], [], []]);
  assert.ok(out.notes.length >= 3);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(out)));
});

test('the export file name is dated in UTC and header-safe', () => {
  assert.equal(exportFileName(now), 'kepo-export-2026-10-12.json');
  assert.match(exportFileName(new Date('2026-01-05T23:59:59.000Z')), /^kepo-export-2026-01-05\.json$/);
});

test('the legacy photo link is exported only as a clean http(s) web link', () => {
  // kept exactly as saved
  assert.equal(exportablePhotoLink('https://cdn.example.com/a.jpg?x=1#top'), 'https://cdn.example.com/a.jpg?x=1#top');
  assert.equal(exportablePhotoLink('http://example.com'), 'http://example.com');
  assert.equal(exportablePhotoLink('  https://example.com/a.png  '), 'https://example.com/a.png');
  // embedded credentials are removed, the rest is kept
  assert.equal(exportablePhotoLink('https://ana:s3cret@cdn.example.com/a.jpg?x=1'), 'https://cdn.example.com/a.jpg?x=1');
  assert.equal(exportablePhotoLink('https://ana@cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  // anything that is not a web link is left out: internal paths, other schemes, free text, junk
  for (const bad of [
    '/api/items/10/image?v=2026-03-01T00:00:00.000Z',
    'items/10/image',
    'C:\\photos\\a.jpg',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'ftp://example.com/a.jpg',
    'my old photo',
    '',
    '   ',
    `https://example.com/${'a'.repeat(2100)}`,
  ]) {
    assert.equal(exportablePhotoLink(bad), null, `should be left out: ${bad.slice(0, 40)}`);
  }
  assert.equal(exportablePhotoLink(null), null);
  assert.equal(exportablePhotoLink(undefined), null);
});

test('no stored credential or internal path reaches the document through the photo fields', () => {
  const out = buildAccountExport(
    {
      ...input,
      items: [
        item({ id: 20, name: 'A', photoUrl: 'https://ana:s3cret@cdn.example.com/a.jpg' }),
        item({ id: 21, name: 'B', photoUrl: '/api/items/21/image?v=1', imageUpdatedAt: '2026-03-01T00:00:00.000Z' }),
        item({ id: 22, name: 'C', photoUrl: 'javascript:alert(1)' }),
      ],
    },
    now
  );
  assert.deepEqual(out.items.map(i => i.photoLink), ['https://cdn.example.com/a.jpg', null, null]);
  assert.deepEqual(out.items.map(i => i.hasUploadedPhoto), [false, true, false]);
  const text = JSON.stringify(out);
  for (const leaked of ['s3cret', '/api/items', 'image?v=', 'javascript:']) {
    assert.ok(!text.includes(leaked), `export must not contain "${leaked}"`);
  }
});
