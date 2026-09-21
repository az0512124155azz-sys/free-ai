# Google OAuth branding for Free AI

This repository can control the Free AI application UI, but Google owns the account chooser / consent UI.

The current Supabase callback is:

`https://xquntkgjlmrxkwkrwsjl.supabase.co/auth/v1/callback`

## Required Google Auth Platform branding

In the Google Cloud project that owns the OAuth client used by Supabase, open **Google Auth Platform > Branding** and configure:

- App name: **Free AI**
- App logo: use the symbol from `build/icon.svg`
- User support email: a monitored product support address
- Homepage: the public Free AI product page when available
- Privacy policy: a public Free AI privacy policy
- Terms of service: a public Free AI terms page

Complete Google brand verification when Google requires it.

Supabase documents that Google Branding / Verification is what shows a logo and name instead of a generic Supabase project identifier in the consent experience.

## Removing the `<project-ref>.supabase.co` hostname

Changing only the app name does **not** change the Supabase callback hostname.

To replace `xquntkgjlmrxkwkrwsjl.supabase.co` with a branded auth hostname, configure a Supabase custom domain (for example `auth.example.com`) or an eligible Supabase vanity subdomain, then:

1. Update the app's `VITE_SUPABASE_URL`.
2. Add the new Supabase callback URL to the Google OAuth client's authorized redirect URIs.
3. Keep `freeai://auth/callback` in Supabase's redirect allow list for desktop/mobile PKCE return.
4. Test both cold-start and warm-start OAuth on Android and desktop before removing the old callback.

## Android native Google sign-in

A future Android-specific improvement can use a Google **Android OAuth client ID** (package name + signing SHA-1) and pass the Google ID token to Supabase with `signInWithIdToken`. That is a different flow from the current hosted OAuth redirect and requires an Android client ID for every signing certificate used by the app.

Do not place OAuth client secrets in the Android package or in this repository.
