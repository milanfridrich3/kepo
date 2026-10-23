/** English privacy policy and terms of service for Kepo. Every concrete statement describes what the current code does. */
export const legal = {
  'legal.updated': "Last updated: 22 October 2026",
  'legal.back': "Back to Kepo",
  'legal.terms.link': "Terms",
  'legal.operator.title': "Who operates Kepo",
  'legal.operator.body': "Kepo is created and operated by Milan Fridrich (the “operator”), who is responsible for the personal data described here. To contact the operator, use Settings → Feedback in the app (see “Your rights” and the Terms).",

  'privacy.title': "Privacy policy",
  'privacy.link': "Privacy",
  'privacy.back': "Back to Kepo",

  'privacy.account.title': "Your account",
  'privacy.account.body': "To register you give a name, an email address and a password. The password is stored only as a hash. We email a confirmation code to the address, and the account can be used once it is confirmed. You can then set a language and a currency, add a profile picture, change your name, email address (confirmed again) and password, and turn on optional features (reminders, household sharing, a calendar feed). Staying signed in uses one cookie (see “Technical data”).",

  'privacy.content.title': "Your items, places, loans and files",
  'privacy.content.body': "You choose what to enter: places, items (name, category, place, status, quantity, brand, model, serial number, purchase date, value, warranty end, tags, notes), a main photo, extra photos and documents such as receipts or manuals, saved filters, and loans (the borrower's name, dates and whether it was returned) with a history of moves. Please enter only what you need about other people. Uploaded images are re-encoded and their embedded metadata (such as location) is removed. All of this belongs to your account and only you can see it, except as described under “Household and calendar feed”.",

  'privacy.household.title': "Household and calendar feed",
  'privacy.household.body': "Households are optional (up to six members, joined with a single-use invitation code that expires after 7 days and is stored only as a hash). Members see each other's names. If you switch sharing on, the other members can see, but never change, the name, category, brand, model, tags, quantity, status, place and warranty end of your active items, together with your name as owner. Prices, serial numbers, notes, loans, photos and documents are never shared.\nA calendar feed is optional. Its secret web address shows, to anyone who has it, your item names with warranty end dates and the return dates of items you have lent (never who has them). Keep it private; you can replace it or switch it off in Settings.",

  'privacy.feedback.title': "Feedback",
  'privacy.feedback.body': "If you send a message from Settings → Feedback (Bug report, Idea, Privacy or Other), Kepo stores its category, text, language and time, linked to your account. To notify the operator, Kepo also sends an email that contains the message number, category, time and the full text of your message, but not your name, email address or other account details. The operator reads the message there and can look up the sender's account in the database.",

  'privacy.email.title': "Emails",
  'privacy.email.body': "Kepo sends a welcome message, confirmation codes, password reset and password-changed notices and, only if you switch it on in Settings, a daily reminder about warranties ending and loans due. Reminders contain the item name and the date, not the borrower's name. Emails are delivered by Resend.",

  'privacy.providers.title': "Hosting and providers",
  'privacy.providers.body': "Kepo runs on Render, which hosts the server, the database and the websites. Resend delivers the emails and so receives your email address, name and the content of each message, including the feedback notification emails sent to the operator, which carry the full text of your feedback. Both are companies based outside the EU and may process data outside the EU/EEA; their own data protection terms apply. Render and Resend keep their own backups and logs for periods that they, not Kepo, set. As host, the operator can technically access the database, and uses that access to run the service and to handle feedback and requests.",

  'privacy.technical.title': "Technical data, cookies and local storage",
  'privacy.technical.body': "One cookie keeps you signed in for up to 30 days; only the server reads it. Your browser also stores your language, theme and list-view choices on your device. Neither is used for tracking or advertising, and Kepo has no advertising and no third-party analytics. Fonts are served by Kepo itself, so your browser makes no request to Google for them.\nThe server logs the method, path, status and duration of each request, without query strings, cookies or contents. Your IP address is used only in short-lived in-memory counters that limit abuse; the hosting provider may also process IP addresses to run its network.",

  'privacy.basis.title': "Why we use your data and on what basis",
  'privacy.basis.body': "To provide your account and the features you use, including the emails needed to run it: performance of the agreement with you (GDPR Art. 6(1)(b)).\nTo keep the service secure and prevent abuse, and to read and answer your feedback: legitimate interests (Art. 6(1)(f)). To answer requests about your personal data: also legal obligation (Art. 6(1)(c)).\nFor features you switch on (reminder emails, household sharing, calendar feed): your consent (Art. 6(1)(a)), which you can withdraw at any time by switching them off in Settings.",

  'privacy.retention.title': "How long data is kept and deletion",
  'privacy.retention.body': "Your data stays while your account exists. Kepo does not set a time limit on it.\nRemoving an item hides it, closes any open loan and deletes its main photo. Its extra photos, documents, notes and history are kept so you can restore it, until you delete it permanently from the Removed items view, which erases it with all of them.\nDeleting your account (Settings, with your password) removes your account and everything in it from the database, including removed items, files and your feedback, and ends any household you own; other members' accounts and items are not touched. Confirmation codes and reset links expire after a short time (by default 15 and 60 minutes).\nDeleting your account, which also deletes your feedback from Kepo's database, does not automatically delete the feedback notification email already delivered to the operator's mailbox; that copy stays there until it is deleted from the mailbox, and Kepo cannot guarantee when that happens. Deleting data in Kepo also does not reach backups and logs kept by Render and Resend; those follow the providers' own schedules, which are not described here.",

  'privacy.export.title': "Downloading your data",
  'privacy.export.body': "Settings → Download my data gives you a JSON file, and a CSV of your items, with your account details, places, items (including removed ones), loans and move history. It does not include photos, extra photos, attached documents, saved filters, household and calendar settings or feedback you sent, so it is not a complete backup.",

  'privacy.rights.title': "Your rights",
  'privacy.rights.body': "Under the GDPR you have the rights of access, correction, erasure, restriction, portability and objection, and you can withdraw consent. Most of your data can be managed in the app: view and edit it, delete items, download a copy and delete your account.\nFor questions or requests about your personal data, send a message from Settings → Feedback and choose Privacy. This needs a signed-in account with a confirmed email address. Kepo currently has no other way to send a request, so someone who cannot sign in or has already deleted their account cannot use it. The operator may need to verify that a request comes from you and answers within the time limits set by the GDPR.\nYou may also complain to the supervisory authority; in the Czech Republic that is the Úřad pro ochranu osobních údajů (www.uoou.gov.cz).",

  'privacy.security.title': "Security",
  'privacy.security.body': "In production the server tells browsers to use HTTPS only. Passwords are stored only as bcrypt hashes. The sign-in cookie cannot be read by page scripts. Confirmation and reset codes are stored only as hashes, expire and are single-use. Sign-in, registration and similar actions are rate limited. Every request for your data is checked against your account. No online service can be made completely secure.",

  'privacy.automated.title': "Automated decisions and camera",
  'privacy.automated.body': "Kepo makes no automated decisions about you with legal or similarly significant effects and does not profile you. When you add an item it may suggest a category from the item's name; you can change it.\nThe scan page asks for camera access only to read labels. The picture is processed on your device and is neither recorded nor uploaded.",

  'privacy.changes.title': "Changes",
  'privacy.changes.body': "If this policy changes, the date at the top changes with it. Your use of Kepo is also covered by the Terms of use (see the Terms page).",

  'terms.title': "Terms of use",
  'terms.link': "Terms",

  'terms.service.title': "Agreement and scope",
  'terms.service.body': "These terms apply to your use of Kepo, a service for keeping track of your belongings: items, places, loans, warranties, and related photos and documents. By creating an account you confirm that you have read the privacy policy and agree to these terms. If you do not agree, please do not use Kepo.",

  'terms.account.title': "Accounts and security",
  'terms.account.body': "Give accurate details, confirm your email address and keep your password secret. You are responsible for what happens under your account. If you think someone else has used it, change your password in Settings and, if you can still sign in, tell the operator through Settings → Feedback → Other.",

  'terms.use.title': "Acceptable use",
  'terms.use.body': "Do not upload unlawful content, try to access other people's accounts or data, disrupt or overload the service, or create accounts automatically in bulk.",

  'terms.content.title': "Your content",
  'terms.content.body': "What you enter and upload (items, places, loans, notes, photos, documents) remains yours and you are responsible for it. You allow Kepo to store and process it only to provide the service to you. Make sure you have the right to upload your photos and documents and that entering details about other people, such as a borrower's name, is appropriate. Kepo does not make your content public.",

  'terms.sharing.title': "Household sharing and calendar feeds",
  'terms.sharing.body': "A household lets the members you choose see limited, read-only details of your items if you switch sharing on; you can switch it off at any time. A calendar feed address shows item names and dates to anyone who has it, so keep it private and replace or switch it off if it leaks. What is shared is described in the privacy policy.",

  'terms.deletion.title': "Deleting content and your account",
  'terms.deletion.body': "Removing an item hides it and you can restore it; deleting it permanently from the Removed items view erases it. You can delete your account at any time in Settings, which erases your account and everything in it from the database, including files, removed items and feedback, and ends any household you own. This cannot be undone, so download your data first if you want a copy; the download does not include photos or documents. Copies in the providers' backups and logs, and feedback notification emails already delivered to the operator's mailbox, are not deleted automatically; see the privacy policy.",

  'terms.suspension.title': "Suspension and termination",
  'terms.suspension.body': "The operator may suspend or close an account that seriously breaks these terms or abuses the service. You may stop using Kepo at any time.",

  'terms.availability.title': "Availability",
  'terms.availability.body': "Kepo is provided as it is. The operator aims to keep it running and your data safe but cannot promise uninterrupted service or that it is free of errors, so keep your own copy with the download in Settings. Nothing in these terms limits rights you have under mandatory law, including consumer law.",

  'terms.changes.title': "Changes to the service and these terms",
  'terms.changes.body': "Kepo's features may change. These terms may be updated; the date at the top shows the latest version.",

  'terms.law.title': "Governing law",
  'terms.law.body': "These terms are governed by Czech law, without limiting any mandatory consumer-protection rights you have under the law of your country of residence.",

  'terms.contact.title': "Contact",
  'terms.contact.body': "For questions about these terms or the service, send a message from Settings → Feedback and choose Other; for anything about your personal data, choose Privacy. This needs a signed-in account with a confirmed email address; Kepo has no other contact channel at present.",

  'auth.register.legal.before': "By creating an account you confirm that you have read the",
  'auth.register.legal.and': "and agree to the",
  'auth.register.legal.privacy': "privacy policy",
  'auth.register.legal.terms': "terms of use",
} as const;
