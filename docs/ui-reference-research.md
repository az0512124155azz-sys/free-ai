# UI research notes — reference lock 2026-09-21

The implementation in this branch is based on two layers of evidence:

1. The attached 22-page research report, which separates official OpenAI documentation, direct screenshots, forensic CSS observations, and Free AI implementation targets.
2. A second verification pass against current official OpenAI Help Center / release documentation and the current ChatGPT Android Play listing.

The second pass confirmed the product structure we implement here: desktop Chat/Work with Codex as a separate view, a built-in desktop browser for Work/Codex, mobile-specific navigation rather than a shrunk desktop shell, plugins/connectors as installed external capabilities, and System/Light/Dark plus contrast/accent appearance controls.

Free AI deliberately keeps its own name, icon and visual mark. Layout density and interaction patterns may closely follow the locked reference, but OpenAI branding is not reused.

## Implementation decisions

- Desktop sidebar target: 260 px.
- Main chat max width: 800 px.
- Composer target: 768 / 52 / 32 (width / base height / radius).
- System UI font stack rather than Inter.
- Dark canvas #181818 with semantic surfaces rather than one hard-coded "ChatGPT background".
- Android compact UI has its own drawer, top Chat/Work selector, safe-area handling and settings navigation.
- Model picker only lists providers that are actually detected or explicitly configured.
- MCP/plugin entries come from capabilities detected on connected providers; Free AI does not claim to install third-party MCP servers itself.
- Desktop browser remains a separate Electron WebContentsView and its native page state is not faked with screenshots.

## Still intentionally not claimed as exact

OpenAI does not publish every internal icon path, per-component animation duration, Android dp measurement, or desktop native app token. Those values remain Free AI baselines until a device/DevTools capture is available.
