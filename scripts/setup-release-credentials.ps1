[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Windows', 'MacOS', 'Android')]
    [string]$Target,

    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository = 'az0512124155azz-sys/free-ai',

    [string]$CertificatePath,
    [string]$KeystorePath,
    [string]$KeyAlias,
    [switch]$GenerateAndroidKeystore,

    [ValidateSet('ApiKey', 'AppleId')]
    [string]$NotarizationMode = 'ApiKey',

    [string]$AppleApiKeyPath,
    [string]$AppleApiKeyId,
    [string]$AppleApiIssuer,
    [string]$AppleId,
    [string]$AppleTeamId,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Resolve-InputFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$Extensions,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label path is required."
    }

    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    $extension = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
    if ($Extensions -notcontains $extension) {
        throw "$Label must use one of these extensions: $($Extensions -join ', ')."
    }
    return $resolved
}

function Read-SecretPlainText {
    param([Parameter(Mandatory = $true)][string]$Prompt)

    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $ptr = [IntPtr]::Zero
    try {
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        if ([string]::IsNullOrEmpty($value)) {
            throw "$Prompt cannot be empty."
        }
        return $value
    }
    finally {
        if ($ptr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }
    }
}

function Convert-FileToBase64 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path))
}

function Set-RepositorySecret {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $secretBytes = [Text.Encoding]::UTF8.GetByteCount($Value)
    if ($secretBytes -gt (48 * 1024)) {
        throw "GitHub Actions secret $Name is $secretBytes bytes; repository secrets are limited to 48 KB."
    }

    if ($DryRun) {
        Write-Host "[dry-run] Would set GitHub Actions secret: $Name"
        return
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'gh'
    $startInfo.Arguments = "secret set $Name --repo $Repository --app actions"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Could not start GitHub CLI while setting $Name."
    }

    try {
        $process.StandardInput.Write($Value)
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()

        if ($process.ExitCode -ne 0) {
            throw ("gh secret set failed for $Name. " + $stderr)
        }

        Write-Host "Set GitHub Actions secret: $Name"
        if (-not [string]::IsNullOrWhiteSpace($stdout)) {
            Write-Verbose $stdout
        }
    }
    finally {
        $process.Dispose()
    }
}

function Get-PrivateKeyCertificate {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Password
    )

    $collection = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
    $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    $collection.Import($Path, $Password, $flags)

    $certificate = $collection |
        Where-Object { $_.HasPrivateKey } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1

    if (-not $certificate) {
        throw 'The certificate bundle does not contain a private key.'
    }
    if ($certificate.NotAfter -le (Get-Date)) {
        throw "The signing certificate expired on $($certificate.NotAfter.ToString('u'))."
    }

    return $certificate
}

function Find-Keytool {
    $candidate = Get-Command keytool -ErrorAction SilentlyContinue
    if ($candidate) {
        return $candidate.Source
    }

    $paths = @()
    if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
        $paths += (Join-Path $env:JAVA_HOME 'bin\keytool.exe')
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $paths += (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe')
    }

    foreach ($path in $paths) {
        if (Test-Path -LiteralPath $path) {
            return (Resolve-Path -LiteralPath $path).Path
        }
    }

    throw 'keytool was not found. Install/use JDK 17+ or add Android Studio JBR\bin to PATH.'
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & $FilePath @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $detail = $output -join [Environment]::NewLine
        throw ("Command failed: " + $FilePath + " " + ($Arguments -join ' ') + [Environment]::NewLine + $detail)
    }
    return $output
}

if (-not $DryRun) {
    Assert-Command 'gh'
    & gh auth status --hostname github.com 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub CLI is not authenticated. Run: gh auth login'
    }
}

switch ($Target) {
    'Windows' {
        $certificate = Resolve-InputFile -Path $CertificatePath -Extensions @('.pfx', '.p12') -Label 'Windows code-signing certificate'
        $password = Read-SecretPlainText 'Windows certificate password'
        try {
            $signingCertificate = Get-PrivateKeyCertificate -Path $certificate -Password $password

            if ($signingCertificate.PublicKey.Oid.Value -ne '1.2.840.113549.1.1.1') {
                throw 'Windows public distribution requires an RSA code-signing certificate for Smart App Control compatibility.'
            }

            Write-Host "Validated Windows certificate:"
            Write-Host "  Subject:    $($signingCertificate.Subject)"
            Write-Host "  Thumbprint: $($signingCertificate.Thumbprint)"
            Write-Host "  Expires:    $($signingCertificate.NotAfter.ToString('u'))"

            $base64 = Convert-FileToBase64 -Path $certificate
            if ($base64.Length -gt 8192) {
                throw 'The base64 Windows certificate exceeds 8192 characters. Re-export the PFX without unnecessary certificate-chain entries or use a cloud/HSM signing path supported by electron-builder.'
            }
            Set-RepositorySecret -Name 'WIN_CSC_LINK' -Value $base64
            Set-RepositorySecret -Name 'WIN_CSC_KEY_PASSWORD' -Value $password
            $base64 = $null
        }
        finally {
            $password = $null
        }
    }

    'MacOS' {
        $certificate = Resolve-InputFile -Path $CertificatePath -Extensions @('.p12', '.pfx') -Label 'Developer ID Application certificate'
        $password = Read-SecretPlainText 'Developer ID Application certificate password'
        try {
            $signingCertificate = Get-PrivateKeyCertificate -Path $certificate -Password $password
            if ($signingCertificate.Subject -notmatch 'Developer ID Application') {
                throw "The selected certificate is not a Developer ID Application certificate. Subject: $($signingCertificate.Subject)"
            }

            Write-Host "Validated macOS Developer ID certificate:"
            Write-Host "  Subject:    $($signingCertificate.Subject)"
            Write-Host "  Thumbprint: $($signingCertificate.Thumbprint)"
            Write-Host "  Expires:    $($signingCertificate.NotAfter.ToString('u'))"

            $base64 = Convert-FileToBase64 -Path $certificate
            Set-RepositorySecret -Name 'MAC_CSC_LINK' -Value $base64
            Set-RepositorySecret -Name 'MAC_CSC_KEY_PASSWORD' -Value $password
            $base64 = $null
        }
        finally {
            $password = $null
        }

        if ($NotarizationMode -eq 'ApiKey') {
            $apiKey = Resolve-InputFile -Path $AppleApiKeyPath -Extensions @('.p8') -Label 'App Store Connect API key'
            if ([string]::IsNullOrWhiteSpace($AppleApiKeyId)) {
                throw 'AppleApiKeyId is required for ApiKey notarization.'
            }
            if ([string]::IsNullOrWhiteSpace($AppleApiIssuer)) {
                throw 'AppleApiIssuer is required for ApiKey notarization.'
            }

            $keyText = [IO.File]::ReadAllText($apiKey)
            if ($keyText -notmatch '-----BEGIN PRIVATE KEY-----') {
                throw 'The .p8 file does not look like an App Store Connect private key.'
            }

            Set-RepositorySecret -Name 'APPLE_API_KEY_BASE64' -Value (Convert-FileToBase64 -Path $apiKey)
            Set-RepositorySecret -Name 'APPLE_API_KEY_ID' -Value $AppleApiKeyId.Trim()
            Set-RepositorySecret -Name 'APPLE_API_ISSUER' -Value $AppleApiIssuer.Trim()
        }
        else {
            if ([string]::IsNullOrWhiteSpace($AppleId)) {
                throw 'AppleId is required for AppleId notarization.'
            }
            if ([string]::IsNullOrWhiteSpace($AppleTeamId)) {
                throw 'AppleTeamId is required for AppleId notarization.'
            }

            $appPassword = Read-SecretPlainText 'Apple app-specific password'
            try {
                Set-RepositorySecret -Name 'APPLE_ID' -Value $AppleId.Trim()
                Set-RepositorySecret -Name 'APPLE_APP_SPECIFIC_PASSWORD' -Value $appPassword
                Set-RepositorySecret -Name 'APPLE_TEAM_ID' -Value $AppleTeamId.Trim()
            }
            finally {
                $appPassword = $null
            }
        }
    }

    'Android' {
        $keytool = Find-Keytool

        if ([string]::IsNullOrWhiteSpace($KeyAlias)) {
            $KeyAlias = 'free-ai'
        }

        if ($GenerateAndroidKeystore) {
            if ([string]::IsNullOrWhiteSpace($KeystorePath)) {
                $signingDirectory = Join-Path $HOME '.free-ai\signing'
                New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
                $KeystorePath = Join-Path $signingDirectory 'free-ai-release.jks'
            }

            $keystore = [IO.Path]::GetFullPath($KeystorePath)
            $extension = [IO.Path]::GetExtension($keystore).ToLowerInvariant()
            if (@('.jks', '.keystore') -notcontains $extension) {
                throw 'A newly generated Android keystore must use .jks or .keystore.'
            }
            if (Test-Path -LiteralPath $keystore) {
                throw "Refusing to overwrite existing Android keystore: $keystore"
            }

            $repoRoot = $null
            if (Get-Command git -ErrorAction SilentlyContinue) {
                $candidateRoot = (& git rev-parse --show-toplevel 2>$null)
                if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($candidateRoot)) {
                    $repoRoot = [IO.Path]::GetFullPath($candidateRoot.Trim())
                }
            }
            if ($repoRoot) {
                $separator = [IO.Path]::DirectorySeparatorChar
                $repoPrefix = $repoRoot.TrimEnd($separator) + $separator
                if ($keystore.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                    throw 'Refusing to generate a production signing key inside the Git repository. Choose a path outside the repository.'
                }
            }

            $parent = Split-Path -Parent $keystore
            if (-not [string]::IsNullOrWhiteSpace($parent)) {
                New-Item -ItemType Directory -Force -Path $parent | Out-Null
            }

            $storePassword = Read-SecretPlainText 'Choose a new Android keystore password'
            $keyPassword = Read-SecretPlainText 'Choose a new Android key password'
        }
        else {
            $keystore = Resolve-InputFile -Path $KeystorePath -Extensions @('.jks', '.keystore', '.p12', '.pfx') -Label 'Android production keystore'
            $storePassword = Read-SecretPlainText 'Android keystore password'
            $keyPassword = Read-SecretPlainText 'Android key password'
        }

        $tempDirectory = Join-Path ([IO.Path]::GetTempPath()) ('free-ai-signing-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tempDirectory | Out-Null
        $generatedKeystoreValidated = $false

        $oldStore = $env:FREEAI_ANDROID_STOREPASS
        $oldKey = $env:FREEAI_ANDROID_KEYPASS
        try {
            $env:FREEAI_ANDROID_STOREPASS = $storePassword
            $env:FREEAI_ANDROID_KEYPASS = $keyPassword

            if ($GenerateAndroidKeystore) {
                Invoke-External -FilePath $keytool -Arguments @(
                    '-genkeypair',
                    '-v',
                    '-keystore', $keystore,
                    '-storetype', 'JKS',
                    '-alias', $KeyAlias,
                    '-keyalg', 'RSA',
                    '-keysize', '4096',
                    '-sigalg', 'SHA256withRSA',
                    '-validity', '10000',
                    '-dname', 'CN=Free AI,O=Free AI',
                    '-storepass:env', 'FREEAI_ANDROID_STOREPASS',
                    '-keypass:env', 'FREEAI_ANDROID_KEYPASS'
                ) | Out-Null

                if (-not (Test-Path -LiteralPath $keystore)) {
                    throw 'keytool did not create the requested Android keystore.'
                }

                Write-Host "Generated Android production keystore: $keystore"
                Write-Host 'Back up this file in at least two secure locations. Never commit it to Git.'
            }

            $csr = Join-Path $tempDirectory 'verify.csr'
            $cer = Join-Path $tempDirectory 'release.cer'

            Invoke-External -FilePath $keytool -Arguments @(
                '-certreq',
                '-alias', $KeyAlias,
                '-keystore', $keystore,
                '-storepass:env', 'FREEAI_ANDROID_STOREPASS',
                '-keypass:env', 'FREEAI_ANDROID_KEYPASS',
                '-file', $csr
            ) | Out-Null

            Invoke-External -FilePath $keytool -Arguments @(
                '-exportcert',
                '-alias', $KeyAlias,
                '-keystore', $keystore,
                '-storepass:env', 'FREEAI_ANDROID_STOREPASS',
                '-file', $cer
            ) | Out-Null

            $releaseCertificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($cer)
            if ($releaseCertificate.NotAfter -le (Get-Date)) {
                throw "The Android signing certificate expired on $($releaseCertificate.NotAfter.ToString('u'))."
            }
            $minimumAndroidExpiry = [DateTime]::SpecifyKind([DateTime]::Parse('2033-10-22T00:00:00'), [DateTimeKind]::Utc)
            if ($releaseCertificate.NotAfter.ToUniversalTime() -le $minimumAndroidExpiry) {
                throw "Android release certificates must remain valid after October 22, 2033. Current expiry: $($releaseCertificate.NotAfter.ToString('u'))"
            }

            $sha1 = $releaseCertificate.Thumbprint.ToUpperInvariant()
            $generatedKeystoreValidated = $true
            $pairs = for ($i = 0; $i -lt $sha1.Length; $i += 2) { $sha1.Substring($i, 2) }
            $sha1Display = $pairs -join ':'

            Write-Host 'Validated Android production key:'
            Write-Host "  Keystore:   $keystore"
            Write-Host "  Alias:      $KeyAlias"
            Write-Host "  Subject:    $($releaseCertificate.Subject)"
            Write-Host "  SHA-1:      $sha1Display"
            Write-Host "  Expires:    $($releaseCertificate.NotAfter.ToString('u'))"
            Write-Host '  OAuth pkg:  com.freeai.mobile'

            Set-RepositorySecret -Name 'ANDROID_RELEASE_KEYSTORE_BASE64' -Value (Convert-FileToBase64 -Path $keystore)
            Set-RepositorySecret -Name 'ANDROID_RELEASE_STORE_PASSWORD' -Value $storePassword
            Set-RepositorySecret -Name 'ANDROID_RELEASE_KEY_ALIAS' -Value $KeyAlias
            Set-RepositorySecret -Name 'ANDROID_RELEASE_KEY_PASSWORD' -Value $keyPassword
            Set-RepositorySecret -Name 'ANDROID_RELEASE_EXPECTED_SHA1' -Value $sha1

            Write-Host ''
            Write-Host 'Google Cloud must have an Android OAuth client for:'
            Write-Host '  Package: com.freeai.mobile'
            Write-Host "  SHA-1:   $sha1Display"
        }
        catch {
            if ($GenerateAndroidKeystore -and (Test-Path -LiteralPath $keystore)) {
                if ($generatedKeystoreValidated) {
                    Write-Warning "The generated keystore was validated and has been kept at $keystore. Fix the setup error and rerun the helper with -KeystorePath instead of generating a new key."
                }
                else {
                    Remove-Item -LiteralPath $keystore -Force -ErrorAction SilentlyContinue
                    Write-Warning 'Removed the newly generated keystore because key generation/validation did not complete successfully.'
                }
            }
            throw
        }
        finally {
            if ($null -eq $oldStore) {
                Remove-Item Env:FREEAI_ANDROID_STOREPASS -ErrorAction SilentlyContinue
            }
            else {
                $env:FREEAI_ANDROID_STOREPASS = $oldStore
            }

            if ($null -eq $oldKey) {
                Remove-Item Env:FREEAI_ANDROID_KEYPASS -ErrorAction SilentlyContinue
            }
            else {
                $env:FREEAI_ANDROID_KEYPASS = $oldKey
            }

            $storePassword = $null
            $keyPassword = $null
            Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host ''
if ($DryRun) {
    Write-Host 'Credential validation dry-run completed. No GitHub secrets were changed.'
}
else {
    Write-Host 'Credential setup completed. Run the production validation workflow next:'
    Write-Host '  validate_release=true'
    Write-Host '  publish_release=false'
}
