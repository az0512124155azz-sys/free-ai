param(
  [Parameter(Mandatory = $true)]
  [string]$Apk,
  [string]$Serial = "",
  [string]$OutputDir = "artifacts/android-google-real-account"
)

$ErrorActionPreference = "Stop"

$Package = "com.freeai.mobile"
$Activity = "$Package/.MainActivity"
$Action = "$Package.FREEAI_RUNTIME_QA"
$ResolvedApk = (Resolve-Path $Apk).Path

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Invoke-Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $prefix = @()
  if ($Serial) {
    $prefix = @("-s", $Serial)
  }

  $output = & adb @prefix @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ("adb failed: " + ($Arguments -join " ") + [Environment]::NewLine + ($output -join [Environment]::NewLine))
  }

  return $output
}

function Get-AuditLine {
  Invoke-Adb shell am broadcast -a $Action -p $Package --es command authAudit | Out-Null
  Start-Sleep -Milliseconds 700
  $logs = Invoke-Adb logcat -d -s "FreeAIAndroidQA:I" "*:S"
  $line = ($logs | Select-String -Pattern "authAudit:" | Select-Object -Last 1).Line
  return [string]$line
}

function Send-QaCommand {
  param([Parameter(Mandatory = $true)][string]$Command)
  Invoke-Adb shell am broadcast -a $Action -p $Package --es command $Command | Out-Null
}

function Wait-ForAudit {
  param(
    [Parameter(Mandatory = $true)][string[]]$Tokens,
    [int]$MaxAttempts = 180
  )

  $line = ""
  for ($i = 0; $i -lt $MaxAttempts; $i++) {
    $line = Get-AuditLine
    $matched = $true
    foreach ($token in $Tokens) {
      if ($line -notlike "*$token*") {
        $matched = $false
        break
      }
    }

    if ($matched) {
      return $line
    }

    Start-Sleep -Seconds 1
  }

  throw "Timed out waiting for: $($Tokens -join ', '). Last audit: $line"
}

function Get-GoogleFingerprint {
  param([Parameter(Mandatory = $true)][string]$AuditLine)

  $match = [regex]::Match($AuditLine, "googleIdentity=([a-f0-9]{16,24})")
  if (-not $match.Success) {
    throw "Google QA did not expose a non-PII identity fingerprint."
  }

  return $match.Groups[1].Value
}

function Assert-NoBrowserFallback {
  $activities = Invoke-Adb shell dumpsys activity activities
  $top = $activities | Select-String -Pattern "mResumedActivity|topResumedActivity|mLastPausedActivity"
  $text = ($top | ForEach-Object { $_.Line }) -join [Environment]::NewLine

  if ($text -match "com\.android\.chrome|com\.google\.android\.apps\.chrome|org\.chromium\.chrome") {
    throw "Unexpected browser fallback detected during native Google sign-in."
  }
}

function Reset-GoogleQa {
  Send-QaCommand "authResetGoogleQa"
  Wait-ForAudit -Tokens @("status=resetGoogle:success") -MaxAttempts 30 | Out-Null
}

function Start-GoogleAndWaitForRequest {
  Reset-GoogleQa
  Invoke-Adb logcat -c | Out-Null
  Send-QaCommand "authStartGoogle"
  $requested = Wait-ForAudit -Tokens @("status=startGoogle:started", "googleRequested=true") -MaxAttempts 60
  Assert-NoBrowserFallback
  return $requested
}

function Wait-ForGoogleSignIn {
  $line = Wait-ForAudit -Tokens @(
    "googleStatus=signed_in",
    "session=true",
    "authScreen=false",
    "authProvider=google"
  ) -MaxAttempts 180

  Assert-NoBrowserFallback
  return $line
}

function Product-Logout {
  Send-QaCommand "authSignOut"
  Wait-ForAudit -Tokens @(
    "status=signOut:success",
    "session=false",
    "authScreen=true"
  ) -MaxAttempts 60 | Out-Null
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  throw "adb is not available in PATH. Install Android Platform Tools first."
}

Invoke-Adb devices | Out-Null
Invoke-Adb install -r $ResolvedApk | Out-Null
Invoke-Adb shell am force-stop $Package | Out-Null
Invoke-Adb shell am start -W -n $Activity | Out-Null

$initial = Wait-ForAudit -Tokens @("ready=true", "session=false", "authScreen=true") -MaxAttempts 60

Write-Host ""
Write-Host "Real Google Account QA"
Write-Host "----------------------"
Write-Host "Use a test device/emulator that already has AT LEAST TWO real Google accounts added in Android Settings."
Write-Host "Do not enter or store Google passwords in this script, GitHub, or the repository."
Write-Host ""
Read-Host "Press Enter when both accounts are already present on the device"

$requestedA = Start-GoogleAndWaitForRequest
Write-Host ""
Write-Host "On the Android device, choose the FIRST Google account (Account A)."
Write-Host "Complete any Google consent/reauthentication UI shown on the device."
$accountALine = Wait-ForGoogleSignIn
$accountA = Get-GoogleFingerprint -AuditLine $accountALine

Product-Logout

$requestedB = Start-GoogleAndWaitForRequest
Write-Host ""
Write-Host "On the Android device, choose a DIFFERENT Google account (Account B)."
Write-Host "Complete any Google consent/reauthentication UI shown on the device."
$accountBLine = Wait-ForGoogleSignIn
$accountB = Get-GoogleFingerprint -AuditLine $accountBLine

if ($accountA -eq $accountB) {
  throw "Account-switch QA failed: Account B produced the same anonymous fingerprint as Account A."
}

Product-Logout

$requestedCancel = Start-GoogleAndWaitForRequest
Write-Host ""
Write-Host "On the Android device, cancel the Google account picker using Back/Cancel. Do not select an account."
$cancelLine = Wait-ForAudit -Tokens @(
  "googleStatus=cancelled",
  "googleCode=user_cancelled",
  "session=false",
  "authScreen=true"
) -MaxAttempts 180

Assert-NoBrowserFallback

$report = @(
  "initial=$initial",
  "account_a_requested=$requestedA",
  "account_a_result=$accountALine",
  "account_a_fingerprint=$accountA",
  "account_b_requested=$requestedB",
  "account_b_result=$accountBLine",
  "account_b_fingerprint=$accountB",
  "account_switch=true",
  "cancel_requested=$requestedCancel",
  "cancel_result=$cancelLine",
  "cancel=true",
  "browserFallback=false"
)

$reportPath = Join-Path $OutputDir "runtime-report.txt"
$report | Set-Content -Path $reportPath -Encoding ascii

Write-Host ""
Write-Host "Android real-account Google QA passed."
Write-Host "Sanitized report: $reportPath"
