#!/usr/bin/env bash
set -euo pipefail

FORM_FACTOR="${1:-phone}"
PACKAGE="com.freeai.mobile"
ACTIVITY="$PACKAGE/.MainActivity"
ACTION="$PACKAGE.FREEAI_RUNTIME_QA"
OUT="artifacts/android-runtime/$FORM_FACTOR"
mkdir -p "$OUT"

APK="$(find runtime-artifacts -type f -name 'free-ai-runtime-qa.apk' -print -quit)"
if [[ -z "$APK" ]]; then
  echo "Runtime QA APK not found."
  find runtime-artifacts -maxdepth 8 -type f -print || true
  exit 1
fi

qa_line() {
  local command="$1"
  adb logcat -c
  adb shell am broadcast -a "$ACTION" -p "$PACKAGE" --es command "$command" >/dev/null
  sleep 1
  adb logcat -d -s FreeAIAndroidQA:I '*:S' | grep "$command:" | tail -n 1 || true
}

audit_until_ready() {
  local line=""
  for _ in $(seq 1 20); do
    line="$(qa_line audit)"
    if [[ "$line" == *"shell=true"* ]]; then
      printf '%s\n' "$line"
      return 0
    fi
    sleep 1
  done
  echo "Android runtime shell never became ready."
  adb logcat -d | tail -n 300 || true
  return 1
}

require_token() {
  local line="$1"
  local token="$2"
  if [[ "$line" != *"$token"* ]]; then
    echo "Expected runtime token '$token' but got:"
    echo "$line"
    exit 1
  fi
}

metric() {
  local line="$1"
  local key="$2"
  printf '%s\n' "$line" | sed -n "s/.*$key=\([0-9][0-9]*\).*/\1/p" | tail -n 1
}

capture() {
  local name="$1"
  adb exec-out screencap -p > "$OUT/$name.png"
  test -s "$OUT/$name.png"
}

adb install -r "$APK" >/dev/null
adb shell am force-stop "$PACKAGE" || true
adb shell am start -W -n "$ACTIVITY" >/dev/null

for _ in $(seq 1 20); do
  if adb shell pidof "$PACKAGE" >/dev/null 2>&1; then break; fi
  sleep 1
done
adb shell pidof "$PACKAGE" >/dev/null

initial="$(audit_until_ready)"
require_token "$initial" "shell=true"
require_token "$initial" "auth=false"
require_token "$initial" "mobileNav=true"
require_token "$initial" "desktopNav=false"
require_token "$initial" "modelPicker=true"
require_token "$initial" "composer=true"
require_token "$initial" "safeTop="
require_token "$initial" "safeBottom="
capture "01-initial"

qa_line openDrawer >/dev/null
sleep 1
drawer="$(qa_line audit)"
require_token "$drawer" "drawer=true"
capture "02-drawer"
adb shell input keyevent 4
sleep 1
after_drawer_back="$(qa_line audit)"
require_token "$after_drawer_back" "drawer=false"
require_token "$after_drawer_back" "shell=true"
adb shell pidof "$PACKAGE" >/dev/null

qa_line openModel >/dev/null
sleep 1
model="$(qa_line audit)"
require_token "$model" "modelOpen=true"
capture "03-model-picker"
adb shell input keyevent 4
sleep 1
after_model_back="$(qa_line audit)"
require_token "$after_model_back" "modelOpen=false"
require_token "$after_model_back" "shell=true"

qa_line openSettings >/dev/null
sleep 1
settings_list="$(qa_line audit)"
require_token "$settings_list" "settingsOpen=true"
require_token "$settings_list" "settingsList=true"
require_token "$settings_list" "settingsDetail=false"
require_token "$settings_list" "settingsSection=General"
capture "04-settings-list"

qa_line openSettingsVoice >/dev/null
sleep 1
settings_detail="$(qa_line audit)"
require_token "$settings_detail" "settingsOpen=true"
require_token "$settings_detail" "settingsList=false"
require_token "$settings_detail" "settingsDetail=true"
require_token "$settings_detail" "settingsSection=Voice"
capture "05-settings-voice"

adb shell input keyevent 4
sleep 1
settings_back_to_list="$(qa_line audit)"
require_token "$settings_back_to_list" "settingsOpen=true"
require_token "$settings_back_to_list" "settingsList=true"
require_token "$settings_back_to_list" "settingsDetail=false"
require_token "$settings_back_to_list" "settingsSection=Voice"

adb shell input keyevent 4
sleep 1
settings_closed="$(qa_line audit)"
require_token "$settings_closed" "settingsOpen=false"
require_token "$settings_closed" "shell=true"

initial_height="$(metric "$initial" height)"

qa_line focusComposer >/dev/null
sleep 2
keyboard="$(qa_line audit)"
native_ime="$(qa_line nativeIme)"
keyboard_offset="$(metric "$keyboard" keyboard)"
keyboard_height="$(metric "$keyboard" height)"
ime_height="$(metric "$native_ime" height)"

if [[ "$native_ime" != *"visible=true"* || -z "$ime_height" || "$ime_height" -le 0 ]]; then
  size="$(adb shell wm size | tr -d '\r' | awk -F': ' '/Physical size|Override size/{v=$2} END{print v}')"
  width="${size%x*}"
  height="${size#*x}"
  if [[ "$width" =~ ^[0-9]+$ && "$height" =~ ^[0-9]+$ ]]; then
    adb shell input tap "$((width/2))" "$((height*86/100))"
    sleep 2
    keyboard="$(qa_line audit)"
    native_ime="$(qa_line nativeIme)"
    keyboard_offset="$(metric "$keyboard" keyboard)"
    keyboard_height="$(metric "$keyboard" height)"
    ime_height="$(metric "$native_ime" height)"
  fi
fi

if [[ "$native_ime" != *"visible=true"* || -z "$ime_height" || "$ime_height" -le 0 ]]; then
  echo "IME did not become visible according to Android WindowInsets."
  echo "$native_ime"
  echo "$keyboard"
  adb shell dumpsys input_method | tail -n 160 || true
  exit 1
fi

viewport_shrink=0
if [[ "$initial_height" =~ ^[0-9]+$ && "$keyboard_height" =~ ^[0-9]+$ && "$initial_height" -gt "$keyboard_height" ]]; then
  viewport_shrink="$((initial_height-keyboard_height))"
fi

keyboard_offset_value="${keyboard_offset:-0}"
if [[ "$keyboard_offset_value" -le 0 && "$viewport_shrink" -le 80 ]]; then
  echo "IME is visible, but neither the WebView viewport nor the keyboard offset adapted enough."
  echo "native_ime=$native_ime"
  echo "initial=$initial"
  echo "keyboard=$keyboard"
  exit 1
fi

capture "06-keyboard"
adb shell input keyevent 4
sleep 1
base="$(qa_line audit)"
w1="$(metric "$base" width)"
h1="$(metric "$base" height)"
if [[ -z "$w1" || -z "$h1" ]]; then
  echo "Could not read initial viewport size: $base"
  exit 1
fi
base_landscape=0
if (( w1 > h1 )); then base_landscape=1; fi

adb shell settings put system accelerometer_rotation 0
rotated_ok=0
for rotation in 1 2 3 0; do
  adb shell settings put system user_rotation "$rotation"
  sleep 3
  rotated="$(qa_line audit)"
  w2="$(metric "$rotated" width)"
  h2="$(metric "$rotated" height)"
  if [[ -z "$w2" || -z "$h2" ]]; then continue; fi
  now_landscape=0
  if (( w2 > h2 )); then now_landscape=1; fi
  if (( now_landscape != base_landscape )); then
    require_token "$rotated" "shell=true"
    require_token "$rotated" "mobileNav=true"
    require_token "$rotated" "desktopNav=false"
    require_token "$rotated" "modelPicker=true"
    capture "07-rotated"
    rotated_ok=1
    break
  fi
done
adb shell settings put system accelerometer_rotation 1
if (( rotated_ok != 1 )); then
  echo "Viewport did not adapt after device rotation."
  exit 1
fi

dictation_report="not-run"
if [[ "$FORM_FACTOR" == "phone" ]]; then
  permission="android.permission.RECORD_AUDIO"
  package_permissions="$(adb shell dumpsys package "$PACKAGE")"
  if ! printf '%s\n' "$package_permissions" | grep -q "$permission"; then
    echo "Android APK does not declare $permission."
    exit 1
  fi

  adb shell pm clear-permission-flags "$PACKAGE" "$permission" user-set user-fixed >/dev/null 2>&1 || true
  adb shell pm grant "$PACKAGE" "$permission"
  adb shell am force-stop "$PACKAGE" || true
  adb shell am start -W -n "$ACTIVITY" >/dev/null
  dictation_ready="$(audit_until_ready)"
  require_token "$dictation_ready" "dictationMic=true"
  require_token "$dictation_ready" "dictationPermission=unknown"

  dictation_start_command="$(qa_line startDictation)"
  require_token "$dictation_start_command" "dictationMic=true"
  adb shell pidof "$PACKAGE" >/dev/null
  native_speech_start="$(adb logcat -d | grep 'Starting recognition |' | tail -n 1 || true)"
  if [[ -z "$native_speech_start" ]]; then
    echo "Native SpeechRecognizer start was not observed after startDictation."
    echo "$dictation_start_command"
    adb shell dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity|mLastPausedActivity' | tail -n 20 || true
    exit 1
  fi
  require_token "$native_speech_start" "partial=true"
  require_token "$native_speech_start" "popup=false"
  require_token "$native_speech_start" "onDevice=false"
  printf '%s\n' "$native_speech_start" > "$OUT/dictation-native-start.txt"

  dictation_started=""
  for _ in $(seq 1 10); do
    dictation_started="$(qa_line audit)"
    if [[ "$dictation_started" == *"dictationStarted=true"* ]]; then break; fi
    if [[ "$dictation_started" == *"dictationError=true"* ]]; then
      echo "Native dictation failed to start with RECORD_AUDIO granted."
      echo "$dictation_started"
      exit 1
    fi
    sleep 1
  done
  require_token "$dictation_started" "dictationMic=true"
  require_token "$dictation_started" "dictationPermission=granted"
  require_token "$dictation_started" "dictationStarted=true"
  require_token "$dictation_started" "dictationLanguage=device"

  qa_line stopDictation >/dev/null
  dictation_stopped=""
  for _ in $(seq 1 10); do
    dictation_stopped="$(qa_line audit)"
    if [[ "$dictation_stopped" == *"dictationStopped=true"* && "$dictation_stopped" == *"dictationFinalized=true"* ]]; then break; fi
    sleep 1
  done
  require_token "$dictation_stopped" "dictationStopped=true"
  require_token "$dictation_stopped" "dictationFinalized=true"
  capture "08-dictation-stopped"

  adb shell pm revoke "$PACKAGE" "$permission" >/dev/null 2>&1 || true
  adb shell pm set-permission-flags "$PACKAGE" "$permission" user-set user-fixed >/dev/null
  adb shell am force-stop "$PACKAGE" || true
  adb shell am start -W -n "$ACTIVITY" >/dev/null
  audit_until_ready >/dev/null

  qa_line startDictation >/dev/null
  dictation_denied=""
  for _ in $(seq 1 10); do
    dictation_denied="$(qa_line audit)"
    if [[ "$dictation_denied" == *"dictationDenied=true"* ]]; then break; fi
    sleep 1
  done
  require_token "$dictation_denied" "dictationPermission=denied"
  require_token "$dictation_denied" "dictationDenied=true"
  require_token "$dictation_denied" "dictationError=true"
  adb shell pidof "$PACKAGE" >/dev/null
  capture "09-dictation-denied"

  adb shell pm clear-permission-flags "$PACKAGE" "$permission" user-set user-fixed >/dev/null 2>&1 || true
  adb shell pm grant "$PACKAGE" "$permission" >/dev/null 2>&1 || true
  dictation_report="started=$dictation_started | stopped=$dictation_stopped | denied=$dictation_denied"
fi

final="$(qa_line audit)"
require_token "$final" "shell=true"
require_token "$final" "auth=false"
adb shell pidof "$PACKAGE" >/dev/null

{
  echo "form_factor=$FORM_FACTOR"
  echo "initial=$initial"
  echo "after_drawer_back=$after_drawer_back"
  echo "after_model_back=$after_model_back"
  echo "settings_list=$settings_list"
  echo "settings_detail=$settings_detail"
  echo "settings_back_to_list=$settings_back_to_list"
  echo "settings_closed=$settings_closed"
  echo "keyboard=$keyboard"
  echo "native_ime=$native_ime"
  echo "viewport_shrink=$viewport_shrink"
  echo "rotated=$rotated"
  echo "dictation=$dictation_report"
  echo "final=$final"
} > "$OUT/runtime-report.txt"

echo "Android runtime QA passed for $FORM_FACTOR."
