# Google Sign-In setup

Free AI uses Supabase Auth for account sessions.

## Email/password

Email/password uses Supabase directly:

- sign up: `supabase.auth.signUp({ email, password })`
- sign in: `supabase.auth.signInWithPassword({ email, password })`

The app now checks the live Supabase Auth settings before attempting email/password authentication so a disabled provider or unreachable Auth service produces a visible error instead of appearing to do nothing.

## Android Google sign-in

Android uses `@capgo/capacitor-social-login` with Google Credential Manager, then exchanges the returned Google ID token with Supabase through `signInWithIdToken`.

Required Google Cloud credentials must be in the same Google Cloud project:

1. **Web OAuth client**
   - used as `webClientId` by the app
   - current default:
     `991329297292-fp0ciud251vjasflsjq4r7k2vgo4sij7.apps.googleusercontent.com`

2. **Android OAuth client**
   - package: `com.freeai.mobile`
   - debug SHA-1:
     `1F:F0:59:1B:C8:69:C4:89:01:01:2F:79:E1:2D:0B:2E:7D:FC:C9:4B`

The Android client ID is registered in Google Cloud only. Do not pass the Android client ID as `webClientId`.

Each signing certificate that can install the app needs a matching Android OAuth client, including:
- local/debug signing
- release signing
- Google Play App Signing

The Web client ID can be overridden at build time with:

`VITE_GOOGLE_WEB_CLIENT_ID`

## Desktop Google sign-in

Windows/macOS/Linux continue to use the Supabase PKCE OAuth flow and return to:

`freeai://auth/callback`

Allow that redirect URL in the Supabase Auth URL configuration.

## Supabase client configuration

The packaged app uses the Free AI Supabase project by default. Another environment can override:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not ship the Google Client Secret in the app. The Google Client Secret belongs in the server-side Supabase Google provider configuration.

## Troubleshooting Android Google

If Android reports error 28444, developer-console configuration errors, credential errors, or a cancellation immediately after choosing an account, verify:

- package name exactly matches `com.freeai.mobile`
- the installed APK's SHA-1 matches a Google Android OAuth client
- the Web OAuth client is used as `webClientId`
- Web and Android OAuth clients belong to the same Google Cloud project
- if the consent screen is in Testing, the account is an allowed test user
- after changing Google Cloud credentials, reinstall the APK and retry

The CI build emits `android-oauth-info.txt` and runs Gradle `signingReport` so the signing identity can be compared against Google Cloud.
