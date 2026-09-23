#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.freeai.mobile"
ACTIVITY="$PACKAGE/.MainActivity"
ACTION="$PACKAGE.FREEAI_RUNTIME_QA"
OUT="artifacts/android-auth-runtime"
mkdir -p "$OUT"

APK="$(find runtime-artifacts -type f -name 'free-ai-auth-runtime-qa.apk' -print -quit)"
if [[ -z "$APK" ]]; then
  echo "Android auth runtime QA APK not found."
  find runtime-artifacts -maxdepth 8 -type f -print || true
  exit 1
fi

EMAIL="${ANDROID_AUTH_TEST_EMAIL:-}"
PASSWORD="${ANDROID_AUTH_TEST_PASSWORD:-}"
if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Android auth runtime QA credentials are not configured."
  exit 2
fi

echo "::add-mask::$EMAIL"
echo "::add-mask::$PASSWORD"

qa_line() {
  local command="$1"
  adb logcat -c
  adb shell am broadcast -a "$ACTION" -p "$PACKAGE" --es command "$command" >/dev/null
  sleep 1
  adb logcat -d -s FreeAIAndroidQA:I '*:S' | grep "$command:" | tail -n 1 || true
}

qa_login_line() {
  local password_value="$1"
  adb logcat -c
  {
    printf '%s\n' "$EMAIL"
    printf '%s\n' "$password_value"
  } | adb shell "IFS= read -r qa_email; IFS= read -r qa_password; am broadcast -a '$ACTION' -p '$PACKAGE' --es command authSignInPassword --es email \"\$qa_email\" --es password \"\$qa_password\" >/dev/null"
  sleep 1
  adb logcat -d -s FreeAIAndroidQA:I '*:S' | grep "authSignInPassword:" | tail -n 1 || true
}

require_token() {
  local line="$1"
  local token="$2"
  if [[ "$line" != *"$token"* ]]; then
    echo "Expected auth runtime token '$token' but got:"
    echo "$line"
    exit 1
  fi
}

wait_for_tokens() {
  local command="$1"
  shift
  local line=""
  for _ in $(seq 1 30); do
    line="$(qa_line "$command")"
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
  echo "Timed out waiting for auth runtime state: $*"
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

initial="$(wait_for_tokens authAudit "ready=true" "session=false" "authScreen=true")"
capture "01-signed-out"

qa_login_line "$PASSWORD" >/dev/null
signed_in="$(wait_for_tokens authAudit "status=signInPassword:success" "session=true" "authScreen=false")"
capture "02-signed-in"

qa_line authRefreshSession >/dev/null
refreshed="$(wait_for_tokens authAudit "status=refreshSession:success" "session=true" "authScreen=false")"

adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$ACTIVITY" >/dev/null
cold_start="$(wait_for_tokens authAudit "ready=true" "session=true" "authScreen=false")"
capture "03-cold-start-restored"

adb shell input keyevent 3
sleep 2
adb shell am start -W -n "$ACTIVITY" >/dev/null
resume="$(wait_for_tokens authAudit "ready=true" "session=true" "authScreen=false")"

qa_line authSignOut >/dev/null
signed_out="$(wait_for_tokens authAudit "status=signOut:success" "session=false" "authScreen=true")"
capture "04-signed-out"

bad_password="${PASSWORD}__freeai_invalid__"
qa_login_line "$bad_password" >/dev/null
invalid="$(wait_for_tokens authAudit "status=signInPassword:error" "session=false" "authScreen=true")"

qa_login_line "$PASSWORD" >/dev/null
relogin="$(wait_for_tokens authAudit "status=signInPassword:success" "session=true" "authScreen=false")"

qa_line authSignOut >/dev/null
final="$(wait_for_tokens authAudit "status=signOut:success" "session=false" "authScreen=true")"

{
  echo "initial=$initial"
  echo "signed_in=$signed_in"
  echo "refreshed=$refreshed"
  echo "cold_start=$cold_start"
  echo "resume=$resume"
  echo "signed_out=$signed_out"
  echo "invalid=$invalid"
  echo "relogin=$relogin"
  echo "final=$final"
} > "$OUT/runtime-report.txt"

echo "Android email/session runtime QA passed."
