# Android 1 — Research + Native Mobile Shell

This checkpoint starts Android development only after the Windows 1–7 program is complete.

## Official findings

- OpenAI's current Android help says chat history is opened from a two-line menu in the top-left of the app.
- OpenAI's June 2026 release notes place the mobile model picker at the top of the conversation.
- Android 15 enforces edge-to-edge for apps targeting API 35+, so content must handle system-bar and display-cutout insets.
- Android 16 removes the edge-to-edge opt-out for apps targeting API 36 and enables predictive-back behavior by default for target 36+ apps.
- Capacitor 8 provides SystemBars for modern edge-to-edge apps and injects `--safe-area-inset-*` CSS variables on Android when needed.
- Capacitor App exposes the Android `backButton` event for application-level back handling.

## Observed in Free AI before Android 1

- A compact drawer, composer, plus menu, model picker, settings navigation, and mobile CSS already existed.
- The compact mobile layout was selected only by viewport width, so Android tablets wider than 760px could fall back to desktop shell behavior.
- Android had no application-level `backButton` listener.
- Safe-area CSS used browser `env()` values only.
- Android branding wrote legacy status/navigation-bar colors and used `shortEdges` cutout mode.

## Android 1 changes

- Native Android is explicitly marked with `nativeMobileShell` at every window width.
- Tablets retain mobile navigation/drawer behavior while allowing wider content.
- The app bar uses a two-line mobile menu glyph.
- The mobile model picker remains at the top of the conversation.
- Native Android back closes transient UI layers before exiting the app.
- SystemBars uses Capacitor 8's edge-to-edge API and CSS inset injection.
- Composer/floating menus react to the visible viewport when the IME changes size.
- The Android resource branding step uses `windowLayoutInDisplayCutoutMode=always` and no longer writes deprecated system-bar colors.

## Deferred to later Android checkpoints

- Authentication and Credential Manager: Android 2.
- Native dictation and chat/composer feature completion: Android 3.
- Full mobile Settings list/detail back-stack behavior: Android 4.
- Remote Desktop: Android 5.
- Device matrix, adaptive branding and final native QA: Android 6.
