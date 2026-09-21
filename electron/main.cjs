const {app,BrowserWindow,ipcMain,desktopCapturer,screen}=require('electron');
const path=require('path');
const {WebSocketServer,WebSocket}=require('ws');
const crypto=require('crypto');

let win;
let extensionSocket=null;
let relaySocket=null;
let providers=[];
const pending=new Map();
let relayConfig={relayUrl:'',pairKey:''};

function status(){
  return {
    extension:!!(extensionSocket&&extensionSocket.readyState===1),
    relay:!!(relaySocket&&relaySocket.readyState===1),
    providers
  };
}
function sendStatus(){
  const s=status();
  if(win&&!win.isDestroyed()) win.webContents.send('bridge-status',s);
  if(relaySocket&&relaySocket.readyState===1) relaySocket.send(JSON.stringify({type:'providerStatus',...s}));
}
function sendExtension(msg){
  if(extensionSocket&&extensionSocket.readyState===1) extensionSocket.send(JSON.stringify(msg));
}
function routeToExtension(msg){
  return new Promise((resolve,reject)=>{
    if(!extensionSocket||extensionSocket.readyState!==1) return reject(new Error('Chrome extension is not connected.'));
    if(msg.provider&&!providers.some(p=>p.id===msg.provider)) return reject(new Error('That browser model is not currently connected.'));
    const id=msg.id||crypto.randomUUID();
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('AI response timed out.'));},150000);
    pending.set(id,{resolve,reject,timer});
    sendExtension({...msg,id,type:'prompt'});
  });
}

function startLocalBridge(){
  const wss=new WebSocketServer({host:'127.0.0.1',port:17341});
  wss.on('connection',ws=>{
    ws.on('message',raw=>{
      let m; try{m=JSON.parse(raw)}catch{return}
      if(m.type==='hello'&&m.role==='extension'){
        extensionSocket=ws;
        providers=[];
        sendExtension({type:'scanProviders'});
        sendStatus();
        return;
      }
      if(m.type==='providers'){
        providers=Array.isArray(m.providers)?m.providers:[];
        sendStatus();
        return;
      }
      if(m.type==='response'&&pending.has(m.id)){
        const p=pending.get(m.id);
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error?p.reject(new Error(m.error)):p.resolve(m);
      }
    });
    ws.on('close',()=>{
      if(ws===extensionSocket){extensionSocket=null;providers=[];}
      sendStatus();
    });
  });
  wss.on('error',e=>console.error('Local bridge error',e));
}

function connectRelay(){
  if(relaySocket){try{relaySocket.close()}catch{}}
  if(!relayConfig.relayUrl||!relayConfig.pairKey){sendStatus();return;}
  relaySocket=new WebSocket(relayConfig.relayUrl);
  relaySocket.on('open',()=>{
    relaySocket.send(JSON.stringify({type:'hello',role:'desktop',key:relayConfig.pairKey}));
    sendStatus();
  });
  relaySocket.on('message',async raw=>{
    let m; try{m=JSON.parse(raw)}catch{return}
    if(m.type==='getProviderStatus'){sendStatus();return}
    if(m.type==='prompt'){
      try{
        const r=await routeToExtension(m);
        relaySocket.send(JSON.stringify({type:'response',id:m.id,text:r.text||'',usedTool:r.usedTool||null}));
      }catch(e){
        relaySocket.send(JSON.stringify({type:'response',id:m.id,error:e.message}));
      }
    }
  });
  relaySocket.on('close',()=>{
    sendStatus();
    setTimeout(()=>{if(relayConfig.relayUrl&&relayConfig.pairKey)connectRelay()},3000);
  });
  relaySocket.on('error',()=>sendStatus());
}

async function openAICompatibleChat(cfg,text){
  const base=String(cfg.baseUrl||'').replace(/\/$/,'');
  if(!base||!cfg.model) throw new Error('API endpoint and model are required.');
  const endpoint=base.endsWith('/chat/completions')?base:base+'/chat/completions';
  const headers={'Content-Type':'application/json'};
  if(cfg.apiKey) headers.Authorization='Bearer '+cfg.apiKey;
  const response=await fetch(endpoint,{
    method:'POST',
    headers,
    body:JSON.stringify({model:cfg.model,messages:[{role:'user',content:text}],stream:false})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error?.message||data?.message||('API request failed: '+response.status));
  const out=data?.choices?.[0]?.message?.content;
  if(typeof out!=='string') throw new Error('The API returned an unsupported response format.');
  return {text:out};
}

async function captureScreens(){
  const displays=screen.getAllDisplays();
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:640,height:360}});
  return sources.map((s,i)=>({
    id:s.id,
    name:s.name||('Screen '+(i+1)),
    thumbnail:s.thumbnail.toDataURL(),
    displayId:displays[i]?.id||null
  }));
}

function createWindow(){
  win=new BrowserWindow({
    width:1380,height:880,minWidth:980,minHeight:650,
    backgroundColor:'#0d0d0d',
    titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}
  });
  const dev=process.env.VITE_DEV_SERVER_URL;
  if(dev) win.loadURL(dev); else win.loadFile(path.join(__dirname,'..','dist','index.html'));
}

app.whenReady().then(()=>{
  startLocalBridge();
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

ipcMain.handle('bridge:getStatus',()=>status());
ipcMain.handle('bridge:scanProviders',()=>{sendExtension({type:'scanProviders'});return status()});
ipcMain.handle('bridge:sendPrompt',(_e,msg)=>routeToExtension(msg));
ipcMain.handle('bridge:configureRelay',(_e,cfg)=>{
  relayConfig={relayUrl:String(cfg?.relayUrl||''),pairKey:String(cfg?.pairKey||'')};
  connectRelay();
  return status();
});
ipcMain.handle('api:chat',(_e,{connection,text})=>openAICompatibleChat(connection,text));
ipcMain.handle('computer:captureScreens',()=>captureScreens());