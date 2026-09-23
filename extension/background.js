let ws=null;
let reconnectTimer=null;
let scanTimer=null;
let browserStateTimer=null;
let heartbeatTimer=null;
let lastProviders=[];
let customProviders=[];
const providerIconCache=new Map();

const HEARTBEAT_MS=20000;
const BRIDGE_WAKE_ALARM='freeai-bridge-wake';
const BRIDGE_WAKE_MINUTES=0.5;

const PROVIDERS={
  chatgpt:{name:'ChatGPT',matches:['https://chatgpt.com/*']},
  claude:{name:'Claude',matches:['https://claude.ai/*']},
  gemini:{name:'Gemini',matches:['https://gemini.google.com/*']},
  deepseek:{name:'DeepSeek',matches:['https://chat.deepseek.com/*']},
  grok:{name:'Grok',matches:['https://grok.com/*']},
  manus:{name:'Manus',matches:['https://manus.im/*','https://www.manus.im/*']}
};

function providerDefinition(providerId){
  return PROVIDERS[providerId]||customProviders.find(item=>item.id===providerId)||null;
}
function providerEntries(){return [...Object.entries(PROVIDERS),...customProviders.map(item=>[item.id,item])]}
function normalizedCustomProvider(input={}){
  const rawUrl=String(input.url||'').trim();
  let parsed;try{parsed=new URL(rawUrl)}catch{throw new Error('Open the AI chat page before adding it.')}
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')throw new Error('Only http/https AI chat pages can be added.');
  const origin=parsed.origin;
  const name=String(input.name||parsed.hostname.replace(/^www\./,'')).trim().slice(0,60);
  if(!name)throw new Error('Enter a name for this AI.');
  const modelName=String(input.modelName||name).trim().slice(0,80)||name;
  const existing=customProviders.find(item=>item.origin===origin);
  return {id:existing?.id||('custom-'+crypto.randomUUID().slice(0,8)),name,modelName,origin,matches:[origin+'/*'],custom:true};
}
async function saveCustomProviders(){await chrome.storage.local.set({freeAiCustomProviders:customProviders})}

function safeSend(message){
  if(ws&&ws.readyState===WebSocket.OPEN){
    try{ws.send(JSON.stringify(message))}catch{}
  }
}

function isWebUrl(value){
  return /^https?:\/\//i.test(String(value||''));
}

function tabMatchesProvider(tab,provider){
  const url=String(tab?.url||'');
  if(!tab?.id||!url||!Array.isArray(provider?.matches))return false;
  return provider.matches.some(pattern=>{
    const prefix=String(pattern||'').replace(/\*+$/,'');
    return !!prefix&&url.startsWith(prefix);
  });
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

async function imageUrlToDataUrl(url){
  const value=String(url||'');
  if(!value)return '';
  if(value.startsWith('data:image/'))return value;
  if(providerIconCache.has(value))return providerIconCache.get(value);
  if(!/^https?:\/\//i.test(value))return '';
  try{
    const response=await fetch(value,{cache:'force-cache'});
    if(!response.ok)return '';
    const type=String(response.headers.get('content-type')||'image/x-icon').split(';')[0]||'image/x-icon';
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!bytes.length||bytes.length>192*1024)return '';
    let binary='';
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    const data='data:'+type+';base64,'+btoa(binary);
    providerIconCache.set(value,data);
    return data;
  }catch{return ''}
}

async function providerIconDataUrl(tab){
  const urls=[];
  if(tab?.favIconUrl)urls.push(String(tab.favIconUrl));
  try{
    const parsed=new URL(String(tab?.url||''));
    if(parsed.protocol==='http:'||parsed.protocol==='https:')urls.push(parsed.origin+'/favicon.ico');
  }catch{}
  for(const url of urls){
    const data=await imageUrlToDataUrl(url);
    if(data)return data;
  }
  return '';
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

async function scanProviders(options={}){
  const probeModels=!!options.probeModels;
  const probeTools=!!options.probeTools;
  const connected=[];
  for(const [providerId,p] of providerEntries()){
    const tabs=await chrome.tabs.query({url:p.matches});
    for(const tab of tabs){
      if(!tab.id)continue;
      try{
        const instanceId=providerId+':'+tab.id;
        const previous=lastProviders.find(item=>item.id===instanceId)||null;
        const ok=await ensureContentScript(tab.id).catch(()=>false);
        if(!ok){
          if(previous){
            connected.push({
              ...previous,
              tabId:tab.id,
              windowId:tab.windowId,
              title:tab.title||previous.title||p.name,
              url:tab.url||previous.url||'',
              favIconUrl:tab.favIconUrl||previous.favIconUrl||'',
              source:'browser'
            });
          }
          continue;
        }
        const capabilities=await sendToTab(tab.id,{type:'freeai:scanCapabilities',provider:providerId,probeModels,probeTools}).catch(()=>({
          mcps:Array.isArray(previous?.mcps)?previous.mcps:[],
          modelOptions:Array.isArray(previous?.modelOptions)?previous.modelOptions:[],
          effortLevels:Array.isArray(previous?.effortLevels)?previous.effortLevels:[],
          activeEffort:previous?.activeEffort||'default',
          effortControl:previous?.effortControl||null,
          fileUpload:previous?.fileUpload===true,
          modelName:previous?.modelName||p.modelName||p.name,
          adapterReady:previous?previous.adapterReady!==false:false,
          adapterIssue:previous?.adapterIssue||'Free AI could not inspect the provider UI.'
        }));
        const modelOptions=Array.isArray(capabilities?.modelOptions)&&capabilities.modelOptions.length?capabilities.modelOptions:(Array.isArray(previous?.modelOptions)?previous.modelOptions:[]);
        const mcps=Array.isArray(capabilities?.mcps)&&capabilities.mcps.length?capabilities.mcps:(Array.isArray(previous?.mcps)?previous.mcps:[]);
        const effortLevels=Array.isArray(capabilities?.effortLevels)&&capabilities.effortLevels.length?capabilities.effortLevels:(Array.isArray(previous?.effortLevels)?previous.effortLevels:[]);
        const iconDataUrl=await providerIconDataUrl(tab)||previous?.iconDataUrl||'';
        connected.push({
          id:instanceId,
          providerId,
          name:p.name,
          tabId:tab.id,
          windowId:tab.windowId,
          title:tab.title||p.name,
          url:tab.url||'',
          favIconUrl:tab.favIconUrl||'',
          iconDataUrl,
          source:'browser',
          adapterReady:capabilities?.adapterReady===true,
          adapterIssue:String(capabilities?.adapterIssue||''),
          modelName:typeof capabilities?.modelName==='string'&&capabilities.modelName.trim()?capabilities.modelName.trim():(previous?.modelName||p.modelName||p.name),
          modelOptions,
          effortLevels,
          effortControl:capabilities?.effortControl||(effortLevels.length>1?'native':previous?.effortControl||null),
          activeEffort:capabilities?.activeEffort||previous?.activeEffort||'default',
          fileUpload:capabilities?.fileUpload===true||previous?.fileUpload===true,
          mcps
        });
      }catch{}
    }
  }

  connected.sort((a,b)=>{
    const provider=String(a.providerId).localeCompare(String(b.providerId));
    if(provider)return provider;
    return Number(a.tabId)-Number(b.tabId);
  });
  lastProviders=connected;
  chrome.storage.local.set({freeAiProviders:connected,freeAiProvidersUpdatedAt:Date.now()}).catch(()=>{});
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

  if(command==='setProviderModel'){
    const tab=await requireBrowserTab(payload.tabId);
    await ensureContentScript(tab.id);
    const result=await sendToTab(tab.id,{type:'freeai:setProviderModel',provider:String(payload.providerId||''),modelName:String(payload.modelName||'')});
    if(result?.error)throw new Error(result.error);
    await scanProviders({probeModels:true});
    return result||{ok:true};
  }

  if(command==='setProviderEffort'){
    const tab=await requireBrowserTab(payload.tabId);
    await ensureContentScript(tab.id);
    const result=await sendToTab(tab.id,{type:'freeai:setProviderEffort',provider:String(payload.providerId||''),effort:String(payload.effort||'default')});
    if(result?.error)throw new Error(result.error);
    await scanProviders({probeModels:true});
    return result||{ok:true};
  }

  throw new Error('Unsupported Browser Use command: '+command);
}

chrome.runtime.onMessage.addListener((m,_sender,sendResponse)=>{
  if(m?.type==='freeai:stream'&&m.id){
    safeSend({type:'stream',id:m.id,text:String(m.text||'')});
    return;
  }
  if(m?.type==='freeai:activity'&&m.id){
    safeSend({type:'activity',id:m.id,text:String(m.text||'')});
    return;
  }
  if(m?.type==='freeai:getStatus'){
    sendResponse({
      bridgeConnected:!!(ws&&ws.readyState===WebSocket.OPEN),
      providers:lastProviders.map(p=>({id:p.id,providerId:p.providerId,name:p.name,modelName:p.modelName,title:p.title,tabId:p.tabId,favIconUrl:p.favIconUrl,iconDataUrl:p.iconDataUrl,custom:!!providerDefinition(p.providerId)?.custom})),
      customProviders:customProviders.map(p=>({id:p.id,name:p.name,modelName:p.modelName,origin:p.origin})),
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
    scanProviders({probeModels:true,probeTools:true}).then(providers=>sendResponse({ok:true,providerCount:providers.length})).catch(err=>sendResponse({ok:false,error:err?.message||String(err)}));
    return true;
  }
  if(m?.type==='freeai:addCustomProvider'){
    (async()=>{
      try{
        const next=normalizedCustomProvider(m.provider||{});
        const index=customProviders.findIndex(item=>item.origin===next.origin);
        if(index>=0)customProviders[index]=next;else customProviders.push(next);
        await saveCustomProviders();
        const providers=await scanProviders({probeModels:true,probeTools:true});
        sendResponse({ok:true,provider:next,providerCount:providers.length});
      }catch(err){sendResponse({ok:false,error:err?.message||String(err)})}
    })();
    return true;
  }
  if(m?.type==='freeai:removeCustomProvider'){
    (async()=>{
      const id=String(m.id||'');
      customProviders=customProviders.filter(item=>item.id!==id);
      await saveCustomProviders().catch(()=>{});
      const providers=await scanProviders();
      sendResponse({ok:true,providerCount:providers.length});
    })();
    return true;
  }
});

async function cancelPrompt(m){
  const entry=lastProviders.find(item=>item.id===m.provider);
  const providerId=String(m.providerId||entry?.providerId||String(m.provider||'').split(':')[0]);
  const provider=providerDefinition(providerId);
  if(!provider)return false;
  const targetTabId=Number(m.tabId||entry?.tabId);
  const preferred=Number.isFinite(targetTabId)?await chrome.tabs.get(targetTabId).catch(()=>null):null;
  const tabs=tabMatchesProvider(preferred,provider)
    ? [preferred]
    : await chrome.tabs.query({url:provider.matches});
  let stopped=false;
  for(const tab of tabs){
    if(!tab.id)continue;
    try{
      const result=await sendToTab(tab.id,{type:'freeai:cancel',id:m.id,provider:providerId});
      stopped=stopped||!!result?.ok;
    }catch{}
  }
  return stopped;
}

async function handlePrompt(m){
  const entry=lastProviders.find(item=>item.id===m.provider);
  const providerId=String(m.providerId||entry?.providerId||String(m.provider||'').split(':')[0]);
  const provider=providerDefinition(providerId);
  if(!provider)throw new Error('Unsupported provider: '+providerId);

  const preferredTabId=Number(m.tabId||entry?.tabId);
  let tabs=[];
  if(Number.isFinite(preferredTabId)){
    const tab=await chrome.tabs.get(preferredTabId).catch(()=>null);
    if(tabMatchesProvider(tab,provider))tabs=[tab];
  }
  if(!tabs.length)tabs=await chrome.tabs.query({url:provider.matches});
  if(!tabs.length)throw new Error(provider.name+' is not open in this browser.');

  let lastError=null;
  for(const tab of [...tabs.filter(t=>t.active),...tabs.filter(t=>!t.active)]){
    if(!tab.id)continue;
    try{
      const result=await sendToTab(tab.id,{
        type:'freeai:prompt',
        id:m.id,
        provider:providerId,
        text:m.text,
        toolRequest:m.toolRequest||null,
        nativeTool:m.nativeTool||null,
        effort:m.effort||'default',
        attachments:Array.isArray(m.attachments)?m.attachments:[]
      });
      if(result?.error)throw new Error(result.error);
      return {...(result||{}),tabId:tab.id,providerId};
    }catch(e){lastError=e}
  }

  throw lastError||new Error('Could not communicate with '+provider.name+'.');
}

function stopHeartbeat(){
  clearInterval(heartbeatTimer);
  heartbeatTimer=null;
}

function startHeartbeat(){
  stopHeartbeat();
  heartbeatTimer=setInterval(()=>{
    if(ws&&ws.readyState===WebSocket.OPEN){
      safeSend({type:'keepalive',at:Date.now()});
    }
  },HEARTBEAT_MS);
}
async function ensureWakeAlarm(){
  try{const existing=await chrome.alarms.get(BRIDGE_WAKE_ALARM);if(!existing)await chrome.alarms.create(BRIDGE_WAKE_ALARM,{periodInMinutes:BRIDGE_WAKE_MINUTES})}catch{}
}
function ensureConnected(){
  if(ws&&ws.readyState===WebSocket.OPEN){safeSend({type:'keepalive',at:Date.now()});return}
  connect();
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
    startHeartbeat();
    safeSend({type:'hello',role:'extension',browserUseVersion:2});
    await Promise.allSettled([scanProviders(),emitBrowserState()]);
  };

  ws.onmessage=async event=>{
    let m;try{m=JSON.parse(event.data)}catch{return}

    if(m.type==='scanProviders'){
      await scanProviders({probeModels:!!m.probeModels,probeTools:!!m.probeTools});
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
        requestedTool:result?.requestedTool||null,
        requestedNativeTool:result?.requestedNativeTool||null,
        sources:Array.isArray(result?.sources)?result.sources:[]
      });
      await scanProviders();
    }catch(err){
      safeSend({type:'response',id:m.id,error:err?.message||String(err)});
    }
  };

  ws.onclose=()=>{
    stopHeartbeat();
    ws=null;
    scheduleReconnect();
  };

  ws.onerror=()=>{try{ws?.close()}catch{}};
}

function scheduleScan(delay=500){
  clearTimeout(scanTimer);
  scanTimer=setTimeout(()=>scanProviders().catch(()=>{}),delay);
}

chrome.alarms.onAlarm.addListener(alarm=>{if(alarm?.name!==BRIDGE_WAKE_ALARM)return;ensureConnected()});

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
chrome.runtime.onStartup.addListener(()=>{ensureWakeAlarm()});
chrome.runtime.onInstalled.addListener(()=>{ensureWakeAlarm()});

chrome.storage.local.get(['freeAiProviders','freeAiCustomProviders']).then(state=>{
  if(Array.isArray(state?.freeAiProviders))lastProviders=state.freeAiProviders;
  if(Array.isArray(state?.freeAiCustomProviders))customProviders=state.freeAiCustomProviders.filter(item=>item&&item.id&&item.origin&&Array.isArray(item.matches));
}).catch(()=>{}).finally(()=>{ensureWakeAlarm();ensureConnected()});
