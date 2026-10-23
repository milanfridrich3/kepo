# Households (sharing)

A household is a small group (at most 6 people) who agree to let each other **see** what they have.

## Rules (enforced in `server/src/household/service.ts`, tested on PostgreSQL in `service.pg.test.ts`)
- Every item belongs to exactly one account. Nobody else can edit, move, lend or delete it, and no existing route changed to allow that.
- Sharing is opt-in per member (default **off**) and can be switched off at any time; it takes effect immediately (the list is computed live).
- The shared view contains: name, category, brand, model, tags, quantity, status, place path, warranty end date and the owner's name. It never contains
  value, currency, serial number, notes, loan details, photos, documents or removed items. A test searches the serialised answer for planted secrets.
- A person is in at most one household. One owner per household (database constraints).
- Invitations are single-use codes (10 characters from an alphabet without look-alike letters, shown as `ABCDE-FGHJK`), valid for 7 days, at most 5 open at a time;
  only a SHA-256 hash is stored and the code is shown once. Unknown, used and expired codes give the same message. Joining is rate limited (10 per 15 minutes per account).
- The owner can remove members and delete the household; a member can leave; the owner can only leave when alone. Nobody's items are touched by any of these.
- **Deleting an account:** if the account owns a household, that household is deleted with it (members and invitations go too, other members keep their accounts and items and can start or join a household again). A member who deletes their account simply leaves. Code: `server/src/account/deleteAccount.ts`, test: `deleteAccount.pg.test.ts`.

## Known limits
- No roles beyond owner and member, no ownership transfer, no per-item sharing (all active items or none).
- The rate limit is per backend instance (in memory).
- The HTTP routes (`routes/household.routes.ts`) were not executed (Express is not installed in the build sandbox); the service they call was.
