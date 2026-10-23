# Transactional email (Resend), verification and password recovery

All email is sent **by the backend only**, through Resend's REST API
(`POST https://api.resend.com/emails`, plain `fetch`, no SDK, no new dependency).
The API key exists only as the backend environment variable `RESEND_API_KEY`:
it is never in the repository, the client bundle, the landing page or a future
Android app, and it is never logged.

## Emails sent

| Email | When | Content |
|---|---|---|
| Welcome | right after registration | greeting, link to the app |
| Verification code | registration, "send a new code", email change | 6-digit code, expiry |
| Password reset | "Forgot password?" for an existing account | single-use link `https://app.kepo.is-cool.dev/reset-password?token=…` |
| Password changed | after a password change or reset | security notice with a link to start a reset if it was not you |

Each is branded "Kepo" with the tagline, available in **English and Czech** (the
account's saved language), and sent as both HTML and plain text
(`server/src/email/templates.ts`). The logo is `https://kepo.is-cool.dev/apple-touch-icon.png`
(override with `EMAIL_LOGO_URL`); the wordmark is real text, so the message reads
fine with images blocked.

## Setting up Resend (manual)

1. Create a Resend account and add the domain you send from (e.g. `kepo.is-cool.dev`).
2. Add the DNS records Resend shows: **SPF** (TXT), **DKIM** (CNAME/TXT) and, recommended, **DMARC** (TXT, e.g. `v=DMARC1; p=none; rua=mailto:you@…`, tightened later).
3. Wait until Resend shows the domain as *Verified*.
4. Create an API key with *Sending access* only.
5. In the backend service set `RESEND_API_KEY` and `EMAIL_FROM=Kepo <no-reply@kepo.is-cool.dev>` (and optionally `EMAIL_REPLY_TO`, which is shown to every recipient as the reply address). For feedback notifications also set `FEEDBACK_NOTIFY_EMAIL` (private; see FEEDBACK.md).

Until the domain is verified Resend only lets you send to your own address, so
real users would not receive mail. **Nothing in this repository has been tested
against live Resend or live DNS**; the transport is covered by unit tests with a
mocked `fetch` (`server/src/email/resend.test.ts`).

## Email verification

- On registration a 6-digit code (cryptographically random) is stored as an
  HMAC-SHA256 hash (key derived from `JWT_SECRET`), valid for `VERIFICATION_CODE_TTL_MINUTES` (default 15).
- **5 wrong attempts** lock the code (even the correct one is then refused); request a new one.
- **Resend cooldown** 60 s (`EMAIL_RESEND_COOLDOWN_SECONDS`), enforced by the server from the time the provider accepted the previous message; plus 6 resends/hour/account. The client only displays the countdown.
- A new code retires every earlier one. A code only works for the address it was sent to (changing the email invalidates it).
- Verifying is one transaction: the code is consumed and `email_verified_at` set together.

### Policy for unverified accounts

- **Existing accounts** (created before this release) are treated as verified, so nobody is locked out.
- **New accounts** can sign in but only reach the verification screen: every data route (`items`, `locations`, `dashboard`, `search`, …) is behind `requireVerified` on the **server** and answers `403 email_not_verified`; the client redirects to `/verify-email`. Account endpoints (sign out, resend, change email, delete account) stay available.
- Changing the email address in Settings (current password required) makes the new address unverified until its code is entered.
- A successful password reset also verifies the address (the link was delivered to it).
- Unverified accounts are not currently purged automatically; a periodic cleanup of accounts that never verified is a sensible later addition.
- `EMAIL_VERIFICATION_REQUIRED=false` exists only for local development without an email provider and is **ignored in production**.

## Password recovery

1. `POST /api/auth/forgot-password {email}` always answers `202 {ok:true}` and takes roughly the same time whether or not the account exists. Only an existing account receives an email.
2. The link carries a 256-bit random token, stored only as a hash, **single use**, valid `RESET_TOKEN_TTL_MINUTES` (default 60); a newer request replaces older tokens. The token is bound to the address it was sent to.
3. `POST /api/auth/reset-password {token,newPassword}`: invalid/expired/used tokens get one generic error. On success the password is changed, **all existing sessions end** (`password_changed_at`), all other outstanding codes are retired, and a "password changed" email is sent.
4. The reset page removes the token from the address bar immediately.
5. Rate limits (in memory, per instance): 20 requests/hour/IP and 4/15 min per IP+address for "forgot", 20/15 min/IP for "reset".

Neither codes, tokens, reset URLs, passwords nor email bodies are logged; a failed
send logs only the kind of email and the HTTP status.

## If Resend is down or not configured

- Registration still succeeds; the verification screen says the email could not be sent and offers "Send a new code".
- "Send a new code" answers `503 email_delivery_failed` and does **not** start the cooldown.
- Password recovery quietly sends nothing (the generic answer must not reveal failures); the startup log warns when `RESEND_API_KEY`/`EMAIL_FROM` are missing.
- Sends are retried once on 429/5xx/network errors with the same `Idempotency-Key`, so a retry cannot double-send.
