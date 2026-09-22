# Free AI

Free AI is a cross-platform AI workspace that can use AI services already open in Chrome, desktop-stored API connections, and a paired Android client.

## Download

### Browser extension

**Stable release:** [Download the published Free AI Browser Bridge ZIP](https://github.com/az0512124155azz-sys/free-ai/releases/latest/download/free-ai-extension.zip)

**Current main build:** [Open the latest `main` Build Free AI runs](https://github.com/az0512124155azz-sys/free-ai/actions/workflows/build.yml?query=branch%3Amain), open the newest successful run, and download the **`free-ai-chrome-extension`** artifact.

The stable link intentionally follows the latest published GitHub Release. Development checkpoints do not republish an existing release tag, so the Actions artifact can be newer than the stable release. GitHub Actions artifacts are temporary build artifacts and can expire; use the published Release ZIP when you need the stable permanent download.

The extension is a Chrome/Edge Manifest V3 bridge with:
- the Free AI app logo
- a status popup
- local desktop-bridge connection status
- supported AI tab detection
- Rescan and Reconnect controls
- Browser Use tab/action support

Install it manually:
1. Download and extract `free-ai-extension.zip`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the extracted extension folder.
6. Open Free AI on the same computer; the popup should report **Connected to Free AI**.

All installers and release files are available from the [Releases page](https://github.com/az0512124155azz-sys/free-ai/releases/latest).

## Repository layout

- `src/` — shared React UI for desktop and Android
- `electron/` — Electron main/preload processes for Windows, macOS and Linux
- `extension/` — Chrome Manifest V3 browser bridge
- `relay/` — WebSocket relay used by Android to reach the paired desktop
- `scripts/` — CI/build helpers
- `.github/workflows/build.yml` — Windows, macOS, Linux, Android and extension builds

## How model connections work

### Browser sessions

The Chrome extension detects supported AI tabs that are actually open and reachable. The app does not assume ChatGPT or any other provider is connected.

Supported browser adapters currently include:

- ChatGPT
- Claude
- Gemini
- DeepSeek
- Grok
- Manus

Browser sites change frequently, so the DOM adapters in `extension/content.js` may need maintenance when providers redesign their chat UI.

### API models

Desktop Settings can store OpenAI-compatible API endpoints such as LM Studio, Ollama-compatible gateways, NVIDIA-compatible gateways, or other `/chat/completions` services.

API keys are stored on the desktop. Android receives only sanitized model metadata through the relay, not the API key.

### MCP / connectors

The extension reports connectors/tools it can detect in connected browser model UIs. Free AI can route a tool request through the browser model that owns the detected connector and then pass the returned result to another connected model.

Free AI does not install MCP servers into third-party AI products. Install/authorize the connector in the provider that supports it first.

## Security model

- The Chrome extension connects only to the desktop bridge on `127.0.0.1:17341`.
- The local bridge rejects normal web-page origins and accepts Chrome-extension WebSocket clients.
- Android remote control uses an outbound desktop WebSocket connection plus a generated pairing key.
- API keys remain on the desktop and are not sent to Android.
- Use `wss://` for a public relay.

## Local development

```bash
npm install
npm run dev
```

Load `extension/` as an unpacked Chrome/Edge extension from `chrome://extensions` or `edge://extensions`.

## Relay

```bash
npm run relay
```

Set `PORT` when required by your host.

## Authentication

Supabase Auth is wired for email/password and Google OAuth.

Configure:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The matching values should also be configured as GitHub Actions secrets for release builds.

Full Google setup instructions: `docs/google-auth.md`.

Google OAuth additionally requires the correct redirect URLs to be allowed in the Supabase/Google provider configuration for the platform being used.

If Supabase is not configured, development builds enter a local workspace instead of hanging on a login screen.

## Builds

The GitHub workflow builds:

- Windows NSIS installer
- macOS DMG
- Linux AppImage
- Android debug APK
- Chrome extension ZIP

Pull requests run the full build matrix before changes are merged to `main`.

## Android Google sign-in

Free AI uses native Google Credential Manager on Android and exchanges the Google ID token directly with Supabase. Android does not use the Supabase-hosted OAuth browser page.

Google Cloud must contain two OAuth clients in the same project:

- **Web application** client: `991329297292-fp0ciud251vjasflsjq4r7k2vgo4sij7.apps.googleusercontent.com`
- **Android** client with:
  - package: `com.freeai.mobile`
  - SHA-1: `1F:F0:59:1B:C8:69:C4:89:01:01:2F:79:E1:2D:0B:2E:7D:FC:C9:4B`

The repository contains a public debug-only keystore so GitHub Actions APKs keep the same SHA-1 across builds. Do not use that debug key for a production Play Store release. Production and Play App Signing certificates need their own Android OAuth client IDs.

The web client ID can be overridden at build time with `VITE_GOOGLE_WEB_CLIENT_ID`.

Desktop/web continue to use the Supabase PKCE OAuth flow. Google Auth Platform Branding/Verification can show the Free AI name/logo, while replacing the raw `<project-ref>.supabase.co` domain itself requires a Supabase custom or vanity domain (a paid-plan feature).

