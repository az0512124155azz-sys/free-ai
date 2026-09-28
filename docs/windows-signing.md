# Windows code-signing readiness

Free AI uses electron-builder 26.x and an NSIS Windows installer.

## CI signing path

Windows Authenticode signing is enabled automatically when both repository Actions secrets are configured:

- `WIN_CSC_LINK` — a Windows code-signing certificate accepted by electron-builder (for example a base64-encoded `.pfx`, file/URL supported by electron-builder).
- `WIN_CSC_KEY_PASSWORD` — the private-key password for that certificate.

The certificate and password must never be committed to the repository.

The workflow deliberately supports two modes:

1. **Development / ordinary CI:** if neither signing secret exists, the Windows build remains unsigned and CI continues.
2. **Signed build:** if both signing secrets exist, electron-builder signs the Windows executable and NSIS installer, and the Windows installer smoke test requires a valid Authenticode signature on both the installer and the installed `Free AI.exe`.

A partial configuration (only one of the two secrets) fails the Windows job.

## Release behavior

Windows Authenticode is optional for Free AI releases.

If `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are configured, electron-builder signs the Windows executable and NSIS installer and CI verifies both signatures. If neither secret is configured, validation and publication continue with the unsigned installer after the normal clean-install, launch, restart, protocol-registration, uninstall and visual-regression checks pass.

A partially configured signing pair still fails closed.

## Publisher trust

Use a certificate issued by a trusted code-signing provider. Do not use a self-signed certificate for public distribution.

SmartScreen reputation is not the same thing as a valid signature: Microsoft documents that a newly signed binary can still show an unrecognized-app warning while publisher/file reputation is established. Keeping the same trusted publisher identity across releases allows reputation to carry across signed versions more effectively than unsigned builds.

## Microsoft Artifact Signing

Microsoft Artifact Signing (formerly Trusted Signing) is Microsoft's recommended cloud-signing path for eligible non-Store distribution. electron-builder 26 exposes this through `win.azureSignOptions`, with Azure/Entra credentials supplied through environment variables.

It is intentionally not configured here because the repository does not currently contain a real signing account endpoint, certificate profile, publisher identity, or Azure credentials. Add it only after those real account values exist; do not insert placeholder signing identities into production configuration.

## Verification

The Windows installer smoke uses PowerShell `Get-AuthenticodeSignature` when signing is expected and fails unless:

- the NSIS installer reports `Status = Valid`;
- the installed `Free AI.exe` reports `Status = Valid`;
- a signer certificate is present.

The normal installer, first-launch, restart, protocol-registration, and uninstall smoke checks still run in both signed and unsigned development builds.
