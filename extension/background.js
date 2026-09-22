let ws=null;
let reconnectTimer=null;
let scanTimer=null;
let browserStateTimer=null;
let lastProviders=[];

const PROVIDERS={
  chatgpt:{name:'ChatGPT',matches:['https://chatgpt.com/*']},
  claude:{name:'Claude',matches:['https://claude.ai/*']},
  gemini:{name:'Gemini',matches:['https://gemini.google.com/*']},
  deepseek:{name:'DeepSeek',matches:['https://chat.deepseek.com/*']},
  grok:{name:'Grok',matches:['https://grok.com/*']},
  manus:{name:'Manus',matches:['https://manus.im/*','https://www.manus.im/*']}
};

function safeSend(message){
  if(ws&&ws.readyState===WebSocket.OPEN){
    try{ws.send(JSON.stringify(message))}catch{}
  }
}

function isWebUrl(value){
  return /^https?:\/\//i.test(String(value||''));
}

function safeTab(tab){
  return {
    id:Number(tab?.id),
    windowId:Number(tab?.windowId),
    active:!!tab?.active,
    audible:!!tab?.audible,
    pinned:!!tab?.pinned,
    status:String(tab?.status||''),
    title:String(tab?.title||''),
    url:String(tab?.url||''),
    favIconUrl:String(tab?.favIconUrl||''),
    controlled:isWebUrl(tab?.url)
  };
}

async function sendToTab(tabId,message){
  try{
    return await chrome.tabs.sendMessage(tabId,message);
  }catch(firstError){
    try{
      await chrome.scripting.executeScript({target:{tabId},files:['content.js']});
      await new Promise(r=>setTimeout(r,120));
      return await chrome.tabs.sendMessage(tabId,message);
    }catch(secondError){
      throw secondError||firstError;
    }
  }
}

async function ensureContentScript(tabId){
  const result=await sendToTab(tabId,{type:'freeai:ping'});
  return result?.ok===true;
}

async function scanProviders(){
  const connected=[];
  for(const [id,p] of Object.entries(PROVIDERS)){
    const tabs=await chrome.tabs.query({url:p.matches});
    if(!tabs.length)continue;

    let chosen=null;
    let capabilities={mcps:[]};

    for(const tab of tabs){
      if(!tab.id)continue;
      try{
        const ok=await ensureContentScript(tab.id);
        if(!ok)continue;
        const result=await chrome.tabs.sendMessage(tab.id,{type:'freeai:scanCapabilities'}).catch(()=>({mcps:[]}));
        chosen=tab;
        capabilities=result||{mcps:[]};
        if(tab.active)break;
      }catch{}
    }

    if(!chosen)continue;

    connected.push({
      id,
      name:p.name,
      tabId:chosen.id,
      title:chosen.title||p.name,
      source:'browser',
      modelName:typeof capabilities?.modelName==='string'?capabilities.modelName:'',
      effortLevels:[],
      effortControl:null,
      activeEffort:'default',
      fileUpload:!!capabilities?.fileUpload,
      mcps:Array.isArray(capabilities?.mcps)?capabilities.mcps:[]
    });
  }

  lastProviders=connected;
  safeSend({type:'providers',providers:connected});
  return connected;
}

async function currentBrowserState(){
  const tabs=(await chrome.tabs.query({})).map(safeTab).filter(tab=>Number.isFinite(tab.id));
  const active=(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0]||null;
  return {
    tabs,
    activeTabId:Number.isFinite(active?.id)?active.id:null,
    activeWindowId:Number.isFinite(active?.windowId)?active.windowId:null
  };
}

async function emitBrowserState(){
  try{safeSend({type:'browserState',state:await currentBrowserState()})}catch{}
}

function scheduleBrowserState(delay=120){
  clearTimeout(browserStateTimer);
  browserStateTimer=setTimeout(()=>emitBrowserState(),delay);
}

async function requireBrowserTab(tabId){
  const id=Number(tabId);
  if(!Number.isFinite(id))throw new Error('A valid browser tab is required.');
  const tab=await chrome.tabs.get(id);
  if(!isWebUrl(tab.url))throw new Error('Free AI can control only http/https tabs.');
  return tab;
}

function normalizedWebUrl(value){
  const raw=String(value||'').trim();
  const candidate=/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw;
  const parsed=new URL(candidate);
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')throw new Error('Only http/https pages can be controlled by Browser Use.');
  return parsed.toString();
}

async function browserSnapshot(tabId){
  const tab=await requireBrowserTab(tabId);
  await ensureContentScript(tab.id);
  const page=await sendToTab(tab.id,{type:'freeai:browserSnapshot'});
  if(page?.error)throw new Error(page.error);
  let screenshot='';
  if(tab.active){
    try{screenshot=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'jpeg',quality:70})}catch{}
  }
  return {tab:safeTab(await chrome.tabs.get(tab.id)),page,screenshot};
}

async function handleBrowserRequest(message){
  const command=String(message?.command||'');
  const payload=message?.payload||{};

  if(command==='listTabs')return currentBrowserState();

  if(command==='activateTab'){
    const tab=await requireBrowserTab(payload.tabId);
    await chrome.tabs.update(tab.id,{active:true});
    if(Number.isFinite(tab.windowId))await chrome.windows.update(tab.windowId,{focused:true}).catch(()=>{});
    await emitBrowserState();
    return {tab:safeTab(await chrome.tabs.get(tab.id))};
  }

  if(command==='createTab'){
    const url=normalizedWebUrl(payload.url||'https://www.google.com/');
    const tab=await chrome.tabs.create({url,active:payload.active!==false});
    await emitBrowserState();
    return {tab:safeTab(tab)};
  }

  if(command==='closeTab'){
    const tab=await requireBrowserTab(payload.tabId);
    await chrome.tabs.remove(tab.id);
    await emitBrowserState();
    return {ok:true};
  }

  if(command==='navigate'){
    const tab=await requireBrowserTab(payload.tabId);
    const url=normalizedWebUrl(payload.url);
    const updated=await chrome.tabs.update(tab.id,{url});
    await emitBrowserState();
    return {tab:safeTab(updated)};
  }

  if(command==='snapshot')return browserSnapshot(payload.tabId);

  if(command==='action'){
    const tab=await requireBrowserTab(payload.tabId);
    await ensureContentScript(tab.id);
    const result=await sendToTab(tab.id,{type:'freeai:browserAction',action:payload.action||{}});
    await new Promise(r=>setTimeout(r,Math.max(80,Math.min(800,Number(payload.settleMs)||180))));
    return {result,...await browserSnapshot(tab.id)};
  }

  throw new Error('Unsupported Browser Use command: '+command);
}

chrome.runtime.onMessage.addListener((m,_sender,sendResponse)=>{
  if(m?.type==='freeai:stream'&&m.id){
    safeSend({type:'stream',id:m.id,text:String(m.text||'')});
    return;
  }
  if(m?.type==='freeai:getStatus'){
    sendResponse({
      bridgeConnected:!!(ws&&ws.readyState===WebSocket.OPEN),
      providers:lastProviders.map(p=>({id:p.id,name:p.name,title:p.title,tabId:p.tabId})),
      providerCount:lastProviders.length
    });
    return;
  }
  if(m?.type==='freeai:reconnect'){
    connect();
    setTimeout(()=>sendResponse({ok:true}),120);
    return true;
  }
  if(m?.type==='freeai:rescan'){
    scanProviders().then(providers=>sendResponse({ok:true,providerCount:providers.length})).catch(err=>sendResponse({ok:false,error:err?.message||String(err)}));
    return true;
  }
});

async function cancelPrompt(m){
  const provider=PROVIDERS[m.provider];
  if(!provider)return false;
  const tabs=await chrome.tabs.query({url:provider.matches});
  let stopped=false;
  for(const tab of tabs){
    if(!tab.id)continue;
    try{
      const result=await sendToTab(tab.id,{type:'freeai:cancel',id:m.id,provider:m.provider});
      stopped=stopped||!!result?.ok;
    }catch{}
  }
  return stopped;
}

async function handlePrompt(m){
  const provider=PROVIDERS[m.provider];
  if(!provider)throw new Error('Unsupported provider: '+m.provider);

  const tabs=await chrome.tabs.query({url:provider.matches});
  if(!tabs.length)throw new Error(provider.name+' is not open in this browser.');

  let lastError=null;
  for(const tab of [...tabs.filter(t=>t.active),...tabs.filter(t=>!t.active)]){
    if(!tab.id)continue;
    try{
      const result=await sendToTab(tab.id,{
        type:'freeai:prompt',
        id:m.id,
        provider:m.provider,
        text:m.text,
        toolRequest:m.toolRequest||null,
        effort:m.effort||'default',
        attachments:Array.isArray(m.attachments)?m.attachments:[]
      });
      if(result?.error)throw new Error(result.error);
      return result||{};
    }catch(e){lastError=e}
  }

  throw lastError||new Error('Could not communicate with '+provider.name+'.');
}

function scheduleReconnect(){
  clearTimeout(reconnectTimer);
  reconnectTimer=setTimeout(connect,1800);
}

function connect(){
  clearTimeout(reconnectTimer);
  if(ws){
    try{ws.close()}catch{}
    ws=null;
  }

  try{ws=new WebSocket('ws://127.0.0.1:17341')}catch{
    scheduleReconnect();
    return;
  }

  ws.onopen=async()=>{
    safeSend({type:'hello',role:'extension',browserUseVersion:1});
    await Promise.allSettled([scanProviders(),emitBrowserState()]);
  };

  ws.onmessage=async event=>{
    let m;try{m=JSON.parse(event.data)}catch{return}

    if(m.type==='scanProviders'){
      await scanProviders();
      return;
    }
    if(m.type==='scanBrowser'){
      await emitBrowserState();
      return;
    }
    if(m.type==='cancel'){
      await cancelPrompt(m);
      return;
    }
    if(m.type==='browserRequest'&&m.id){
      try{
        const result=await handleBrowserRequest(m);
        safeSend({type:'browserResponse',id:m.id,result});
      }catch(err){
        safeSend({type:'browserResponse',id:m.id,error:err?.message||String(err)});
      }
      return;
    }

    if(m.type!=='prompt')return;

    try{
      const result=await handlePrompt(m);
      safeSend({
        type:'response',
        id:m.id,
        text:result?.text||'',
        requestedTool:result?.requestedTool||null
      });
      await scanProviders();
    }catch(err){
      safeSend({type:'response',id:m.id,error:err?.message||String(err)});
    }
  };

  ws.onclose=()=>{
    ws=null;
    scheduleReconnect();
  };

  ws.onerror=()=>{try{ws?.close()}catch{}};
}

function scheduleScan(delay=500){
  clearTimeout(scanTimer);
  scanTimer=setTimeout(()=>scanProviders().catch(()=>{}),delay);
}

chrome.tabs.onCreated.addListener(()=>{scheduleScan();scheduleBrowserState()});
chrome.tabs.onRemoved.addListener(()=>{scheduleScan(250);scheduleBrowserState(80)});
chrome.tabs.onActivated.addListener(()=>scheduleBrowserState(50));
chrome.tabs.onUpdated.addListener((_id,info)=>{
  if(info.status==='complete'||info.url||info.title){
    scheduleScan();
    scheduleBrowserState();
  }
});
chrome.windows.onFocusChanged.addListener(()=>scheduleBrowserState(50));
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

connect();
