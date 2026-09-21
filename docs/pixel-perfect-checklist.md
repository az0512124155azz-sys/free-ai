# Free AI reference-locked UI checklist

This checklist turns the research report into release gates. Unknown ChatGPT values must stay unknown until measured; do not replace them with guesses.

## Desktop shell

- [ ] Free AI brand mark is visible in app chrome, auth, splash, taskbar/dock and installers.
- [ ] Sidebar is 260 CSS px at the locked desktop reference.
- [ ] Main canvas, sidebar, composer, popovers and borders use semantic tokens.
- [ ] Chat/Work selector is centered in the desktop header.
- [ ] Composer baseline is 768 px wide, 52 px minimum height, 32 px radius.
- [ ] Model list is built from actually connected browser/API providers; the app never assumes ChatGPT is connected.
- [ ] Reasoning effort exposes explicit discrete states and keyboard-accessible range input.
- [ ] Plus menu has no dead action: file attach, browser, plugins and computer controls must execute.
- [ ] Profile menu and Settings are interactive rather than screenshot replicas.
- [ ] Browser panel is backed by Electron WebContentsView, not an iframe or static image.
- [ ] File preview supports text/image and explicit unsupported/archive states.
- [ ] Computer pane clearly distinguishes preview-only from full access.
- [ ] File/Edit/View/Help native application menu is visible on Windows/Linux.
- [ ] Ctrl/Cmd+Shift+B toggles the browser panel.

## Android

- [ ] Compact layout uses a drawer instead of a permanently pinned desktop sidebar.
- [ ] Chat/Work is selected through a compact top menu.
- [ ] All primary touch targets are at least 48 dp where possible.
- [ ] Safe-area and IME/keyboard insets do not cover the composer.
- [ ] Browser actions open a mobile browser destination rather than copying the desktop split pane.
- [ ] Settings use list -> detail navigation on compact screens.
- [ ] Adaptive icon, monochrome layer and splash use the Free AI brand.
- [ ] Google OAuth handles both cold-start and warm-start freeai:// callbacks.

## QA

- [ ] npm run validate
- [ ] npm run build:web
- [ ] Windows NSIS build
- [ ] macOS DMG build
- [ ] Linux AppImage build
- [ ] Android APK build
- [ ] Chrome extension package
- [ ] No renderer blank/black screen on cold launch.
- [ ] No OpenAI/ChatGPT logo is used as Free AI branding.
- [ ] Keyboard: Tab, Shift+Tab, Enter, Space, Escape and slider arrows.
- [ ] RTL smoke test for Hebrew text and mixed RTL/LTR URLs.
- [ ] Reduced-motion mode disables nonessential movement.
