import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {Capacitor} from '@capacitor/core';
import {App as CapacitorApp} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import './styles.css';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL;
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=supabaseUrl&&supabaseKey
  ? createClient(supabaseUrl,supabaseKey,{
      auth:{
        flowType:'pkce',
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:false
      }
    })
  : null;
const isDesktop=!!window.desktopApi;
const isNative=Capacitor.isNativePlatform();
const AUTH_CALLBACK_URL='freeai://auth/callback';
const providerNames={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',deepseek:'DeepSeek',grok:'Grok',manus:'Manus'};

function readJSON(key,fallback){
  try{
    const value=JSON.parse(localStorage.getItem(key)||'null');
    return value??fallback;
  }catch{return fallback}
}

function randomKey(){
  const b=new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function modelLabel(model){
  return model?.name||providerNames[model?.id]||model?.model||'AI';
}

function App(){
  const [authReady,setAuthReady]=useState(false);
  const [session,setSession]=useState(null);
  const [status,setStatus]=useState({extension:false,relay:false,providers:[]});
  const [selected,setSelected]=useState(null);
  const [selectedTool,setSelectedTool]=useState(null);
  const [messages,setMessages]=useState([]);
  const [prompt,setPrompt]=useState('');
  const [busy,setBusy]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [modelMenu,setModelMenu]=useState(false);
  const [toolsOpen,setToolsOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [computerOpen,setComputerOpen]=useState(false);
  const [screens,setScreens]=useState([]);
  const [screenLoading,setScreenLoading]=useState(false);
  const [chats,setChats]=useState(()=>readJSON('freeai.chats',[]));
  const [currentChatId,setCurrentChatId]=useState(null);
  const [settings,setSettings]=useState(()=>({
    relayUrl:localStorage.getItem('relayUrl')||'',
    pairKey:localStorage.getItem('pairKey')||''
  }));
  const [apiDraft,setApiDraft]=useState({name:'',baseUrl:'',model:'',apiKey:''});
  const [apiError,setApiError]=useState('');
  const fileRef=useRef(null);

  useEffect(()=>{
    if(!supabase){
      setSession({user:{email:'Local workspace'}});
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      setAuthReady(true);
    }).catch(()=>{
      setSession(null);
      setAuthReady(true);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      setSession(next);
      setAuthReady(true);
    });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!isDesktop)return;
    let active=true;
    window.desktopApi.getStatus().then(s=>active&&setStatus(s)).catch(()=>{});
    const off=window.desktopApi.onStatus(s=>active&&setStatus(s));
    window.desktopApi.configureRelay(settings).then(s=>active&&setStatus(s)).catch(()=>{});
    window.desktopApi.scanProviders().catch(()=>{});
    return()=>{
      active=false;
      off?.();
    };
  },[]);

  useEffect(()=>{
    if(isDesktop)return;
    if(!settings.relayUrl||!settings.pairKey){
      setStatus({extension:false,relay:false,providers:[]});
      return;
    }

    let stopped=false;
    let socket=null;
    let retry=null;

    const connect=()=>{
      if(stopped)return;
      try{socket=new WebSocket(settings.relayUrl)}catch{
        retry=setTimeout(connect,3000);
        return;
      }

      socket.onopen=()=>{
        socket.send(JSON.stringify({type:'hello',role:'mobile',key:settings.pairKey}));
      };

      socket.onmessage=event=>{
        let m;try{m=JSON.parse(event.data)}catch{return}

        if(m.type==='ready'){
          const ps=m.providerStatus;
          if(ps){
            setStatus({...ps,relay:true});
          }else{
            setStatus(s=>({...s,relay:true}));
          }
          socket.send(JSON.stringify({type:'getProviderStatus'}));
          return;
        }

        if(m.type==='providerStatus'){
          setStatus({...m,relay:true});
        }
      };

      socket.onclose=()=>{
        setStatus({extension:false,relay:false,providers:[]});
        if(!stopped)retry=setTimeout(connect,3000);
      };

      socket.onerror=()=>{};
    };

    connect();

    return()=>{
      stopped=true;
      clearTimeout(retry);
      try{socket?.close()}catch{}
    };
  },[settings.relayUrl,settings.pairKey]);

  const connected=useMemo(
    ()=>Array.isArray(status.providers)?status.providers:[],
    [status.providers]
  );

  const mcpTools=useMemo(()=>{
    const tools=[];
    for(const p of connected){
      if(p.source!=='browser'||!Array.isArray(p.mcps))continue;
      for(const mcp of p.mcps){
        tools.push({
          key:p.id+'::'+mcp,
          mcp,
          ownerProviderId:p.id,
          ownerName:modelLabel(p)
        });
      }
    }
    return tools;
  },[connected]);

  useEffect(()=>{
    if(!selected)return;
    const fresh=connected.find(p=>p.id===selected.id&&p.source===selected.source);
    if(!fresh){
      setSelected(null);
      setSelectedTool(null);
    }else if(fresh!==selected){
      setSelected(fresh);
    }
  },[connected]);

  function storeChats(next){
    const trimmed=next.slice(0,50);
    setChats(trimmed);
    localStorage.setItem('freeai.chats',JSON.stringify(trimmed));
  }

  function saveCurrentChat(nextMessages,model=selected){
    if(!model||!nextMessages.length)return;

    const firstUser=nextMessages.find(m=>m.role==='user')?.text||'New chat';
    const title=firstUser.length>46?firstUser.slice(0,46)+'…':firstUser;
    let id=currentChatId;

    if(!id){
      id=crypto.randomUUID();
      setCurrentChatId(id);
    }

    setChats(prev=>{
      const existing=prev.find(c=>c.id===id);
      const chat={
        id,
        title,
        providerId:model.id,
        source:model.source,
        modelName:modelLabel(model),
        messages:nextMessages,
        updatedAt:Date.now()
      };
      const next=[chat,...prev.filter(c=>c.id!==id)];
      localStorage.setItem('freeai.chats',JSON.stringify(next.slice(0,50)));
      return next.slice(0,50);
    });
  }

  function newChat(){
    setCurrentChatId(null);
    setMessages([]);
    setPrompt('');
    setSelected(null);
    setSelectedTool(null);
    setModelMenu(false);
    setToolsOpen(false);
  }

  function openChat(chat){
    setCurrentChatId(chat.id);
    setMessages(Array.isArray(chat.messages)?chat.messages:[]);
    const model=connected.find(p=>p.id===chat.providerId&&p.source===chat.source)||null;
    setSelected(model);
    setSelectedTool(null);
    setModelMenu(false);
  }

  async function send(){
    const text=prompt.trim();
    if(!text||busy)return;
    if(!selected){
      setModelMenu(true);
      return;
    }

    setBusy(true);
    setPrompt('');

    const userMessage={role:'user',text};
    const withUser=[...messages,userMessage];
    setMessages(withUser);
    saveCurrentChat(withUser,selected);

    try{
      const payload={
        provider:selected.id,
        source:selected.source||'browser',
        text,
        toolRequest:selectedTool?{
          mcp:selectedTool.mcp,
          ownerProviderId:selectedTool.ownerProviderId
        }:null
      };

      const result=isDesktop
        ? await window.desktopApi.sendPrompt(payload)
        : await sendRemote(settings.relayUrl,settings.pairKey,payload);

      const assistantMessage={
        role:'assistant',
        text:result?.text||String(result||''),
        provider:selected.id
      };
      const next=[...withUser,assistantMessage];
      setMessages(next);
      saveCurrentChat(next,selected);
    }catch(e){
      const errorMessage={role:'error',text:e?.message||String(e)};
      const next=[...withUser,errorMessage];
      setMessages(next);
      saveCurrentChat(next,selected);
    }finally{
      setBusy(false);
    }
  }

  async function saveSettings(){
    const relayUrl=settings.relayUrl.trim();
    const pairKey=settings.pairKey.trim();
    localStorage.setItem('relayUrl',relayUrl);
    localStorage.setItem('pairKey',pairKey);
    const next={relayUrl,pairKey};
    setSettings(next);
    if(isDesktop){
      try{setStatus(await window.desktopApi.configureRelay(next))}catch{}
    }
  }

  async function addApiConnection(){
    if(!isDesktop)return;
    setApiError('');
    try{
      await window.desktopApi.addApiConnection(apiDraft);
      setApiDraft({name:'',baseUrl:'',model:'',apiKey:''});
    }catch(e){
      setApiError(e?.message||String(e));
    }
  }

  async function removeApiConnection(id){
    if(!isDesktop)return;
    try{await window.desktopApi.removeApiConnection(id)}catch{}
  }

  async function openComputer(){
    setToolsOpen(false);
    setComputerOpen(true);
    setScreenLoading(true);
    setScreens([]);
    if(!isDesktop){
      setScreenLoading(false);
      return;
    }
    try{
      const result=await window.desktopApi.captureScreens();
      setScreens(Array.isArray(result)?result:[]);
    }catch{
      setScreens([]);
    }finally{
      setScreenLoading(false);
    }
  }

  async function attachFiles(event){
    const files=[...(event.target.files||[])];
    if(!files.length)return;
    const chunks=[];

    for(const file of files){
      if(file.size>2*1024*1024){
        chunks.push('[Skipped '+file.name+': file is larger than 2 MB]');
        continue;
      }
      const textLike=
        file.type.startsWith('text/')||
        /\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|py|java|kt|swift|c|cpp|h|hpp|sh|ps1|sql)$/i.test(file.name);

      if(!textLike){
        chunks.push('[Attached '+file.name+': binary/image upload to browser models is not enabled yet]');
        continue;
      }

      try{
        const body=await file.text();
        chunks.push('[File: '+file.name+']\n'+body);
      }catch{
        chunks.push('[Could not read '+file.name+']');
      }
    }

    if(chunks.length){
      setPrompt(p=>(p?p+'\n\n':'')+chunks.join('\n\n'));
    }
    event.target.value='';
  }

  if(!authReady)return <div className="splash">Free AI</div>;
  if(!session&&supabase)return <Auth/>;

  return <div className={'app '+(!sidebarOpen?'sidebarCollapsed':'')}>
    <aside className="sidebar">
      <div className="sideTop">
        <button className="iconBtn" onClick={()=>setSidebarOpen(false)} title="Hide sidebar">☰</button>
        <button className="iconBtn" onClick={newChat} title="New chat">✎</button>
      </div>

      <button className="newChatBtn" onClick={newChat}><span>✎</span> New chat</button>

      <div className="sideSectionLabel">Chats</div>
      <div className="chatHistory">
        {chats.length===0
          ? <div className="emptyHistory">Your conversations will appear here</div>
          : chats.map(chat=>
              <button
                key={chat.id}
                className={'historyItem '+(currentChatId===chat.id?'active':'')}
                onClick={()=>openChat(chat)}
                title={chat.title}
              >
                <span>{chat.title}</span>
              </button>
            )
        }
      </div>

      <div className="sideBottom">
        <button className="sideAction" onClick={()=>setSettingsOpen(true)}>
          <span>⚙</span>
          <div>
            <b>Settings</b>
            <small>{isDesktop
              ? (status.extension?'Chrome connected':'Chrome not connected')
              : (status.relay?'Desktop connected':'Desktop not connected')
            }</small>
          </div>
        </button>

        <div className="profileRow">
          <div className="avatar">{(session?.user?.email||'L')[0].toUpperCase()}</div>
          <div className="profileText">
            <b>{session?.user?.email||'Local workspace'}</b>
            <small>{supabase?'Signed in':'Authentication not configured'}</small>
          </div>
        </div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        {!sidebarOpen&&<button className="iconBtn" onClick={()=>setSidebarOpen(true)}>☰</button>}

        <div className="modelWrap">
          <button className="modelTrigger" onClick={()=>setModelMenu(v=>!v)}>
            <span>{selected?modelLabel(selected):'Select a model'}</span>
            <span className="chev">⌄</span>
          </button>

          {modelMenu&&<div className="modelMenu">
            <div className="menuTitle">Available models</div>

            {connected.length===0
              ? <div className="noModels">
                  <b>No models connected</b>
                  <span>{isDesktop
                    ? 'Open a supported AI in Chrome and enable the Free AI extension, or add an API connection in Settings.'
                    : 'Pair this device with the desktop app first.'
                  }</span>
                  {isDesktop&&<button onClick={()=>window.desktopApi.scanProviders()}>Scan again</button>}
                </div>
              : connected.map(p=>
                  <button
                    key={(p.source||'browser')+':'+p.id}
                    className={'modelOption '+(selected?.id===p.id&&selected?.source===p.source?'active':'')}
                    onClick={()=>{setSelected(p);setSelectedTool(null);setModelMenu(false)}}
                  >
                    <div className={'providerDot '+(p.source==='api'?'api':p.id)}></div>
                    <div>
                      <b>{modelLabel(p)}</b>
                      <small>{p.source==='api'?'Desktop API · '+(p.model||'model'):'Browser session'}</small>
                    </div>
                    {selected?.id===p.id&&selected?.source===p.source&&<span className="check">✓</span>}
                  </button>
                )
            }
          </div>}
        </div>

        <div className="topActions">
          <div className={'statusPill '+((isDesktop?status.extension:status.relay)?'online':'offline')}>
            <span></span>
            {isDesktop
              ? (status.extension?'Chrome connected':'Chrome offline')
              : (status.relay?'Desktop connected':'Desktop offline')
            }
          </div>
          <button className="iconBtn" onClick={()=>setSettingsOpen(true)}>⋯</button>
        </div>
      </header>

      <section className="conversation">
        {messages.length===0
          ? <div className="welcome">
              <div className="orb">✦</div>
              <h1>{selected?'How can I help?':'Choose a model to start'}</h1>
              <p>{selected
                ? (selected.source==='api'
                    ? 'This conversation uses an API connection stored on your desktop.'
                    : 'This conversation uses your existing browser session.')
                : 'Only models that are actually connected are shown.'
              }</p>
              <div className="suggestions">
                <button onClick={()=>setPrompt('Help me plan a project')}>Plan a project</button>
                <button onClick={()=>setPrompt('Review my code and suggest improvements')}>Review code</button>
                <button onClick={()=>setPrompt('Research this topic and compare the options')}>Research</button>
                <button onClick={()=>setToolsOpen(true)}>Use tools</button>
              </div>
            </div>
          : <div className="messages">
              {messages.map((m,i)=>
                <div key={i} className={'messageRow '+m.role}>
                  <div className="messageInner">
                    <div className="messageLabel">{m.role==='user'?'You':m.role==='error'?'Error':modelLabel(selected)}</div>
                    <div className="messageText">{m.text}</div>
                  </div>
                </div>
              )}
            </div>
        }
      </section>

      <div className="composerZone">
        <div className="composer">
          {selectedTool&&
            <div className="toolChip">
              <span>MCP: {selectedTool.mcp}</span>
              <small>via {selectedTool.ownerName}</small>
              <button onClick={()=>setSelectedTool(null)}>×</button>
            </div>
          }

          <textarea
            value={prompt}
            onChange={e=>setPrompt(e.target.value)}
            onKeyDown={e=>{
              if(e.key==='Enter'&&!e.shiftKey){
                e.preventDefault();
                send();
              }
            }}
            placeholder={selected?'Message '+modelLabel(selected):'Select a connected model first'}
          />

          <div className="composerBar">
            <div className="composerLeft">
              <button className="roundBtn" onClick={()=>setToolsOpen(v=>!v)}>＋</button>
              <button className="toolBtn" onClick={()=>setToolsOpen(v=>!v)}>⌘ Tools</button>
              <button className="toolBtn" onClick={openComputer}>▣ Computer</button>
            </div>
            <button
              className={'sendBtn '+(prompt.trim()&&selected?'ready':'')}
              disabled={!prompt.trim()||!selected||busy}
              onClick={send}
            >{busy?'…':'↑'}</button>
          </div>

          <input ref={fileRef} type="file" multiple hidden onChange={attachFiles}/>

          {toolsOpen&&<div className="toolsMenu">
            <button onClick={()=>fileRef.current?.click()}>📎 Add text/code files</button>
            <button onClick={openComputer}>▣ View computer screens</button>
            <div className="toolsDivider"></div>
            <div className="toolsLabel">Installed MCP / connectors</div>
            {mcpTools.length===0
              ? <div className="toolsEmpty">No installed MCP tools were detected in the connected browser models.</div>
              : mcpTools.map(tool=>
                  <button
                    key={tool.key}
                    onClick={()=>{setSelectedTool(tool);setToolsOpen(false)}}
                  >
                    ⌘ {tool.mcp}<small>{tool.ownerName}</small>
                  </button>
                )
            }
          </div>}
        </div>

        <div className="disclaimer">Free AI can make mistakes. Check important information.</div>
      </div>
    </main>

    {settingsOpen&&
      <div className="modalBackdrop" onMouseDown={()=>setSettingsOpen(false)}>
        <div className="settingsModal" onMouseDown={e=>e.stopPropagation()}>
          <div className="settingsHeader">
            <div>
              <h2>Settings</h2>
              <p>Connections, APIs and remote access</p>
            </div>
            <button className="iconBtn" onClick={()=>setSettingsOpen(false)}>×</button>
          </div>

          <div className="settingsGrid">
            <div className="settingCard">
              <div>
                <b>{isDesktop?'Chrome extension':'Paired desktop'}</b>
                <small>{isDesktop
                  ? 'Browser models are detected automatically.'
                  : 'Android uses the models and APIs available on your desktop.'
                }</small>
              </div>
              <span className={'state '+((isDesktop?status.extension:status.relay)?'good':'bad')}>
                {(isDesktop?status.extension:status.relay)?'Connected':'Disconnected'}
              </span>
            </div>

            <label>
              Relay URL
              <input
                value={settings.relayUrl}
                onChange={e=>setSettings({...settings,relayUrl:e.target.value})}
                placeholder="wss://your-relay.example.com"
              />
            </label>

            <label>
              Android pairing API key
              <div className="keyRow">
                <input
                  value={settings.pairKey}
                  onChange={e=>setSettings({...settings,pairKey:e.target.value})}
                  placeholder="Generate a key on desktop"
                />
                {isDesktop&&<button onClick={()=>setSettings({...settings,pairKey:randomKey()})}>Generate</button>}
              </div>
            </label>

            <button className="saveBtn" onClick={saveSettings}>Save connection</button>

            <div className="settingsDivider"></div>

            <div className="settingsSectionTitle">
              <div>
                <b>API models</b>
                <small>{isDesktop
                  ? 'Keys stay on this computer and are never sent to Android.'
                  : 'Add or remove API models from the desktop app.'
                }</small>
              </div>
            </div>

            {connected.filter(p=>p.source==='api').map(api=>
              <div className="apiRow" key={api.id}>
                <div>
                  <b>{modelLabel(api)}</b>
                  <small>{api.model} · {api.baseUrl}</small>
                </div>
                {isDesktop&&<button onClick={()=>removeApiConnection(api.id)}>Remove</button>}
              </div>
            )}

            {isDesktop&&<>
              <div className="apiForm">
                <input
                  placeholder="Display name (e.g. Local Llama)"
                  value={apiDraft.name}
                  onChange={e=>setApiDraft({...apiDraft,name:e.target.value})}
                />
                <input
                  placeholder="Base URL (e.g. http://127.0.0.1:1234/v1)"
                  value={apiDraft.baseUrl}
                  onChange={e=>setApiDraft({...apiDraft,baseUrl:e.target.value})}
                />
                <input
                  placeholder="Model ID"
                  value={apiDraft.model}
                  onChange={e=>setApiDraft({...apiDraft,model:e.target.value})}
                />
                <input
                  type="password"
                  placeholder="API key (optional for local servers)"
                  value={apiDraft.apiKey}
                  onChange={e=>setApiDraft({...apiDraft,apiKey:e.target.value})}
                />
                <button className="saveBtn" onClick={addApiConnection}>Add API model</button>
                {apiError&&<div className="formError">{apiError}</div>}
              </div>
            </>}

            {supabase&&session&&
              <button className="signOutBtn" onClick={()=>supabase.auth.signOut()}>Sign out</button>
            }
          </div>
        </div>
      </div>
    }

    {computerOpen&&
      <div className="modalBackdrop" onMouseDown={()=>setComputerOpen(false)}>
        <div className="computerModal" onMouseDown={e=>e.stopPropagation()}>
          <div className="settingsHeader">
            <div>
              <h2>Computer</h2>
              <p>Screen preview from this desktop</p>
            </div>
            <button className="iconBtn" onClick={()=>setComputerOpen(false)}>×</button>
          </div>
          <div className="screenGrid">
            {!isDesktop&&<div className="toolsEmpty">Computer preview is available from the desktop app.</div>}
            {screenLoading&&<div className="toolsEmpty">Loading screens…</div>}
            {!screenLoading&&isDesktop&&screens.length===0&&<div className="toolsEmpty">No screens could be captured.</div>}
            {screens.map(s=>
              <div className="screenCard" key={s.id}>
                <img src={s.thumbnail} alt={s.name}/>
                <span>{s.name}</span>
              </div>
            )}
          </div>
          <div className="computerNote">This build can preview screens. Mouse/keyboard control is not enabled yet.</div>
        </div>
      </div>
    }
  </div>
}

function Auth(){
  const [mode,setMode]=useState('signin');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState('');
  const [working,setWorking]=useState(false);

  useEffect(()=>{
    let desktopOff=null;
    let nativeHandle=null;
    let cancelled=false;

    async function finishOAuth(url){
      if(!url||!url.startsWith('freeai://auth'))return;
      setWorking(true);
      setMessage('');
      try{
        const parsed=new URL(url);
        const oauthError=parsed.searchParams.get('error_description')||parsed.searchParams.get('error');
        if(oauthError)throw new Error(oauthError);

        const code=parsed.searchParams.get('code');
        if(!code)throw new Error('Google did not return an authorization code.');

        const {error}=await supabase.auth.exchangeCodeForSession(code);
        if(error)throw error;

        if(isNative){
          try{await Browser.close()}catch{}
        }
      }catch(e){
        if(!cancelled)setMessage(e?.message||String(e));
      }finally{
        if(!cancelled)setWorking(false);
      }
    }

    if(isDesktop&&window.desktopApi?.onAuthCallback){
      desktopOff=window.desktopApi.onAuthCallback(finishOAuth);
    }

    if(isNative){
      CapacitorApp.addListener('appUrlOpen',({url})=>finishOAuth(url))
        .then(handle=>{nativeHandle=handle})
        .catch(()=>{});

      CapacitorApp.getLaunchUrl()
        .then(result=>{if(result?.url)finishOAuth(result.url)})
        .catch(()=>{});
    }

    return()=>{
      cancelled=true;
      desktopOff?.();
      nativeHandle?.remove?.();
    };
  },[]);

  async function submit(event){
    event.preventDefault();
    setWorking(true);
    setMessage('');
    try{
      const result=mode==='signup'
        ? await supabase.auth.signUp({email,password})
        : await supabase.auth.signInWithPassword({email,password});

      if(result.error)throw result.error;
      if(mode==='signup'&&!result.data.session){
        setMessage('Account created. Check your email if confirmation is enabled.');
      }
    }catch(e){
      setMessage(e?.message||String(e));
    }finally{
      setWorking(false);
    }
  }

  async function google(){
    setWorking(true);
    setMessage('');
    try{
      const externalFlow=isDesktop||isNative;
      const redirectTo=externalFlow?AUTH_CALLBACK_URL:window.location.origin;

      const {data,error}=await supabase.auth.signInWithOAuth({
        provider:'google',
        options:{
          redirectTo,
          skipBrowserRedirect:externalFlow
        }
      });

      if(error)throw error;

      if(externalFlow){
        if(!data?.url)throw new Error('Google sign-in URL was not created.');

        if(isDesktop){
          await window.desktopApi.openAuthUrl(data.url);
        }else{
          await Browser.open({
            url:data.url,
            presentationStyle:'popover'
          });
        }
      }
    }catch(e){
      setMessage(e?.message||String(e));
      setWorking(false);
    }
  }

  return <div className="auth">
    <div className="authCard">
      <div className="authLogo">✦</div>
      <h1>{mode==='signup'?'Create your account':'Welcome back'}</h1>
      <p>Sign in to Free AI</p>

      <button className="googleBtn" onClick={google} disabled={working}>Continue with Google</button>
      <div className="authDivider"><span></span><small>or</small><span></span></div>

      <form onSubmit={submit}>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" required/>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" minLength="6" required/>
        <button className="saveBtn" disabled={working}>{working?'Please wait…':(mode==='signup'?'Create account':'Sign in')}</button>
      </form>

      <button className="authSwitch" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('')}}>
        {mode==='signup'?'Already have an account? Sign in':'New to Free AI? Create account'}
      </button>

      {message&&<div className="formError">{message}</div>}
    </div>
  </div>
}

function sendRemote(url,key,payload){
  return new Promise((resolve,reject)=>{
    if(!url||!key){
      reject(new Error('Set the relay URL and pairing key in Settings first.'));
      return;
    }

    let ws;
    try{ws=new WebSocket(url)}
    catch{
      reject(new Error('The relay URL is invalid.'));
      return;
    }

    const id=crypto.randomUUID();
    const timer=setTimeout(()=>{
      try{ws.close()}catch{}
      reject(new Error('Desktop did not answer in time.'));
    },180000);

    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',role:'mobile',key}));

    ws.onmessage=event=>{
      let m;try{m=JSON.parse(event.data)}catch{return}

      if(m.type==='ready'){
        if(!m.desktopOnline){
          clearTimeout(timer);
          ws.close();
          reject(new Error('Paired desktop is offline.'));
          return;
        }
        ws.send(JSON.stringify({type:'prompt',id,...payload}));
        return;
      }

      if(m.type==='response'&&m.id===id){
        clearTimeout(timer);
        ws.close();
        if(m.error)reject(new Error(m.error));
        else resolve(m);
      }
    };

    ws.onerror=()=>{
      clearTimeout(timer);
      reject(new Error('Cannot connect to relay.'));
    };
  });
}

createRoot(document.getElementById('root')).render(<App/>);
