$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$Message) {
  Write-Error "Windows 7 installer smoke failed: $Message"
  exit 1
}

function Wait-Until([scriptblock]$Condition, [int]$Seconds, [string]$Failure) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 500
  }
  Fail $Failure
}

if (-not $env:RUNNER_TEMP) { Fail 'RUNNER_TEMP is unavailable.' }

$installers = @(Get-ChildItem -Path 'release' -Filter 'Free-AI-Windows-*.exe' -File -ErrorAction Stop)
if ($installers.Count -ne 1) {
  Fail ("Expected exactly one Windows installer, found " + $installers.Count + '.')
}

$installer = $installers[0]
if ($installer.Length -lt 40MB) {
  Fail ("Installer is unexpectedly small: " + $installer.Length + ' bytes.')
}

$runKey = if ($env:GITHUB_RUN_ID) { $env:GITHUB_RUN_ID } else { [Guid]::NewGuid().ToString('N') }
$installDir = Join-Path $env:RUNNER_TEMP ("freeai-win7-install-" + $runKey)
$userDataDir = Join-Path $env:RUNNER_TEMP ("freeai-win7-userdata-" + $runKey)

if ($installDir -match '\s') {
  Fail ('Smoke-test install path must not contain spaces because NSIS /D must be the final unquoted argument: ' + $installDir)
}

Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $userDataDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Installer: $($installer.FullName)"
Write-Host "Install directory: $installDir"

$install = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
if ($install.ExitCode -ne 0) {
  Fail ("NSIS installer exited with code " + $install.ExitCode + '.')
}

$appExe = Join-Path $installDir 'Free AI.exe'
$appAsar = Join-Path $installDir 'resources\app.asar'

Wait-Until { Test-Path -LiteralPath $appExe -PathType Leaf } 30 'Installed Free AI.exe did not appear.'
if (-not (Test-Path -LiteralPath $appAsar -PathType Leaf)) {
  Fail 'Installed resources\app.asar is missing.'
}

$exeInfo = (Get-Item -LiteralPath $appExe).VersionInfo
Write-Host ("Installed executable: " + $appExe)
Write-Host ("File version: " + [string]$exeInfo.FileVersion)
Write-Host ("Product version: " + [string]$exeInfo.ProductVersion)

New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null

$launchArgs = @("--user-data-dir=$userDataDir", '--disable-gpu')

function Start-FreeAISmokeLaunch([string]$Label) {
  $process = Start-Process -FilePath $appExe -ArgumentList $launchArgs -PassThru
  Start-Sleep -Seconds 8
  $process.Refresh()
  if ($process.HasExited) {
    Fail ($Label + " exited during smoke with code " + $process.ExitCode + '.')
  }

  $actualPath = (Get-Process -Id $process.Id -ErrorAction Stop).Path
  if (-not $actualPath.StartsWith($installDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail ($Label + " did not execute the installed binary. Process path: " + $actualPath)
  }

  Write-Host ($Label + " stayed alive. PID=" + $process.Id)
  & taskkill.exe /PID $process.Id /T /F | Out-Host
  Start-Sleep -Seconds 1
}

Start-FreeAISmokeLaunch 'First launch'

Wait-Until { (Test-Path -LiteralPath $userDataDir -PathType Container) -and ((Get-ChildItem -LiteralPath $userDataDir -Force -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0) } 15 'First launch did not initialize the isolated userData profile.'

Start-FreeAISmokeLaunch 'Second launch with existing profile'

$uninstaller = Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $uninstaller) {
  Fail 'NSIS uninstaller was not installed.'
}

Write-Host ("Uninstaller: " + $uninstaller.FullName)
$uninstallArgs = "/S _?=$installDir"
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList $uninstallArgs -Wait -PassThru
if ($uninstall.ExitCode -ne 0) {
  Fail ("NSIS uninstaller exited with code " + $uninstall.ExitCode + '.')
}

Wait-Until { -not (Test-Path -LiteralPath $appExe -PathType Leaf) } 30 'Free AI.exe remained after silent uninstall.'

Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $userDataDir -Recurse -Force -ErrorAction SilentlyContinue

$summary = @(
  '### Windows 7 installer smoke',
  '',
  '- NSIS silent clean install: PASS',
  '- Installed executable + ASAR: PASS',
  '- First launch process survival: PASS',
  '- Isolated userData profile initialization: PASS',
  '- Second launch / restart with same profile: PASS',
  '- Installed-binary path verification: PASS',
  '- NSIS silent uninstall: PASS'
) -join [Environment]::NewLine

Write-Host $summary
if ($env:GITHUB_STEP_SUMMARY) {
  Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value $summary
}
