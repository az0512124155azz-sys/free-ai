# Free AI production signing credentials

Use this guide only for production signing material. Never commit certificates, keystores, private keys, passwords, or App Store Connect private keys to the repository.

The helper script in this repository validates local signing material and writes GitHub Actions secrets through GitHub CLI standard input. Secret values are not passed as command-line arguments.

## Prerequisites

- PowerShell 5.1+ or PowerShell 7+
- GitHub CLI (`gh`) authenticated to the repository
- Write access to `az0512124155azz-sys/free-ai`
- JDK 17+ or Android Studio for Android signing

Check GitHub CLI before changing secrets:

```powershell
gh auth status
```

You can validate local files without writing any GitHub secrets by adding `-DryRun` to the commands below.

## Windows Authenticode

Windows Authenticode signing is optional for Free AI releases.

If you choose to sign Windows builds, configure:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Use a trusted RSA code-signing certificate exported with its private key as `.pfx` or `.p12`. If neither secret is configured, the validated unsigned NSIS installer may still be published.

Microsoft currently documents that Smart App Control accepts trusted RSA-signed applications and does not support ECC signatures for this check:

https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control

electron-builder accepts a base64-encoded `.pfx`/`.p12` through `WIN_CSC_LINK`:

https://www.electron.build/docs/features/code-signing/

First validate the certificate locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target Windows `
  -CertificatePath "C:\secure\free-ai-code-signing.pfx" `
  -DryRun
```

Then write the repository secrets:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target Windows `
  -CertificatePath "C:\secure\free-ai-code-signing.pfx"
```

The helper prompts for the certificate password, verifies that the bundle contains a non-expired private key, requires RSA for Windows, then uploads the base64 certificate and password without printing either value.

## macOS Developer ID and notarization

Free AI public macOS builds require Developer ID signing and notarization by default:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`

and one complete notarization credential set.

For v0.7.1, Apple signing may be intentionally deferred. In that case, leave all macOS signing/notarization secrets unset and use the explicit `allow_unsigned_macos=true` workflow input during both validation and publication. The release workflow will warn that the DMG is unsigned/not notarized. Do not use the exception with a partially configured Apple credential set.

Apple documents Developer ID Application certificates for apps distributed outside the Mac App Store:

https://developer.apple.com/help/account/certificates/create-developer-id-certificates

The Developer ID Application certificate must be exported from Keychain Access with its private key as a password-protected `.p12`.

### Preferred notarization path: App Store Connect API key

Required secrets:

- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Keep the downloaded `.p8` private key in a secure location. Apple private keys cannot always be downloaded again after creation.

Apple notarization documentation:

https://developer.apple.com/documentation/notaryapi

Run a local validation first:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target MacOS `
  -CertificatePath "C:\secure\DeveloperIDApplication.p12" `
  -NotarizationMode ApiKey `
  -AppleApiKeyPath "C:\secure\AuthKey_ABC123.p8" `
  -AppleApiKeyId "ABC123" `
  -AppleApiIssuer "00000000-0000-0000-0000-000000000000" `
  -DryRun
```

Then remove `-DryRun` to set the GitHub secrets.

### Alternative notarization path: Apple ID

Required secrets:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target MacOS `
  -CertificatePath "C:\secure\DeveloperIDApplication.p12" `
  -NotarizationMode AppleId `
  -AppleId "you@example.com" `
  -AppleTeamId "TEAMID1234"
```

The helper prompts separately for the Developer ID certificate password and the Apple app-specific password.

## Android production signing

Free AI public Android builds require:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`
- `ANDROID_RELEASE_EXPECTED_SHA1`

Android requires release APKs to be signed. Google Play App Signing is required for new Play apps, but an upload still uses developer-controlled signing material.

Android release guidance:

https://developer.android.com/studio/publish/preparing

Keep the Android keystore backed up in at least two secure locations. Losing the signing key can prevent future updates outside Play App Signing.

If no production keystore exists yet, generate it locally and configure all five GitHub Actions secrets in one command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target Android `
  -GenerateAndroidKeystore
```

The default generated key is:

- path: `$HOME\.free-ai\signing\free-ai-release.jks`
- alias: `free-ai`
- algorithm: RSA 4096 / SHA256withRSA
- validity: 10,000 days

The helper prompts locally for the new keystore and key passwords. Those passwords are never passed as command-line arguments. Back up the generated `.jks` in at least two secure locations before publishing the first production build.

To validate an existing keystore without changing GitHub Secrets:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target Android `
  -KeystorePath "C:\secure\free-ai-release.jks" `
  -KeyAlias "free-ai" `
  -DryRun
```

Remove `-DryRun` when you want an existing keystore written to GitHub Actions secrets.

The helper:

1. locates `keytool`;
2. optionally creates a new RSA-4096 JKS outside the Git repository;
3. validates the keystore password, key alias, and private-key password;
4. rejects certificates that do not remain valid beyond October 22, 2033;
5. exports the signing certificate to a temporary directory;
6. computes the release certificate SHA-1 itself;
7. sets all five Android release secrets;
8. deletes the temporary certificate/CSR files;
9. preserves a newly generated keystore if GitHub secret upload fails after key validation, so the same key can be retried;
10. prints only the non-secret SHA-1 needed for Google OAuth.

Google Cloud must contain an Android OAuth client for:

- package: `com.freeai.mobile`
- SHA-1: the fingerprint printed by the helper

If Google Play App Signing is introduced later, add the Play app-signing certificate SHA-1 as its own Android OAuth client too.

## Verify credential presence

After committing no files and exposing no secret values, GitHub Actions reports the presence state on trusted `main` runs:

- Windows Authenticode
- macOS Developer ID + notarization
- Android production signing

The production credential readiness job reports only `READY`, `PARTIAL`, or `MISSING`. It does not prove the credentials work.

## Mandatory production dry-run

After all three signing groups show `READY`, open:

**GitHub -> Actions -> Build Free AI -> Run workflow**

Use:

- `validate_release=true`
- `publish_release=false`
- `allow_unsigned_macos=false` for normal signed macOS validation, or `true` only when intentionally deferring Apple signing

The validation run must be green before publication. It performs Windows/Android production signing checks, runtime/auth QA, exact release asset validation, checksum generation, and macOS signing/notarization when the unsigned exception is not selected. It does not create a tag or GitHub Release.

Only after that dry-run succeeds should a separate publication run use:

- `validate_release=false`
- `publish_release=true`
- the same `allow_unsigned_macos` value that was used by the successful validation run
