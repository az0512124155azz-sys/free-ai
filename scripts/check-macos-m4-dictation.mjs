import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const main=read('electron/main.cjs');
const preload=read('electron/preload.cjs');
const backend=read('electron/local-dictation.cjs');
const renderer=read('src/main.jsx');
const prepare=read('scripts/prepare-local-whisper.mjs');
const workflow=read('.github/workflows/build.yml');
const pkg=read('package.json');

function fail(message){
  console.error('macOS M4 Dictation regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const localDictation=require('./local-dictation.cjs');",'shared local dictation backend import'],
  ["return mediaTypes.includes('audio')&&!mediaTypes.includes('video');",'audio-only trusted renderer permission'],
  ["ipcMain.handle('dictation:requestMicrophone'",'macOS microphone permission IPC'],
  ["systemPreferences.askForMediaAccess('microphone')",'macOS microphone system prompt'],
  ["systemPreferences.getMediaAccessStatus('microphone')",'macOS microphone status'],
  ["ipcMain.handle('dictation:localStatus'",'local dictation status IPC'],
  ["ipcMain.handle('dictation:localTranscribe'",'local dictation transcription IPC'],
  ["if(process.platform!=='linux'&&process.platform!=='darwin')throw new Error('Local Whisper dictation is currently available on Linux and macOS.');",'macOS transcription platform gate'],
  ["if(!trustedMainRenderer(event.sender))throw new Error('Local dictation is only available to the Free AI renderer.');",'trusted renderer transcription scope'],
  ["if(process.platform!=='win32')throw new Error('System voice typing is currently available on Windows.');",'Windows Voice Typing preserved']
]) requireText(main,text,label);

for(const [text,label] of [
  ["requestDictationMicrophoneAccess:()=>ipcRenderer.invoke('dictation:requestMicrophone')",'microphone permission preload bridge'],
  ["getLocalDictationStatus:()=>ipcRenderer.invoke('dictation:localStatus')",'local status preload bridge'],
  ["transcribeLocalDictation:(payload)=>ipcRenderer.invoke('dictation:localTranscribe',payload)",'local transcription preload bridge']
]) requireText(preload,text,label);

for(const [text,label] of [
  ["const MODEL_NAME='ggml-base-q5_1.bin';",'multilingual quantized Whisper model'],
  ["const MODEL_SIZE=59707625;",'pinned model size'],
  ["const MODEL_SHA256='422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898';",'pinned model SHA256'],
  ["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/",'official model source'],
  ["const buildFolder=process.platform==='darwin'?'macos-whisper':'linux-whisper';",'macOS development binary path'],
  ["? path.join(process.resourcesPath,'whisper','whisper-cli')",'packaged Whisper binary path'],
  ["available:(process.platform==='linux'||process.platform==='darwin')&&fs.existsSync(binary)",'macOS local dictation availability'],
  ["if(process.platform!=='linux'&&process.platform!=='darwin')throw new Error('Local Whisper dictation is currently enabled on Linux and macOS.');",'backend macOS platform gate'],
  ["if(hash!==MODEL_SHA256)",'model integrity verification'],
  ["await fsp.rename(tempPath,finalPath)",'atomic verified model install'],
  ["localOnly:true",'local-only transcription metadata'],
  ["await fsp.rm(tempRoot,{recursive:true,force:true})",'temporary audio cleanup']
]) requireText(backend,text,label);

for(const [text,label] of [
  ["const TAG='v1.9.4';",'pinned whisper.cpp release'],
  ["const supported=process.platform==='linux'||process.platform==='darwin';",'Linux/macOS build support'],
  ["const buildFolder=process.platform==='darwin'?'macos-whisper':'linux-whisper';",'macOS build output'],
  ["https://github.com/ggml-org/whisper.cpp.git",'official whisper.cpp source'],
  ["'-DBUILD_SHARED_LIBS=OFF'",'self-contained Whisper build'],
  ["'-DWHISPER_BUILD_IS_DEV=OFF'",'release Whisper version'],
  ["'-DGGML_OPENMP=OFF'",'no host OpenMP runtime'],
  ["if(process.platform==='darwin')configure.push('-DGGML_METAL=ON');",'Apple Metal acceleration'],
  ["execFileSync(out,['--version']", 'Whisper version smoke'],
  ["execFileSync('otool',['-L',out]",'macOS dynamic dependency smoke'],
  ["if(!/Mach-O/.test(fileInfo))",'macOS executable format smoke']
]) requireText(prepare,text,label);

for(const [text,label] of [
  ["const localAudioRef=useRef(null);",'shared local microphone state'],
  ["navigator.mediaDevices.getUserMedia",'desktop microphone capture'],
  ["audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}",'audio-only capture constraints'],
  ["localDownsampleAudio(localFlattenAudio(state.chunks),state.sampleRate,16000)",'16 kHz Whisper audio'],
  ["window.desktopApi.requestDictationMicrophoneAccess?.()",'macOS microphone permission request'],
  ["window.desktopApi.transcribeLocalDictation",'local Whisper transcription call'],
  ["desktopPlatform==='linux'||desktopPlatform==='darwin'",'macOS local dictation route'],
  ["Dictate locally with Whisper",'macOS microphone UI'],
  ["Recorded audio is transcribed locally and is not sent to Apple or an AI provider.",'macOS local privacy settings copy'],
  ["System Settings → Privacy & Security → Microphone",'macOS microphone recovery guidance'],
  ["Multilingual Whisper base q5_1.",'model settings'],
  ["Auto-detect keeps multilingual dictation flexible.",'language hint settings']
]) requireText(renderer,text,label);

for(const [text,label] of [
  ["node scripts/prepare-local-whisper.mjs && npm run validate",'shared Whisper build preparation'],
  ["node --check electron/local-dictation.cjs",'local dictation backend syntax validation'],
  ["node --check scripts/prepare-local-whisper.mjs",'local Whisper preparation syntax validation'],
  ['"from": "build/macos-whisper"','macOS packaged Whisper resource'],
  ['"NSMicrophoneUsageDescription"','macOS microphone Info.plist usage description'],
  ['"from": "build/linux-whisper"','Linux Whisper resource retained']
]) requireText(pkg,text,label);

for(const [text,label] of [
  ["name: macOS packaged dictation smoke",'packaged macOS dictation QA step'],
  ["hdiutil attach", 'DMG mount smoke'],
  ["Contents/Resources/whisper/whisper-cli",'packaged Whisper binary verification'],
  ["PlistBuddy", 'Info.plist microphone verification']
]) requireText(workflow,text,label);

if(/SFSpeechRecognizer|NSSpeechRecognitionUsageDescription/.test(main+backend+renderer+pkg)){
  fail('Apple cloud Speech recognition was introduced; M4 must keep desktop dictation local-only');
}
if(!pkg.includes('node scripts/check-macos-m4-dictation.mjs')){
  fail('package validate does not run the macOS M4 Dictation guard');
}

console.log('macOS M4 Dictation regression checks passed.');
