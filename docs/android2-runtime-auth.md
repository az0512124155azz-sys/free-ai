# Android 2A2 — Runtime authentication verification

## Scope of this sub-step

Android 2A2-A adds a dedicated Android authentication runtime-QA build and a debug-only command bridge. It does **not** declare Android 2A2 complete and it does not add Android 3 work.

The existing Android shell/runtime APK remains auth-independent. A second CI-only APK, `free-ai-auth-runtime-qa.apk`, is built with the real configured Supabase URL/publishable key and Google Web Client ID so later runtime tests can exercise the actual authentication stack.

## Why a separate APK is required

The Android 1 runtime build deliberately uses `VITE_VISUAL_TEST=1`. In that mode the renderer does not create a Supabase client, which keeps shell/IME/rotation tests deterministic but makes real login/session verification impossible.

Android 2A2 therefore uses `VITE_ANDROID_AUTH_QA=1` as a separate flag. This keeps Supabase enabled while exposing a debug-only QA hook.

## Runtime commands

The native debug bridge can route auth-prefixed commands to `window.__FREEAI_ANDROID_AUTH_QA__`.

Supported infrastructure commands:

- `authAudit` — reports only readiness, whether a session exists, whether the auth screen is present, operation status, and a sanitized error code.
- `authSignInPassword` — signs in through the real `supabase.auth.signInWithPassword` path using credentials supplied only at runtime.
- `authRefreshSession` — exercises `supabase.auth.refreshSession()`.
- `authSignOut` — exercises the same product logout path used by the UI, including native Google provider logout on Android.
- `authStartGoogle` — starts the real native Google button/Capgo Credential Manager flow for later runtime verification.

No access token, refresh token, email, or password is returned by the audit hook.

## Security rules

- Do not commit test account credentials.
- Do not compile test account credentials into the APK.
- Do not add service-role or secret keys to the renderer.
- Email/password test credentials, if added in a later checkpoint, must be supplied at runtime from CI secrets and masked by GitHub.
- The auth runtime APK is CI-only and must not be included in release artifacts.

## Research basis

- Supabase JavaScript supports password login with `signInWithPassword`, stored-session inspection with `getSession`, explicit refresh with `refreshSession`, and logout with `signOut`.
- Supabase sessions consist of an access token plus a one-time-use refresh token; refresh behavior is therefore an important mobile runtime check.
- Android Sign in with Google uses Credential Manager. The native flow returns a Google ID token which is then passed to Supabase `signInWithIdToken`.
- Capgo's Android Google implementation uses Credential Manager and requires the Android package/SHA-1 and Web Client ID configuration to match the Google Cloud project.

Official references:

- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/reference/javascript/auth-getsession
- https://supabase.com/docs/reference/javascript/auth-refreshsession
- https://supabase.com/docs/guides/auth/signout
- https://developer.android.com/identity/sign-in/credential-manager-siwg
- https://capgo.app/docs/plugins/social-login/google/android/

## Deferred to the next Android 2A2 checkpoints

This sub-step creates the safe runtime plumbing only. The following still require runtime evidence before Android 2A2 can be closed:

- live email/password login, invalid password, logout and relogin
- cold-start persisted-session restore
- background/foreground restore
- explicit refresh-token verification
- expired/revoked-session behavior
- Google Credential Manager presentation/cancel behavior
- successful Google login with a real Google account
- account switching
- confirmation that Android never falls back to a Supabase-hosted browser OAuth screen


## Android 2A2-E — Live email/password and session runtime QA

This checkpoint adds a credential-gated Android 16 emulator job for a dedicated existing test account.

Repository secrets:

- `ANDROID_AUTH_TEST_EMAIL`
- `ANDROID_AUTH_TEST_PASSWORD`

The credentials are injected only at workflow runtime. They are not committed, compiled into the APK, written to the QA report, or returned by the renderer audit hook. The workflow masks both values before running the emulator.

When both secrets are configured, the live QA driver verifies:

1. signed-out startup
2. existing-account email/password login
3. explicit `refreshSession()`
4. cold app restart with persisted session restoration
5. Android background → foreground resume while keeping the session
6. logout through the product logout path
7. invalid-password failure without a stale authenticated UI
8. valid relogin
9. final logout

Evidence is uploaded separately as `free-ai-android-auth-runtime-email-session`.

If either repository secret is missing, the credential check fails the Android auth runtime job. The workflow must not produce a green result for this checkpoint unless the live emulator flow actually runs.

The test account should be dedicated to CI because the current product logout uses Supabase's default global sign-out behavior.

### Still deferred

Android 2A2 is not complete after this checkpoint. Remaining runtime coverage still includes:

- signup
- expired/revoked session behavior
- real Google Credential Manager presentation and cancel behavior
- successful Google login with an account present on the Android device
- Google account switching
- wrong/missing Google configuration runtime evidence
- proof that Android Google auth never falls back to a Supabase-hosted browser OAuth screen


### Configuring the dedicated CI test account

Create one dedicated confirmed Email/Password user in the Supabase Dashboard under Authentication → Users. Do not reuse a personal account.

Store that account only as GitHub repository Actions secrets:

- Settings → Secrets and variables → Actions → New repository secret → `ANDROID_AUTH_TEST_EMAIL`
- Settings → Secrets and variables → Actions → New repository secret → `ANDROID_AUTH_TEST_PASSWORD`

Do not place either value in repository variables, workflow YAML, documentation, issue/PR comments, or source code.

Supabase's Admin API is also valid for provisioning a test user from a trusted server, but it requires a secret/service-role key and must never be exposed to the renderer or Android APK.


## Android 2A2-K — Public Auth configuration alignment

The live-auth configuration probe must use the same public Supabase project configuration as the application itself.

If GitHub Actions does not define `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`, the probe reads the application's existing fallback values from `src/main.jsx`. The fallback key must begin with `sb_publishable_`; secret/service-role keys are rejected.

This is intentional: Supabase publishable keys are designed for public clients such as browser, mobile, desktop applications, scripts, source code, and CI. They do not grant server/admin privileges.

This fallback applies only to public project configuration. It does not provide the credentialed test account required for the live email/password lifecycle test.


## Android 2A2-M — GitHub OIDC trust verification

Before adding any server-side CI user provisioning, the Android auth runtime job now proves the GitHub→Supabase trust channel independently.

The job requests a GitHub Actions OIDC token with the dedicated audience `free-ai-android-auth-qa` using `permissions: id-token: write`. It sends that short-lived token to the Supabase Edge Function `free-ai-ci-oidc-check`.

The Edge Function has Supabase platform JWT verification disabled because GitHub issues the token, not Supabase. The function performs its own verification against GitHub's OIDC issuer/JWKS and accepts only the intended repository/workflow identity and allowed PR/main events.

This checkpoint does not create, modify, or delete any Supabase Auth user and does not use an Auth admin/service-role credential in GitHub Actions.


## Android 2A2-O — OIDC-gated ephemeral QA account provisioning

The live email/password runtime test no longer requires long-lived GitHub repository secrets for the QA account.

Flow:

1. GitHub Actions requests a short-lived OIDC token with the audience `free-ai-android-auth-qa`.
2. The workflow generates a fresh random password locally for that run and masks it before any later workflow command.
3. The password is sent over HTTPS to the Supabase Edge Function `free-ai-ci-auth-provision` together with the OIDC token.
4. The Edge Function verifies the GitHub OIDC issuer, audience, repository, workflow and allowed PR/main event claims.
5. Only after that verification, the function uses Supabase's server-side admin client with the Edge Function's built-in secret key to create or update the dedicated confirmed QA account.
6. The function returns only the QA email and success metadata. It never returns the password.
7. The workflow stores the generated email/password only in the current job's environment for the Android emulator steps.

The dedicated account is marked in `app_metadata.purpose` as `free-ai-android-auth-runtime-qa`.

No service-role or `sb_secret_` key leaves Supabase. No long-lived QA password is stored in GitHub, the repository, the APK, artifacts, or logs.


## Android 2A2-S — Revoked/expired session recovery runtime QA

The Android auth runtime suite now verifies the deterministic equivalent of reaching access-token expiry after the server has revoked the session:

1. Sign in to the dedicated QA account.
2. In the dedicated QA build only, capture the current access token into runner memory without writing it to the evidence report.
3. Mask the token immediately and send it over HTTPS to the OIDC-gated Supabase Edge Function `free-ai-ci-auth-revoke`.
4. The Edge Function verifies GitHub OIDC claims, validates that the supplied JWT belongs to the dedicated QA identity, and calls Supabase Admin `signOut(jwt, "global")`.
5. Because Supabase access-token JWTs remain valid until their `exp` time, the test explicitly calls `refreshSession()` immediately after revocation. This deterministically exercises the failure the client will hit once it needs to refresh.
6. The renderer treats only terminal Auth error codes (`refresh_token_not_found`, `refresh_token_already_used`, `session_not_found`, or `session_expired`) as revoked/expired sessions. Temporary network errors are not treated as logout.
7. On a terminal refresh failure, the app attempts a local-only sign-out, clears stale React session state, and must show the Auth screen.
8. The suite captures `05-revoked-session-recovered.png` and verifies a fresh password sign-in works afterward.

The access token is never written to `runtime-report.txt`, GitHub artifacts, repository files, or application release builds. No Supabase secret/service-role credential is exposed to the Android app or GitHub Actions.


## Android 2A2-W — Google Credential Manager runtime QA infrastructure

The Android Google sign-in path remains on `@capgo/capacitor-social-login` and its Android Credential Manager implementation. No legacy `GoogleSignInClient` flow is added.

Current Android OAuth runtime identity:

- package: `com.freeai.mobile`
- stable debug signing SHA-1: `1F:F0:59:1B:C8:69:C4:89:01:01:2F:79:E1:2D:0B:2E:7D:FC:C9:4B`
- the native plugin is initialized with the Web OAuth client ID, while the Android OAuth client remains configured in Google Cloud by package + signing SHA-1.

The dedicated auth QA renderer now records sanitized Google state without exposing an ID token:

- `provider_check`
- `initializing`
- `credential_manager_requested`
- `credential_received`
- `signed_in`
- `cancelled / user_cancelled`
- classified non-fatal `no_credential` / `account_reauth_failed`
- explicit `google_config` for package/SHA/client-ID setup failures

User cancellation is deliberately not rendered as an unknown authentication failure.

The new `Android Google Credential Manager runtime` CI job runs the real Android product button path on an Android 16 Google APIs emulator. The CI emulator does not contain a personal Google account, so this checkpoint verifies the native entry path and error/cancel behavior rather than claiming a successful Google identity login.

The runtime driver:

1. starts from the signed-out Auth screen;
2. invokes the real `Continue with Google` product path;
3. requires proof that the native Google request path was reached;
4. captures native-system evidence;
5. rejects an unexpected Chrome/browser activity;
6. sends Android Back to exercise cancellation when a native chooser is present;
7. accepts only a benign user-cancel, an accountless `no_credential` outcome, or the documented account reauthentication outcome;
8. fails on `google_config`;
9. requires `session=false` and the Auth screen after a non-authenticated outcome.

Evidence is uploaded separately as `free-ai-android-google-runtime`.

This does **not** yet mark the credentialed Google scenarios complete. A later checkpoint still needs real-account evidence for account selection, successful Google ID-token → Supabase sign-in, logout → different Google account, and user cancellation on a device/emulator that actually has Google accounts.
