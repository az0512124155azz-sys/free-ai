# Android 2A — Authentication lifecycle

Android 2 starts after Android 1 runtime/device QA is complete.

## Current research

Google's current Android guidance uses Credential Manager for Sign in with Google. The legacy Google Sign-In Android API is outdated and no longer the recommended integration.

Free AI already uses `@capgo/capacitor-social-login` 8.5.10. The maintained v8 plugin uses Android Credential Manager internally, so Android 2 does not replace it with another Google SDK.

Supabase supports native Google authentication by receiving the Google ID token through `signInWithIdToken`. This avoids redirecting Android users through the Supabase-hosted OAuth page.

Supabase also recommends managing auth auto-refresh with the mobile app's foreground/background lifecycle. On foreground, refresh should run; in the background, it should stop.

## Android 2A changes

- Keep Supabase session persistence enabled.
- Restore the stored session on cold start.
- Re-read the stored session when Android returns to the foreground.
- Start Supabase auto-refresh while Android is active.
- Stop auto-refresh while Android is backgrounded.
- Keep the existing `onAuthStateChange` subscription as the authoritative UI session signal.
- Use Credential Manager's Google bottom-sheet flow through the maintained Capgo plugin.
- Explicitly allow all Google accounts instead of only previously authorized accounts.
- Request only `email` and `profile` scopes.
- Send the Google ID token directly to Supabase Auth.
- On logout, clear both the Supabase session and the native Google provider state.

## Project verification

The connected Supabase project is `free-ai` with ref `xquntkgjlmrxkwkrwsjl`, and it is currently healthy. The publishable key used by the app matches an enabled publishable key on that project.

## Deferred Android 2 work

This sub-checkpoint does not yet claim complete authentication coverage. Later Android 2 steps still need runtime verification of:

- email/password sign-in and sign-up;
- real Google account selection on a device/emulator with a Google account;
- cold-start session restoration;
- warm-resume session restoration;
- logout followed by login as another Google account;
- expired/rotated session handling;
- user-facing error states for canceled or misconfigured Google sign-in.
