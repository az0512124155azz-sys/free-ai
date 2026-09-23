# Android 1C — Runtime / Device QA

Android 1C adds real Android 16 emulator coverage after the Android 1 mobile shell was merged.

## Why this exists

A successful APK build proves packaging, but it does not prove that the WebView shell behaves correctly under Android system UI, back navigation, IME resizing, rotation, or large-screen window sizes.

Android's current platform guidance requires extra attention here:

- Android 16 removes the edge-to-edge opt-out for apps targeting API 36.
- Predictive back is enabled by default for target 36 apps on Android 16.
- Large screens at 600dp+ are expected to adapt across window sizes and orientation.
- Android recommends testing Android 16 on both phone and tablet/large-screen emulator profiles.

## CI matrix

The runtime job boots two Android 16 Google APIs emulators:

- Pixel 7 Pro — phone
- Pixel Tablet — large screen

The release job depends on both runtime jobs.

## Runtime assertions

The dedicated runtime QA APK uses the same production React/Capacitor shell but builds with the existing deterministic test-session flag so authentication does not block shell testing.

A debug-only MainActivity bridge lets ADB request renderer state. The bridge is not active in release builds.

Each emulator must prove:

- the native Android shell is rendered;
- the login screen is not present in the test build;
- the mobile navigation trigger is visible;
- desktop primary navigation is hidden;
- the conversation model picker is visible;
- the composer is visible;
- safe-area values are exposed;
- opening the drawer works;
- Android Back closes the drawer without exiting;
- opening the model picker works;
- Android Back closes the model picker;
- focusing the composer produces a non-zero keyboard viewport offset;
- the viewport adapts after rotation while preserving the mobile shell;
- the app process remains alive.

The job records screenshots for initial state, drawer, model picker, keyboard, and rotated state plus a text runtime report.

## Scope

This checkpoint still belongs to Android 1. It does not implement Android 2 authentication. Production APK output remains the normal authenticated build; the runtime QA APK is a separate CI-only debug artifact.
