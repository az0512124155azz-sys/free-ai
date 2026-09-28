'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');

const MODEL_NAME='ggml-base-q5_1.bin';
const MODEL_LABEL='Whisper base q5_1';
const MODEL_SIZE=59707625;
const MODEL_SHA256='422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898';
const MODEL_URL='https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'+MODEL_NAME+'?download=true';
const MAX_WAV_BYTES=16*1024*1024;
let modelPromise=null;
let modelVerificationCache={key:'',ready:false};

function rootFor(app){
  return path.join(app.getPath('userData'),'dictation');
}

function modelPath(app){
  return path.join(rootFor(app),MODEL_NAME);
}

function whisperBinary(app){
  const buildFolder=process.platform==='darwin'?'macos-whisper':'linux-whisper';
  return app.isPackaged
    ? path.join(process.resourcesPath,'whisper','whisper-cli')
    : path.join(app.getAppPath(),'build',buildFolder,'whisper-cli');
}

async function fileSha256(file){
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash('sha256');
    const input=fs.createReadStream(file);
    input.on('error',reject);
    input.on('data',chunk=>hash.update(chunk));
    input.on('end',()=>resolve(hash.digest('hex')));
  });
}

async function verifiedModel(app){
  const file=modelPath(app);
  try{
    const stat=await fsp.stat(file);
    const key=String(stat.size)+':'+String(Math.trunc(stat.mtimeMs));
    if(modelVerificationCache.key===key)return modelVerificationCache.ready;
    if(stat.size!==MODEL_SIZE){
      modelVerificationCache={key,ready:false};
      return false;
    }
    const ready=(await fileSha256(file))===MODEL_SHA256;
    modelVerificationCache={key,ready};
    return ready;
  }catch{
    modelVerificationCache={key:'',ready:false};
    return false;
  }
}

async function ensureModel(app){
  if(await verifiedModel(app))return {path:modelPath(app),downloaded:false};
  if(modelPromise)return modelPromise;
  modelPromise=(async()=>{
    const root=rootFor(app);
    const finalPath=modelPath(app);
    const tempPath=finalPath+'.download-'+process.pid;
    await fsp.mkdir(root,{recursive:true});
    await fsp.rm(tempPath,{force:true});
    let response;
    try{
      response=await fetch(MODEL_URL,{redirect:'follow'});
    }catch(error){
      throw new Error('Could not download the local Whisper model. Check your internet connection and try again. '+String(error?.message||error));
    }
    if(!response.ok||!response.body){
      throw new Error('Could not download the local Whisper model (HTTP '+response.status+').');
    }
    try{
      await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(tempPath,{flags:'wx'}));
      const stat=await fsp.stat(tempPath);
      if(stat.size!==MODEL_SIZE){
        throw new Error('Downloaded Whisper model has an unexpected size.');
      }
      const hash=await fileSha256(tempPath);
      if(hash!==MODEL_SHA256){
        throw new Error('Downloaded Whisper model failed integrity verification.');
      }
      await fsp.rename(tempPath,finalPath);
      return {path:finalPath,downloaded:true};
    }finally{
      await fsp.rm(tempPath,{force:true}).catch(()=>{});
    }
  })().finally(()=>{modelPromise=null});
  return modelPromise;
}

function languageCode(value){
  const raw=String(value||'auto').trim().toLowerCase();
  if(!raw||raw==='auto'||raw==='device')return 'auto';
  const primary=raw.split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(primary)?primary:'auto';
}

function validateWav(data){
  if(!Buffer.isBuffer(data))throw new Error('Local dictation audio payload is invalid.');
  if(data.length<44||data.length>MAX_WAV_BYTES)throw new Error('Local dictation audio is empty or too long.');
  if(data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE'){
    throw new Error('Local dictation requires a PCM WAV recording.');
  }
}

function runWhisper(binary,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='';
    child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>24000)stdout=stdout.slice(-24000)});
    child.stderr.on('data',chunk=>{stderr+=chunk.toString();if(stderr.length>24000)stderr=stderr.slice(-24000)});
    child.on('error',reject);
    child.on('close',code=>{
      if(code===0)return resolve({stdout,stderr});
      reject(new Error('Local Whisper transcription failed'+(stderr.trim()?': '+stderr.trim().slice(-800):'.')));
    });
  });
}

async function status(app){
  const binary=whisperBinary(app);
  const modelReady=await verifiedModel(app);
  return {
    available:(process.platform==='linux'||process.platform==='darwin')&&fs.existsSync(binary),
    binaryReady:fs.existsSync(binary),
    modelReady,
    model:MODEL_LABEL,
    modelBytes:MODEL_SIZE,
    localOnly:true,
    platform:process.platform
  };
}

async function transcribe(app,{wav,language='auto'}={}){
  if(process.platform!=='linux'&&process.platform!=='darwin')throw new Error('Local Whisper dictation is currently enabled on Linux and macOS.');
  const binary=whisperBinary(app);
  if(!fs.existsSync(binary))throw new Error('The local Whisper engine is missing from this Free AI build.');
  try{await fsp.access(binary,fs.constants.X_OK)}catch{await fsp.chmod(binary,0o755)}
  const audio=Buffer.isBuffer(wav)?wav:Buffer.from(wav||[]);
  validateWav(audio);
  const model=await ensureModel(app);
  const tempRoot=await fsp.mkdtemp(path.join(os.tmpdir(),'free-ai-dictation-'));
  const wavPath=path.join(tempRoot,'input.wav');
  const outputBase=path.join(tempRoot,'result');
  const outputJson=outputBase+'.json';
  try{
    await fsp.writeFile(wavPath,audio,{mode:0o600});
    const args=[
      '--model',model.path,
      '--file',wavPath,
      '--language',languageCode(language),
      '--output-json',
      '--output-file',outputBase,
      '--no-prints',
      '--no-timestamps'
    ];
    await runWhisper(binary,args);
    const parsed=JSON.parse(await fsp.readFile(outputJson,'utf8'));
    const text=(Array.isArray(parsed?.transcription)?parsed.transcription:[])
      .map(segment=>String(segment?.text||'').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g,' ')
      .trim();
    if(!text)throw new Error('No speech was detected. Try again.');
    return {
      text,
      language:String(parsed?.result?.language||languageCode(language)||'auto'),
      model:MODEL_LABEL,
      downloadedModel:model.downloaded,
      localOnly:true
    };
  }finally{
    await fsp.rm(tempRoot,{recursive:true,force:true}).catch(()=>{});
  }
}

module.exports={status,transcribe,ensureModel};
