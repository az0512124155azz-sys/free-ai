#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.freeai.mobile"
ACTIVITY="$PACKAGE/.MainActivity"
ACTION="$PACKAGE.FREEAI_RUNTIME_QA"
OUT="artifacts/android-a1"
mkdir -p "$OUT"
REPORT="$OUT/results.tsv"
printf 'status\tcheck\tdetail\n' > "$REPORT"

APK="$(find runtime-artifacts -type f -name 'free-ai-runtime-qa.apk' -print -quit)"
if [[ -z "$APK" ]]; then
  echo "Runtime QA APK not found."
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
  for _ in $(seq 1 25); do
    line="$(qa_line audit)"
    if [[ "$line" == *"shell=true"* && "$line" == *"auth=false"* ]]; then
      printf '%s\n' "$line"
      return 0
    fi
    sleep 1
  done
  return 1
}

capture() {
  local name="$1"
  adb exec-out screencap -p > "$OUT/$name.png"
  test -s "$OUT/$name.png"
}

pass() { printf 'PASS\t%s\t%s\n' "$1" "$2" >> "$REPORT"; }
fail() { printf 'FAIL\t%s\t%s\n' "$1" "$2" >> "$REPORT"; }
require_token() {
  local check="$1" line="$2" token="$3"
  if [[ "$line" == *"$token"* ]]; then pass "$check" "$token"; else fail "$check" "missing $token | $line"; fi
}

adb install -r "$APK" >/dev/null
adb shell am force-stop "$PACKAGE" || true
adb shell am start -W -n "$ACTIVITY" >/dev/null

if ! ready="$(audit_until_ready)"; then
  fail "Main shell" "shell did not become ready"
  capture "01-main-timeout" || true
  cat "$REPORT"
  exit 1
fi
sleep 2
capture "01-main"
require_token "Main shell" "$ready" "shell=true"
require_token "Mobile navigation" "$ready" "mobileNav=true"
require_token "Composer" "$ready" "composer=true"
require_token "Chat mode initial" "$ready" "modeLabel=Free AI · Chat"

qa_line openAdd >/dev/null
add_chat="$(qa_line audit)"
capture "02-plus-chat"
require_token "Chat Add opens" "$add_chat" "plusOpen=true"
require_token "Chat Add Camera" "$add_chat" "Camera"
require_token "Chat Add Photos" "$add_chat" "Photos"
require_token "Chat Add Files" "$add_chat" "Files"
require_token "Chat Add Manage plugins" "$add_chat" "Manage plugins"
if [[ "$add_chat" == *"Computer"* ]]; then fail "Chat Add excludes Computer" "$add_chat"; else pass "Chat Add excludes Computer" "no Computer item"; fi
adb shell input keyevent 4
sleep 1

qa_line openModeMenu >/dev/null
mode_menu="$(qa_line audit)"
capture "03-mode-menu"
require_token "Mode menu opens" "$mode_menu" "modeMenu=true"

qa_line selectWork >/dev/null
work="$(qa_line audit)"
capture "04-work"
require_token "Work mode selected" "$work" "modeLabel=Free AI · Work"

qa_line openAdd >/dev/null
add_work="$(qa_line audit)"
capture "05-plus-work"
require_token "Work Add opens" "$add_work" "plusOpen=true"
require_token "Work Add Camera" "$add_work" "Camera"
require_token "Work Add Photos" "$add_work" "Photos"
require_token "Work Add Files" "$add_work" "Files"
if [[ "$add_work" == *"Files"* && "$add_work" == *"Attach files"* ]]; then
  fail "Work Add duplicate file actions" "Files and Attach files are both present | $add_work"
else
  pass "Work Add duplicate file actions" "no duplicate file action"
fi
adb shell input keyevent 4
sleep 1

qa_line openModeMenu >/dev/null
qa_line selectChat >/dev/null
chat_again="$(qa_line audit)"
require_token "Return to Chat" "$chat_again" "modeLabel=Free AI · Chat"

qa_line openDrawer >/dev/null
drawer="$(qa_line audit)"
capture "06-drawer"
require_token "Drawer opens" "$drawer" "drawer=true"
require_token "Drawer Remote shortcut" "$drawer" "remoteQuick=true"
require_token "Drawer Apps shortcut" "$drawer" "appsQuick=true"
require_token "Drawer Explore shortcut" "$drawer" "exploreQuick=true"

qa_line openProfile >/dev/null
profile="$(qa_line audit)"
capture "07-profile-menu"
require_token "Profile menu opens" "$profile" "profileOpen=true"
adb shell input keyevent 4
sleep 1
profile_closed="$(qa_line audit)"
require_token "Profile menu closes with Back" "$profile_closed" "profileOpen=false"

qa_line openAppsQuick >/dev/null
apps="$(qa_line audit)"
capture "08-apps-quick"
require_token "Apps shortcut opens Apps" "$apps" "appsPage=true"
adb shell input keyevent 4
sleep 1

qa_line openDrawer >/dev/null
qa_line openExploreQuick >/dev/null
explore="$(qa_line audit)"
capture "09-explore-quick"
require_token "Explore shortcut opens Explore" "$explore" "explorePage=true"
adb shell input keyevent 4
sleep 1

qa_line openDrawer >/dev/null
qa_line openRemoteQuick >/dev/null
remote="$(qa_line audit)"
capture "10-remote-mode"
require_token "Remote shortcut closes drawer" "$remote" "drawer=false"
require_token "Remote shortcut enters Remote" "$remote" "modeLabel=Remote"

qa_line openDrawer >/dev/null
drawer_remote="$(qa_line audit)"
capture "11-remote-drawer"
require_token "Remote drawer opens" "$drawer_remote" "drawer=true"

# Report actual failures, but always leave artifacts behind.
cat "$REPORT"
if grep -q '^FAIL' "$REPORT"; then
  exit 1
fi

echo "Android A1 UI audit passed."
