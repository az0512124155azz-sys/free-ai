import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './styles.css';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL;
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey):null;
const isDesktop=!!window.desktopApi;

const providerNames={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',deepseek:'DeepSeek',grok:'Grok',manus:'Manus'};

function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
function randomKey(){const b=new Uint8Array(32);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}

function App(){
  const [session,setSession]=useState(null);
  const [status,setStatus]=useState({extension:false,relay:false,providers:[]});
  const [selected,setSelected]=useState(null);
  const [messages,setMessages]=useState([]);
  const [prompt,setPrompt]=useState('');
  const [busy,setBusy]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [modelMenu,setModelMenu]=useState(false);
  const [toolsOpen,setToolsOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [history,setHistory]=useState(()=>readJSON('history',[]));
  const [settings,setSettings]=useState(()=>({
    relayUrl:localStorage.getItem('relayUrl')||'',
    pairKey:localStorage.getItem('pairKey')||''
  }));

  useEffect(()=>{
    if(!supabase){setSession({user:{email:'Local workspace'}});return}
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!isDesktop)return;
    window.desktopApi.getStatus().then(setStatus);
    const off=window.desktopApi.onStatus(setStatus);
    window.desktopApi.scanProviders?.();
    return off;
  },[]);

  const connected=useMemo(()=>Array.isArray(status.providers)?status.providers:[],[status]);
  useEffect(()=>{
    if(selected&&!connected.some(p=>p.id===selected.id)) setSelected(null);
  },[connected]);

  function newChat(){
    setMessages([]);
    setPrompt('');
    setSelected(null);
    setModelMenu(false);
  }

  function saveHistory(next){
    setHistory(next);
    localStorage.setItem('history',JSON.stringify(next.slice(0,30)));
  }

  async function send(){
    const text=prompt.trim();
    if(!text||busy)return;
    if(!selected){setModelMenu(true);return}
    setBusy(true);
    setPrompt('');
    setMessages(m=>[...m,{role:'user',text}]);
    if(messages.length===0){
      const title=text.length>42?text.slice(0,42)+'…':text;
      saveHistory([{id:crypto.randomUUID(),title,provider:selected.id},...history]);
    }
    try{
      let r;
      if(isDesktop){
        r=await window.desktopApi.sendPrompt({provider:selected.id,text});
      }else{
        r=await sendRemote(settings.relayUrl,settings.pairKey,selected.id,text);
      }
      setMessages(m=>[...m,{role:'assistant',text:r.text||r,provider:selected.id}]);
    }catch(e){
      setMessages(m=>[...m,{role:'error',text:e.message||String(e)}]);
    }finally{setBusy(false)}
  }

  async function saveSettings(next=settings){
    localStorage.setItem('relayUrl',next.relayUrl);
    localStorage.setItem('pairKey',next.pairKey);
    setSettings(next);
    if(isDesktop) setStatus(await window.desktopApi.configureRelay(next));
  }

  if(session===null)return <div className="splash">Free AI</div>;

  return <div className={'app '+(!sidebarOpen?'sidebarCollapsed':'')}>
    <aside className="sidebar">
      <div className="sideTop">
        <button className="iconBtn" onClick={()=>setSidebarOpen(false)} title="Hide sidebar">☰</button>
        <button className="iconBtn" onClick={newChat} title="New chat">✎</button>
      </div>
      <button className="newChatBtn" onClick={newChat}><span>✎</span> New chat</button>
      <div className="sideSectionLabel">Chats</div>
      <div className="chatHistory">
        {history.length===0?<div className="emptyHistory">Your conversations will appear here</div>:
          history.map(h=><button key={h.id} className="historyItem"><span>{h.title}</span></button>)
        }
      </div>
      <div className="sideBottom">
        <button className="sideAction" onClick={()=>setSettingsOpen(true)}><span>⚙</span><div><b>Settings</b><small>{status.extension?'Browser connected':'Browser not connected'}</small></div></button>
        <div className="profileRow"><div className="avatar">{(session.user?.email||'U')[0].toUpperCase()}</div><div className="profileText"><b>{session.user?.email||'Local workspace'}</b><small>Free AI</small></div></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        {!sidebarOpen&&<button className="iconBtn" onClick={()=>setSidebarOpen(true)}>☰</button>}
        <div className="modelWrap">
          <button className="modelTrigger" onClick={()=>setModelMenu(v=>!v)}>
            <span>{selected?(selected.name||providerNames[selected.id]||selected.id):'Select a model'}</span>
            <span className="chev">⌄</span>
          </button>
          {modelMenu&&<div className="modelMenu">
            <div className="menuTitle">Models available on this computer</div>
            {connected.length===0?
              <div className="noModels">
                <b>No models connected</b>
                <span>Open ChatGPT, Claude, Gemini, DeepSeek, Grok or Manus in Chrome and keep the Free AI extension enabled.</span>
                <button onClick={()=>window.desktopApi?.scanProviders?.()}>Scan again</button>
              </div>:
              connected.map(p=><button key={p.id} className={'modelOption '+(selected?.id===p.id?'active':'')} onClick={()=>{setSelected(p);setModelMenu(false)}}>
                <div className={'providerDot '+p.id}></div>
                <div><b>{p.name||providerNames[p.id]||p.id}</b><small>Browser session</small></div>
                {selected?.id===p.id&&<span className="check">✓</span>}
              </button>)
            }
          </div>}
        </div>
        <div className="topActions">
          <div className={'statusPill '+(status.extension?'online':'offline')}><span></span>{status.extension?'Chrome connected':'Chrome offline'}</div>
          <button className="iconBtn">⋯</button>
        </div>
      </header>

      <section className="conversation">
        {messages.length===0?
          <div className="welcome">
            <div className="orb">✦</div>
            <h1>{selected?'How can I help?':'Choose a model to start'}</h1>
            <p>{selected?'You are chatting through your existing browser session.':'Free AI only shows models that are actually connected on your computer.'}</p>
            <div className="suggestions">
              <button onClick={()=>setPrompt('Help me plan a project')}>Plan a project</button>
              <button onClick={()=>setPrompt('Review my code and suggest improvements')}>Review code</button>
              <button onClick={()=>setPrompt('Research this topic and compare options')}>Research</button>
              <button onClick={()=>setToolsOpen(true)}>Use tools</button>
            </div>
          </div>:
          <div className="messages">
            {messages.map((m,i)=><div key={i} className={'messageRow '+m.role}>
              <div className="messageInner">
                <div className="messageLabel">{m.role==='user'?'You':m.role==='error'?'Error':(selected?.name||providerNames[selected?.id]||'AI')}</div>
                <div className="messageText">{m.text}</div>
              </div>
            </div>)}
          </div>
        }
      </section>

      <div className="composerZone">
        <div className="composer">
          <textarea
            value={prompt}
            onChange={e=>setPrompt(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
            placeholder={selected?'Message '+(selected.name||providerNames[selected.id]||'AI'):'Select a connected model first'}
          />
          <div className="composerBar">
            <div className="composerLeft">
              <button className="roundBtn" onClick={()=>setToolsOpen(v=>!v)}>＋</button>
              <button className="toolBtn" onClick={()=>setToolsOpen(v=>!v)}>⌘ Tools</button>
              <button className="toolBtn">▣ Computer</button>
            </div>
            <button className={'sendBtn '+(prompt.trim()&&selected?'ready':'')} disabled={!prompt.trim()||!selected||busy} onClick={send}>{busy?'…':'↑'}</button>
          </div>
          {toolsOpen&&<div className="toolsMenu">
            <button>📎 Add files</button>
            <button>⌘ MCP tools</button>
            <button>▣ Use computer</button>
            <button>◉ Connected apps</button>
          </div>}
        </div>
        <div className="disclaimer">Free AI can make mistakes. Check important information.</div>
      </div>
    </main>

    {settingsOpen&&<div className="modalBackdrop" onMouseDown={()=>setSettingsOpen(false)}>
      <div className="settingsModal" onMouseDown={e=>e.stopPropagation()}>
        <div className="settingsHeader"><div><h2>Settings</h2><p>Connections and remote access</p></div><button className="iconBtn" onClick={()=>setSettingsOpen(false)}>×</button></div>
        <div className="settingsGrid">
          <div className="settingCard">
            <div><b>Chrome extension</b><small>Models are detected from your open browser sessions.</small></div>
            <span className={'state '+(status.extension?'good':'bad')}>{status.extension?'Connected':'Disconnected'}</span>
          </div>
          <label>Relay URL<input value={settings.relayUrl} onChange={e=>setSettings({...settings,relayUrl:e.target.value})} placeholder="wss://your-relay.example.com"/></label>
          <label>Android pairing API key<div className="keyRow"><input value={settings.pairKey} onChange={e=>setSettings({...settings,pairKey:e.target.value})}/><button onClick={()=>setSettings({...settings,pairKey:randomKey()})}>Generate</button></div></label>
          <button className="saveBtn" onClick={()=>saveSettings()}>Save changes</button>
        </div>
      </div>
    </div>}
  </div>
}

function sendRemote(url,key,provider,text){
  return new Promise((resolve,reject)=>{
    if(!url||!key)return reject(new Error('Set the relay URL and pairing key in Settings first.'));
    const ws=new WebSocket(url),id=crypto.randomUUID();
    const timer=setTimeout(()=>{try{ws.close()}catch{};reject(new Error('Desktop did not answer in time.'))},120000);
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',role:'mobile',key}));
    ws.onmessage=e=>{
      let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==='ready')ws.send(JSON.stringify({type:'prompt',id,provider,text}));
      if(m.type==='response'&&m.id===id){clearTimeout(timer);ws.close();m.error?reject(new Error(m.error)):resolve(m)}
    };
    ws.onerror=()=>{clearTimeout(timer);reject(new Error('Cannot connect to relay.'))}
  });
}

createRoot(document.getElementById('root')).render(<App/>);