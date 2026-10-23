# Final release audit: summary (2026-10-22)

Summary of the final public-release audit of this source tree and of the corrections made afterwards. The full report
(sections A to H) is `KEPO-FINAL-RELEASE-AUDIT.md` in the Kepo project. **This file does not say the project is ready for release.**

**Provenance.** This archive was built from the ZIP originally supplied for the audit plus text-only corrections. No Git repository
was available, so the branch, commit SHA and working-tree status could not be recorded (NOT VERIFIED). Apply the changes to the real
repository by comparing, not by overwriting.

## Corrections included (text only; no application code, email behaviour, database logic or configuration changed)
- English and Czech privacy policy (`client/src/i18n/{en,cs}/legal.ts`): the feedback notification email contains the feedback number,
  category, time and the full message, no name, email address or account details; it is sent through Resend; deleting feedback or the
  account in Kepo does not automatically delete the copy already delivered to the operator's mailbox (and Kepo cannot guarantee when
  that copy is removed). `legal.updated` is 22 October 2026.
- English and Czech terms (`terms.deletion.body`): same statement about delivered notification emails and provider backups/logs.
- `README.md` (feedback rows) and `docs/RELEASE-CHECKLIST.md` (live feedback test expects the full message and no sender details).
- `docs/FEEDBACK.md` was already correct and is unchanged.

## Validation (this archive's source tree)
| Check | Result |
|---|---|
| Server unit tests (`npm test -w server`) | 125/126 pass. The one failure, `errorHandler.test.ts` (`Cannot find module 'multer'`), is an environment limit: dependencies could not be installed. Not PASS |
| Client tests incl. EN/CS catalog parity | PASS 33/33 |
| Legal-text key parity (`legal.ts`, EN vs CS) | PASS, 64 keys each, none missing |
| PostgreSQL integration tests (throwaway local cluster) | PASS 23/23 |
| Landing page build | PASS (no Google font references) |
| Lockfile consistency (`npm ls --package-lock-only`) | PASS (structural only) |
| `npm ci`, TypeScript check, client and server builds, `npm audit`, Android build | NOT VERIFIED (npm registry blocked, SDK absent) |
| Live Render/Resend/DNS/device checks | NOT VERIFIED |

## Unresolved items (see the full report)
- **API domain / cookie (conditional P1):** the cookie is `SameSite=None`; if the API stays on `onrender.com`, Safari/Firefox users cannot stay signed in. Use `api.kepo.is-cool.dev`.
- **Gates not cleared:** install/typecheck/build/audit never ran; Render deployment and Android sign-in are unverified.
- P2: no per-account storage cap; rate limits depend on `req.ip` behind Render's proxy (in-memory, single instance); no cleanup of old codes, invites or unverified accounts; Android cannot download data.
- P3: logout does not revoke the 30-day token; registration reveals existing emails; legacy external photo links; one-year image caching; `docs/EMAIL.md` omits the digest and feedback emails.
- Accepted: the only contact channel is Settings → Feedback (needs a signed-in, verified account). Legal wording needs a lawyer's review.
