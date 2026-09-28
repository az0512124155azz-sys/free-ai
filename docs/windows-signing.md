# Windows code-signing readiness

Free AI uses electron-builder 26.x and an NSIS Windows installer.

The release pipeline supports **exactly one** of two trusted Windows signing methods:

1. a traditional RSA Authenticode certificate supplied as PFX/P12;
2. Microsoft Artifact Signing (formerly Azure Trusted Signing), using an Artifact Signing account and Microsoft Entra application.

A release-validation or publication run fails closed if neither method is configured, if either method is only partially configured, or if both methods are configured at the same time.

## Option A: PFX / P12 Authenticode certificate

Required GitHub Actions secrets:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

`WIN_CSC_LINK` may contain the base64-encoded certificate accepted by electron-builder. The certificate must include its private key and must be issued by a trusted code-signing provider for public distribution.

Use the repository helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target Windows `
  -WindowsSigningMode Pfx `
  -CertificatePath "C:\secure\free-ai-code-signing.pfx"
```

The helper validates the private key, expiry and RSA algorithm, checks the Windows environment-variable size limit, prompts for the PFX password locally, and writes both repository secrets through GitHub CLI stdin.

Do not use a self-signed certificate for public distribution.

## Option B: Microsoft Artifact Signing

Microsoft Artifact Signing is the current name for the managed service previously called Trusted Signing. electron-builder 26 supports it directly through `win.azureSignOptions`.

External prerequisites that cannot be created safely by source code alone:

1. an Azure subscription;
2. the `Microsoft.CodeSigning` resource provider registered;
3. an Artifact Signing account;
4. completed Microsoft identity validation;
5. a Public Trust certificate profile;
6. a Microsoft Entra application/service principal that is allowed to sign with the certificate profile.

Microsoft documents the current setup here:

- https://learn.microsoft.com/azure/artifact-signing/quickstart
- https://learn.microsoft.com/azure/artifact-signing/how-to-signing-integrations

After those resources exist, Free AI needs these Actions secrets:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `WIN_AZURE_SIGN_ENDPOINT`
- `WIN_AZURE_SIGN_ACCOUNT`
- `WIN_AZURE_SIGN_PROFILE`
- `WIN_AZURE_SIGN_PUBLISHER`

The publisher value must match the Common Name / publisher identity issued by the Artifact Signing certificate profile.

Configure all seven safely with the local helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-release-credentials.ps1 `
  -Target Windows `
  -WindowsSigningMode ArtifactSigning `
  -AzureTenantId "<tenant-id>" `
  -AzureClientId "<application-client-id>" `
  -AzureSigningEndpoint "https://<region>.codesigning.azure.net/" `
  -AzureSigningAccount "<artifact-signing-account>" `
  -AzureSigningProfile "<certificate-profile>" `
  -AzureSigningPublisher "<exact-certificate-publisher>"
```

The helper prompts for the Entra application client secret with `SecureString`; it is not accepted as a command-line parameter.

The CI preflight rejects:

- any partial PFX configuration;
- any partial Artifact Signing configuration;
- both signing methods configured simultaneously;
- a production validation/publication run with no signing method.

When Artifact Signing is selected, `electron-builder.config.cjs` populates `win.azureSignOptions` dynamically from the Actions secrets. Azure authentication is provided through `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`.

## Development versus release builds

Ordinary CI remains allowed to build an unsigned Windows installer when no signing credentials exist. This keeps pull-request and development builds usable.

A manual run with either:

- `validate_release=true`, or
- `publish_release=true`

requires a complete trusted Windows signing method.

## Verification

The Windows installer smoke uses PowerShell `Get-AuthenticodeSignature` whenever signing is expected and fails unless:

- the NSIS installer reports `Status = Valid`;
- the installed `Free AI.exe` reports `Status = Valid`;
- a signer certificate is present.

The normal installer, first-launch, restart, protocol-registration, and uninstall smoke checks run in both signed and unsigned development builds.

## Important trust distinction

A valid Authenticode signature proves publisher identity and file integrity. Windows SmartScreen reputation is a separate reputation system, so a newly established publisher may still see reputation warnings while trust is built.

Never replace a production certificate with a self-signed certificate merely to make the release gate green.
