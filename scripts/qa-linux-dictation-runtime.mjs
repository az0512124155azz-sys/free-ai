import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import WebSocket from 'ws';

const [appimageArg,sampleArg]=process.argv.slice(2);
if(!appimageArg||!sampleArg)throw new Error('Usage: node scripts/qa-linux-dictation-runtime.mjs <AppImage> <speech.wav>');
const appimage=path.resolve(appimageArg);
const sample=path.resolve(sampleArg);

const MODEL_NAME='ggml-base-q5_1.bin';
const MODEL_SIZE=59707625;
const MODEL_SHA256='422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898';
const work=await fsp.mkdtemp(path.join(os.tmpdir(),'free-ai-linux-dictation-qa-'));
const display=':97';
const port=9477;
let xvfb=null,app=null,cdp=null;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fail=message=>{throw new Error('Linux packaged Dictation QA failed: '+message)};
const sha256=async file=>new Promise((resolve,reject)=>{
  const h=crypto.createHash('sha256');
  const input=fs.createReadStream(file);
  input.on('error',reject);
  input.on('data',chunk=>h.update(chunk));
  input.on('end',()=>resolve(h.digest('hex')));
});

class Cdp {
  constructor(url){this.url=url;this.ws=null;this.next=1;this.pending=new Map();this.requests=[]}
  async connect(){
    this.ws=new WebSocket(this.url,{origin:`http://127.0.0.1:${port}`});
    await new Promise((resolve,reject)=>{this.ws.once('open',resolve);this.ws.once('error',reject)});
    this.ws.on('message',raw=>{
      const msg=JSON.parse(String(raw));
      if(msg.id&&this.pending.has(msg.id)){
        const {resolve,reject}=this.pending.get(msg.id);this.pending.delete(msg.id);
        msg.error?reject(new Error(msg.error.message||'CDP error')):resolve(msg.result);
      }else if(msg.method==='Network.requestWillBeSent'){
        this.requests.push(String(msg.params?.request?.url||''));
      }
    });
  }
  call(method,params={}){
    const id=this.next++;
    this.ws.send(JSON.stringify({id,method,params}));
    return new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));
  }
  async eval(expression){
    const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails){
      const detail=result.exceptionDetails?.exception?.description
        ||result.exceptionDetails?.exception?.value
        ||result.exceptionDetails?.text
        ||'Renderer evaluation failed';
      throw new Error(String(detail));
    }
    return result.result?.value;
  }
  close(){try{this.ws?.close()}catch{}}
}

async function waitPage(){
  for(let i=0;i<240;i++){
    try{
      const list=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page=list.find(item=>item.type==='page');
      if(page)return page;
    }catch{}
    await sleep(250);
  }
  fail('Electron DevTools endpoint did not become ready.');
}

async function waitEval(expression,predicate,{timeout=30000,interval=250,label='condition'}={}){
  const start=Date.now();
  let value;
  while(Date.now()-start<timeout){
    value=await cdp.eval(expression);
    if(predicate(value))return value;
    await sleep(interval);
  }
  fail(label+' timed out; last value='+JSON.stringify(value));
}

function fakeSession(){
  const now=Math.floor(Date.now()/1000);
  const base64url=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken=[
    base64url({alg:'HS256',typ:'JWT'}),
    base64url({
      aud:'authenticated',exp:now+86400*3650,iat:now,
      sub:'00000000-0000-4000-8000-000000000001',
      email:'qa@freeai.local',role:'authenticated',
      user_metadata:{name:'Linux Dictation QA'},
      app_metadata:{provider:'email',providers:['email']}
    }),
    'qa'
  ].join('.');
  return {
    access_token:accessToken,token_type:'bearer',expires_in:86400*3650,expires_at:now+86400*3650,
    refresh_token:'qa-refresh',
    user:{
      id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',
      email:'qa@freeai.local',email_confirmed_at:'2026-01-01T00:00:00Z',phone:'',
      confirmed_at:'2026-01-01T00:00:00Z',last_sign_in_at:'2026-09-27T00:00:00Z',
      app_metadata:{provider:'email',providers:['email']},user_metadata:{name:'Linux Dictation QA'},
      identities:[],created_at:'2026-01-01T00:00:00Z',updated_at:'2026-09-27T00:00:00Z'
    }
  };
}

try{
  await fsp.chmod(appimage,0o755);
  execFileSync(appimage,['--appimage-extract'],{cwd:work,stdio:'ignore'});
  const appDir=path.join(work,'squashfs-root');
  const appRun=path.join(appDir,'AppRun');
  const whisper=path.join(appDir,'resources','whisper','whisper-cli');
  if(!fs.existsSync(whisper))fail('packaged resources/whisper/whisper-cli is missing.');
  await fsp.access(whisper,fs.constants.X_OK);

  const version=execFileSync(whisper,['--version'],{encoding:'utf8'}).trim();
  if(!/whisper\.cpp version:\s*1\.9\.4\b/.test(version)||/-dev\b/.test(version))fail('unexpected packaged Whisper version: '+version);
  const ldd=execFileSync('ldd',[whisper],{encoding:'utf8'});
  if(/libgomp\.so/i.test(ldd))fail('packaged Whisper still depends on libgomp.');

  const home=path.join(work,'home');
  const config=path.join(work,'config');
  const cache=path.join(work,'cache');
  const userData=path.join(config,'free-ai');
  const dictation=path.join(userData,'dictation');
  const model=path.join(dictation,MODEL_NAME);
  await fsp.mkdir(dictation,{recursive:true});
  const handle=await fsp.open(model,'w');
  await handle.truncate(MODEL_SIZE);
  await handle.close();

  xvfb=spawn('Xvfb',[display,'-screen','0','1280x900x24','-nolisten','tcp'],{stdio:['ignore','pipe','pipe']});
  await sleep(800);
  if(xvfb.exitCode!==null)fail('Xvfb exited before the app started.');

  app=spawn(appRun,[
    '--no-sandbox','--disable-gpu',
    `--remote-debugging-port=${port}`,'--remote-allow-origins=*',
    '--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${path.resolve(sample)}`
  ],{
    env:{...process.env,APPDIR:appDir,DISPLAY:display,HOME:home,XDG_CONFIG_HOME:config,XDG_CACHE_HOME:cache},
    stdio:['ignore','pipe','pipe']
  });

  const page=await waitPage();
  cdp=new Cdp(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.call('Network.enable');

  const seeded=JSON.stringify(fakeSession());
  await cdp.eval(`localStorage.setItem('sb-xquntkgjlmrxkwkrwsjl-auth-token',${JSON.stringify(seeded)});location.reload();true`);
  await waitEval(
    `JSON.stringify({auth:!!document.querySelector('.authScreen'),mic:!!document.querySelector('.micButton'),title:document.querySelector('.micButton')?.title||'',textarea:!!document.querySelector('textarea')})`,
    value=>{try{const x=JSON.parse(value);return !x.auth&&x.mic&&x.textarea&&x.title==='Dictate locally with Whisper'}catch{return false}},
    {timeout:20000,label:'authenticated Linux composer'}
  );

  const statusProbe=JSON.parse(await cdp.eval(`(async()=>{try{return JSON.stringify({ok:true,value:await window.desktopApi.getLinuxDictationStatus()})}catch(e){return JSON.stringify({ok:false,name:e?.name||'',message:e?.message||String(e),stack:e?.stack||''})}})()`));
  if(!statusProbe.ok)fail('dictation status IPC failed: '+statusProbe.message);
  const statusBefore=statusProbe.value;
  if(!statusBefore.available||!statusBefore.binaryReady)fail('packaged local Whisper backend is unavailable.');
  if(statusBefore.modelReady)fail('corrupt same-size model was incorrectly accepted as ready.');

  const permissions=JSON.parse(await cdp.eval(`(async()=>{const out={};
    try{const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});out.audio={ok:true,a:s.getAudioTracks().length,v:s.getVideoTracks().length};s.getTracks().forEach(t=>t.stop())}catch(e){out.audio={ok:false,name:e.name,message:e.message}}
    try{const s=await navigator.mediaDevices.getUserMedia({video:true,audio:false});out.video={ok:true,a:s.getAudioTracks().length,v:s.getVideoTracks().length};s.getTracks().forEach(t=>t.stop())}catch(e){out.video={ok:false,name:e.name,message:e.message}}
    try{const s=await navigator.mediaDevices.getUserMedia({video:true,audio:true});out.av={ok:true};s.getTracks().forEach(t=>t.stop())}catch(e){out.av={ok:false,name:e.name,message:e.message}}
    return JSON.stringify(out)})()`));
  if(!permissions.audio?.ok||permissions.audio.a!==1||permissions.audio.v!==0)fail('audio-only microphone permission did not succeed.');
  if(permissions.video?.ok||permissions.video?.name!=='NotAllowedError')fail('camera permission was not denied.');
  if(permissions.av?.ok||permissions.av?.name!=='NotAllowedError')fail('combined audio/video permission was not denied.');

  const networkStart=cdp.requests.length;
  await cdp.eval(`document.querySelector('.micButton').click();true`);
  await waitEval(
    `JSON.stringify({title:document.querySelector('.micButton')?.title||'',cls:document.querySelector('.micButton')?.className||'',notice:document.querySelector('.dictationStatus')?.innerText||''})`,
    value=>{try{const x=JSON.parse(value);return x.title==='Stop local dictation'&&/listening/.test(x.cls)&&/Listening locally/.test(x.notice)}catch{return false}},
    {timeout:10000,label:'local recording state'}
  );

  await sleep(6000);
  await cdp.eval(`document.querySelector('.micButton').click();true`);

  const notices=new Set();
  let finalState=null;
  const start=Date.now();
  while(Date.now()-start<180000){
    const raw=await cdp.eval(`JSON.stringify({title:document.querySelector('.micButton')?.title||'',cls:document.querySelector('.micButton')?.className||'',notice:document.querySelector('.dictationStatus')?.innerText||'',error:document.querySelector('.dictationError')?.innerText||'',text:document.querySelector('textarea')?.value||''})`);
    const state=JSON.parse(raw);
    if(state.notice)notices.add(state.notice);
    if(state.error)fail('dictation UI reported: '+state.error);
    if(state.text.trim()){finalState=state;break}
    await sleep(300);
  }
  if(!finalState)fail('local transcription did not populate the composer.');
  if(!/(fellow|americans|country|ask|president)/i.test(finalState.text))fail('unexpected speech transcript: '+finalState.text);
  if(finalState.title!=='Dictate locally with Whisper'||/listening/.test(finalState.cls))fail('microphone UI did not return to idle after transcription.');

  const statusAfter=JSON.parse(await cdp.eval(`JSON.stringify(await window.desktopApi.getLinuxDictationStatus())`));
  if(!statusAfter.modelReady||!statusAfter.localOnly)fail('downloaded model did not become verified/ready.');
  const stat=await fsp.stat(model);
  if(stat.size!==MODEL_SIZE)fail('downloaded model size mismatch.');
  if(await sha256(model)!==MODEL_SHA256)fail('downloaded model SHA256 mismatch.');

  const runtimeRequests=cdp.requests.slice(networkStart);
  const providerLeak=runtimeRequests.find(url=>/api\.openai\.com|anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.groq\.com/i.test(url));
  if(providerLeak)fail('dictation triggered an AI-provider network request: '+providerLeak);

  const leftovers=(await fsp.readdir(os.tmpdir())).filter(name=>name.startsWith('free-ai-dictation-'));
  if(leftovers.length)fail('temporary dictation WAV directory was not cleaned up: '+leftovers.join(','));

  console.log(JSON.stringify({
    ok:true,
    version,
    statusBefore,
    permissions,
    notices:[...notices],
    transcript:finalState.text,
    statusAfter,
    modelSha256:await sha256(model),
    providerRequests:runtimeRequests.filter(url=>/openai|anthropic|generative|mistral|groq/i.test(url))
  },null,2));
}finally{
  cdp?.close();
  try{app?.kill('SIGTERM')}catch{}
  try{xvfb?.kill('SIGTERM')}catch{}
  await sleep(500);
  await fsp.rm(work,{recursive:true,force:true}).catch(()=>{});
}
