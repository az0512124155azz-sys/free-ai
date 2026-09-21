let ws=null;
let reconnectTimer=null;

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
      mcps:Array.isArray(capabilities?.mcps)?capabilities.mcps:[]
    });
  }

  safeSend({type:'providers',providers:connected});
  return connected;
}

async function handlePrompt(m){
  const provider=PROVIDERS[m.provider];
  if(!provider)throw new Error('Unsupported provider: '+m.provider);

  const tabs=await chrome.tabs.query({url:provider.matches});
  if(!tabs.length)throw new Error(provider.name+' is not open in Chrome.');

  let lastError=null;
  for(const tab of [...tabs.filter(t=>t.active),...tabs.filter(t=>!t.active)]){
    if(!tab.id)continue;
    try{
      const result=await sendToTab(tab.id,{
        type:'freeai:prompt',
        provider:m.provider,
        text:m.text,
        toolRequest:m.toolRequest||null
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
    safeSend({type:'hello',role:'extension'});
    await scanProviders();
  };

  ws.onmessage=async event=>{
    let m;try{m=JSON.parse(event.data)}catch{return}

    if(m.type==='scanProviders'){
      await scanProviders();
      return;
    }

    if(m.type!=='prompt')return;

    try{
      const result=await handlePrompt(m);
      safeSend({
        type:'response',
        id:m.id,
        text:result?.text||'',
        usedTool:result?.usedTool||null
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

let scanTimer=null;
function scheduleScan(delay=500){
  clearTimeout(scanTimer);
  scanTimer=setTimeout(()=>scanProviders().catch(()=>{}),delay);
}

chrome.tabs.onCreated.addListener(()=>scheduleScan());
chrome.tabs.onRemoved.addListener(()=>scheduleScan(250));
chrome.tabs.onUpdated.addListener((_id,info)=>{
  if(info.status==='complete'||info.url)scheduleScan();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

connect();
