#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.freeai.mobile"
ACTIVITY="$PACKAGE/.MainActivity"
ACTION="$PACKAGE.FREEAI_RUNTIME_QA"
OUT="artifacts/android-google-runtime"
mkdir -p "$OUT"

APK="$(find runtime-artifacts -type f -name 'free-ai-auth-runtime-qa.apk' -print -quit)"
if [[ -z "$APK" ]]; then
  echo "Android auth runtime QA APK not found."
  find runtime-artifacts -maxdepth 8 -type f -print || true
  exit 1
fi

audit_line() {
  adb shell am broadcast -a "$ACTION" -p "$PACKAGE" --es command authAudit >/dev/null
  sleep 1
  adb logcat -d -s FreeAIAndroidQA:I '*:S' | grep "authAudit:" | tail -n 1 || true
}

wait_for_tokens() {
  local line=""
  for _ in $(seq 1 30); do
    line="$(audit_line)"
    local ok=1
    for token in "$@"; do
      if [[ "$line" != *"$token"* ]]; then ok=0; break; fi
    done
    if (( ok == 1 )); then
      printf '%s\n' "$line"
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for Google runtime state: $*"
  echo "last=$line"
  adb logcat -d | tail -n 250 || true
  return 1
}

capture() {
  local name="$1"
  adb exec-out screencap -p > "$OUT/$name.png"
  test -s "$OUT/$name.png"
}

adb install -r "$APK" >/dev/null
adb shell am force-stop "$PACKAGE" || true
adb shell am start -W -n "$ACTIVITY" >/dev/null

initial="$(wait_for_tokens "ready=true" "session=false" "authScreen=true")"
capture "01-google-signed-out"

adb logcat -c
adb shell am broadcast -a "$ACTION" -p "$PACKAGE" --es command authStartGoogle >/dev/null

requested="$(wait_for_tokens "status=startGoogle:started" "googleRequested=true")"
capture "02-google-native-requested"

adb shell dumpsys activity activities \
  | grep -E 'mResumedActivity|topResumedActivity|mLastPausedActivity|Hist #' \
  | head -n 60 > "$OUT/top-activities.txt" || true

if grep -Eqi 'com\.android\.chrome|com\.google\.android\.apps\.chrome|org\.chromium\.chrome' "$OUT/top-activities.txt"; then
  echo "Google runtime QA unexpectedly opened a browser instead of native Credential Manager."
  cat "$OUT/top-activities.txt"
  exit 1
fi

# The CI emulator intentionally has no pre-provisioned personal Google account.
# If Credential Manager is displaying native UI, Back must be treated as a benign cancellation.
# If the provider immediately reports no credentials, that is also an expected accountless-device outcome.
adb shell input keyevent 4 || true

outcome=""
for _ in $(seq 1 30); do
  line="$(audit_line)"
  if [[ "$line" == *"googleStatus=cancelled"* && "$line" == *"googleCode=user_cancelled"* ]]; then
    outcome="$line"
    break
  fi
  if [[ "$line" == *"googleStatus=error"* && "$line" == *"googleCode=no_credential"* ]]; then
    outcome="$line"
    break
  fi
  if [[ "$line" == *"googleStatus=error"* && "$line" == *"googleCode=account_reauth_failed"* ]]; then
    outcome="$line"
    break
  fi
  if [[ "$line" == *"googleStatus=error"* && "$line" == *"googleCode=google_config"* ]]; then
    echo "Google Credential Manager reached a configuration error."
    echo "$line"
    exit 1
  fi
  sleep 1
done

if [[ -z "$outcome" ]]; then
  echo "Google Credential Manager did not reach a recognized non-authenticated outcome."
  echo "last=$(audit_line)"
  adb logcat -d | tail -n 250 || true
  exit 1
fi

if [[ "$outcome" != *"googleRequested=true"* || "$outcome" != *"session=false"* || "$outcome" != *"authScreen=true"* ]]; then
  echo "Google runtime outcome left stale authenticated UI."
  echo "$outcome"
  exit 1
fi

capture "03-google-returned-to-auth"

{
  echo "initial=$initial"
  echo "requested=$requested"
  echo "outcome=$outcome"
  echo "browserFallback=false"
} > "$OUT/runtime-report.txt"

echo "Android Google Credential Manager launch/cancel infrastructure QA passed."
