import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');
const runtime=fs.readFileSync('scripts/android-runtime-qa.sh','utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

function fail(message){
  console.error('Android 3A2 native dictation regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){
  if(!text.includes(marker))fail(message||('Missing marker: '+marker));
}
function ok(value,message){if(!value)fail(message)}

has(source,"import {SpeechRecognition} from '@capgo/capacitor-speech-recognition';",'Android dictation must use the native Capacitor speech plugin.');
has(source,"const nativeLanguage=voiceLanguage==='auto'?undefined:voiceLanguage;",'Device-language mode must omit a forced locale so native speech recognition uses the Android device language.');
has(source,'SpeechRecognition.available()','Native speech availability must be checked before listening.');
has(source,'popup:false','Android native dictation must use inline recognition rather than the system popup.');
ok(!source.includes('const onDevice=await SpeechRecognition.isOnDeviceRecognitionAvailable'),'Android dictation must not automatically opt into the on-device/model-download path; keep the plugin stable default unless a dedicated rollout enables it.');
has(source,'SpeechRecognition.checkPermissions()','Native microphone permission must be checked before listening.');
has(source,'SpeechRecognition.requestPermissions()','Native microphone permission must be requested when needed.');
has(source,"permissionState==='denied'",'Denied microphone permission must have an explicit product state.');
has(source,'Microphone access is denied. Enable microphone permission for Free AI in Android Settings.','Denied permission must show a clear recovery message.');
has(source,"SpeechRecognition.addListener('partialResults'",'Android dictation must stream partial transcripts.');
has(source,"SpeechRecognition.addListener('segmentResults'",'Android dictation must retain native final/segment results.');
has(source,'SpeechRecognition.getLastPartialResult','Android dictation must recover the last native transcript when a session ends or is stopped.');
has(source,"SpeechRecognition.addListener('listeningState'",'Android dictation must track the native listening lifecycle.');
has(source,"SpeechRecognition.addListener('error'",'Android dictation must surface native recognizer errors.');
has(source,"SpeechRecognition.addListener('readyForNextSession'",'Android dictation must finalize and clean up only after native resources are ready.');
has(source,'SpeechRecognition.forceStop','Android dictation Stop must use the native force-stop path with fallback cleanup.');
has(source,'async function finalizeNativeVoice','Android dictation must have deterministic final transcription cleanup.');
has(source,'nativeSpeechHandles.current.splice(0)','Native speech listeners must be removed between sessions.');
has(source,'const startVoiceRef=useRef(null);','The global voice event must use a current ref instead of recreating/removing native listeners on every listening state change.');
has(source,"window.addEventListener('freeai:start-voice',startHandler)",'Stable native dictation start event bridge is missing.');
has(source,"window.addEventListener('freeai:stop-voice',stopHandler)",'Stable native dictation stop event bridge is missing.');
has(source,'role="alert">{dictationError}</div>','Dictation permission/errors must be announced accessibly.');
has(source,"'dictationStarted='+!!readAndroidDictationQaState().started",'Android runtime QA must expose native dictation start evidence.');
has(source,"'dictationDenied='+!!readAndroidDictationQaState().denied",'Android runtime QA must expose denied-permission evidence.');
has(source,"'dictationLanguage='+String(readAndroidDictationQaState().language||'unknown')",'Android runtime QA must expose whether device language was used.');

has(runtime,'android.permission.RECORD_AUDIO','Runtime QA must verify the Android microphone permission exists in the APK.');
has(runtime,'pm grant "$PACKAGE" "$permission"','Runtime QA must exercise native dictation with microphone permission granted.');
has(runtime,'startDictation','Runtime QA must start dictation through the real product microphone path.');
has(runtime,'stopDictation','Runtime QA must stop dictation through the real product path.');
has(runtime,'dictationStarted=true','Runtime QA must prove the native recognizer start promise succeeded.');
has(runtime,"grep 'Starting recognition |'",'Runtime QA must preserve native SpeechRecognizer start evidence.');
has(runtime,'onDevice=false','Runtime QA must prove dictation stayed on the stable native recognizer path.');
has(runtime,'dictationFinalized=true','Runtime QA must prove the stop/finalization path completed.');
has(runtime,'pm revoke "$PACKAGE" "$permission"','Runtime QA must exercise denied microphone permission.');
has(runtime,'user-set user-fixed','Runtime QA must reproduce Android permanent-denial permission flags.');
has(runtime,'dictationDenied=true','Runtime QA must prove denied permission is handled by the app.');
has(runtime,'dictationLanguage=device','Runtime QA must prove auto language delegates to Android device language.');

has(workflow,'bash scripts/android-runtime-qa.sh ${{ matrix.form_factor }}','Android 16 phone/tablet runtime QA must execute the dictation lifecycle checks.');

const speechVersion=String(pkg.devDependencies?.['@capgo/capacitor-speech-recognition']||'');
const capacitorVersion=String(pkg.devDependencies?.['@capacitor/core']||'');
ok(/^\^?8\./.test(speechVersion),'Speech recognition plugin major must match Capacitor 8.');
ok(/^\^?8\./.test(capacitorVersion),'Capacitor core must remain on major 8 for the current speech plugin.');

const pluginManifest='node_modules/@capgo/capacitor-speech-recognition/android/src/main/AndroidManifest.xml';
if(fs.existsSync(pluginManifest)){
  const manifest=fs.readFileSync(pluginManifest,'utf8');
  has(manifest,'android.permission.RECORD_AUDIO','Installed native speech plugin must declare RECORD_AUDIO for Android manifest merge.');
}

console.log('Android 3A2 native dictation regression checks passed.');
