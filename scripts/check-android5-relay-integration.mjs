import {spawn} from 'node:child_process';
import net from 'node:net';
import {WebSocket} from 'ws';

function fail(message){
  throw new Error('Android 5 relay integration failed: '+message);
}
function once(target,type,timeout=8000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for '+type))},timeout);
    const cleanup=()=>{
      clearTimeout(timer);
      target.off?.(type,onValue);
      target.removeListener?.(type,onValue);
    };
    const onValue=(...args)=>{cleanup();resolve(args.length>1?args:args[0])};
    target.once(type,onValue);
  });
}
function message(ws,match,timeout=8000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.off('message',onMessage);reject(new Error('Timed out waiting for relay message'))},timeout);
    const onMessage=raw=>{
      let value;try{value=JSON.parse(String(raw))}catch{return}
      if(!match(value))return;
      clearTimeout(timer);ws.off('message',onMessage);resolve(value);
    };
    ws.on('message',onMessage);
  });
}
async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function open(url){
  const ws=new WebSocket(url);
  await once(ws,'open');
  return ws;
}

const port=await freePort();
const child=spawn(process.execPath,['relay/server.mjs'],{
  env:{...process.env,PORT:String(port)},
  stdio:['ignore','pipe','pipe']
});
let stderr='';
child.stderr.on('data',chunk=>{stderr+=String(chunk)});
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Relay did not start. '+stderr)),8000);
    child.stdout.on('data',chunk=>{
      if(String(chunk).includes('Free AI relay listening')){
        clearTimeout(timer);resolve();
      }
    });
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Relay exited early with '+code+'. '+stderr))});
  });

  const url='ws://127.0.0.1:'+port;
  const key='android5-integration-'+('a'.repeat(48));
  const desktop=await open(url);
  desktop.send(JSON.stringify({type:'hello',role:'desktop',key}));
  const desktopReady=await message(desktop,m=>m.type==='ready');
  if(desktopReady.desktopOnline!==true)fail('desktop hello must establish an online desktop room');

  const mobile=await open(url);
  mobile.send(JSON.stringify({type:'hello',role:'mobile',key}));
  const mobileReady=await message(mobile,m=>m.type==='ready');
  if(mobileReady.desktopOnline!==true)fail('mobile pairing must report desktopOnline=true');

  const statusRequest=message(desktop,m=>m.type==='getProviderStatus');
  mobile.send(JSON.stringify({type:'getProviderStatus'}));
  await statusRequest;

  const safeStatus={
    type:'providerStatus',
    desktopOnline:true,
    relay:true,
    extension:true,
    browserExtension:{connected:true,tabCount:1},
    remoteCapabilities:{browser:{available:true},computer:{available:true}},
    providers:[{id:'test-model',providerId:'test',name:'Test',model:'test-model',modelName:'Test Model',source:'api',connected:true,adapterReady:true,effortLevels:[],effortControl:null,activeEffort:'default',fileUpload:false,mcps:[]}]
  };
  const statusToMobile=message(mobile,m=>m.type==='providerStatus'&&m.desktopOnline===true);
  desktop.send(JSON.stringify(safeStatus));
  const mobileStatus=await statusToMobile;
  if(mobileStatus.providers?.[0]?.modelName!=='Test Model')fail('sanitized model metadata did not reach Android');

  const promptAtDesktop=message(desktop,m=>m.type==='prompt'&&m.id==='prompt-1');
  mobile.send(JSON.stringify({type:'prompt',id:'prompt-1',requestId:'prompt-1',provider:'test-model',text:'hello',history:[]}));
  const prompt=await promptAtDesktop;
  if(prompt.requestId!=='prompt-1')fail('relay must preserve prompt requestId');

  const streamAtMobile=message(mobile,m=>m.type==='stream'&&m.id==='prompt-1');
  desktop.send(JSON.stringify({type:'stream',id:'prompt-1',text:'hel'}));
  const stream=await streamAtMobile;
  if(stream.text!=='hel')fail('stream chunk was not relayed to Android');

  const responseAtMobile=message(mobile,m=>m.type==='response'&&m.id==='prompt-1');
  desktop.send(JSON.stringify({type:'response',id:'prompt-1',text:'hello'}));
  const response=await responseAtMobile;
  if(response.text!=='hello')fail('final response was not relayed to Android');

  const cancelPromptAtDesktop=message(desktop,m=>m.type==='prompt'&&m.id==='prompt-2');
  mobile.send(JSON.stringify({type:'prompt',id:'prompt-2',requestId:'prompt-2',provider:'test-model',text:'cancel me'}));
  await cancelPromptAtDesktop;
  const cancelAtDesktop=message(desktop,m=>m.type==='cancel'&&m.id==='prompt-2');
  mobile.send(JSON.stringify({type:'cancel',id:'prompt-2',requestId:'prompt-2'}));
  await cancelAtDesktop;

  const offlineAtMobile=message(mobile,m=>m.type==='providerStatus'&&m.desktopOnline===false);
  desktop.close();
  const offline=await offlineAtMobile;
  if(offline.remoteCapabilities?.browser?.available!==false||offline.remoteCapabilities?.computer?.available!==false){
    fail('desktop disconnect must disable remote Browser and Computer');
  }

  mobile.close();

  const invalid=await open(url);
  const invalidClosed=once(invalid,'close');
  invalid.send(JSON.stringify({type:'hello',role:'mobile',key:'too-short'}));
  const closeArgs=await invalidClosed;
  const code=Array.isArray(closeArgs)?closeArgs[0]:closeArgs;
  if(Number(code)!==1008)fail('invalid pairing keys must be rejected with policy code 1008');

  console.log('Android 5 relay integration checks passed.');
}finally{
  child.kill('SIGTERM');
}
