# Free AI release process

The normal `main` workflow produces development and QA artifacts. Production signing can be exercised safely with a manual `validate_release=true` dry-run. A public GitHub Release is intentionally stricter and must be started manually with `publish_release=true`.

## Current release line

- Current published stable tag: `v0.7.1`.
- The next development/release line is `v0.7.2`.
- Do not reuse or overwrite an existing tag. The release workflow fails if the package tag already exists.

## Production credential setup helper

Use [release-credentials.md](release-credentials.md) for the local validation and GitHub Secrets setup workflow. The helper script validates signing material locally and sends secret values to GitHub through stdin instead of command-line arguments.

## Required production credentials

### Windows

Configure both GitHub Actions secrets:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Windows Authenticode signing is optional. If the two signing secrets are present, the release is signed and CI verifies the signatures; otherwise the validated unsigned NSIS installer may be published.

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

By default, a public release requires both Developer ID signing and notarization. When Apple signing is intentionally unavailable, an operator may explicitly set `allow_unsigned_macos=true` for the validation/publication run. In that mode the DMG is published unsigned and the GitHub Release notes receive a prominent warning.

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

## Credential readiness status

Trusted `main` pushes and manual workflow runs include a non-blocking **Production credential readiness** job. It reports only whether each required secret group is `READY`, `PARTIAL`, or `MISSING`:

- Windows Authenticode
- macOS Developer ID + notarization
- Android production signing
- Supabase + Google public build configuration

The job never prints secret values. A `READY` status only confirms that every required field in that group is non-empty; the production dry-run is still required to prove that certificates, passwords, fingerprints, OAuth configuration, signing, and notarization actually work.

## Production release dry-run

Use this before publishing after adding or rotating any signing credential.

1. Add the required repository secrets under **Settings -> Secrets and variables -> Actions**.
2. Open **Actions -> Build Free AI -> Run workflow** on `main`.
3. Set **Validate production release without publishing** to `true`.
4. Leave **Publish the final GitHub Release** set to `false`.
5. The workflow requires the Android production keystore. Windows signing is optional. macOS Developer ID + notarization remains the default requirement; set `allow_unsigned_macos=true` only when intentionally validating an unsigned macOS DMG.
6. It runs the same desktop, Android runtime, email/session, Google Credential Manager, and extension gates used by publication.
7. It builds the signed Android release APK and the signed/notarized desktop artifacts, verifies the exact production asset set, verifies that the target tag/release does not already exist, generates `SHA256SUMS.txt`, and uploads a temporary Actions artifact named `free-ai-release-candidate`.
8. It does **not** create a Git tag and does **not** create or modify a GitHub Release.

Do not enable both validation and publication in the same manual run. The workflow has an explicit release-mode guard and fails when both inputs are true. Use validation first, inspect the green result and release-candidate artifact, then start a separate publication run.

## Publication

1. Merge the release-readiness change to `main` only after the full PR build matrix is green.
2. Confirm `package.json` contains the intended new version and that no matching tag exists.
3. Complete a green production release dry-run as described above.
4. Open **Actions -> Build Free AI -> Run workflow** on `main` again.
5. Leave **Validate production release without publishing** set to `false`.
6. Set **Publish the final GitHub Release** to `true`.
7. If the corresponding green validation run intentionally used an unsigned macOS DMG, set `allow_unsigned_macos=true` again. Otherwise leave it `false`.
8. The workflow builds and validates Windows, macOS, Linux, Android and the browser extension again from the publication commit.
9. The release job verifies the exact expected production assets, writes `SHA256SUMS.txt`, refuses an existing tag, and creates the GitHub Release with generated notes. An unsigned macOS publication automatically prepends a Gatekeeper warning to the Release notes.

Expected public assets for version `x.y.z`:

- `Free-AI-Windows-x.y.z.exe`
- `Free-AI-macOS-x.y.z.dmg`
- `Free-AI-Linux-x.y.z.AppImage`
- `Free-AI-Android-x.y.z.apk`
- `free-ai-extension.zip`
- `SHA256SUMS.txt`

Do not manually replace an asset on an existing release. If a published build is wrong, increment the version and publish a new release.
