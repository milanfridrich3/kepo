# Android

The Android app is a Capacitor 8 shell (`client/android`, application id
`com.kepo.app`) around the same web build as the website. This file records how
it relates to the web app and the API, and what is still open. Where it says
"not done", nothing has been verified on a device from this repository.

## What is already compatible

- **One API for every client.** The app talks only to the REST API
  (`client/src/lib/api.ts`). An Android client would use the same endpoints,
  including verification and password recovery.
- **Language and currency live in the account**, not in the browser: `users.language`
  / `users.currency`, returned in every `user` object and changed with
  `PUT /api/account/preferences`. The server answers in the language sent in the
  `Accept-Language` header (`en` or `cs`), including error messages.
- **No conversion anywhere.** Amounts carry their own currency (`items.currency`).
- **Transactional emails use https links to the web app.** There is no custom
  scheme; see "Deep links".
- **The email provider key never leaves the server.**

## Decisions (the package id `com.kepo.app` has been chosen)

| Topic | Recommendation |
|---|---|
| Package id | `com.kepo.app` (chosen and used by `client/android`); it can never change after the first Play Store upload |
| App name | Kepo |
| Min SDK | 24 (Android 7) or higher |
| Wrapper | Capacitor wrapping the existing Vite build is the least work; a native app is the alternative |

## Icons and splash

Sources already exist in `client/public/`: `icon-512.png`, `maskable-icon-512.png`
(safe-zone padded, usable as the adaptive-icon foreground) and the vector mark
`client/src/assets/brand/kepo-mark.svg`. Brand colour `#331DAA`; splash background
`#F8FAFC` (light) / `#0F172A` (dark), mark centred. Generate the adaptive icon
(foreground = mark, background = `#331DAA`) and splash sizes with the wrapper's
asset tool.

## API configuration

`VITE_API_URL` is baked into the web build. An Android build must point it at the
**absolute** HTTPS API URL (e.g. `https://api.kepo.is-cool.dev/api`); a same-origin
`/api` would resolve to the WebView's own origin. Debug builds may use
`http://10.0.2.2:4000/api` (emulator → host) with cleartext allowed **for debug only**.
Keep the base URL in build configuration, never hard-coded in app code.

## Authentication on a device

Today the session is an `httpOnly` cookie, which is ideal in a browser. In an
Android WebView/Capacitor shell the origin is `https://localhost` (or
`capacitor://localhost`), which is a different site from the API, so a
`SameSite=None; Secure` cookie is required and third-party-cookie blocking can
break it. Two sound options:

1. **Preferred for a native shell:** add a token endpoint (e.g. `POST /api/auth/token`
   returning a short-lived access token and a refresh token) alongside the cookie
   flow, and store the tokens in **encrypted secure storage**: Android Keystore via
   `EncryptedSharedPreferences`, or a Capacitor secure-storage plugin. Never in
   `localStorage`/`SharedPreferences` plain, never in logs, never in the repo.
2. Serve the API from the same registrable domain as the WebView origin you configure
   (`androidScheme: 'https'`, hostname `app.kepo.is-cool.dev`) so the cookie stays first-party.

Either way the server-side checks (`requireAuth`, `requireVerified`, password-change
session revocation) apply unchanged. This work is **not done**; it needs a backend
change that was out of scope here.

## Deep links

Emails link to `https://app.kepo.is-cool.dev/reset-password?token=…`. To open those in
the app, use **Android App Links**:

1. Host `https://app.kepo.is-cool.dev/.well-known/assetlinks.json` (a static file in the app's `client/public/.well-known/` when the time comes) containing the package id and the release signing certificate's SHA-256 fingerprint.
2. Declare an intent filter with `android:autoVerify="true"` for host `app.kepo.is-cool.dev`, paths `/reset-password` and `/verify-email`.
3. In the app, route the incoming URL to the existing `/reset-password` screen. The screen already strips the token from the URL after reading it.

Without App Links the link simply opens in the browser, which still works.

## Build and signing

1. Build the web app (`npm run build -w client`) with the production `VITE_API_URL`.
2. Sync into the wrapper (`npx cap sync android`), open in Android Studio.
3. Create an upload keystore once (`keytool -genkeypair -v -keystore kepo-upload.jks -alias kepo -keyalg RSA -keysize 2048 -validity 10000`), keep it **outside the repository** (password manager / CI secret store) and back it up. Use **Play App Signing**.
4. Release build as an **AAB** (`./gradlew bundleRelease`) signed with the upload key. `*.jks`, `keystore.properties` and `google-services.json` must be git-ignored.

## Release signing in detail (what you do once; nothing here is in the repository)

1. Create the **upload key** on your own machine, never on a shared or cloud machine:
   `keytool -genkeypair -v -keystore ~/keys/kepo-upload.jks -alias kepo-upload -keyalg RSA -keysize 2048 -validity 10000`.
   Choose a strong password and put the file and the password in a password manager plus one offline backup.
2. Create `client/android/keystore.properties` (git-ignored by `.gitignore`):
   ```
   storeFile=/absolute/path/to/kepo-upload.jks
   storePassword=…
   keyAlias=kepo-upload
   keyPassword=…
   ```
3. In `client/android/app/build.gradle` read that file in a `signingConfigs.release` block **only when it exists**, so debug builds and CI work
   without it, and attach it to `buildTypes.release`. (This block is deliberately not added by this repository: it must be tested with your
   real key and Android Studio.)
4. `./gradlew bundleRelease` produces `app/build/outputs/bundle/release/app-release.aab`. Upload it to Play Console with **Play App Signing** enabled:
   Google keeps the app signing key, you keep only the upload key (replaceable through Play support if lost).
5. In CI, store the keystore as a base64 secret and the passwords as secrets, write them to a temporary file during the job, and never print them.
6. Before every release verify: `apkanalyzer` or `unzip -l` shows no `.env`, key or token; `versionCode` is higher than the last upload; the data-safety
   form in Play Console matches `PRIVACY` (the notice in the app): email, name, user content (items, photos, documents), camera (scanning, not stored).

## Camera and scanning (Scan page)

The manifest now declares `CAMERA` (not required: `uses-feature … required="false"`). The Scan page uses the web `getUserMedia` and `BarcodeDetector` APIs.
**Not verified on a device.** Two things must be checked on a real phone: (a) Capacitor's WebView shows the Android camera permission prompt when the page
asks, and (b) `BarcodeDetector` exists in the installed Android System WebView (it does in recent Chrome-based WebViews on Android, but this depends
on the device). If either fails the page falls back to typing the code. If scanning is important for the Android release, the robust route is a
native scanner plugin (e.g. `@capacitor-mlkit/barcode-scanning`); it was not added here because it is a new dependency that needs your approval.

Printing labels (`window.print()`) and downloading documents/exports do not work inside the Android WebView; those buttons are disabled in the app with an explanation.

## Testing checklist

- Emulator and a physical device; Android 7 and the latest release.
- Register (en and cs), receive the code, verify, sign out, sign in; forgot/reset with an App Link and without.
- Rotate, split-screen, dark mode, font scaling 200 %, TalkBack.
- Offline / flaky network: errors read as the localized "could not reach Kepo" message.
- Camera / gallery for item photos (needs `READ_MEDIA_IMAGES` or the photo picker).
- Confirm no secret (Resend key, JWT secret, keystore) is present in the APK: `apkanalyzer` / unzip and grep.
