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
  console.error('Linux Dictation regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const localDictation=require('./local-dictation.cjs');",'shared local dictation backend import'],
  ["function trustedMainRenderer(webContents){",'trusted main renderer permission scope'],
  ["if(permission!=='media'||!trustedMainRenderer(webContents))return false;",'default deny for non-media/untrusted permission'],
  ["return mediaTypes.includes('audio')&&!mediaTypes.includes('video');",'audio-only microphone permission'],
  ["ses.setPermissionCheckHandler",'explicit media permission check handler'],
  ["ses.setPermissionRequestHandler",'explicit media permission request handler'],
  ["ipcMain.handle('dictation:localStatus'",'shared dictation status IPC'],
  ["ipcMain.handle('dictation:localTranscribe'",'shared dictation transcription IPC'],
  ["if(process.platform!=='linux'&&process.platform!=='darwin')throw new Error('Local Whisper dictation is currently available on Linux and macOS.');",'Linux/macOS transcription gate'],
  ["if(!trustedMainRenderer(event.sender))throw new Error('Local dictation is only available to the Free AI renderer.');",'transcription caller validation'],
  ["if(process.platform!=='win32')throw new Error('System voice typing is currently available on Windows.');",'Windows system dictation preserved'],
  ["configureMainRendererPermissions();",'renderer permission installation']
]) requireText(main,text,label);

for(const [text,label] of [
  ["getLocalDictationStatus:()=>ipcRenderer.invoke('dictation:localStatus')",'shared status preload bridge'],
  ["transcribeLocalDictation:(payload)=>ipcRenderer.invoke('dictation:localTranscribe',payload)",'shared transcription preload bridge']
]) requireText(preload,text,label);

for(const [text,label] of [
  ["const MODEL_NAME='ggml-base-q5_1.bin';",'multilingual quantized Whisper model'],
  ["const MODEL_SIZE=59707625;",'pinned model size'],
  ["const MODEL_SHA256='422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898';",'pinned model SHA256'],
  ["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/",'official model source'],
  ["const buildFolder=process.platform==='darwin'?'macos-whisper':'linux-whisper';",'platform-local build binary'],
  ["? path.join(process.resourcesPath,'whisper','whisper-cli')",'packaged Whisper binary location'],
  ["await pipeline(Readable.fromWeb(response.body)",'streamed model download'],
  ["if(hash!==MODEL_SHA256)",'model integrity verification'],
  ["const modelReady=await verifiedModel(app);",'status verifies model integrity'],
  ["if(data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')",'PCM WAV validation'],
  ["'--language',languageCode(language)",'language-aware local transcription'],
  ["'--output-json'",'structured Whisper output'],
  ["localOnly:true",'local-only transcription metadata']
]) requireText(backend,text,label);

for(const [text,label] of [
  ["const TAG='v1.9.4';",'pinned whisper.cpp release'],
  ["const supported=process.platform==='linux'||process.platform==='darwin';",'Linux/macOS build support'],
  ["https://github.com/ggml-org/whisper.cpp.git",'official whisper.cpp source'],
  ["'-DBUILD_SHARED_LIBS=OFF'",'self-contained CLI build'],
  ["'-DWHISPER_BUILD_IS_DEV=OFF'",'release-version whisper CLI'],
  ["'-DGGML_OPENMP=OFF'",'portable build without host OpenMP runtime'],
  ["'--target','whisper-cli'",'whisper-cli build target'],
  ["execFileSync(out,['--version']", 'packaged Whisper version smoke'],
  ["execFileSync('ldd',[out]",'Linux packaged Whisper dependency smoke'],
  ["if(/libgomp\\.so/i.test(ldd))",'libgomp portability guard'],
  ["fs.chmodSync(out,0o755)",'executable packaged CLI']
]) requireText(prepare,text,label);

for(const [text,label] of [
  ["const localAudioRef=useRef(null);",'shared local microphone recording state'],
  ["navigator.mediaDevices.getUserMedia",'local microphone capture'],
  ["audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}",'audio-only capture constraints'],
  ["localDownsampleAudio(localFlattenAudio(state.chunks),state.sampleRate,16000)",'16 kHz Whisper audio'],
  ["write(0,'RIFF');",'WAV RIFF encoder'],
  ["write(8,'WAVE');",'WAV format encoder'],
  ["window.desktopApi.transcribeLocalDictation",'local transcription invocation'],
  ["Preparing local Whisper model (~60 MB) for first use…",'first-use model UX'],
  ["desktopPlatform==='linux'||desktopPlatform==='darwin'",'shared desktop local dictation route'],
  ["Dictate locally with Whisper",'Linux microphone UI retained'],
  ["Runs Whisper locally on this computer.",'local privacy settings copy'],
  ["Multilingual Whisper base q5_1.",'Linux model settings'],
  ["Auto-detect keeps multilingual dictation flexible.",'Linux language setting'],
  ["XDG Remote Desktop controls pointer/keyboard access for the active desktop session",'Computer Use settings retained']
]) requireText(renderer,text,label);

if(!renderer.includes("if(desktopPlatform==='linux'||desktopPlatform==='darwin'){\n        try{\n          await startLocalVoice();")){
  fail('Linux desktop dictation no longer routes to local microphone capture before web speech');
}
if(!renderer.includes("if(isNative){\n      const session=Date.now();")){
  fail('Android native dictation path changed unexpectedly');
}
if(!renderer.includes("await window.desktopApi.startSystemDictation();")){
  fail('Windows Voice Typing path changed unexpectedly');
}

for(const [text,label] of [
  ["node scripts/prepare-local-whisper.mjs && npm run validate",'shared Whisper build preparation'],
  ["node --check electron/local-dictation.cjs",'local dictation backend syntax validation'],
  ["node --check scripts/prepare-local-whisper.mjs",'local Whisper preparation syntax validation'],
  ['"from": "build/linux-whisper"','Linux Whisper extraResource'],
  ['"to": "whisper"','packaged Whisper resource destination']
]) requireText(pkg,text,label);

requireText(workflow,"Install Linux Whisper build toolchain",'Linux CI toolchain step');
requireText(workflow,"sudo apt-get update && sudo apt-get install -y cmake build-essential",'Linux CMake compiler setup');

if(!pkg.includes('node scripts/check-linux-dictation.mjs')){
  fail('package validate does not run the Linux Dictation guard');
}

console.log('Linux Dictation regression checks passed.');
