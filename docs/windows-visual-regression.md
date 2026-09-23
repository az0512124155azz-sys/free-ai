# Windows visual regression CI

Windows 7.16 adds a deterministic visual-regression gate for the Windows Electron shell.

## Why Windows-only first

The release-readiness gap identified in the existing Windows plan is the lack of any screenshot/golden comparison in CI. The first gate intentionally runs only on `windows-latest` so the baseline and future comparisons use the same OS family and runner class. Playwright documents that screenshot rendering can vary by OS, settings and hardware, so a baseline generated on another platform is not accepted.

## Test contract

The visual test:

- launches the real Electron application through Playwright;
- loads the production `dist` renderer, not a mock page;
- uses a fresh isolated user-data directory;
- forces a deterministic 1440×900 Windows window;
- fixes theme to dark, medium contrast, blue accent and 100% UI scale;
- clears chats/projects/provider-team state;
- disables animations, transitions and caret rendering;
- waits for fonts before capture;
- compares the main Windows shell against a committed PNG baseline;
- allows at most 0.3% changed pixels to tolerate small text anti-aliasing differences while still catching layout regressions.

The GitHub Release job depends on this visual job, so a release cannot be published when the Windows UI baseline check fails.

## Baseline workflow

A new baseline must be generated on the same `windows-latest` CI environment using Playwright `--update-snapshots`. The generated PNG must be reviewed before it is committed. Normal CI must compare against the committed baseline and must not auto-update snapshots.

This checkpoint does not publish a release.
