# Google sign-in branding for Free AI

The Android Google account chooser can currently show `xquntkgjlmrxkwkrwsjl.supabase.co`.
That string is the Supabase Auth domain involved in the OAuth redirect. Renaming the
Supabase project display name alone does not replace this host.

## Google Auth Platform

Configure the OAuth client in **Google Auth Platform -> Branding**:

- App name: `Free AI`
- App logo: use `build/free-ai-symbol.svg` (or a PNG export of the same mark)
- Support email: a real Free AI support address
- Homepage: the public Free AI product page
- Privacy Policy: a public privacy policy URL
- Terms of Service: a public terms URL

Submit the brand for verification when Google requires it for the configured scopes.

## Supabase Auth domain

Supabase recommends using a custom project domain such as `auth.example.com` for a
fully branded OAuth flow. Without one, Google can show the default
`<project-ref>.supabase.co` domain.

The current Supabase organization for this project is on the Free plan. Custom
domains are a paid Supabase add-on, so this repository cannot remove the Supabase
project-ref host until the project is moved to a plan that supports the add-on and a
domain is configured.

When a custom domain is enabled:

1. Add the custom Supabase callback URL to the Google OAuth client's authorized
   redirect URIs.
2. Keep `freeai://auth/callback` in the Supabase redirect allow list for the
   desktop/Android PKCE return to the application.
3. Test both cold-start and warm-start deep-link returns.
4. Do not remove the working callback until the new branded domain has been verified.

## What the app code already does

Free AI uses PKCE and returns to:

`freeai://auth/callback`

That app deep link is separate from the Google -> Supabase callback domain.
