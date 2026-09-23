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

capture_access_token() {
  qa_line authCaptureAccessToken >/dev/null
  wait_for_tokens authAudit "status=captureAccessToken:success" "session=true" "authScreen=false" >/dev/null

  local token_line
  adb logcat -c
  adb shell am broadcast -a "$ACTION" -p "$PACKAGE" --es command authReadAccessToken >/dev/null
  sleep 1
  token_line="$(adb logcat -d -s FreeAIAndroidQA:I '*:S' | grep "authReadAccessToken:" | tail -n 1 || true)"
  QA_ACCESS_TOKEN="$(printf '%s' "$token_line" | sed -n 's/.*accessToken=\([A-Za-z0-9._-]*\).*/\1/p')"
  adb logcat -c

  if [[ -z "$QA_ACCESS_TOKEN" || "$QA_ACCESS_TOKEN" != *.*.* ]]; then
    echo "Android auth runtime QA could not capture a valid access token."
    exit 1
  fi

  echo "::add-mask::$QA_ACCESS_TOKEN"
}

revoke_remote_session() {
  local oidc_response="$RUNNER_TEMP/free-ai-revoke-oidc.json"
  local oidc_token_file="$RUNNER_TEMP/free-ai-revoke-oidc-token"
  local access_token_file="$RUNNER_TEMP/free-ai-revoke-access-token"
  local revoke_body="$RUNNER_TEMP/free-ai-revoke-body.json"
  local revoke_response="$RUNNER_TEMP/free-ai-revoke-response.json"

  if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
    echo "GitHub OIDC request environment is unavailable to revoked-session QA."
    exit 1
  fi

  curl --silent --show-error --fail \
    --header "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=free-ai-android-auth-qa" \
    --output "$oidc_response"

  node - "$oidc_response" "$oidc_token_file" <<'NODE'
const fs = require('node:fs');
const [responsePath, tokenPath] = process.argv.slice(2);
const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
if (!response.value || typeof response.value !== 'string') {
  console.error('GitHub OIDC token response did not contain a token.');
  process.exit(1);
}
fs.writeFileSync(tokenPath, response.value, { mode: 0o600 });
NODE

  printf '%s' "$QA_ACCESS_TOKEN" > "$access_token_file"
  chmod 600 "$access_token_file"
  node - "$access_token_file" "$revoke_body" <<'NODE'
const fs = require('node:fs');
const [tokenPath, bodyPath] = process.argv.slice(2);
const accessToken = fs.readFileSync(tokenPath, 'utf8');
fs.writeFileSync(bodyPath, JSON.stringify({ access_token: accessToken }), { mode: 0o600 });
NODE

  local http_code
  http_code="$(curl --silent --show-error \
    --output "$revoke_response" \
    --write-out '%{http_code}' \
    --request POST \
    --header "Authorization: Bearer $(cat "$oidc_token_file")" \
    --header "Content-Type: application/json" \
    --data-binary "@$revoke_body" \
    "https://xquntkgjlmrxkwkrwsjl.supabase.co/functions/v1/free-ai-ci-auth-revoke")"

  rm -f "$oidc_response" "$oidc_token_file" "$access_token_file" "$revoke_body"
  QA_ACCESS_TOKEN=""

  if [[ "$http_code" != "200" ]]; then
    echo "Supabase revoked-session QA endpoint returned HTTP $http_code."
    cat "$revoke_response"
    rm -f "$revoke_response"
    exit 1
  fi

  node - "$revoke_response" <<'NODE'
const fs = require('node:fs');
const response = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (response.ok !== true) {
  console.error('Supabase revoked-session QA endpoint did not confirm revocation.');
  process.exit(1);
}
NODE
  rm -f "$revoke_response"
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

QA_ACCESS_TOKEN=""
capture_access_token
revoke_remote_session

qa_line authRefreshSession >/dev/null
revoked="$(wait_for_tokens authAudit "status=refreshSession:error" "session=false" "authScreen=true")"
if [[ "$revoked" != *"code=refresh_token_not_found"* && "$revoked" != *"code=refresh_token_already_used"* && "$revoked" != *"code=session_not_found"* && "$revoked" != *"code=session_expired"* ]]; then
  echo "Expected a terminal revoked-session refresh error but got:"
  echo "$revoked"
  exit 1
fi
capture "05-revoked-session-recovered"

qa_login_line "$PASSWORD" >/dev/null
post_revoke_relogin="$(wait_for_tokens authAudit "status=signInPassword:success" "session=true" "authScreen=false")"

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
  echo "revoked=$revoked"
  echo "post_revoke_relogin=$post_revoke_relogin"
  echo "final=$final"
} > "$OUT/runtime-report.txt"

echo "Android email/session and revoked-session runtime QA passed."
