const {app,BrowserWindow,ipcMain,desktopCapturer,screen,safeStorage,shell,Menu,WebContentsView,clipboard,systemPreferences,session}=require('electron');
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
const activePrompts=new Map();
let relayConfig={relayUrl:'',pairKey:''};
let pendingAuthUrl=null;
const browserTabs=new Map();
const browserErrors=new Map();
const browserUrls=new Map();
const browserTitles=new Map();
const browserFavicons=new Map();
let activeBrowserTabId=null;
let browserBounds=null;
let browserAttached=false;
let browserDownloads=[];
let browserDownloadHooked=false;
const browserDownloadItems=new Map();
const browserSiteTools=new Map();
const browserPermissionGrants=new Set();
const browserPermissionRequests=new Map();
let browserPermissionsConfigured=false;
let siteToolsEnabled=true;

const AUTH_SCHEME='freeai';
const AUTH_CALLBACK_PREFIX='freeai://auth';
const BROWSER_PARTITION='persist:freeai-browser';
const BROWSER_RENDERABLE_PROTOCOLS=new Set(['http:','https:','about:','data:','blob:']);
const BROWSER_EXTERNAL_PROTOCOLS=new Set(['mailto:','tel:','sms:','webcal:']);

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
      {label:'Toggle browser',accelerator:'CmdOrCtrl+Shift+B',click:()=>win?.webContents.send('app-command',process.platform==='win32'?'toggle-browser':'open-browser')},
      {label:'Toggle sidebar',accelerator:'CmdOrCtrl+Shift+S',click:()=>win?.webContents.send('app-command','toggle-sidebar')},
      {type:'separator'},{role:'reload'},{role:'forceReload'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}
    ]},
    {label:'Help',submenu:[{label:'About Free AI',click:()=>win?.webContents.send('app-command','about')}]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAppMenu(label){
  if(!win||win.isDestroyed())return false;
  const item=Menu.getApplicationMenu()?.items?.find(entry=>entry.label===label);
  if(!item?.submenu)return false;
  item.submenu.popup({window:win});
  return true;
}

function setWindowChromeTheme({color,symbolColor}={}){
  if(process.platform!=='win32'||!win||win.isDestroyed())return false;
  const options={};
  if(typeof color==='string'&&color.trim())options.color=color.trim();
  if(typeof symbolColor==='string'&&symbolColor.trim())options.symbolColor=symbolColor.trim();
  if(!Object.keys(options).length)return false;
  win.setTitleBarOverlay(options);
  return true;
}

function activeBrowserEntry(){
  return activeBrowserTabId?browserTabs.get(activeBrowserTabId)||null:null;
}

function browserCanGoBack(wc){
  if(!wc)return false;
  if(process.platform==='win32'&&wc.navigationHistory)return wc.navigationHistory.canGoBack();
  return wc.canGoBack();
}

function browserCanGoForward(wc){
  if(!wc)return false;
  if(process.platform==='win32'&&wc.navigationHistory)return wc.navigationHistory.canGoForward();
  return wc.canGoForward();
}

function browserGoBack(wc){
  if(!wc)return false;
  if(process.platform==='win32'&&wc.navigationHistory){
    if(!wc.navigationHistory.canGoBack())return false;
    wc.navigationHistory.goBack();
    return true;
  }
  if(!wc.canGoBack())return false;
  wc.goBack();
  return true;
}

function browserGoForward(wc){
  if(!wc)return false;
  if(process.platform==='win32'&&wc.navigationHistory){
    if(!wc.navigationHistory.canGoForward())return false;
    wc.navigationHistory.goForward();
    return true;
  }
  if(!wc.canGoForward())return false;
  wc.goForward();
  return true;
}

function browserTabMeta(id,view){
  const wc=view.webContents;
  const windows=process.platform==='win32';
  return {
    id,
    url:windows?(browserUrls.get(id)||wc.getURL()||''):(wc.getURL()||''),
    title:windows?(browserTitles.get(id)||'New tab'):(wc.getTitle()||'New tab'),
    favicon:windows?(browserFavicons.get(id)||''):'',
    loading:wc.isLoading(),
    error:browserErrors.get(id)||null
  };
}

function browserPermissionPublic(record){
  return {
    id:record.id,
    tabId:record.tabId,
    permission:record.permission,
    origin:record.origin,
    requestingUrl:record.requestingUrl,
    userGesture:!!record.userGesture
  };
}

function browserPermissionSnapshot(tabId){
  if(process.platform!=='win32'||!tabId)return [];
  return [...browserPermissionRequests.values()]
    .filter(record=>record.tabId===tabId)
    .map(browserPermissionPublic);
}

function browserSnapshot(){
  const entry=activeBrowserEntry();
  const tabs=[...browserTabs.entries()].map(([id,view])=>browserTabMeta(id,view));
  if(!entry){
    return {url:'',title:'New tab',favicon:'',loading:false,canGoBack:false,canGoForward:false,tabs,activeTabId:null,downloads:browserDownloads,siteTools:[],permissionRequests:[],error:null};
  }
  const wc=entry.webContents;
  const activeMeta=browserTabMeta(activeBrowserTabId,entry);
  return {
    url:activeMeta.url,
    title:activeMeta.title,
    favicon:activeMeta.favicon,
    loading:activeMeta.loading,
    canGoBack:browserCanGoBack(wc),
    canGoForward:browserCanGoForward(wc),
    tabs,
    activeTabId:activeBrowserTabId,
    downloads:browserDownloads,
    siteTools:browserSiteTools.get(activeBrowserTabId)||[],
    permissionRequests:browserPermissionSnapshot(activeBrowserTabId),
    error:browserErrors.get(activeBrowserTabId)||null
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

function clampBrowserBounds(bounds){
  if(!bounds)return null;
  const content=win&&!win.isDestroyed()?win.getContentBounds():null;
  const contentWidth=Math.max(1,Math.round(Number(content?.width)||1));
  const contentHeight=Math.max(1,Math.round(Number(content?.height)||1));
  const x=Math.min(contentWidth-1,Math.max(0,Math.round(Number(bounds.x)||0)));
  const y=Math.min(contentHeight-1,Math.max(0,Math.round(Number(bounds.y)||0)));
  const width=Math.min(contentWidth-x,Math.max(1,Math.round(Number(bounds.width)||1)));
  const height=Math.min(contentHeight-y,Math.max(1,Math.round(Number(bounds.height)||1)));
  return {x,y,width,height};
}

function applyBrowserBounds(view=activeBrowserEntry()){
  if(!view||view.webContents.isDestroyed()||!browserBounds)return false;
  const next=clampBrowserBounds(browserBounds);
  if(!next)return false;
  browserBounds=next;
  try{view.setBounds(next);return true}catch{return false}
}

function attachBrowserView(view){
  if(!win||win.isDestroyed()||!view)return;
  if(browserAttached){
    const previous=activeBrowserEntry();
    if(previous&&previous!==view){
      try{win.contentView.removeChildView(previous)}catch{}
    }
  }
  try{win.contentView.addChildView(view);browserAttached=true}catch{}
  applyBrowserBounds(view);
}

async function refreshBrowserSiteTools(id){
  if(!siteToolsEnabled){
    browserSiteTools.set(id,[]);
    emitBrowserState();
    return [];
  }
  const view=browserTabs.get(id);
  if(!view||view.webContents.isDestroyed())return [];
  try{
    const tools=await view.webContents.executeJavaScript(`
      (async()=>{
        const ctx=document.modelContext;
        if(!ctx||typeof ctx.getTools!=='function')return [];
        try{
          const tools=await ctx.getTools();
          return tools.map(tool=>({
            name:String(tool.name||''),
            title:String(tool.title||''),
            description:String(tool.description||''),
            origin:String(tool.origin||location.origin||''),
            inputSchema:tool.inputSchema||{type:'object',properties:{}},
            annotations:tool.annotations||{}
          }));
        }catch{return []}
      })()
    `,true);
    browserSiteTools.set(id,Array.isArray(tools)?tools:[]);
  }catch{
    browserSiteTools.set(id,[]);
  }
  emitBrowserState();
  return browserSiteTools.get(id)||[];
}

async function startBrowserAnnotation(id){
  const view=browserTabs.get(id);
  if(!view||view.webContents.isDestroyed())throw new Error('That browser tab is no longer available.');
  return view.webContents.executeJavaScript(`
    (()=>{
      if(window.__freeAiAnnotation?.cleanup)window.__freeAiAnnotation.cleanup();
      return new Promise(resolve=>{
        const overlay=document.createElement('div');
        Object.assign(overlay.style,{
          position:'fixed',pointerEvents:'none',zIndex:'2147483647',
          border:'2px solid #3a83f7',background:'rgba(58,131,247,.10)',
          borderRadius:'4px',boxSizing:'border-box'
        });
        document.documentElement.appendChild(overlay);
        let current=null;
        const selectorFor=el=>{
          if(!el||el===document.documentElement)return 'html';
          if(el.id)return '#'+CSS.escape(el.id);
          const parts=[];
          let node=el;
          while(node&&node.nodeType===1&&node!==document.body){
            let part=node.localName;
            if(node.classList?.length){
              const cls=[...node.classList].find(x=>/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(x));
              if(cls)part+='.'+CSS.escape(cls);
            }
            const siblings=node.parentElement?[...node.parentElement.children].filter(x=>x.localName===node.localName):[];
            if(siblings.length>1)part+=':nth-of-type('+(siblings.indexOf(node)+1)+')';
            parts.unshift(part);
            node=node.parentElement;
            if(parts.length>=5)break;
          }
          return parts.join(' > ');
        };
        const update=event=>{
          const el=event.target;
          if(!el||el===overlay)return;
          current=el;
          const r=el.getBoundingClientRect();
          Object.assign(overlay.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
        };
        const cleanup=()=>{
          document.removeEventListener('mousemove',update,true);
          document.removeEventListener('click',pick,true);
          document.removeEventListener('keydown',key,true);
          overlay.remove();
          delete window.__freeAiAnnotation;
        };
        const pick=event=>{
          if(!current)return;
          event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
          const el=current;
          const r=el.getBoundingClientRect();
          const result={
            selector:selectorFor(el),
            tag:el.localName||'',
            text:String(el.innerText||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,1000),
            ariaLabel:el.getAttribute?.('aria-label')||'',
            title:el.getAttribute?.('title')||'',
            rect:{x:r.x,y:r.y,width:r.width,height:r.height},
            url:location.href
          };
          cleanup();
          resolve(result);
        };
        const key=event=>{
          if(event.key==='Escape'){cleanup();resolve(null)}
        };
        document.addEventListener('mousemove',update,true);
        document.addEventListener('click',pick,true);
        document.addEventListener('keydown',key,true);
        window.__freeAiAnnotation={cleanup:()=>{cleanup();resolve(null)}};
      })
    })()
  `,true);
}

async function cancelBrowserAnnotation(id){
  const view=browserTabs.get(id);
  if(!view||view.webContents.isDestroyed())return false;
  try{
    await view.webContents.executeJavaScript(`window.__freeAiAnnotation?.cleanup?.(); true`,true);
    return true;
  }catch{return false}
}

async function executeBrowserSiteTool(id,name,input){
  if(!siteToolsEnabled)throw new Error('Site tools are disabled in Browser settings.');
  const view=browserTabs.get(id);
  if(!view||view.webContents.isDestroyed())throw new Error('That browser tab is no longer available.');
  const safeName=JSON.stringify(String(name||''));
  const safeInput=JSON.stringify(input&&typeof input==='object'?input:{});
  const result=await view.webContents.executeJavaScript(`
    (async()=>{
      const ctx=document.modelContext;
      if(!ctx||typeof ctx.getTools!=='function'||typeof ctx.executeTool!=='function'){
        throw new Error('This page does not expose WebMCP site tools.');
      }
      const tools=await ctx.getTools();
      const tool=tools.find(t=>t.name===${safeName});
      if(!tool)throw new Error('The selected site tool is no longer available.');
      const value=await ctx.executeTool(tool,${safeInput});
      try{return {ok:true,value:JSON.parse(JSON.stringify(value))}}catch{return {ok:true,value:String(value??'')}}
    })()
  `,true);
  setTimeout(()=>refreshBrowserSiteTools(id),300);
  return result;
}

function syncBrowserDownloadRecord(record,item,state=undefined,terminal=false){
  const savePath=String(item.getSavePath?.()||record.savePath||'');
  const totalBytes=Math.max(0,Number(item.getTotalBytes?.()||0));
  const receivedBytes=Math.max(0,Number(item.getReceivedBytes?.()||0));
  const currentState=String(state||item.getState?.()||record.state||'progressing');
  record.state=currentState;
  record.terminal=!!terminal;
  record.receivedBytes=receivedBytes;
  record.totalBytes=totalBytes;
  record.percentComplete=totalBytes>0?Math.max(0,Math.min(100,Number(item.getPercentComplete?.()||0))):null;
  record.savePath=savePath;
  if(savePath)record.filename=path.basename(savePath);
  else record.filename=String(item.getFilename?.()||record.filename||'Download');
  record.canCancel=!terminal&&(currentState==='progressing'||currentState==='interrupted');
  record.canOpen=terminal&&currentState==='completed'&&!!savePath&&fs.existsSync(savePath);
  return record;
}

function browserDownloadById(id){
  return browserDownloads.find(entry=>entry.id===id)||null;
}

function persistentBrowserSession(){
  const ses=session.fromPartition(BROWSER_PARTITION);
  if(process.platform==='win32'&&!browserPermissionsConfigured){
    browserPermissionsConfigured=true;
    ses.setPermissionCheckHandler((webContents,permission,requestingOrigin,details={})=>{
      const origin=browserPermissionOrigin(details.requestingUrl||requestingOrigin||webContents?.getURL?.()||'');
      return !!origin&&browserPermissionGrants.has(browserPermissionKey(origin,permission));
    });
    ses.setPermissionRequestHandler((webContents,permission,callback,details={})=>{
      const tabId=browserTabIdForWebContents(webContents);
      const requestingUrl=String(details.requestingUrl||webContents?.getURL?.()||'');
      const origin=browserPermissionOrigin(requestingUrl);
      if(!tabId||tabId!==activeBrowserTabId||!browserAttached||!origin){
        callback(false);
        return;
      }
      const key=browserPermissionKey(origin,permission);
      if(browserPermissionGrants.has(key)){
        callback(true);
        return;
      }
      const existing=[...browserPermissionRequests.values()].find(record=>record.tabId===tabId&&record.key===key);
      if(existing){
        existing.callbacks.push(callback);
        emitBrowserState();
        return;
      }
      const id=crypto.randomUUID();
      browserPermissionRequests.set(id,{
        id,
        tabId,
        permission:String(permission||'unknown'),
        origin,
        requestingUrl,
        userGesture:!!details.isUserGesture,
        key,
        callbacks:[callback]
      });
      emitBrowserState();
    });
  }
  return ses;
}

function browserPermissionOrigin(value){
  try{
    const parsed=new URL(String(value||''));
    if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')return '';
    return parsed.origin;
  }catch{return ''}
}

function browserPermissionKey(origin,permission){
  return String(origin||'')+'\n'+String(permission||'unknown');
}

function browserTabIdForWebContents(webContents){
  if(!webContents)return null;
  for(const [id,view] of browserTabs){
    if(view.webContents===webContents)return id;
  }
  return null;
}

function resolveBrowserPermission(id,allow){
  const record=browserPermissionRequests.get(id);
  if(!record)return browserSnapshot();
  browserPermissionRequests.delete(id);
  if(allow)browserPermissionGrants.add(record.key);
  for(const callback of record.callbacks){
    try{callback(!!allow)}catch{}
  }
  emitBrowserState();
  return browserSnapshot();
}

function cancelBrowserPermissionsForTab(tabId){
  for(const [id,record] of [...browserPermissionRequests]){
    if(record.tabId!==tabId)continue;
    browserPermissionRequests.delete(id);
    for(const callback of record.callbacks){
      try{callback(false)}catch{}
    }
  }
}

function clearBrowserPermissions(){
  browserPermissionGrants.clear();
  for(const [id,record] of [...browserPermissionRequests]){
    browserPermissionRequests.delete(id);
    for(const callback of record.callbacks){
      try{callback(false)}catch{}
    }
  }
}

function browserProtocolInfo(value){
  try{
    const parsed=new URL(String(value||''));
    if(BROWSER_RENDERABLE_PROTOCOLS.has(parsed.protocol))return null;
    return {
      scheme:parsed.protocol.replace(/:$/,'')||'unknown',
      url:parsed.href,
      canOpenExternal:BROWSER_EXTERNAL_PROTOCOLS.has(parsed.protocol)
    };
  }catch{return null}
}

function setBrowserProtocolError(tabId,value){
  const info=browserProtocolInfo(value);
  if(!info||!tabId)return false;
  browserSiteTools.set(tabId,[]);
  browserErrors.set(tabId,{
    type:'protocol',
    description:info.canOpenExternal
      ? info.scheme.toUpperCase()+' links open in another app, not inside Free AI.'
      : 'The '+info.scheme+': protocol is not supported inside Free AI.',
    url:info.url,
    scheme:info.scheme,
    canOpenExternal:info.canOpenExternal
  });
  emitBrowserState();
  return true;
}

function createBrowserView(webPreferences={}){
  if(process.platform==='win32')persistentBrowserSession();
  return new WebContentsView({
    webPreferences:{
      ...(webPreferences&&typeof webPreferences==='object'?webPreferences:{}),
      sandbox:true,
      contextIsolation:true,
      nodeIntegration:false,
      partition:BROWSER_PARTITION
    }
  });
}

function popupLoadOptions(details={}){
  const options={};
  if(details.referrer)options.httpReferrer=details.referrer;
  const postBody=details.postBody;
  if(Array.isArray(postBody?.data)&&postBody.data.length){
    options.postData=postBody.data;
    let contentType=String(postBody.contentType||'').trim();
    if(contentType==='multipart/form-data'&&postBody.boundary)contentType+='; boundary='+postBody.boundary;
    if(contentType)options.extraHeaders='Content-Type: '+contentType+'\n';
  }
  return options;
}

function removeBrowserTabState(id){
  cancelBrowserPermissionsForTab(id);
  browserTabs.delete(id);
  browserSiteTools.delete(id);
  browserErrors.delete(id);
  browserUrls.delete(id);
  browserTitles.delete(id);
  browserFavicons.delete(id);
}

function handleBrowserTabDestroyed(id,view){
  if(browserTabs.get(id)!==view)return;
  const ids=[...browserTabs.keys()];
  const index=ids.indexOf(id);
  const wasActive=activeBrowserTabId===id;
  const wasAttached=wasActive&&browserAttached;
  if(wasAttached){
    try{win?.contentView.removeChildView(view)}catch{}
    browserAttached=false;
  }
  removeBrowserTabState(id);
  if(wasActive){
    activeBrowserTabId=null;
    const nextId=ids[index+1]||ids[index-1]||[...browserTabs.keys()][0]||null;
    if(nextId){
      if(wasAttached)activateBrowserTab(nextId);
      else{
        activeBrowserTabId=nextId;
        emitBrowserState();
      }
    }else{
      createBrowserTab('https://www.google.com/',true,{preserveHidden:!wasAttached});
    }
  }else{
    emitBrowserState();
  }
}

function hookBrowserDownloads(wc){
  if(browserDownloadHooked)return;
  browserDownloadHooked=true;
  wc.session.on('will-download',(_event,item)=>{
    const id=crypto.randomUUID();
    const record={
      id,
      filename:String(item.getFilename?.()||'Download'),
      suggestedFilename:String(item.getFilename?.()||'Download'),
      url:String(item.getURL?.()||''),
      mimeType:String(item.getMimeType?.()||''),
      state:String(item.getState?.()||'progressing'),
      terminal:false,
      receivedBytes:0,
      totalBytes:0,
      percentComplete:null,
      savePath:'',
      canCancel:true,
      canOpen:false
    };
    syncBrowserDownloadRecord(record,item,record.state,false);
    browserDownloadItems.set(id,item);
    browserDownloads=[record,...browserDownloads].slice(0,12);
    emitBrowserState();
    item.on('updated',(_e,state)=>{
      syncBrowserDownloadRecord(record,item,state,false);
      emitBrowserState();
    });
    item.once('done',(_e,state)=>{
      syncBrowserDownloadRecord(record,item,state,true);
      browserDownloadItems.delete(id);
      emitBrowserState();
    });
  });
}

function createBrowserTab(input='https://www.google.com/',activate=true,options={}){
  const id=crypto.randomUUID();
  const skipLoad=!!options.skipLoad;
  const initialUrl=skipLoad?String(input||'about:blank'):normalizeBrowserUrl(input);
  const view=options.view||createBrowserView(options.webPreferences);
  browserTabs.set(id,view);
  browserErrors.delete(id);
  if(process.platform==='win32'){
    browserUrls.set(id,initialUrl);
    browserTitles.set(id,'New tab');
    browserFavicons.delete(id);
  }
  const wc=view.webContents;
  hookBrowserDownloads(wc);
  wc.on('before-input-event',(event,input)=>{
    if(process.platform!=='win32'||input.type!=='keyDown')return;
    const key=String(input.key||'').toLowerCase();
    if(key==='b'&&input.control&&input.shift&&!input.alt&&!input.meta){
      event.preventDefault();
      win?.webContents.send('app-command','toggle-browser');
    }
  });
  wc.setWindowOpenHandler((details)=>{
    if(process.platform!=='win32'){
      createBrowserTab(details.url,true);
      return {action:'deny'};
    }
    if(setBrowserProtocolError(id,details.url))return {action:'deny'};
    const activatePopup=details.disposition!=='background-tab';
    const browserWasAttached=browserAttached;
    return {
      action:'allow',
      outlivesOpener:true,
      createWindow:(windowOptions={})=>{
        let popupView=null;
        const supplied=windowOptions.webContents;
        if(supplied){
          popupView=new WebContentsView({webContents:supplied});
        }else{
          popupView=createBrowserView(windowOptions.webPreferences);
        }
        const popup=createBrowserTab(details.url||'about:blank',activatePopup,{
          view:popupView,
          skipLoad:true,
          preserveHidden:!browserWasAttached
        });
        if(details.disposition==='background-tab'&&details.url&&details.url!=='about:blank'){
          popup.view.webContents.loadURL(details.url,popupLoadOptions(details)).catch(error=>{
            if(browserTabs.has(popup.id))browserErrors.set(popup.id,{
              type:'load',
              description:String(error?.message||'This page could not be loaded.'),
              url:String(details.url)
            });
            emitBrowserState();
          });
        }
        return popup.view.webContents;
      }
    };
  });
  wc.on('will-navigate',(details)=>{
    if(process.platform!=='win32')return;
    if(setBrowserProtocolError(id,details?.url)){
      details.preventDefault();
    }
  });
  wc.on('did-start-navigation',(_event,details)=>{
    if(process.platform!=='win32'||details?.isMainFrame===false)return;
    if(typeof details?.url==='string'&&details.url)browserUrls.set(id,details.url);
    if(!details?.isSameDocument){
      cancelBrowserPermissionsForTab(id);
      browserTitles.set(id,'New tab');
      browserFavicons.delete(id);
    }
    emitBrowserState();
  });
  wc.on('did-redirect-navigation',(_event,details)=>{
    if(process.platform!=='win32'||details?.isMainFrame===false)return;
    if(typeof details?.url==='string'&&details.url)browserUrls.set(id,details.url);
    emitBrowserState();
  });
  wc.on('did-start-loading',()=>{browserErrors.delete(id);emitBrowserState()});
  wc.on('did-navigate',(_event,url)=>{
    if(process.platform==='win32'&&typeof url==='string'&&url)browserUrls.set(id,url);
    emitBrowserState();
  });
  wc.on('did-navigate-in-page',(_event,url,isMainFrame)=>{
    if(process.platform==='win32'&&isMainFrame!==false&&typeof url==='string'&&url)browserUrls.set(id,url);
    emitBrowserState();
  });
  wc.on('page-title-updated',(_event,title)=>{
    if(process.platform==='win32')browserTitles.set(id,String(title||'New tab'));
    emitBrowserState();
  });
  wc.on('page-favicon-updated',async(_event,favicons)=>{
    if(process.platform!=='win32')return;
    const favicon=(Array.isArray(favicons)?favicons:[]).find(value=>typeof value==='string'&&value.trim());
    if(!favicon){
      browserFavicons.delete(id);
      emitBrowserState();
      return;
    }
    try{
      if(favicon.startsWith('data:')){
        if(browserTabs.has(id))browserFavicons.set(id,favicon);
      }else{
        const response=await wc.session.fetch(favicon);
        if(!response.ok)throw new Error('favicon fetch failed');
        const type=response.headers.get('content-type')||'image/x-icon';
        const bytes=Buffer.from(await response.arrayBuffer());
        if(browserTabs.has(id))browserFavicons.set(id,`data:${type};base64,${bytes.toString('base64')}`);
      }
    }catch{
      browserFavicons.delete(id);
    }
    emitBrowserState();
  });
  wc.on('did-fail-load',(_event,errorCode,errorDescription,validatedURL,isMainFrame)=>{
    if(process.platform!=='win32'||isMainFrame===false||Number(errorCode)===-3)return;
    const existing=browserErrors.get(id);
    if(existing?.type!=='certificate'){
      browserErrors.set(id,{
        type:'load',
        code:Number(errorCode)||0,
        description:String(errorDescription||'This page could not be loaded.'),
        url:String(validatedURL||wc.getURL()||'')
      });
    }
    browserSiteTools.set(id,[]);
    emitBrowserState();
  });
  wc.on('did-stop-loading',()=>{
    emitBrowserState();
    if(!browserErrors.has(id)){
      refreshBrowserSiteTools(id);
      setTimeout(()=>refreshBrowserSiteTools(id),1200);
    }
  });
  wc.on('render-process-gone',(_event,details)=>{
    browserSiteTools.set(id,[]);
    cancelBrowserPermissionsForTab(id);
    if(process.platform==='win32')browserErrors.set(id,{
      type:'crash',
      description:'The page process stopped unexpectedly. Retry reloads this tab in a new renderer process.',
      reason:String(details?.reason||'crashed'),
      url:String(wc.getURL()||'')
    });
    emitBrowserState();
  });
  wc.once('destroyed',()=>handleBrowserTabDestroyed(id,view));
  if(activate){
    if(options.preserveHidden){
      activeBrowserTabId=id;
      emitBrowserState();
    }else{
      activateBrowserTab(id);
    }
  }
  if(!skipLoad){
    wc.loadURL(initialUrl).catch(error=>{
      if(process.platform==='win32')browserErrors.set(id,{
        type:'load',
        description:String(error?.message||'This page could not be loaded.'),
        url:String(wc.getURL()||initialUrl)
      });
      emitBrowserState();
    });
  }
  emitBrowserState();
  return {id,view};
}

function activateBrowserTab(id){
  const view=browserTabs.get(id);
  if(!view)return false;
  const previousId=activeBrowserTabId;
  const previous=activeBrowserEntry();
  if(previousId&&previousId!==id)cancelBrowserPermissionsForTab(previousId);
  if(previous&&previous!==view&&browserAttached){
    try{win?.contentView.removeChildView(previous)}catch{}
    browserAttached=false;
  }
  activeBrowserTabId=id;
  attachBrowserView(view);
  emitBrowserState();
  return true;
}

function ensureBrowserView(){
  let entry=activeBrowserEntry();
  if(!entry){
    entry=createBrowserTab('https://www.google.com/',true).view;
  }else{
    attachBrowserView(entry);
  }
  return entry;
}

function setBrowserBounds(bounds){
  const next=clampBrowserBounds(bounds);
  if(!next)return false;
  browserBounds=next;
  if(browserAttached)applyBrowserBounds();
  return true;
}

function closeBrowserTab(id){
  const view=browserTabs.get(id);
  if(!view)return browserSnapshot();
  const ids=[...browserTabs.keys()];
  const index=ids.indexOf(id);
  const wasActive=activeBrowserTabId===id;
  const wasAttached=wasActive&&browserAttached;
  if(wasAttached){
    try{win?.contentView.removeChildView(view)}catch{}
    browserAttached=false;
  }
  removeBrowserTabState(id);
  if(wasActive)activeBrowserTabId=null;
  try{view.webContents.close()}catch{}
  if(wasActive){
    const nextId=ids[index+1]||ids[index-1]||[...browserTabs.keys()][0]||null;
    if(nextId){
      if(wasAttached)activateBrowserTab(nextId);
      else{
        activeBrowserTabId=nextId;
        emitBrowserState();
      }
    }else{
      createBrowserTab('https://www.google.com/',true,{preserveHidden:!wasAttached});
    }
  }
  emitBrowserState();
  return browserSnapshot();
}

function hideBrowserView(){
  const view=activeBrowserEntry();
  if(activeBrowserTabId)cancelBrowserPermissionsForTab(activeBrowserTabId);
  if(view&&browserAttached){
    try{win?.contentView.removeChildView(view)}catch{}
  }
  browserAttached=false;
  if(process.platform==='win32'){
    try{persistentBrowserSession().flushStorageData()}catch{}
  }
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
  const display=displays.find(d=>String(d.id)===String(displayId));
  if(!display)throw new Error('The selected screen is no longer available. Refresh Computer Use and try again.');
  const clamp=value=>Math.min(1,Math.max(0,Number(value)||0));
  if(process.platform==='win32'){
    const physical=screen.dipToScreenRect(null,display.bounds);
    const x=physical.x+Math.round(Math.max(0,physical.width-1)*clamp(nx));
    const y=physical.y+Math.round(Math.max(0,physical.height-1)*clamp(ny));
    return {x,y,displayId:display.id,coordinateSpace:'physical'};
  }
  const x=display.bounds.x+Math.round(Math.max(0,display.bounds.width-1)*clamp(nx));
  const y=display.bounds.y+Math.round(Math.max(0,display.bounds.height-1)*clamp(ny));
  return {x,y,displayId:display.id,coordinateSpace:'dip'};
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
  await clipboard.writeText(String(text||''));
  await runPowerShell("Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 120; [System.Windows.Forms.SendKeys]::SendWait('^v')");
}

function runAppleScript(script){
  return new Promise((resolve,reject)=>{
    execFile('/usr/bin/osascript',['-e',script],{windowsHide:true},(error,stdout,stderr)=>{
      if(error){
        const detail=String(stderr||error.message||error);
        if(/not allowed assistive access|-25211|accessibility/i.test(detail)){
          return reject(new Error('Free AI needs Accessibility permission in System Settings → Privacy & Security → Accessibility to control macOS apps.'));
        }
        return reject(new Error(detail));
      }
      resolve(String(stdout||'').trim());
    });
  });
}

function ensureMacAccessibility(){
  if(process.platform!=='darwin')return true;
  if(systemPreferences.isTrustedAccessibilityClient(false))return true;
  systemPreferences.isTrustedAccessibilityClient(true);
  throw new Error('Free AI needs Accessibility permission in System Settings → Privacy & Security → Accessibility. Enable it, then try again.');
}

async function clickMacPoint(x,y){
  ensureMacAccessibility();
  const px=Math.round(Number(x)||0);
  const py=Math.round(Number(y)||0);
  await runAppleScript(`tell application "System Events" to click at {${px}, ${py}}`);
}

async function pasteMacText(text){
  ensureMacAccessibility();
  clipboard.writeText(String(text||''));
  await runAppleScript('tell application "System Events" to keystroke "v" using command down');
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
  return {
    id:c.id,name:c.name,model:c.model,baseUrl:c.baseUrl,source:'api',hasKey:!!c.apiKey,
    effortLevels:[],effortControl:null,activeEffort:'default',fileUpload:false,mcps:[]
  };
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

function emitPromptStream(id,text){
  if(!id||!win||win.isDestroyed())return;
  win.webContents.send('prompt-stream',{id,text:String(text||'')});
}

function routeToBrowser(msg,onStream){
  return new Promise((resolve,reject)=>{
    if(!extensionSocket||extensionSocket.readyState!==WebSocket.OPEN){
      return reject(new Error('Chrome extension is not connected.'));
    }
    if(!browserProviders.some(p=>p.id===msg.provider)){
      return reject(new Error('That browser model is not currently connected.'));
    }
    const id=msg.requestId||msg.id||crypto.randomUUID();
    const timer=setTimeout(()=>{
      pending.delete(id);
      reject(new Error('AI response timed out.'));
    },180000);
    pending.set(id,{resolve,reject,timer,onStream,provider:msg.provider});
    sendExtension({...msg,id,type:'prompt'});
  });
}

function cancelPrompt(id){
  const requestId=String(id||'');
  if(!requestId)return false;
  const active=activePrompts.get(requestId);
  if(active){
    active.cancelled=true;
    active.controller.abort();
    return true;
  }
  const browser=pending.get(requestId);
  if(browser){
    clearTimeout(browser.timer);
    pending.delete(requestId);
    sendExtension({type:'cancel',id:requestId,provider:browser.provider});
    browser.reject(new Error('Generation stopped.'));
    return true;
  }
  return false;
}

async function openAICompatibleChat(cfg,msg,onStream){
  const base=String(cfg.baseUrl||'').trim().replace(/\/$/,'');
  if(!/^https?:\/\//i.test(base)) throw new Error('API endpoint must start with http:// or https://');
  if(!cfg.model) throw new Error('API model is required.');
  const endpoint=base.endsWith('/chat/completions')?base:base+'/chat/completions';
  const headers={'Content-Type':'application/json'};
  if(cfg.apiKey) headers.Authorization='Bearer '+cfg.apiKey;
  const requestId=String(msg.requestId||crypto.randomUUID());
  const history=Array.isArray(msg.history)
    ? msg.history.filter(item=>item&&['user','assistant'].includes(item.role)&&typeof item.content==='string').map(item=>({role:item.role,content:item.content}))
    : [];
  const messages=history.length?history:[{role:'user',content:String(msg.text||'')}];
  const controller=new AbortController();
  const active={controller,cancelled:false};
  activePrompts.set(requestId,active);
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort()},120000);
  try{
    const useStream=!!msg.requestId;
    const response=await fetch(endpoint,{
      method:'POST',
      headers,
      signal:controller.signal,
      body:JSON.stringify({model:cfg.model,messages,stream:useStream})
    });
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw new Error(data?.error?.message||data?.message||('API request failed: '+response.status));
    }
    const contentType=String(response.headers.get('content-type')||'').toLowerCase();
    if(useStream&&contentType.includes('text/event-stream')&&response.body){
      const reader=response.body.getReader();
      const decoder=new TextDecoder();
      let buffer='';
      let full='';
      while(true){
        const {value,done}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split(/\r?\n/);
        buffer=lines.pop()||'';
        for(const line of lines){
          const trimmed=line.trim();
          if(!trimmed.startsWith('data:'))continue;
          const raw=trimmed.slice(5).trim();
          if(!raw||raw==='[DONE]')continue;
          let chunk;try{chunk=JSON.parse(raw)}catch{continue}
          const delta=chunk?.choices?.[0]?.delta?.content;
          if(typeof delta==='string'&&delta){
            full+=delta;
            onStream?.(full);
          }
        }
      }
      if(full)return {text:full,streamed:true};
      throw new Error('The API stream ended without a text response.');
    }
    const data=await response.json().catch(()=>({}));
    const out=data?.choices?.[0]?.message?.content;
    if(typeof out!=='string') throw new Error('The API returned an unsupported response format.');
    onStream?.(out);
    return {text:out,streamed:false};
  }catch(e){
    if(e?.name==='AbortError'){
      if(active.cancelled)throw new Error('Generation stopped.');
      if(timedOut)throw new Error('API request timed out.');
    }
    throw e;
  }finally{
    clearTimeout(timeout);
    if(activePrompts.get(requestId)===active)activePrompts.delete(requestId);
  }
}

async function routeDirect(msg,onStream){
  if(msg.source==='api'){
    const cfg=apiConnections.find(c=>c.id===msg.provider);
    if(!cfg) throw new Error('That API connection is not available on the desktop.');
    return openAICompatibleChat(cfg,msg,onStream);
  }
  return routeToBrowser(msg,onStream);
}

async function routePrompt(msg,emitToRenderer=false){
  const onStream=emitToRenderer&&msg.requestId?text=>emitPromptStream(msg.requestId,text):null;
  const tool=msg.toolRequest;
  if(tool?.mcp&&tool.ownerProviderId){
    const owner=browserProviders.find(p=>p.id===tool.ownerProviderId);
    if(!owner) throw new Error('The model that owns this MCP is not currently connected.');
    if(msg.source!=='api'&&msg.provider===tool.ownerProviderId){
      return routeToBrowser({...msg,toolRequest:tool},onStream);
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
    },null);
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
    return routeDirect({...msg,text:augmented,toolRequest:null},onStream);
  }
  return routeDirect(msg,onStream);
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
      if(m.type==='stream'&&pending.has(m.id)){
        pending.get(m.id)?.onStream?.(String(m.text||''));
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
  return sources.map((source,index)=>{
    const reliableWindowsDisplay=process.platform==='win32'&&source.display_id
      ? displays.find(display=>String(display.id)===String(source.display_id))||null
      : null;
    const legacyDisplay=process.platform==='win32'?null:(displays[index]||null);
    const display=reliableWindowsDisplay||legacyDisplay;
    return {
      id:source.id,
      name:display?.label||source.name||('Screen '+(index+1)),
      thumbnail:source.thumbnail.toDataURL(),
      displayId:display?.id??null,
      interactive:process.platform==='win32'?!!reliableWindowsDisplay:process.platform==='darwin'?!!display:false,
      scaleFactor:Number(display?.scaleFactor)||1,
      rotation:Number(display?.rotation)||0,
      mapping:process.platform==='win32'?(reliableWindowsDisplay?'display_id':'unavailable'):'legacy'
    };
  });
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
    titleBarStyle:process.platform==='win32'?'hidden':process.platform==='darwin'?'hiddenInset':'default',
    ...(process.platform==='win32'?{titleBarOverlay:true}:{}),
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true
    }
  });

  if(process.platform==='win32'){
    win.setMenuBarVisibility(false);
    win.on('resize',()=>{
      if(browserAttached&&browserBounds)applyBrowserBounds();
    });
  }

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

app.on('certificate-error',(event,webContents,url,error,_certificate,callback,isMainFrame)=>{
  if(process.platform!=='win32'||isMainFrame===false)return;
  const tabId=browserTabIdForWebContents(webContents);
  if(!tabId)return;
  event.preventDefault();
  browserSiteTools.set(tabId,[]);
  browserErrors.set(tabId,{
    type:'certificate',
    description:'Certificate verification failed. Free AI did not bypass the invalid certificate.',
    url:String(url||webContents.getURL()||''),
    code:String(error||'certificate-error')
  });
  emitBrowserState();
  callback(false);
});

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
  if(process.platform==='win32'){
    clearBrowserPermissions();
    try{persistentBrowserSession().flushStorageData()}catch{}
  }
  hideBrowserView();
  const closingBrowserViews=[...browserTabs.values()];
  browserTabs.clear();
  browserSiteTools.clear();
  browserErrors.clear();
  browserUrls.clear();
  browserTitles.clear();
  browserFavicons.clear();
  activeBrowserTabId=null;
  for(const view of closingBrowserViews){try{view.webContents.close()}catch{}}
  clearTimeout(relayReconnectTimer);
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Application is closing.'))}
  pending.clear();
  for(const active of activePrompts.values())active.controller.abort();
  activePrompts.clear();
});

app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

ipcMain.handle('shell:showMenu',(_e,label)=>showAppMenu(String(label||'')));
ipcMain.handle('shell:setTitleBarTheme',(_e,theme)=>setWindowChromeTheme(theme||{}));
ipcMain.handle('bridge:getStatus',()=>status());
ipcMain.handle('bridge:scanProviders',()=>{sendExtension({type:'scanProviders'});return status()});
ipcMain.handle('bridge:sendPrompt',(_e,msg)=>routePrompt(msg||{},true));
ipcMain.handle('bridge:cancelPrompt',(_e,id)=>cancelPrompt(id));
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
  if(payload.bounds)setBrowserBounds(payload.bounds);
  let view=ensureBrowserView();
  if(payload.newTab){
    view=createBrowserTab(payload.url||'https://www.google.com/',true).view;
  }else if(payload.url&&(!view.webContents.getURL()||payload.forceNavigate)){
    await view.webContents.loadURL(normalizeBrowserUrl(payload.url));
  }
  emitBrowserState();
  return browserSnapshot();
});
ipcMain.handle('browser:newTab',async(_e,input)=>{
  createBrowserTab(input||'https://www.google.com/',true);
  return browserSnapshot();
});
ipcMain.handle('browser:selectTab',(_e,id)=>{activateBrowserTab(id);return browserSnapshot()});
ipcMain.handle('browser:closeTab',(_e,id)=>closeBrowserTab(id));
ipcMain.handle('browser:setSiteToolsEnabled',(_e,value)=>{
  siteToolsEnabled=!!value;
  if(!siteToolsEnabled){
    for(const id of browserTabs.keys())browserSiteTools.set(id,[]);
    emitBrowserState();
  }else if(activeBrowserTabId){
    refreshBrowserSiteTools(activeBrowserTabId);
  }
  return siteToolsEnabled;
});
ipcMain.handle('browser:clearData',async()=>{
  if(process.platform==='win32'){
    clearBrowserPermissions();
    const ses=persistentBrowserSession();
    await ses.clearStorageData();
    await ses.clearCache();
    for(const [id,view] of browserTabs){
      browserSiteTools.set(id,[]);
      if(!view.webContents.isDestroyed())view.webContents.reload();
    }
  }else{
    const sessions=new Set([...browserTabs.values()].map(view=>view.webContents.session));
    for(const ses of sessions){
      await ses.clearStorageData();
      await ses.clearCache();
    }
    for(const id of browserTabs.keys())browserSiteTools.set(id,[]);
  }
  emitBrowserState();
  return {ok:true};
});
ipcMain.handle('browser:cancelDownload',(_e,id)=>{
  if(process.platform!=='win32')return browserSnapshot();
  const item=browserDownloadItems.get(id);
  const record=browserDownloadById(id);
  if(item&&record&&!record.terminal&&record.canCancel){
    item.cancel();
    syncBrowserDownloadRecord(record,item,'cancelled',false);
    emitBrowserState();
  }
  return browserSnapshot();
});
ipcMain.handle('browser:openDownload',async(_e,id)=>{
  if(process.platform!=='win32')return {ok:false,error:'Download file actions are currently available on Windows.'};
  const record=browserDownloadById(id);
  if(!record?.canOpen||!record.savePath||!fs.existsSync(record.savePath))return {ok:false,error:'The downloaded file is not available.'};
  const error=await shell.openPath(record.savePath);
  return error?{ok:false,error}:{ok:true};
});
ipcMain.handle('browser:showDownload',(_e,id)=>{
  if(process.platform!=='win32')return {ok:false,error:'Download file actions are currently available on Windows.'};
  const record=browserDownloadById(id);
  if(!record?.canOpen||!record.savePath||!fs.existsSync(record.savePath))return {ok:false,error:'The downloaded file is not available.'};
  shell.showItemInFolder(record.savePath);
  return {ok:true};
});
ipcMain.handle('browser:resolvePermission',(_e,{id,allow}={})=>resolveBrowserPermission(id,!!allow));
ipcMain.handle('browser:dismissError',()=>{
  if(activeBrowserTabId)browserErrors.delete(activeBrowserTabId);
  emitBrowserState();
  return browserSnapshot();
});
ipcMain.handle('browser:openExternalProtocol',async(_e,url)=>{
  if(process.platform!=='win32')return {ok:false,error:'External protocol handling is currently available on Windows.'};
  const activeError=activeBrowserTabId?browserErrors.get(activeBrowserTabId):null;
  const info=browserProtocolInfo(url);
  if(!activeError||activeError.type!=='protocol'||activeError.url!==String(url||'')||!info?.canOpenExternal){
    return {ok:false,error:'This external link is not approved for opening.'};
  }
  await shell.openExternal(info.url);
  browserErrors.delete(activeBrowserTabId);
  emitBrowserState();
  return {ok:true};
});
ipcMain.handle('browser:startAnnotation',()=>activeBrowserTabId?startBrowserAnnotation(activeBrowserTabId):null);
ipcMain.handle('browser:cancelAnnotation',()=>activeBrowserTabId?cancelBrowserAnnotation(activeBrowserTabId):false);
ipcMain.handle('browser:refreshSiteTools',()=>activeBrowserTabId?refreshBrowserSiteTools(activeBrowserTabId):[]);
ipcMain.handle('browser:executeSiteTool',async(_e,{tabId,name,input}={})=>{
  const id=tabId||activeBrowserTabId;
  if(!id)throw new Error('No browser tab is active.');
  return executeBrowserSiteTool(id,name,input);
});
ipcMain.handle('browser:navigate',async(_e,input)=>{
  const view=ensureBrowserView();
  const target=normalizeBrowserUrl(input);
  if(process.platform==='win32'&&activeBrowserTabId){
    browserUrls.set(activeBrowserTabId,target);
    browserTitles.set(activeBrowserTabId,'New tab');
    browserFavicons.delete(activeBrowserTabId);
    emitBrowserState();
  }
  try{
    await view.webContents.loadURL(target);
  }catch(error){
    if(process.platform==='win32'&&activeBrowserTabId)browserErrors.set(activeBrowserTabId,{
      type:'load',
      description:String(error?.message||'This page could not be loaded.'),
      url:target
    });
  }
  emitBrowserState();
  return browserSnapshot();
});
ipcMain.handle('browser:setBounds',(_e,bounds)=>{setBrowserBounds(bounds);return true});
ipcMain.handle('browser:back',()=>{browserGoBack(activeBrowserEntry()?.webContents);return browserSnapshot()});
ipcMain.handle('browser:forward',()=>{browserGoForward(activeBrowserEntry()?.webContents);return browserSnapshot()});
ipcMain.handle('browser:reload',()=>{
  const entry=activeBrowserEntry();
  if(entry&&!entry.webContents.isDestroyed()){
    if(activeBrowserTabId)browserErrors.delete(activeBrowserTabId);
    entry.webContents.reload();
    emitBrowserState();
  }
  return browserSnapshot();
});
ipcMain.handle('browser:close',()=>{hideBrowserView();return true});

ipcMain.handle('computer:click',async(_e,{displayId,nx,ny}={})=>{
  if(process.platform!=='win32'&&process.platform!=='darwin'){
    throw new Error('Interactive desktop control is available on Windows and macOS. Linux currently supports screen preview and browser actions.');
  }
  const point=displayPoint(displayId,nx,ny);
  if(process.platform==='darwin')await clickMacPoint(point.x,point.y);
  else await clickWindowsPoint(point.x,point.y);
  return point;
});
ipcMain.handle('computer:clickAndType',async(_e,{displayId,nx,ny,text}={})=>{
  if(process.platform!=='win32'&&process.platform!=='darwin'){
    throw new Error('Interactive desktop control is available on Windows and macOS.');
  }
  const point=displayPoint(displayId,nx,ny);
  if(process.platform==='darwin'){
    await clickMacPoint(point.x,point.y);
    await new Promise(resolve=>setTimeout(resolve,120));
    await pasteMacText(text);
  }else{
    await clickWindowsPoint(point.x,point.y);
    await pasteWindowsText(text);
  }
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
