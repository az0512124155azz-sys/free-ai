let ws;
let reconnectTimer;
const PROVIDERS = {
  chatgpt: {name:'ChatGPT', matches:['https://chatgpt.com/*']},
  claude: {name:'Claude', matches:['https://claude.ai/*']},
  gemini: {name:'Gemini', matches:['https://gemini.google.com/*']},
  deepseek: {name:'DeepSeek', matches:['https://chat.deepseek.com/*']},
  grok: {name:'Grok', matches:['https://grok.com/*']},
  manus: {name:'Manus', matches:['https://manus.im/*','https://www.manus.im/*']}
};

function safeSend(message){
  if(ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

async function scanProviders(){
  const connected=[];
  for(const [id,p] of Object.entries(PROVIDERS)){
    const tabs = await chrome.tabs.query({url:p.matches});
    if(!tabs.length) continue;
    const activeTab = tabs.find(t=>t.active) || tabs[0];
    let mcps=[];
    try{
      const result = await chrome.tabs.sendMessage(activeTab.id,{type:'freeai:scanCapabilities'});
      if(Array.isArray(result?.mcps)) mcps=result.mcps;
    }catch{}
    connected.push({id,name:p.name,tabId:activeTab.id,title:activeTab.title||p.name,mcps});
  }
  safeSend({type:'providers',providers:connected});
  return connected;
}

async function connect(){
  clearTimeout(reconnectTimer);
  try{
    ws=new WebSocket('ws://127.0.0.1:17341');
    ws.onopen=async()=>{
      safeSend({type:'hello',role:'extension'});
      await scanProviders();
    };
    ws.onmessage=async e=>{
      let m; try{m=JSON.parse(e.data)}catch{return}
      if(m.type==='scanProviders'){await scanProviders();return}
      if(m.type!=='prompt') return;
      try{
        const provider=PROVIDERS[m.provider];
        if(!provider) throw new Error('Unsupported provider: '+m.provider);
        const tabs=await chrome.tabs.query({url:provider.matches});
        if(!tabs.length) throw new Error(provider.name+' is not open in Chrome.');
        const tab=tabs.find(t=>t.active)||tabs[0];
        const result=await chrome.tabs.sendMessage(tab.id,{type:'freeai:prompt',provider:m.provider,text:m.text,toolRequest:m.toolRequest||null});
        if(result?.error) throw new Error(result.error);
        safeSend({type:'response',id:m.id,text:result?.text||'',usedTool:result?.usedTool||null});
        await scanProviders();
      }catch(err){
        safeSend({type:'response',id:m.id,error:err.message||String(err)});
      }
    };
    ws.onclose=()=>reconnectTimer=setTimeout(connect,1800);
    ws.onerror=()=>{try{ws.close()}catch{}};
  }catch{
    reconnectTimer=setTimeout(connect,1800);
  }
}

chrome.tabs.onCreated.addListener(()=>setTimeout(scanProviders,500));
chrome.tabs.onRemoved.addListener(()=>setTimeout(scanProviders,300));
chrome.tabs.onUpdated.addListener((_id,info)=>{if(info.status==='complete'||info.url)setTimeout(scanProviders,500)});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();