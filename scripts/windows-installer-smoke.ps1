$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[Windows installer smoke] $Message"
}

function Wait-ForPath([string]$Path, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMilliseconds = 700) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) { return $false }
    $client.EndConnect($async)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-ForTcpPort([string]$HostName, [int]$Port, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -HostName $HostName -Port $Port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if ($env:RUNNER_OS -and $env:RUNNER_OS -ne 'Windows') {
  throw 'windows-installer-smoke.ps1 must run on a Windows runner.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseDir = Join-Path $repoRoot 'release'
$installer = Get-ChildItem -LiteralPath $releaseDir -Filter 'Free-AI-Windows-*.exe' -File |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw "Windows installer was not found under $releaseDir"
}

$installRoot = Join-Path $env:RUNNER_TEMP 'free-ai-installer-smoke'
$userDataRoot = Join-Path $env:APPDATA 'free-ai'
$localUserDataRoot = Join-Path $env:LOCALAPPDATA 'free-ai'

Write-Step "Installer: $($installer.FullName)"
Write-Step "Clean install path: $installRoot"

foreach ($path in @($installRoot, $userDataRoot, $localUserDataRoot)) {
  if ($path -and (Test-Path -LiteralPath $path)) {
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (Test-Path -LiteralPath $installRoot) {
  throw "Could not clear previous smoke-test installation: $installRoot"
}

Write-Step 'Running silent NSIS install'
$installProcess = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installRoot") -Wait -PassThru
if ($installProcess.ExitCode -ne 0) {
  throw "Installer exited with code $($installProcess.ExitCode)"
}

$appExe = Join-Path $installRoot 'Free AI.exe'
if (-not (Wait-ForPath -Path $appExe -TimeoutSeconds 30)) {
  $listing = if (Test-Path -LiteralPath $installRoot) {
    (Get-ChildItem -LiteralPath $installRoot -Recurse -File -ErrorAction SilentlyContinue |
      Select-Object -First 80 -ExpandProperty FullName) -join [Environment]::NewLine
  } else {
    '<install directory does not exist>'
  }
  throw ("Installed Free AI executable was not found at " + $appExe + [Environment]::NewLine + $listing)
}

$asar = Join-Path $installRoot 'resources\app.asar'
if (-not (Test-Path -LiteralPath $asar)) {
  throw "Packaged app.asar is missing: $asar"
}

$exeInfo = (Get-Item -LiteralPath $appExe).VersionInfo
Write-Step "Installed product: $($exeInfo.ProductName) $($exeInfo.ProductVersion)"
if ($exeInfo.ProductName -and $exeInfo.ProductName -ne 'Free AI') {
  throw "Installed executable ProductName is '$($exeInfo.ProductName)', expected 'Free AI'."
}

Write-Step 'Launching installed Free AI'
$appProcess = Start-Process -FilePath $appExe -PassThru

try {
  if (-not (Wait-ForTcpPort -HostName '127.0.0.1' -Port 17341 -TimeoutSeconds 35)) {
    $appProcess.Refresh()
    if ($appProcess.HasExited) {
      throw "Installed Free AI exited during first launch with code $($appProcess.ExitCode)."
    }
    throw 'Installed Free AI stayed running but did not open its local Browser Bridge port 17341.'
  }

  $appProcess.Refresh()
  if ($appProcess.HasExited) {
    throw "Installed Free AI exited immediately after opening its local bridge (code $($appProcess.ExitCode))."
  }

  Write-Step "First launch passed; local Browser Bridge is listening on 127.0.0.1:17341 (PID $($appProcess.Id))"
} finally {
  if ($appProcess -and -not $appProcess.HasExited) {
    & taskkill.exe /PID $appProcess.Id /T /F | Out-Host
    Start-Sleep -Seconds 2
  }
}

$uninstaller = Get-ChildItem -LiteralPath $installRoot -Filter '*Uninstall*.exe' -File -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $uninstaller) {
  throw "NSIS uninstaller was not found under $installRoot"
}

Write-Step "Running silent uninstall: $($uninstaller.Name)"
$uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList @('/S', "_?=$installRoot") -Wait -PassThru
if ($uninstallProcess.ExitCode -ne 0) {
  throw "Uninstaller exited with code $($uninstallProcess.ExitCode)"
}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and (Test-Path -LiteralPath $appExe)) {
  Start-Sleep -Milliseconds 500
}
if (Test-Path -LiteralPath $appExe) {
  throw "Free AI executable still exists after uninstall: $appExe"
}

Write-Step 'Clean install, packaged files, first launch, local bridge startup, and uninstall all passed.'
