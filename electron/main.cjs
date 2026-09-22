const {app,BrowserWindow,ipcMain,desktopCapturer,screen,safeStorage,shell,Menu,WebContentsView,clipboard}=require('electron');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const {execFile}=require('child_process');
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
let browserTabs=[];
let activeBrowserTabId=null;
let browserBounds=null;
let browserTabSeq=0;

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


function installAppMenu(){
  const template=[
    {
      label:'File',
      submenu:[
        {label:'New chat',accelerator:'CmdOrCtrl+N',click:()=>win?.webContents.send('app-command','new-chat')},
        {type:'separator'},
        process.platform==='darwin'?{role:'close'}:{role:'quit'}
      ]
    },
    {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[
      {label:'Toggle browser',accelerator:'CmdOrCtrl+Shift+B',click:()=>win?.webContents.send('app-command','open-browser')},
      {label:'Toggle sidebar',accelerator:'CmdOrCtrl+Shift+S',click:()=>win?.webContents.send('app-command','toggle-sidebar')},
      {type:'separator'},{role:'reload'},{role:'forceReload'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}
    ]},
    {label:'Help',submenu:[{label:'About Free AI',click:()=>win?.webContents.send('app-command','about')}]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function activeBrowserTab(){
  return browserTabs.find(tab=>tab.id===activeBrowserTabId)||null;
}

function browserTabSnapshot(tab){
  if(!tab?.view)return {id:tab?.id||'',url:'',title:'New tab',loading:false,canGoBack:false,canGoForward:false};
  const wc=tab.view.webContents;
  return {
    id:tab.id,
    url:wc.getURL()||tab.url||'',
    title:wc.getTitle()||tab.title||'New tab',
    loading:wc.isLoading(),
    canGoBack:wc.canGoBack(),
    canGoForward:wc.canGoForward()
  };
}

function browserSnapshot(){
  const active=activeBrowserTab();
  const current=active?browserTabSnapshot(active):{id:'',url:'',title:'New tab',loading:false,canGoBack:false,canGoForward:false};
  return {
    ...current,
    activeTabId:activeBrowserTabId,
    tabs:browserTabs.map(browserTabSnapshot)
  };
}

function emitBrowserState(){
  if(win&&!win.isDestroyed())win.webContents.send('browser-state',browserSnapshot());
}

function normalizeBrowserUrl(input){
  const raw=String(input||'').trim();
  if(!raw)return 'https://www.google.com/';
  if(/^https?:\/\//i.test(raw))return raw;
  if(/^localhost(?::\d+)?(?:\/|$)/i.test(raw))return 'http://'+raw;
  if(/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(raw))return 'https://'+raw;
  return 'https://www.google.com/search?q='+encodeURIComponent(raw);
}

function createBrowserTab(url='https://www.google.com/'){
  const id='tab-'+(++browserTabSeq);
  const view=new WebContentsView({
    webPreferences:{
      sandbox:true,
      contextIsolation:true,
      nodeIntegration:false,
      partition:'persist:freeai-browser'
    }
  });
  const tab={id,view,url,title:'New tab'};
  browserTabs.push(tab);
  const wc=view.webContents;
  wc.setWindowOpenHandler(({url:newUrl})=>{
    const child=createBrowserTab(newUrl);
    switchBrowserTab(child.id);
    child.view.webContents.loadURL(normalizeBrowserUrl(newUrl)).catch(()=>{});
    return {action:'deny'};
  });
  for(const eventName of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated']){
    wc.on(eventName,()=>{
      const snap=browserTabSnapshot(tab);
      tab.url=snap.url;tab.title=snap.title;
      emitBrowserState();
    });
  }
  wc.on('render-process-gone',()=>emitBrowserState());
  return tab;
}

function switchBrowserTab(id){
  const next=browserTabs.find(tab=>tab.id===id);
  if(!next||!win||win.isDestroyed())return null;
  const current=activeBrowserTab();
  if(current&&current.id!==next.id){
    try{win.contentView.removeChildView(current.view)}catch{}
  }
  activeBrowserTabId=next.id;
  try{win.contentView.addChildView(next.view)}catch{}
  if(browserBounds)setBrowserBounds(browserBounds);
  emitBrowserState();
  return next;
}

function ensureBrowserTab(){
  let tab=activeBrowserTab();
  if(tab)return tab;
  tab=createBrowserTab();
  switchBrowserTab(tab.id);
  return tab;
}

function setBrowserBounds(bounds){
  browserBounds=bounds||browserBounds;
  const tab=activeBrowserTab();
  if(!tab?.view||!browserBounds)return;
  const x=Math.max(0,Math.round(Number(browserBounds.x)||0));
  const y=Math.max(0,Math.round(Number(browserBounds.y)||0));
  const width=Math.max(1,Math.round(Number(browserBounds.width)||1));
  const height=Math.max(1,Math.round(Number(browserBounds.height)||1));
  tab.view.setBounds({x,y,width,height});
}

function closeBrowserTab(id){
  const index=browserTabs.findIndex(tab=>tab.id===id);
  if(index<0)return browserSnapshot();
  const [tab]=browserTabs.splice(index,1);
  const wasActive=tab.id===activeBrowserTabId;
  if(wasActive){
    try{win?.contentView.removeChildView(tab.view)}catch{}
  }
  try{tab.view.webContents.close()}catch{}
  if(wasActive){
    const fallback=browserTabs[Math.max(0,index-1)]||browserTabs[0]||null;
    activeBrowserTabId=fallback?.id||null;
    if(fallback&&win&&!win.isDestroyed()){
      try{win.contentView.addChildView(fallback.view)}catch{}
      if(browserBounds)setBrowserBounds(browserBounds);
    }
  }
  emitBrowserState();
  return browserSnapshot();
}

function closeBrowserView(){
  for(const tab of browserTabs){
    try{win?.contentView.removeChildView(tab.view)}catch{}
    try{tab.view.webContents.close()}catch{}
  }
  browserTabs=[];
  activeBrowserTabId=null;
  browserBounds=null;
  emitBrowserState();
}

function runPowerShell(script){
  return new Promise((resolve,reject)=>{
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{windowsHide:true},(error,stdout,stderr)=>{
      if(error)return reject(new Error(String(stderr||error.message||error)));
      resolve(String(stdout||'').trim());
    });
  });
}

function displayPoint(displayId,nx,ny){
  const displays=screen.getAllDisplays();
  const display=displays.find(d=>String(d.id)===String(displayId))||screen.getPrimaryDisplay();
  const x=display.bounds.x+Math.round(display.bounds.width*Math.min(1,Math.max(0,Number(nx)||0)));
  const y=display.bounds.y+Math.round(display.bounds.height*Math.min(1,Math.max(0,Number(ny)||0)));
  return {x,y,displayId:display.id};
}

async function clickWindowsPoint(x,y){
  const script=`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FreeAIMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
}
'@
[FreeAIMouse]::SetCursorPos(${x},${y}) | Out-Null
Start-Sleep -Milliseconds 80
[FreeAIMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
[FreeAIMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
`;
  await runPowerShell(script);
}

async function pasteWindowsText(text){
  clipboard.writeText(String(text||''));
  await runPowerShell("Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 120; [System.Windows.Forms.SendKeys]::SendWait('^v')");
}

async function startWindowsVoiceTyping(){
  const script=`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FreeAIKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@
[FreeAIKeys]::keybd_event(0x5B,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[FreeAIKeys]::keybd_event(0x48,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[FreeAIKeys]::keybd_event(0x48,0,2,[UIntPtr]::Zero)
[FreeAIKeys]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)
`;
  await runPowerShell(script);
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
    backgroundColor:'#181818',
    show:false,
    autoHideMenuBar:false,
    title:'Free AI',
    icon:path.join(__dirname,'..','build','icon.png'),
    titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true
    }
  });

  win.once('ready-to-show',()=>{
    if(!win.isDestroyed())win.show();
  });

  win.webContents.on('did-fail-load',(_event,errorCode,errorDescription)=>{
    console.error('Renderer failed to load',errorCode,errorDescription);
    const fallback='data:text/html;charset=utf-8,'+encodeURIComponent(
      '<!doctype html><html><body style="margin:0;background:#171717;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh">'+
      '<div style="text-align:center;max-width:520px;padding:32px"><svg viewBox="0 0 512 512" width="58" height="58" aria-hidden="true"><path d="M154 112 A182 182 0 0 1 400 358" fill="none" stroke="#3183F7" stroke-width="76" stroke-linecap="round"/><path d="M358 400 A182 182 0 0 1 112 154" fill="none" stroke="#3183F7" stroke-width="76" stroke-linecap="round"/></svg>'+
      '<h1 style="margin:12px 0 10px">Free AI</h1><p style="color:#aaa">The interface could not be loaded.</p>'+
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
  installAppMenu();
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
  closeBrowserView();
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
ipcMain.handle('dictation:start',async()=>{
  if(process.platform!=='win32')throw new Error('Native desktop dictation is currently available on Windows.');
  await startWindowsVoiceTyping();
  return {ok:true,mode:'windows-voice-typing'};
});



ipcMain.handle('browser:open',async(_e,payload={})=>{
  if(!win||win.isDestroyed())throw new Error('Desktop window is not available.');
  const tab=ensureBrowserTab();
  if(payload.bounds)setBrowserBounds(payload.bounds);
  const url=normalizeBrowserUrl(payload.url||tab.url);
  if(!tab.view.webContents.getURL())await tab.view.webContents.loadURL(url);
  emitBrowserState();
  return browserSnapshot();
});
ipcMain.handle('browser:newTab',async(_e,input='https://www.google.com/')=>{
  const tab=createBrowserTab(normalizeBrowserUrl(input));
  switchBrowserTab(tab.id);
  await tab.view.webContents.loadURL(normalizeBrowserUrl(input));
  emitBrowserState();
  return browserSnapshot();
});
ipcMain.handle('browser:switchTab',(_e,id)=>{switchBrowserTab(id);return browserSnapshot()});
ipcMain.handle('browser:closeTab',(_e,id)=>closeBrowserTab(id));
ipcMain.handle('browser:navigate',async(_e,input)=>{
  const tab=ensureBrowserTab();
  const url=normalizeBrowserUrl(input);
  await tab.view.webContents.loadURL(url);
  emitBrowserState();
  return browserSnapshot();
});
ipcMain.handle('browser:setBounds',(_e,bounds)=>{setBrowserBounds(bounds);return true});
ipcMain.handle('browser:back',()=>{const tab=activeBrowserTab();if(tab?.view.webContents.canGoBack())tab.view.webContents.goBack();return browserSnapshot()});
ipcMain.handle('browser:forward',()=>{const tab=activeBrowserTab();if(tab?.view.webContents.canGoForward())tab.view.webContents.goForward();return browserSnapshot()});
ipcMain.handle('browser:reload',()=>{activeBrowserTab()?.view.webContents.reload();return browserSnapshot()});
ipcMain.handle('browser:close',()=>{closeBrowserView();return true});

ipcMain.handle('computer:click',async(_e,{displayId,nx,ny}={})=>{
  if(process.platform!=='win32')throw new Error('Interactive computer control is currently available on Windows. Screen preview still works on this platform.');
  const point=displayPoint(displayId,nx,ny);
  await clickWindowsPoint(point.x,point.y);
  return point;
});
ipcMain.handle('computer:clickAndType',async(_e,{displayId,nx,ny,text}={})=>{
  if(process.platform!=='win32')throw new Error('Interactive computer control is currently available on Windows.');
  const point=displayPoint(displayId,nx,ny);
  await clickWindowsPoint(point.x,point.y);
  await pasteWindowsText(text);
  return point;
});

ipcMain.handle('auth:openExternal',async(_e,url)=>{
  const parsed=new URL(String(url||''));
  if(parsed.protocol!=='https:'&&parsed.protocol!=='http:'){
    throw new Error('Only http/https authentication URLs can be opened.');
  }
  await shell.openExternal(parsed.toString());
  return true;
});
