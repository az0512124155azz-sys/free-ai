const {app,BrowserWindow,ipcMain,desktopCapturer,screen,safeStorage,shell,Menu}=require('electron');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const {WebSocketServer,WebSocket}=require('ws');

let win;
let extensionSocket=null;
let relaySocket=null;
let relayReconnectTimer=null;
let browserProviders=[];
let apiConnections=[];
const pending=new Map();
let relayConfig={relayUrl:'',pairKey:''};
let pendingAuthUrl=null;

const AUTH_SCHEME='freeai';
const AUTH_CALLBACK_PREFIX='freeai://auth';

function handleAuthCallback(url){
  if(typeof url!=='string'||!url.startsWith(AUTH_CALLBACK_PREFIX))return false;
  if(!win||win.isDestroyed()){
    pendingAuthUrl=url;
    return true;
  }
  win.show();
  win.focus();
  win.webContents.send('auth-callback',url);
  return true;
}

function findAuthUrl(argv){
  return (Array.isArray(argv)?argv:[]).find(arg=>typeof arg==='string'&&arg.startsWith(AUTH_CALLBACK_PREFIX))||null;
}

function registerAuthProtocol(){
  if(process.defaultApp&&process.argv.length>=2){
    app.setAsDefaultProtocolClient(AUTH_SCHEME,process.execPath,[path.resolve(process.argv[1])]);
  }else{
    app.setAsDefaultProtocolClient(AUTH_SCHEME);
  }
}

function apiStorePath(){return path.join(app.getPath('userData'),'api-connections.json')}

function encodeSecret(value){
  const text=JSON.stringify(value);
  if(safeStorage.isEncryptionAvailable()) return {mode:'encrypted',data:safeStorage.encryptString(text).toString('base64')};
  return {mode:'plain',data:Buffer.from(text,'utf8').toString('base64')};
}

function decodeSecret(payload){
  if(!payload||!payload.data)return [];
  try{
    if(payload.mode==='encrypted'&&safeStorage.isEncryptionAvailable()){
      return JSON.parse(safeStorage.decryptString(Buffer.from(payload.data,'base64')));
    }
    return JSON.parse(Buffer.from(payload.data,'base64').toString('utf8'));
  }catch{return []}
}

function loadApiConnections(){
  try{
    const raw=JSON.parse(fs.readFileSync(apiStorePath(),'utf8'));
    apiConnections=Array.isArray(decodeSecret(raw))?decodeSecret(raw):[];
  }catch{apiConnections=[]}
}

function saveApiConnections(){
  try{
    fs.mkdirSync(path.dirname(apiStorePath()),{recursive:true});
    fs.writeFileSync(apiStorePath(),JSON.stringify(encodeSecret(apiConnections)),'utf8');
  }catch(e){console.error('Failed to save API connections',e)}
}

function publicApiConnection(c){
  return {id:c.id,name:c.name,model:c.model,baseUrl:c.baseUrl,source:'api',hasKey:!!c.apiKey,mcps:[]};
}

function status(){
  return {
    extension:!!(extensionSocket&&extensionSocket.readyState===WebSocket.OPEN),
    relay:!!(relaySocket&&relaySocket.readyState===WebSocket.OPEN),
    providers:[
      ...browserProviders.map(p=>({...p,source:'browser'})),
      ...apiConnections.map(publicApiConnection)
    ]
  };
}

function sendStatus(){
  const s=status();
  if(win&&!win.isDestroyed()) win.webContents.send('bridge-status',s);
  if(relaySocket&&relaySocket.readyState===WebSocket.OPEN){
    relaySocket.send(JSON.stringify({type:'providerStatus',...s}));
  }
}

function sendExtension(msg){
  if(extensionSocket&&extensionSocket.readyState===WebSocket.OPEN){
    extensionSocket.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function routeToBrowser(msg){
  return new Promise((resolve,reject)=>{
    if(!extensionSocket||extensionSocket.readyState!==WebSocket.OPEN){
      return reject(new Error('Chrome extension is not connected.'));
    }
    if(!browserProviders.some(p=>p.id===msg.provider)){
      return reject(new Error('That browser model is not currently connected.'));
    }
    const id=msg.id||crypto.randomUUID();
    const timer=setTimeout(()=>{
      pending.delete(id);
      reject(new Error('AI response timed out.'));
    },180000);
    pending.set(id,{resolve,reject,timer});
    sendExtension({...msg,id,type:'prompt'});
  });
}

async function openAICompatibleChat(cfg,text){
  const base=String(cfg.baseUrl||'').trim().replace(/\/$/,'');
  if(!/^https?:\/\//i.test(base)) throw new Error('API endpoint must start with http:// or https://');
  if(!cfg.model) throw new Error('API model is required.');
  const endpoint=base.endsWith('/chat/completions')?base:base+'/chat/completions';
  const headers={'Content-Type':'application/json'};
  if(cfg.apiKey) headers.Authorization='Bearer '+cfg.apiKey;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),120000);
  try{
    const response=await fetch(endpoint,{
      method:'POST',
      headers,
      signal:controller.signal,
      body:JSON.stringify({model:cfg.model,messages:[{role:'user',content:text}],stream:false})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error?.message||data?.message||('API request failed: '+response.status));
    const out=data?.choices?.[0]?.message?.content;
    if(typeof out!=='string') throw new Error('The API returned an unsupported response format.');
    return {text:out};
  }catch(e){
    if(e?.name==='AbortError') throw new Error('API request timed out.');
    throw e;
  }finally{clearTimeout(timeout)}
}

async function routeDirect(msg){
  if(msg.source==='api'){
    const cfg=apiConnections.find(c=>c.id===msg.provider);
    if(!cfg) throw new Error('That API connection is not available on the desktop.');
    return openAICompatibleChat(cfg,msg.text);
  }
  return routeToBrowser(msg);
}

async function routePrompt(msg){
  const tool=msg.toolRequest;
  if(tool?.mcp&&tool.ownerProviderId){
    const owner=browserProviders.find(p=>p.id===tool.ownerProviderId);
    if(!owner) throw new Error('The model that owns this MCP is not currently connected.');
    if(msg.source!=='api'&&msg.provider===tool.ownerProviderId){
      return routeToBrowser({...msg,toolRequest:tool});
    }
    const toolPrompt=[
      'Use the already-installed MCP/connector named "'+tool.mcp+'" for the following task.',
      'Only report results you actually obtain from that installed tool.',
      '',
      msg.text
    ].join('\n');
    const toolResult=await routeToBrowser({
      provider:tool.ownerProviderId,
      source:'browser',
      text:toolPrompt,
      toolRequest:tool
    });
    const augmented=[
      'Another connected model used the installed MCP/connector "'+tool.mcp+'".',
      'Tool result:',
      toolResult.text||'',
      '',
      'Original request:',
      msg.text,
      '',
      'Use the tool result above to answer the original request.'
    ].join('\n');
    return routeDirect({...msg,text:augmented,toolRequest:null});
  }
  return routeDirect(msg);
}

function startLocalBridge(){
  const wss=new WebSocketServer({host:'127.0.0.1',port:17341});
  wss.on('connection',(ws,req)=>{
    const origin=String(req.headers.origin||'');
    if(origin&& !origin.startsWith('chrome-extension://')){
      ws.close(1008,'Unsupported client origin');
      return;
    }
    ws.on('message',raw=>{
      let m;try{m=JSON.parse(raw)}catch{return}
      if(m.type==='hello'&&m.role==='extension'){
        extensionSocket=ws;
        browserProviders=[];
        sendExtension({type:'scanProviders'});
        sendStatus();
        return;
      }
      if(m.type==='providers'){
        browserProviders=Array.isArray(m.providers)?m.providers.map(p=>({...p,source:'browser'})):[];
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
      if(ws===extensionSocket){
        extensionSocket=null;
        browserProviders=[];
      }
      sendStatus();
    });
  });
  wss.on('error',e=>console.error('Local bridge error',e));
}

function scheduleRelayReconnect(){
  clearTimeout(relayReconnectTimer);
  if(relayConfig.relayUrl&&relayConfig.pairKey){
    relayReconnectTimer=setTimeout(connectRelay,3000);
  }
}

function connectRelay(){
  clearTimeout(relayReconnectTimer);
  if(relaySocket){
    try{relaySocket.removeAllListeners();relaySocket.close()}catch{}
    relaySocket=null;
  }
  if(!relayConfig.relayUrl||!relayConfig.pairKey){sendStatus();return}
  if(!/^wss?:\/\//i.test(relayConfig.relayUrl)){
    console.error('Relay URL must start with ws:// or wss://');
    sendStatus();
    return;
  }
  try{relaySocket=new WebSocket(relayConfig.relayUrl)}catch(e){
    console.error('Relay connection failed',e);
    scheduleRelayReconnect();
    return;
  }
  relaySocket.on('open',()=>{
    relaySocket.send(JSON.stringify({type:'hello',role:'desktop',key:relayConfig.pairKey}));
    sendStatus();
  });
  relaySocket.on('message',async raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.type==='getProviderStatus'){sendStatus();return}
    if(m.type==='prompt'){
      try{
        const r=await routePrompt(m);
        relaySocket?.send(JSON.stringify({type:'response',id:m.id,text:r.text||'',usedTool:r.usedTool||null}));
      }catch(e){
        relaySocket?.send(JSON.stringify({type:'response',id:m.id,error:e.message||String(e)}));
      }
    }
  });
  relaySocket.on('close',()=>{
    relaySocket=null;
    sendStatus();
    scheduleRelayReconnect();
  });
  relaySocket.on('error',e=>console.error('Relay socket error',e?.message||e));
}

async function captureScreens(){
  const displays=screen.getAllDisplays();
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:800,height:450}});
  return sources.map((s,i)=>({
    id:s.id,
    name:s.name||('Screen '+(i+1)),
    thumbnail:s.thumbnail.toDataURL(),
    displayId:displays[i]?.id||null
  }));
}

function createWindow(){
  win=new BrowserWindow({
    width:1380,
    height:880,
    minWidth:980,
    minHeight:650,
    backgroundColor:'#212121',
    show:false,
    autoHideMenuBar:true,
    title:'Free AI',
    titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true
    }
  });
  win.setMenuBarVisibility(false);

  win.once('ready-to-show',()=>{
    if(!win.isDestroyed())win.show();
  });

  win.webContents.on('did-fail-load',(_event,errorCode,errorDescription)=>{
    console.error('Renderer failed to load',errorCode,errorDescription);
    const fallback='data:text/html;charset=utf-8,'+encodeURIComponent(
      '<!doctype html><html><body style="margin:0;background:#171717;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh">'+
      '<div style="text-align:center;max-width:520px;padding:32px"><div style="font-size:42px;margin-bottom:16px">✦</div>'+
      '<h1 style="margin:0 0 10px">Free AI</h1><p style="color:#aaa">The interface could not be loaded.</p>'+
      '<p style="color:#777;font-size:13px">Please install the newest Free AI release.</p></div></body></html>'
    );
    win.loadURL(fallback).catch(()=>{});
  });

  const dev=process.env.VITE_DEV_SERVER_URL;
  if(dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname,'..','dist','index.html'));
}

const gotSingleInstanceLock=app.requestSingleInstanceLock();

if(!gotSingleInstanceLock){
  app.quit();
}else{
  app.on('second-instance',(_event,argv)=>{
    const url=findAuthUrl(argv);
    if(url)handleAuthCallback(url);
    if(win&&!win.isDestroyed()){
      if(win.isMinimized())win.restore();
      win.show();
      win.focus();
    }
  });

  app.on('open-url',(event,url)=>{
    event.preventDefault();
    handleAuthCallback(url);
  });
}

app.whenReady().then(()=>{
  Menu.setApplicationMenu(null);
  registerAuthProtocol();
  loadApiConnections();
  startLocalBridge();
  createWindow();

  const startupAuthUrl=findAuthUrl(process.argv);
  if(startupAuthUrl)pendingAuthUrl=startupAuthUrl;
  if(pendingAuthUrl){
    win.webContents.once('did-finish-load',()=>{
      const url=pendingAuthUrl;
      pendingAuthUrl=null;
      handleAuthCallback(url);
    });
  }

  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});

app.on('before-quit',()=>{
  clearTimeout(relayReconnectTimer);
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Application is closing.'))}
  pending.clear();
});

app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

ipcMain.handle('bridge:getStatus',()=>status());
ipcMain.handle('bridge:scanProviders',()=>{sendExtension({type:'scanProviders'});return status()});
ipcMain.handle('bridge:sendPrompt',(_e,msg)=>routePrompt(msg||{}));
ipcMain.handle('bridge:configureRelay',(_e,cfg)=>{
  relayConfig={relayUrl:String(cfg?.relayUrl||'').trim(),pairKey:String(cfg?.pairKey||'').trim()};
  connectRelay();
  return status();
});
ipcMain.handle('api:listConnections',()=>apiConnections.map(publicApiConnection));
ipcMain.handle('api:addConnection',(_e,input)=>{
  const connection={
    id:crypto.randomUUID(),
    name:String(input?.name||input?.model||'API model').trim(),
    baseUrl:String(input?.baseUrl||'').trim(),
    model:String(input?.model||'').trim(),
    apiKey:String(input?.apiKey||'').trim()
  };
  if(!connection.baseUrl||!connection.model) throw new Error('Base URL and model are required.');
  if(!/^https?:\/\//i.test(connection.baseUrl)) throw new Error('Base URL must start with http:// or https://');
  apiConnections.push(connection);
  saveApiConnections();
  sendStatus();
  return publicApiConnection(connection);
});
ipcMain.handle('api:removeConnection',(_e,id)=>{
  apiConnections=apiConnections.filter(c=>c.id!==id);
  saveApiConnections();
  sendStatus();
  return apiConnections.map(publicApiConnection);
});
ipcMain.handle('computer:captureScreens',()=>captureScreens());


ipcMain.handle('auth:openExternal',async(_e,url)=>{
  const parsed=new URL(String(url||''));
  if(parsed.protocol!=='https:'&&parsed.protocol!=='http:'){
    throw new Error('Only http/https authentication URLs can be opened.');
  }
  await shell.openExternal(parsed.toString());
  return true;
});
