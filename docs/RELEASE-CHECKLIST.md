# Public release checklist

What cannot be verified from the repository. Nothing here has been checked against the real Render, Resend or DNS
setup. Tick each item yourself; items are ordered by priority.

## 1. Must do before anyone outside the test group signs up

- [ ] **Feedback notifications (secret variable).** In Render, API web service → Environment, add `FEEDBACK_NOTIFY_EMAIL` = a private mailbox you
      read (server-only, never in the repository or `VITE_*`). Redeploy the API, confirm the start log has no `FEEDBACK_NOTIFY_EMAIL is not set`
      warning, then send one message of each category from Settings → Feedback: the form must say it was sent (not "saved only") and a mail
      `[Kepo] ... #N` must arrive within a minute (check spam). Apply migration `0012` (runs with `npm run migrate`). See `FEEDBACK.md`.
- [ ] **BLOCKER (decision): people who cannot sign in.** Settings → Feedback requires a signed-in, confirmed account. It cannot serve
      someone who lost access or already deleted their account, and no other channel exists in the code. The privacy policy and terms
      say so plainly and invent no fallback; decide whether that is acceptable for release or add a channel later (then edit
      `privacy.rights.body` and `terms.contact.body` in `client/src/i18n/{en,cs}/legal.ts`). The operator is named only as Milan
      Fridrich; no address, email, age or other personal detail is published, by instruction. Decide whether a postal address or
      legal form is required for the operator's actual status (natural person or business).
- [ ] **Legal review of the proposed texts.** The GDPR Art. 6 bases (contract; legitimate interests; legal obligation for privacy
      requests; consent for features you switch on), the Czech governing-law clause, and the suspension/"as is" clauses are proposals
      derived from what the app does, not verified legal advice. The policy states that backups/logs at Render and Resend follow their
      own schedules and that those providers may process data outside the EU/EEA under their own terms; confirm the DPAs and
      transfer safeguards in the Render and Resend accounts (nothing is claimed about them).
- [ ] **Render region and plan.** Confirm where the database and API run (EU region or not), and add it to the privacy
      notice if you want to state it. Confirm the database plan includes backups and how long they are kept (see
      `BACKUP-RESTORE.md`, "Deleted data and backups"); the notice says copies may remain "until backups expire".
- [ ] **Data Processing Agreements** accepted with Render and Resend (dashboard settings), and the Resend account's data
      region and log retention checked against the notice ("a limited time").
- [ ] **Production environment variables** on the API: `NODE_ENV=production`, strong `JWT_SECRET` (32+ chars, not the
      development one), `DATABASE_URL` (internal URL), `CLIENT_ORIGIN=https://app.kepo.is-cool.dev`, `RESEND_API_KEY`,
      `EMAIL_FROM` on a verified domain. Check the API start log for configuration warnings. Never put secrets in `VITE_*`.
- [ ] **HTTPS and cookies.** Both custom domains serve valid certificates and redirect HTTP to HTTPS. Sign in on the real
      app domain and confirm the `wii_token` cookie is `Secure`, `HttpOnly`, and survives a reload. Prefer the API on
      `api.kepo.is-cool.dev` (same site) so cookies are first-party.
- [ ] **Email end to end.** SPF, DKIM, DMARC pass for the sending domain. Register, receive the code, verify, "Forgot
      password", reset, check the password-changed mail. Check mails are not in spam and links point to the app domain.
- [ ] **SPA rewrite** `/* → /index.html` on the app static site: open `/privacy`, `/terms`, `/reset-password?token=x`
      directly (not via a click).
- [ ] **Backup and restore rehearsal** following `BACKUP-RESTORE.md` once, on a scratch database.

## 2. Check on the live site (production, with two throwaway accounts A and B)

- [ ] **Feedback.** As A: send one message in each category (Bug report, Idea, Privacy, Other). Each must show the normal "sent" text (not
      "saved only") and a `[Kepo] ... #N` email must reach `FEEDBACK_NOTIFY_EMAIL` containing the number, category, time and the full message text, and no sender name, email address or account details. Query the row in the
      database (see `FEEDBACK.md`). Sending 6 in an hour must be refused.
- [ ] **Email verification.** Register a new account: the code mail arrives, a wrong code is refused, the right one unlocks the app, the
      link/domain in the mail is the app domain.
- [ ] **Password reset.** "Forgot password" mail arrives, the link opens `/reset-password?token=...` directly, the new password works, the
      old one and old sessions do not, and the password-changed notice arrives.
- [ ] **Private attachments.** As A upload a photo and a PDF to an item. As B (signed in) and signed out, request the image/document URLs
      (`/api/items/<id>/image`, `/api/items/<id>/photos/<photoId>`, `/api/items/<id>/documents/<docId>/file`): both must be refused (401/404). A can open them. After A removes the
      item, A's own file URLs must also stop working until restore, and "Delete permanently" must erase them.
- [ ] **Account deletion.** Delete account A with its password: sign-in fails afterwards, its items, files and feedback rows are gone
      (`SELECT count(*) FROM feedback WHERE user_id = <A>` = 0), B is unaffected, and a household owned by A is gone.
- [ ] Browser network tab on the landing page and the app: no request to `fonts.googleapis.com` or `fonts.gstatic.com`; Inter loads from
      `/fonts/*.woff` on the same origin.
- [ ] Landing footer links (Privacy, Terms) open the app's pages in both languages; registration shows the acknowledgement line with working links.
- [ ] Settings → Download my data: the file's `notes` list what is excluded.
- [ ] Calendar feed for an account with a lent item shows "Return due: <item>" and no borrower name; if `REMINDERS_ENABLED=true`, the digest names items and dates only.
- [ ] API response headers: `Strict-Transport-Security`, `X-Content-Type-Options`; cookie `wii_token` is `Secure` and `HttpOnly`.

## 3. Decisions to take (not defects)

- [ ] Sign-out does not revoke the 30-day token (stateless JWT). A stolen cookie works until it expires or the
      password is changed. Accepting this is reasonable for the first release; changing it needs server-side sessions.
- [ ] Registration tells a visitor whether an email address already has an account (needed for a clear error). Accept or
      change to an email-only flow later.
- [ ] A welcome email is sent at registration before the address is verified. Harmless but you may prefer to send it
      after verification.
- [ ] Legacy external image links (`photoUrl`) in old items load from third-party hosts in the viewer's browser. New
      uploads are stored by Kepo. Consider hiding legacy links.
- [ ] Rate limits are in memory per API instance and reset on deploy (documented); acceptable on a single instance.
- [ ] No admin panel exists in this repository. If you operate one elsewhere, it must be covered by the privacy notice
      and access-controlled; this repository could not verify it.
- [ ] Android app: the privacy notice describes the web app. Publishing the app (store listing, data-safety form) needs
      its own review.

## 4. After release

- [ ] Run `npm audit` on a machine with registry access and review (see the final report for the last known state).
- [ ] Keep a log of deletion requests received by email so they can be re-applied after a restore.
