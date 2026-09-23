import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const bridge=fs.readFileSync('scripts/configure-android-runtime-qa.mjs','utf8');
const smoke=fs.readFileSync('scripts/android-runtime-qa.sh','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

function fail(message){
  console.error('Android 1C runtime QA regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){if(!text.includes(marker))fail(message||('Missing marker: '+marker));}
function ok(value,message){if(!value)fail(message);}

has(source,"window.__FREEAI_ANDROID_QA__=(command='audit')=>",'Android runtime QA hook is missing.');
has(source,"'shell='+(!!shell&&shell.classList.contains('nativeMobileShell'))",'Runtime audit must verify the native mobile shell.');
has(source,"'modelPicker='+visible(document.querySelector('.mobileConversationPicker'))",'Runtime audit must verify the mobile model picker.');
has(source,"'keyboard='+Math.round(parseFloat(rootStyle.getPropertyValue('--keyboard-offset'))||0)",'Runtime audit must expose IME offset.');
has(source,"if(command==='openDrawer')",'Runtime QA must exercise the drawer.');
has(source,"if(command==='openModel')",'Runtime QA must exercise the model picker.');
has(source,"if(command==='focusComposer')",'Runtime QA must exercise the composer/IME.');

has(bridge,'com.freeai.mobile.FREEAI_RUNTIME_QA','Debug runtime broadcast action is missing.');
has(bridge,'if (!BuildConfig.DEBUG) return;','Runtime QA bridge must stay debug-only.');
has(bridge,'Context.RECEIVER_EXPORTED','ADB runtime QA receiver must be callable on modern Android.');
has(bridge,'window.__FREEAI_ANDROID_QA__','Native QA bridge must invoke the renderer audit hook.');
has(bridge,'InputMethodManager.SHOW_IMPLICIT','Runtime QA must explicitly exercise the soft keyboard.');

has(smoke,'adb install -r "$APK"','Runtime QA must install the generated APK.');
has(smoke,'require_token "$initial" "shell=true"','Runtime QA must prove the Android shell rendered.');
has(smoke,'require_token "$initial" "desktopNav=false"','Runtime QA must reject desktop navigation on Android.');
has(smoke,'require_token "$drawer" "drawer=true"','Runtime QA must open the drawer.');
has(smoke,'adb shell input keyevent 4','Runtime QA must exercise Android back.');
has(smoke,'require_token "$model" "modelOpen=true"','Runtime QA must open the model picker.');
has(smoke,'keyboard_offset','Runtime QA must validate IME viewport movement.');
has(smoke,'user_rotation','Runtime QA must exercise runtime rotation.');
has(smoke,'adb exec-out screencap -p','Runtime QA must capture emulator evidence.');

has(workflow,'android_runtime:','CI must include Android runtime jobs.');
has(workflow,'api-level: 36','Runtime QA must execute on Android 16.');
has(workflow,'profile: pixel_7_pro','Runtime QA must cover a phone profile.');
has(workflow,'profile: pixel_tablet','Runtime QA must cover a large-screen tablet profile.');
has(workflow,'reactivecircus/android-emulator-runner@v2','CI must boot real Android emulators.');
has(workflow,'free-ai-runtime-qa.apk','CI must preserve a dedicated auth-independent runtime QA APK.');
has(workflow,'needs: [desktop, windows_visual, android, android_runtime, extension]','Release publishing must depend on runtime Android QA.');

ok(pkg?.scripts?.['android:configure-runtime-qa']==='node scripts/configure-android-runtime-qa.mjs','Android runtime QA bridge script is not wired.');
ok(String(pkg?.scripts?.validate||'').includes('check-android1-runtime-qa.mjs'),'Android 1C regression check is not part of validation.');

console.log('Android 1C runtime/device QA regression checks passed.');
