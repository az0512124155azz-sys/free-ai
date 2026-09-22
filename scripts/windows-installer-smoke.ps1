$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Error "Windows installer smoke failed: $Message"
  exit 1
}

$installer = Get-ChildItem -Path "release" -Filter "Free-AI-Windows-*.exe" -File |
  Where-Object { $_.Name -notmatch '^Uninstall' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  Fail "No Windows installer was produced in release/."
}

$installDir = Join-Path $env:RUNNER_TEMP "free-ai-windows7-smoke"
if (Test-Path $installDir) {
  Remove-Item -Path $installDir -Recurse -Force
}

Write-Host "Installing $($installer.FullName) into $installDir"
$install = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
if ($install.ExitCode -ne 0) {
  Fail "Installer exited with code $($install.ExitCode)."
}

$appExe = Join-Path $installDir "Free AI.exe"
$asar = Join-Path $installDir "resources\app.asar"

if (-not (Test-Path $appExe)) {
  Fail "Installed app executable is missing: $appExe"
}
if (-not (Test-Path $asar)) {
  Fail "Installed app.asar is missing: $asar"
}

$uninstaller = Get-ChildItem -Path $installDir -Filter "Uninstall*.exe" -File | Select-Object -First 1
if (-not $uninstaller) {
  Fail "Installed uninstaller is missing."
}

Write-Host "Launching installed Free AI for first-launch smoke test"
$env:ELECTRON_ENABLE_LOGGING = '1'
$app = Start-Process -FilePath $appExe -PassThru

Start-Sleep -Seconds 12
$app.Refresh()

if ($app.HasExited) {
  Fail "Installed Free AI exited during first-launch smoke with code $($app.ExitCode)."
}

Write-Host "Installed Free AI stayed alive through first-launch smoke."
& taskkill.exe /PID $app.Id /T /F | Out-Host
Start-Sleep -Seconds 2

Write-Host "Running silent uninstall"
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList @('/S', "_?=$installDir") -Wait -PassThru
if ($uninstall.ExitCode -ne 0) {
  Fail "Uninstaller exited with code $($uninstall.ExitCode)."
}

$deadline = (Get-Date).AddSeconds(30)
while ((Test-Path $appExe) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
}

if (Test-Path $appExe) {
  Fail "Free AI.exe still exists after uninstall."
}

Write-Host "Windows clean-install / first-launch / uninstall smoke passed."
