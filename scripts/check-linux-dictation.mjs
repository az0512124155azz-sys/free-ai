import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const main=read('electron/main.cjs');
const preload=read('electron/preload.cjs');
const backend=read('electron/linux-dictation.cjs');
const renderer=read('src/main.jsx');
const prepare=read('scripts/prepare-linux-whisper.mjs');
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
  ["const linuxDictation=require('./linux-dictation.cjs');",'Linux dictation backend import'],
  ["function trustedMainRenderer(webContents){",'trusted main renderer permission scope'],
  ["if(permission!=='media'||!trustedMainRenderer(webContents))return false;",'default deny for non-media/untrusted permission'],
  ["return mediaTypes.includes('audio')&&!mediaTypes.includes('video');",'audio-only microphone permission'],
  ["const ses=session.defaultSession;",'default renderer session permission handler'],
  ["ses.setPermissionCheckHandler",'explicit media permission check handler'],
  ["ses.setPermissionRequestHandler",'explicit media permission request handler'],
  ["ipcMain.handle('dictation:linuxStatus'",'Linux dictation status IPC'],
  ["ipcMain.handle('dictation:linuxTranscribe'",'Linux dictation transcription IPC'],
  ["if(!trustedMainRenderer(event.sender))throw new Error('Linux dictation is only available to the Free AI renderer.');",'transcription caller validation'],
  ["if(process.platform!=='win32')throw new Error('System voice typing is currently available on Windows.');",'Windows system dictation preserved'],
  ["configureMainRendererPermissions();",'renderer permission installation']
]) requireText(main,text,label);

for(const [text,label] of [
  ["getLinuxDictationStatus:()=>ipcRenderer.invoke('dictation:linuxStatus')",'Linux status preload bridge'],
  ["transcribeLinuxDictation:(payload)=>ipcRenderer.invoke('dictation:linuxTranscribe',payload)",'Linux transcription preload bridge']
]) requireText(preload,text,label);

for(const [text,label] of [
  ["const MODEL_NAME='ggml-base-q5_1.bin';",'multilingual quantized Whisper model'],
  ["const MODEL_SIZE=59707625;",'pinned model size'],
  ["const MODEL_SHA256='422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898';",'pinned model SHA256'],
  ["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/",'official model source'],
  ["return app.isPackaged\n    ? path.join(process.resourcesPath,'whisper','whisper-cli')",'packaged Whisper binary location'],
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
  ["https://github.com/ggml-org/whisper.cpp.git",'official whisper.cpp source'],
  ["'-DBUILD_SHARED_LIBS=OFF'",'self-contained Linux CLI build'],
  ["'-DWHISPER_BUILD_IS_DEV=OFF'",'release-version whisper CLI'],
  ["'-DGGML_OPENMP=OFF'",'portable build without host OpenMP runtime'],
  ["'--target','whisper-cli'",'whisper-cli build target'],
  ["execFileSync(out,['--version']", 'packaged Whisper version smoke'],
  ["execFileSync('ldd',[out]",'packaged Whisper dependency smoke'],
  ["if(/libgomp\\.so/i.test(ldd))",'libgomp portability guard'],
  ["fs.chmodSync(out,0o755)",'executable packaged CLI']
]) requireText(prepare,text,label);

for(const [text,label] of [
  ["const linuxAudioRef=useRef(null);",'Linux microphone recording state'],
  ["navigator.mediaDevices.getUserMedia",'Linux microphone capture'],
  ["audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}",'audio-only capture constraints'],
  ["linuxDownsampleAudio(linuxFlattenAudio(state.chunks),state.sampleRate,16000)",'16 kHz Whisper audio'],
  ["write(0,'RIFF');",'WAV RIFF encoder'],
  ["write(8,'WAVE');",'WAV format encoder'],
  ["window.desktopApi.transcribeLinuxDictation",'local transcription invocation'],
  ["Preparing local Whisper model (~60 MB) for first use…",'first-use model UX'],
  ["desktopPlatform==='linux'?(listening?'Stop local dictation':'Dictate locally with Whisper')",'Linux microphone UI'],
  ["Runs Whisper locally on this computer. Recorded audio is transcribed locally and is not sent to an AI provider.",'local privacy settings copy'],
  ["Multilingual Whisper base q5_1.",'Linux model settings'],
  ["desktopPlatform==='linux'?'Language hint for local Whisper transcription.",'Linux language setting'],
  ["XDG Remote Desktop controls pointer/keyboard access for the active desktop session",'Computer Use settings retained']
]) requireText(renderer,text,label);

if(!renderer.includes("if(desktopPlatform==='linux'){\n        try{\n          await startLinuxVoice();")){
  fail('Linux desktop dictation does not route to local microphone capture before web speech');
}
if(!renderer.includes("if(isNative){\n      const session=Date.now();")){
  fail('Android native dictation path changed unexpectedly');
}
if(!renderer.includes("await window.desktopApi.startSystemDictation();")){
  fail('Windows Voice Typing path changed unexpectedly');
}

for(const [text,label] of [
  ["node scripts/prepare-linux-whisper.mjs && npm run validate",'Linux Whisper build preparation'],
  ["node --check electron/linux-dictation.cjs",'Linux dictation backend syntax validation'],
  ["node --check scripts/prepare-linux-whisper.mjs",'Whisper preparation syntax validation'],
  ['"from": "build/linux-whisper"','Linux Whisper extraResource'],
  ['"to": "whisper"','packaged Whisper resource destination']
]) requireText(pkg,text,label);

requireText(workflow,"Install Linux Whisper build toolchain",'Linux CI toolchain step');
requireText(workflow,"sudo apt-get update && sudo apt-get install -y cmake build-essential",'Linux CMake compiler setup');

if(!pkg.includes('node scripts/check-linux-dictation.mjs')){
  fail('package validate does not run the Linux Dictation guard');
}

console.log('Linux Dictation regression checks passed.');
