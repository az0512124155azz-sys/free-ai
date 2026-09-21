# Google Sign-In setup

The application code supports Google OAuth on Windows, macOS, Linux and Android through Supabase Auth.

## 1. Create or choose a Supabase project

The packaged app is connected to the Free AI Supabase project by default using the public Project URL and publishable key. You can still override them for another environment with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are public client values; the Google Client Secret is never bundled into the app.

Do not put the Google client secret in the app or in a `VITE_*` variable.

## 2. Configure Google Cloud

Create an OAuth 2.0 **Web application** client in Google Cloud.

In **Authorized redirect URIs**, add the Supabase callback URL:

```text
https://xquntkgjlmrxkwkrwsjl.supabase.co/auth/v1/callback
```

Copy the Google Client ID and Client Secret.

## 3. Enable Google in Supabase

Open **Authentication -> Providers -> Google** and enable the provider.

Paste:

- Google Client ID
- Google Client Secret

## 4. Allow the Free AI app callback

In the Supabase authentication URL/redirect settings, add this allowed redirect URL:

```text
freeai://auth/callback
```

Desktop and Android both return to the app through this custom scheme.

For local browser-only development, also allow the Vite URL you use, for example:

```text
http://localhost:5173
```

## 5. Platform behavior

### Windows / macOS / Linux

Free AI opens Google authentication in the system browser. After the user finishes, the browser redirects to:

```text
freeai://auth/callback?code=...
```

Electron receives that protocol URL and exchanges the authorization code for a Supabase session using PKCE.

### Android

Free AI opens Google authentication in the system browser using Capacitor Browser. The Android manifest contains a generated intent filter for:

- scheme: `freeai`
- host: `auth`

The app receives the callback through Capacitor App and exchanges the authorization code for a Supabase session.

## 6. Email/password

Email/password authentication continues to use the same Supabase project. Enable Email in Supabase Authentication providers if it is disabled.

## Security

- The Google Client Secret belongs only in Supabase/Google Cloud configuration.
- `VITE_SUPABASE_ANON_KEY` is a public client key and is expected to be present in the packaged app.
- OAuth uses PKCE.
- The custom protocol handler accepts the Free AI auth callback and forwards it to the renderer.
