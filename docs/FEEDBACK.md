# Feedback (Settings → Feedback)

Signed-in people with a confirmed email can send a message with one of four categories: **Bug report**, **Idea**,
**Privacy** and **Other** (`bug`, `idea`, `privacy`, `other` in the API and database).

## How it works

- UI: `client/src/components/FeedbackSettings.tsx` (shown in Settings). Client checks: 10 to 4000 characters.
- API: `POST /api/feedback { category, message }` (`server/src/routes/feedback.routes.ts`), mounted behind `requireAuth` and
  `requireVerified` like the other data routes. There is **no public (signed-out) endpoint**.
- Server checks (`server/src/feedback/service.ts`): category must be one of the four; message 10 to 4000 characters after trimming;
  control characters removed; at most 5 per hour per account (in-memory limiter) and 10 per rolling 24 hours (database count).
  The JSON body limit of the API (100 kB) applies too. The database enforces category and length with CHECK constraints.
- Storage: table `feedback` (migration `0012_feedback.sql`, additive, PostgreSQL): `id, user_id, category, message, language,
  created_at, notified_at`. `user_id` is `ON DELETE CASCADE`: deleting an account deletes its feedback. Feedback is not part of
  the data export (the export notes and the privacy notice say so).
- Notification: after the row is saved, one email goes through the existing Resend setup (`RESEND_API_KEY`, `EMAIL_FROM`) to the address in
  **`FEEDBACK_NOTIFY_EMAIL`**. The email contains the number, category, time and the full message text (HTML-escaped, plus a plain-text
  version; subject `[Kepo] Privacy request #N` for the Privacy category, never containing the message) and nothing that identifies the sender. `notified_at` is set when the provider accepts it.
- The answer of `POST /api/feedback` is `{ id, notified }`. `notified: false` means the message is stored but the provider did not accept
  the notification within 5 seconds, or `FEEDBACK_NOTIFY_EMAIL` / Resend is not configured. The form then tells the user plainly that the
  message was saved but the operator could not be notified automatically; it never implies someone was told.

## Configuration (Render, API web service → Environment)

| Variable | Purpose | Value |
|---|---|---|
| `FEEDBACK_NOTIFY_EMAIL` | Private mailbox that receives the feedback notifications. A secret: set it only in Render, never in the repository, the client build (`VITE_*`) or the legal pages. | One valid email address you read (for example your own). Whitespace is trimmed; an invalid value counts as unset. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Already required for all Kepo emails. | Unchanged. The sending domain must be verified in Resend. |

Why not `EMAIL_REPLY_TO`: that value is sent as the Reply-To header of every email Kepo delivers, so using it would show your private
mailbox to every user. Feedback therefore has its own variable and `EMAIL_REPLY_TO` is not used.

If `FEEDBACK_NOTIFY_EMAIL` is missing the API logs `[config] FEEDBACK_NOTIFY_EMAIL is not set ...` at start and
`[feedback] stored, but no notification sent` per message. Feedback is still stored. Do not announce the form as monitored until a
test message of each category has reached your mailbox. Messages that were never notified can be listed with
`SELECT id, category, created_at FROM feedback WHERE notified_at IS NULL ORDER BY id;`.

## Reading and answering feedback (there is no admin interface)

Run in a database console (Render → database → connect). Replace N with the number from the email:

```sql
SELECT f.id, f.category, f.created_at, f.notified_at, f.message, u.email, u.name
  FROM feedback f JOIN users u ON u.id = f.user_id
 WHERE f.id = N;
-- everything not yet seen, newest first
SELECT id, category, created_at, left(message, 80) FROM feedback ORDER BY created_at DESC LIMIT 50;
```

Privacy requests have legal deadlines (GDPR Art. 12: one month): verify who is asking, then act (access, correction, erasure)
and answer from your own mailbox. Deleting the sender's account removes the feedback row too, so keep your own record of
the request and your answer if you need one.

## Known limits

- Requires sign-in. Someone who cannot sign in, or who has deleted the account, cannot use it. The privacy policy and terms state this limit and name no
  other channel.
- A message cannot be edited or deleted by the sender except by deleting the account.
