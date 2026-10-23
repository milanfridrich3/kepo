# iOS: what exists and what is needed

**Status: not started as a native project, nothing here has been built or run.**
Checked in the repository: `client/capacitor.config.ts` (`appId com.kepo.app`, `webDir dist`),
`@capacitor/android` and `@capacitor/core` are dependencies, there is no `ios/` folder and no
`@capacitor/ios`. The web app is shared code, so iOS needs no separate UI.

Needs macOS with Xcode and an Apple Developer account; none of it can be done on Linux:

1. `npm i @capacitor/ios@^8.5.3 -w client`, `npx cap add ios`, `npm run build -w client`, `npx cap sync ios`.
2. Open `client/ios/App/App.xcworkspace`, set the signing team and bundle id `com.kepo.app`.
3. Run on a simulator, then a device. Signing certificates and provisioning profiles
   must never be committed (extend `.gitignore` for `*.p12`, `*.mobileprovision`).
4. App Store: privacy nutrition labels, screenshots, review. Account deletion in the app
   already exists (Settings), which the App Store requires for apps with sign-up.

Open questions to settle on a device before release (not verified): the page origin inside
the iOS web view versus the server's CORS allow-list (`server/src/app.ts` allows only
`CLIENT_ORIGIN` and `https://localhost`), and whether the sign-in cookie is kept in
WKWebView for a cross-site API. The same cookie question is open on Android
(see docs/ANDROID.md). The file download, photo picker, the new QR scan (camera permission
`NSCameraUsageDescription` must be added in Info.plist; Android already has `CAMERA`) and label
printing also need checking there.
