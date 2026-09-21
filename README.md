# Free AI

Free AI is a cross-platform AI control center that lets a desktop app and Android client use AI chats already open in Chrome through a companion extension.

## Architecture

- `apps/desktop` — Electron + React desktop app (Windows/macOS/Linux)
- `apps/mobile` — Capacitor Android wrapper using the shared web UI
- `extension` — Chrome Manifest V3 companion extension
- `relay` — lightweight WebSocket relay for remote Android -> desktop commands
- `.github/workflows/build.yml` — cross-platform build pipeline

## Security model

The Chrome extension only connects to the desktop bridge on `127.0.0.1:17341`.
Remote Android control uses a user-generated pairing key and an outbound desktop connection to the relay.
Never expose the local browser bridge directly to the internet.

## Setup

1. Install dependencies: `npm install`
2. Start desktop: `npm run dev`
3. Load `extension/` as an unpacked Chrome extension.
4. In desktop Settings, create/copy a pairing key.
5. Run the relay with `npm run relay` on a reachable HTTPS/WSS host.
6. Enter the relay URL + pairing key in Android settings.

## Authentication

The UI includes email/password and Google sign-in wiring through Supabase Auth.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for production auth.

## Browser providers

Initial adapters: ChatGPT, Claude, Gemini, DeepSeek and Grok.
Because provider DOMs change over time, adapters are isolated in `extension/providers.js`.
