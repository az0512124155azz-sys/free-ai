# Free AI

Free AI is a cross-platform AI workspace that can use AI services already open in Chrome, desktop-stored API connections, and a paired Android client.

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

Load `extension/` as an unpacked Chrome extension from `chrome://extensions`.

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
