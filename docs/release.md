# Free AI release process

The normal `main` workflow produces development and QA artifacts. A public GitHub Release is intentionally stricter and must be started manually with `publish_release=true`.

## Current release line

- Last published stable tag before this checkpoint: `v0.6.0`.
- The next prepared release line is `v0.7.0`.
- Do not reuse or overwrite an existing tag. The release workflow fails if the package tag already exists.

## Required production credentials

### Windows

Configure both GitHub Actions secrets:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

A public release fails closed if Authenticode signing is unavailable.

### macOS

Configure Developer ID signing:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`

And one complete notarization set.

Preferred App Store Connect API-key path:

- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Alternative Apple ID path:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

A public release requires both Developer ID signing and notarization. The packaged DMG is verified with `codesign`, `stapler`, and Gatekeeper before publication.

### Android

Never publish the repository debug keystore APK as a production release.

Configure:

- `ANDROID_RELEASE_KEYSTORE_BASE64` - base64 of the production keystore
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`
- `ANDROID_RELEASE_EXPECTED_SHA1` - SHA-1 fingerprint of the release certificate

The release job builds `assembleRelease`, verifies the APK signature with Android build-tools `apksigner`, checks package/version metadata with `aapt`, and compares the signing certificate SHA-1 against `ANDROID_RELEASE_EXPECTED_SHA1`.

Google Cloud must also contain an Android OAuth client for package `com.freeai.mobile` using that same production signing SHA-1. Google Play App Signing uses its own certificate and therefore needs its own Android OAuth client when a Play Store build is introduced.

### Authentication configuration

Keep the production values configured for:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_WEB_CLIENT_ID`

The release workflow also runs the Android email/session and Google Credential Manager runtime gates before the release job is allowed to start.

## Publication

1. Merge the release-readiness change to `main` only after the full PR build matrix is green.
2. Confirm `package.json` contains the intended new version and that no matching tag exists.
3. Open **Actions -> Build Free AI -> Run workflow** on `main`.
4. Set **Publish the final GitHub Release** to `true`.
5. The workflow builds and validates Windows, macOS, Linux, Android and the browser extension.
6. The release job verifies the exact expected production assets, writes `SHA256SUMS.txt`, refuses an existing tag, and creates the GitHub Release with generated notes.

Expected public assets for version `x.y.z`:

- `Free-AI-Windows-x.y.z.exe`
- `Free-AI-macOS-x.y.z.dmg`
- `Free-AI-Linux-x.y.z.AppImage`
- `Free-AI-Android-x.y.z.apk`
- `free-ai-extension.zip`
- `SHA256SUMS.txt`

Do not manually replace an asset on an existing release. If a published build is wrong, increment the version and publish a new release.
