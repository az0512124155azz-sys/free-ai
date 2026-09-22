# Google Sign-In setup

Free AI supports email/password plus Google sign-in through Supabase Auth.

## 1. Supabase client configuration

The packaged app uses the Free AI Supabase project by default. Another environment can override:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_WEB_CLIENT_ID`

The Supabase publishable key and Google Web Client ID are public client identifiers. Never bundle the Google Client Secret.

## 2. Google Cloud clients

Use the same Google Cloud project for both client types.

### Web application client

Create an OAuth 2.0 **Web application** client. Its client ID is the ID-token audience used by Android and the normal OAuth client used by desktop/web.

For the existing Supabase-hosted desktop OAuth flow, keep this callback in **Authorized redirect URIs**:

```text
https://xquntkgjlmrxkwkrwsjl.supabase.co/auth/v1/callback
```

### Android client

Create a separate OAuth 2.0 **Android** client for:

```text
Package: com.freeai.mobile
SHA-1: <fingerprint of the exact APK you install>
```

Do not use the Android client ID as `VITE_GOOGLE_WEB_CLIENT_ID`. The native Credential Manager flow still uses the Web application client ID as its server/ID-token audience.

The GitHub Android build publishes `google-oauth-certificate.txt` beside the APK. Copy the SHA-1 from that file when registering the APK in Google Cloud. If the signing key changes, register the new certificate too.

## 3. Google Auth Platform branding and audience

In Google Auth Platform:

- Set the application name to **Free AI** under Branding.
- Add the Free AI logo when desired.
- Use **External** audience unless the app is intentionally restricted to one Google Workspace organization.
- While the consent screen is in Testing, add every Google account used for testing under Audience -> Test users.
- Keep the required profile scopes: `openid`, email and profile.

Brand verification can take time. Android native Google sign-in avoids the confusing Supabase project-ref page because account selection is handled by Google Credential Manager. Desktop/web still use the OAuth redirect flow described below.

## 4. Enable Google in Supabase

Open **Authentication -> Providers -> Google** and enable the provider.

For the web OAuth flow configure the Google Web Client ID and Client Secret. When you create additional Google client IDs for native platforms, Supabase recommends registering the relevant client IDs for the provider as well.

Do not put the Client Secret in this repository.

## 5. Desktop callback

In Supabase Authentication redirect settings keep:

```text
freeai://auth/callback
```

### Windows / macOS / Linux

Free AI opens Google authentication in the system browser. Supabase completes the OAuth flow and redirects to:

```text
freeai://auth/callback?code=...
```

Electron receives the protocol URL and exchanges the authorization code for a Supabase session using PKCE.

To replace the raw `<project-ref>.supabase.co` identity shown during that hosted flow, configure Google Auth Platform Branding/Verification. A branded Supabase custom/vanity auth domain is an additional option when the Supabase plan supports it.

## 6. Android behavior

Android does **not** use the Supabase-hosted browser OAuth page.

Free AI initializes `@capgo/capacitor-social-login`, Google Credential Manager shows the native account chooser, and the app sends Google's ID token directly to:

```js
supabase.auth.signInWithIdToken({
  provider: 'google',
  token: idToken
})
```

The Android build script also modifies `MainActivity.java` exactly as required by the social-login plugin so Google authorization results are forwarded to the plugin.

If Google reports error 28444 or the account chooser closes after selection, compare all three values:

1. installed APK signing SHA-1,
2. package `com.freeai.mobile`,
3. the Web application client ID used by Free AI.

## 7. Local browser development

For browser-only Vite development, allow the local URL in Google/Supabase, for example:

```text
http://localhost:5173
```

## 8. Email/password

Email/password uses the same Supabase project. Keep the Email provider enabled in Supabase Authentication.

## Security notes

- Never commit the Google Client Secret or a production Android signing key.
- `VITE_SUPABASE_ANON_KEY` / Supabase publishable keys are public client values.
- Desktop OAuth uses PKCE.
- Android uses a native Google ID token and requires the exact APK signing certificate to be registered.
