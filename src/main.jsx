import React,{useEffect,useEffectEvent,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {Capacitor} from '@capacitor/core';
import {App as CapacitorApp} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {InAppBrowser} from '@capacitor/inappbrowser';
import {SpeechRecognition} from '@capgo/capacitor-speech-recognition';
import {
  AppWindow,Archive,ArrowLeft,ArrowRight,ArrowUp,Bell,Blocks,Bot,Box,Brain,Briefcase,
  CalendarDays,Check,ChevronDown,ChevronRight,Chrome,Clock3,Code2,Database,ExternalLink,
  File,FileText,Folder,GitBranch,Globe2,HardDrive,HelpCircle,Image,Keyboard,Link2,
  LogOut,Mail,Menu,Mic2,Monitor,MousePointer2,Palette,PanelLeft,Paperclip,PenLine,Plug,
  Plus,RefreshCw,RotateCcw,Search,Settings,ShieldCheck,SlidersHorizontal,Sparkles,
  SquarePen,Table2,Target,SquareTerminal,UserRound,Volume2,X
} from 'lucide-react';
import './styles.css';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL||'https://xquntkgjlmrxkwkrwsjl.supabase.co';
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY||'sb_publishable_5jLA64uA5h7NICd9sQLwUg_aQquD67t';
const supabase=supabaseUrl&&supabaseKey
  ? createClient(supabaseUrl,supabaseKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})
  : null;

const isDesktop=!!window.desktopApi;
const isNative=Capacitor.isNativePlatform();
const AUTH_CALLBACK_URL='freeai://auth/callback';
const providerNames={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',deepseek:'DeepSeek',grok:'Grok',manus:'Manus'};

const settingsSections=[
  ['personal','General',Settings],['personal','Profile',UserRound],['personal','Appearance',Palette],['personal','Voice',Volume2],
  ['personal','Configuration',SlidersHorizontal],['personal','Keyboard shortcuts',Keyboard],
  ['integrations','Computer use',Monitor],['integrations','Plugins',Plug],['integrations','Browser',Globe2],
  ['coding','Connections',Link2],['coding','Git',GitBranch],['coding','Environments',SquareTerminal]
];

function readJSON(key,fallback){
  try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}
}
function randomKey(){
  const b=new Uint8Array(32);crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function modelLabel(model){
  return model?.modelName||model?.name||providerNames[model?.id]||model?.model||'Select model';
}
function initials(session){
  const value=session?.user?.user_metadata?.full_name||session?.user?.email||'Free AI';
  return value.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
}
function humanSize(bytes){
  if(!Number.isFinite(bytes))return '';
  if(bytes<1024)return bytes+' B';
  if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';
  return (bytes/1024/1024).toFixed(1)+' MB';
}

function BrandMark({size=22,className=''}) {
  return <span className={'freeAiMark '+className} style={{'--mark-size':size+'px'}} aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <path className="markLobe markTop" d="M12 2.7c2.15 0 4.16 1.22 5.13 3.13.97 1.91.77 4.18-.52 5.89L12 17.72 7.39 11.72c-1.29-1.71-1.49-3.98-.52-5.89C7.84 3.92 9.85 2.7 12 2.7Z"/>
      <path className="markLobe markLeft" d="M3.35 14.92c1.07-1.86 3.08-3.05 5.22-3.08 2.14-.03 4.18 1.09 5.3 2.91L17.8 21H8.23c-2.14 0-4.12-1.14-5.18-3-1.06-1.86-1.02-4.15.3-6.08Z" transform="rotate(120 12 12)"/>
      <path className="markLobe markRight" d="M3.35 14.92c1.07-1.86 3.08-3.05 5.22-3.08 2.14-.03 4.18 1.09 5.3 2.91L17.8 21H8.23c-2.14 0-4.12-1.14-5.18-3-1.06-1.86-1.02-4.15.3-6.08Z" transform="rotate(240 12 12)"/>
      <path className="markCore" d="M12 8.25 15.75 12 12 15.75 8.25 12 12 8.25Z"/>
    </svg>
  </span>;
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
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [mobileModeMenu,setMobileModeMenu]=useState(false);
  const [sidebarSearchOpen,setSidebarSearchOpen]=useState(false);
  const [sidebarSearch,setSidebarSearch]=useState('');
  const [page,setPage]=useState('chat');
  const [product,setProduct]=useState(()=>localStorage.getItem('freeai.product')||'free');
  const [productMenu,setProductMenu]=useState(false);
  const [mode,setMode]=useState('chat');
  const [approvalMode,setApprovalMode]=useState('ask');
  const [modelMenu,setModelMenu]=useState(false);
  const [effortMenu,setEffortMenu]=useState(false);
  const [effort,setEffort]=useState('instant');
  const [plusMenu,setPlusMenu]=useState(false);
  const [profileMenu,setProfileMenu]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsSection,setSettingsSection]=useState('General');
  const [sidePanel,setSidePanel]=useState(null);
  const [selectedFile,setSelectedFile]=useState(null);
  const [screens,setScreens]=useState([]);
  const [chats,setChats]=useState(()=>readJSON('freeai.chats',[]));
  const [currentChatId,setCurrentChatId]=useState(null);
  const [appPrefs,setAppPrefs]=useState(()=>({
    appearance:'dark',contrast:'medium',accent:'blue',textSize:100,suggestedPrompts:true,
    autoReviewEnabled:false,fullAccessEnabled:false,voiceLanguage:'system',voiceAutoSend:false,
    ...readJSON('freeai.prefs',{defaultPermissions:true,language:'English',showBottomPanel:true})
  }));
  const [settings,setSettings]=useState(()=>({relayUrl:localStorage.getItem('relayUrl')||'',pairKey:localStorage.getItem('pairKey')||''}));
  const [apiDraft,setApiDraft]=useState({name:'',baseUrl:'',model:'',apiKey:''});
  const [apiError,setApiError]=useState('');
  const fileRef=useRef(null);

  useEffect(()=>{
    if(!supabase){setSession({user:{email:'Local workspace'}});setAuthReady(true);return}
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true)}).catch(()=>{setSession(null);setAuthReady(true)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setAuthReady(true)});
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!isDesktop)return;
    let active=true;
    window.desktopApi.getStatus().then(s=>active&&setStatus(s)).catch(()=>{});
    const offStatus=window.desktopApi.onStatus(s=>active&&setStatus(s));
    const offCommand=window.desktopApi.onAppCommand?.(command=>{
      if(command==='new-chat')newChat();
      if(command==='about'){setSettingsSection('General');setSettingsOpen(true)}
      if(command==='open-browser')openBrowser();
      if(command==='toggle-sidebar')setSidebarOpen(v=>!v);
    });
    window.desktopApi.configureRelay(settings).then(s=>active&&setStatus(s)).catch(()=>{});
    window.desktopApi.scanProviders().catch(()=>{});
    return()=>{active=false;offStatus?.();offCommand?.()};
  },[]);

  useEffect(()=>{
    if(isDesktop)return;
    if(!settings.relayUrl||!settings.pairKey){setStatus({extension:false,relay:false,providers:[]});return}
    let stopped=false,socket=null,retry=null;
    const connect=()=>{
      if(stopped)return;
      try{socket=new WebSocket(settings.relayUrl)}catch{retry=setTimeout(connect,3000);return}
      socket.onopen=()=>socket.send(JSON.stringify({type:'hello',role:'mobile',key:settings.pairKey}));
      socket.onmessage=event=>{
        let m;try{m=JSON.parse(event.data)}catch{return}
        if(m.type==='ready'){setStatus(m.providerStatus?{...m.providerStatus,relay:true}:s=>({...s,relay:true}));socket.send(JSON.stringify({type:'getProviderStatus'}))}
        if(m.type==='providerStatus')setStatus({...m,relay:true});
      };
      socket.onclose=()=>{setStatus({extension:false,relay:false,providers:[]});if(!stopped)retry=setTimeout(connect,3000)};
    };
    connect();
    return()=>{stopped=true;clearTimeout(retry);try{socket?.close()}catch{}};
  },[settings.relayUrl,settings.pairKey]);

  const connected=useMemo(()=>Array.isArray(status.providers)?status.providers:[],[status.providers]);
  const mcpTools=useMemo(()=>{
    const tools=[];
    for(const p of connected){
      if(p.source!=='browser'||!Array.isArray(p.mcps))continue;
      for(const mcp of p.mcps)tools.push({key:p.id+'::'+mcp,mcp,ownerProviderId:p.id,ownerName:modelLabel(p)});
    }
    return tools;
  },[connected]);

  useEffect(()=>{
    if(!selected)return;
    const fresh=connected.find(p=>p.id===selected.id&&p.source===selected.source);
    if(!fresh){setSelected(null);setSelectedTool(null)}
    else if(fresh!==selected)setSelected(fresh);
  },[connected]);

  useEffect(()=>{
    if(approvalMode==='auto'&&!appPrefs.autoReviewEnabled)setApprovalMode('ask');
    if(approvalMode==='full'&&!appPrefs.fullAccessEnabled)setApprovalMode('ask');
  },[approvalMode,appPrefs.autoReviewEnabled,appPrefs.fullAccessEnabled]);

  useEffect(()=>{
    const root=document.documentElement;
    let resolved=appPrefs.appearance||'dark';
    if(resolved==='system')resolved=window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark';
    root.dataset.theme=resolved;
    root.dataset.contrast=appPrefs.contrast||'medium';
    root.dataset.accent=appPrefs.accent||'blue';
    const scale=(Number(appPrefs.textSize)||100)/100;
    root.style.setProperty('--ui-scale',String(scale));
    document.body.style.zoom=isNative?'1':String(scale);
  },[appPrefs.appearance,appPrefs.contrast,appPrefs.accent,appPrefs.textSize]);

  useEffect(()=>{
    const onKey=e=>{
      if(e.key!=='Escape')return;
      if(profileMenu){setProfileMenu(false);return}
      if(modelMenu){setModelMenu(false);return}
      if(effortMenu){setEffortMenu(false);return}
      if(plusMenu){setPlusMenu(false);return}
      if(mobileModeMenu){setMobileModeMenu(false);return}
      if(mobileNavOpen){setMobileNavOpen(false);return}
      if(settingsOpen){setSettingsOpen(false);return}
      if(sidePanel){setSidePanel(null)}
    };
    const onPointer=e=>{
      const target=e.target;
      if(!(target instanceof Element))return;
      if(!target.closest('.menuAnchor')){setModelMenu(false);setEffortMenu(false);setPlusMenu(false)}
      if(!target.closest('.profileMenu')&&!target.closest('.profileButton'))setProfileMenu(false);
      if(!target.closest('.mobileModeAnchor'))setMobileModeMenu(false);
    };
    window.addEventListener('keydown',onKey);
    document.addEventListener('pointerdown',onPointer);
    return()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer)};
  },[profileMenu,modelMenu,effortMenu,plusMenu,mobileModeMenu,mobileNavOpen,settingsOpen,sidePanel]);

  const visibleChats=useMemo(()=>{
    const q=sidebarSearch.trim().toLowerCase();
    const productChats=chats.filter(chat=>(chat.product||'free')===product);
    return q?productChats.filter(chat=>String(chat.title||'').toLowerCase().includes(q)):productChats;
  },[chats,sidebarSearch,product]);

  function persistPrefs(next){setAppPrefs(next);localStorage.setItem('freeai.prefs',JSON.stringify(next))}
  function saveCurrentChat(nextMessages,model=selected){
    if(!model||!nextMessages.length)return;
    const firstUser=nextMessages.find(m=>m.role==='user')?.text||'New chat';
    const title=firstUser.length>46?firstUser.slice(0,46)+'…':firstUser;
    let id=currentChatId;
    if(!id){id=crypto.randomUUID();setCurrentChatId(id)}
    setChats(prev=>{
      const chat={id,title,product,providerId:model.id,source:model.source,modelName:modelLabel(model),messages:nextMessages,updatedAt:Date.now()};
      const next=[chat,...prev.filter(c=>c.id!==id)].slice(0,60);
      localStorage.setItem('freeai.chats',JSON.stringify(next));return next;
    });
  }
  function switchProduct(next){
    const value=next==='super'?'super':'free';
    setProduct(value);
    localStorage.setItem('freeai.product',value);
    setProductMenu(false);
    setCurrentChatId(null);
    setMessages([]);
    setSelectedTool(null);
    setPage('chat');
    if(value==='super')setMode('work');
    else setMode(appPrefs.defaultMode==='work'?'work':'chat');
  }
  function newChat(){
    setCurrentChatId(null);setMessages([]);setPrompt('');setSelectedTool(null);setApprovalMode('ask');
    if(product==='free')setMode(appPrefs.defaultMode==='work'?'work':'chat');
    setModelMenu(false);setPlusMenu(false);setPage('chat');setSidePanel(null);setMobileNavOpen(false);
  }
  function openChat(chat){
    setCurrentChatId(chat.id);setMessages(Array.isArray(chat.messages)?chat.messages:[]);
    setSelected(connected.find(p=>p.id===chat.providerId&&p.source===chat.source)||null);
    setSelectedTool(null);setPage('chat');
  }
  async function send(overrideText){
    const text=(typeof overrideText==='string'?overrideText:prompt).trim();
    if(!text||busy)return;
    if(!selected){setModelMenu(true);return}
    setBusy(true);setPrompt('');
    const withUser=[...messages,{role:'user',text}];setMessages(withUser);saveCurrentChat(withUser,selected);
    try{
      const payload={
        provider:selected.id,source:selected.source||'browser',text,effort,
        product,mode,approvalMode,fullAccess:approvalMode==='full',
        toolRequest:selectedTool?{mcp:selectedTool.mcp,ownerProviderId:selectedTool.ownerProviderId}:null
      };
      const result=isDesktop?await window.desktopApi.sendPrompt(payload):await sendRemote(settings.relayUrl,settings.pairKey,payload);
      const next=[...withUser,{role:'assistant',text:result?.text||String(result||''),provider:selected.id}];
      setMessages(next);saveCurrentChat(next,selected);
    }catch(e){
      const next=[...withUser,{role:'error',text:e?.message||String(e)}];setMessages(next);saveCurrentChat(next,selected);
    }finally{setBusy(false)}
  }
  async function saveSettings(){
    const next={relayUrl:settings.relayUrl.trim(),pairKey:settings.pairKey.trim()};
    localStorage.setItem('relayUrl',next.relayUrl);localStorage.setItem('pairKey',next.pairKey);setSettings(next);
    if(isDesktop)try{setStatus(await window.desktopApi.configureRelay(next))}catch{}
  }
  async function addApiConnection(){
    if(!isDesktop)return;setApiError('');
    try{await window.desktopApi.addApiConnection(apiDraft);setApiDraft({name:'',baseUrl:'',model:'',apiKey:''})}
    catch(e){setApiError(e?.message||String(e))}
  }
  async function removeApiConnection(id){if(isDesktop)try{await window.desktopApi.removeApiConnection(id)}catch{}}

  async function openBrowser(){
    setPlusMenu(false);
    if(isNative){
      try{
        await InAppBrowser.openInWebView({
          url:'https://www.google.com/',
          options:{
            showURL:true,
            showToolbar:true,
            showNavigationButtons:true,
            closeButtonText:'Close',
            clearCache:false,
            clearSessionCache:false,
            android:{hardwareBack:true,allowZoom:true,pauseMedia:true},
            iOS:{allowsBackForwardNavigationGestures:true,allowInLineMediaPlayback:true}
          }
        });
      }catch(e){
        console.error('Free AI mobile browser failed',e);
      }
      return;
    }
    setSidePanel('browser');
  }

  async function openHelp(){
    const url='https://github.com/az0512124155azz-sys/free-ai#readme';
    try{
      if(isDesktop)await window.desktopApi.openAuthUrl(url);
      else if(isNative)await Browser.open({url,presentationStyle:'popover'});
      else window.open(url,'_blank','noopener,noreferrer');
    }catch{}
  }

  async function attachFiles(event){
    const files=[...(event.target.files||[])];if(!files.length)return;
    const file=files[0];
    const preview={name:file.name,type:file.type,size:file.size,kind:'binary',content:'',url:''};
    const textLike=file.type.startsWith('text/')||/\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|py|java|kt|swift|c|cpp|h|hpp|sh|ps1|sql)$/i.test(file.name);
    if(file.type.startsWith('image/')){preview.kind='image';preview.url=URL.createObjectURL(file)}
    else if(textLike&&file.size<=2*1024*1024){preview.kind='text';try{preview.content=await file.text()}catch{}}
    else if(/\.(zip|rar|7z|tar|gz)$/i.test(file.name))preview.kind='archive';
    setSelectedFile(preview);setSidePanel('file');
    const chunks=[];
    for(const item of files){
      const itemText=item.type.startsWith('text/')||/\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|py|java|kt|swift|c|cpp|h|hpp|sh|ps1|sql)$/i.test(item.name);
      if(itemText&&item.size<=2*1024*1024){try{chunks.push('[File: '+item.name+']\n'+await item.text())}catch{}}
      else chunks.push('[Attached file: '+item.name+']');
    }
    if(chunks.length)setPrompt(p=>(p?p+'\n\n':'')+chunks.join('\n\n'));
    event.target.value='';
  }

  if(!authReady)return <div className="splash"><BrandMark size={34}/><span>Free AI</span></div>;
  if(!session&&supabase)return <Auth/>;

  const sidebarName=session?.user?.user_metadata?.full_name||session?.user?.email?.split('@')[0]||'Free AI';
  const productLabel=product==='super'?'Super AI':'Free AI';
  const heading=product==='super'?'What should we build?':mode==='work'?'What should we work on?':messages.length?'':'Ready when you are.';

  return <div className={'desktopShell '+(!sidebarOpen?'sidebarHidden':'')+' '+(sidePanel?'hasSidePanel':'')+' '+(mobileNavOpen?'mobileNavOpen':'')}>
    <input ref={fileRef} type="file" multiple hidden onChange={attachFiles}/>

    {(sidebarOpen||mobileNavOpen)&&<aside className={'gptSidebar '+(mobileNavOpen?'mobileOpen':'')}>
      <div className="brandRow">
        <div className="productAnchor">
          <button className="brandButton" title="Switch product" aria-haspopup="menu" aria-expanded={productMenu} onClick={()=>setProductMenu(v=>!v)}>
            <BrandMark size={20}/><b>{productLabel}</b><ChevronDown size={14}/>
          </button>
          {productMenu&&<ProductMenu product={product} choose={switchProduct}/>}
        </div>
        <div className="brandActions">
          <button title="Search chats" aria-label="Search chats" onClick={()=>setSidebarSearchOpen(v=>!v)}><Search size={16}/></button>
          <button className="mobileCloseNav" title="Close navigation" onClick={()=>setMobileNavOpen(false)}><X size={17}/></button>
        </div>
      </div>
      {sidebarSearchOpen&&<div className="sidebarSearch"><Search size={14}/><input autoFocus value={sidebarSearch} onChange={e=>setSidebarSearch(e.target.value)} placeholder="Search chats"/></div>}
      <nav className="primaryNav">
        <NavItem icon={SquarePen} label={product==='super'?'New task':'New chat'} active={page==='chat'&&!currentChatId} onClick={newChat}/>
        <NavItem icon={Image} label="Images" active={page==='images'} onClick={()=>{setPage('images');setMobileNavOpen(false)}}/>
        {!isNative&&<NavItem icon={Clock3} label="Scheduled" active={page==='scheduled'} onClick={()=>{setPage('scheduled');setMobileNavOpen(false)}}/>}
        {!isNative&&<NavItem icon={Plug} label="Plugins" active={page==='plugins'} onClick={()=>{setPage('plugins');setMobileNavOpen(false)}}/>}
        {!isNative&&<NavItem icon={Blocks} label="Explore" active={page==='explore'} onClick={()=>{setPage('explore');setMobileNavOpen(false)}}/>}
      </nav>
      <div className="sidebarScroll">
        <div className="sidebarGroupTitle">Projects</div>
        <button className="projectItem" onClick={()=>{setMode('work');setPage('chat')}}><Folder size={15}/>{product==='super'?'Code workspace':'Free AI Workspace'}</button>
        <div className="sidebarGroupTitle">Recents</div>
        {visibleChats.length===0?<div className="sidebarEmpty">{sidebarSearch?'No matching chats':'No chats yet'}</div>:visibleChats.map(chat=>
          <button key={chat.id} className={'recentItem '+(currentChatId===chat.id?'active':'')} onClick={()=>{openChat(chat);setMobileNavOpen(false)}}>{chat.title}</button>
        )}
      </div>
      <div className="sidebarFooter">
        <button className="profileButton" onClick={()=>setProfileMenu(v=>!v)}>
          <span className="avatar">{initials(session)}</span>
          <span className="profileName">{sidebarName}</span>
          <span className={'connectionDot '+((isDesktop?status.extension:status.relay)?'online':'')}></span>
        </button>
        <button className="voiceButton" onClick={()=>{setPage('chat');setMobileNavOpen(false);window.dispatchEvent(new CustomEvent('freeai:start-voice'))}}><Mic2 size={15}/>Voice</button>
        <button className="circleIcon" title="Help" onClick={openHelp}><HelpCircle size={16}/></button>
        {profileMenu&&<ProfileMenu session={session} onSettings={()=>{setProfileMenu(false);setSettingsOpen(true)}}/>}
      </div>
    </aside>}
    {mobileNavOpen&&<button className="mobileNavScrim" aria-label="Close navigation" onClick={()=>setMobileNavOpen(false)}/>}

    <main className="workspace">
      <header className="workspaceHeader">
        <div className="headerLeft">
          <button className="headerIcon mobileNavTrigger" onClick={()=>setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={18}/></button>
          {!sidebarOpen&&<button className="headerIcon desktopSidebarTrigger" onClick={()=>setSidebarOpen(true)} aria-label="Open sidebar"><PanelLeft size={18}/></button>}
        </div>
        {product==='free'&&<div className="modeSwitch" role="tablist" aria-label="Experience">
          <button role="tab" aria-selected={mode==='chat'} className={mode==='chat'?'active':''} onClick={()=>setMode('chat')}>Chat</button>
          <button role="tab" aria-selected={mode==='work'} className={mode==='work'?'active':''} onClick={()=>setMode('work')}>Work</button>
        </div>}
        {product==='free'&&<div className="mobileModeAnchor">
          <button className="mobileModeButton" aria-haspopup="menu" aria-expanded={mobileModeMenu} onClick={()=>setMobileModeMenu(v=>!v)}>
            <span>{mode==='work'?'Work':'Chat'}</span><ChevronDown size={14}/>
          </button>
          {mobileModeMenu&&<div className="mobileModeMenu" role="menu">
            <button className={mode==='chat'?'active':''} onClick={()=>{setMode('chat');setMobileModeMenu(false)}}>Chat</button>
            <button className={mode==='work'?'active':''} onClick={()=>{setMode('work');setMobileModeMenu(false)}}>Work</button>
          </div>}
        </div>}
        {product==='super'&&<div className="superHeaderLabel">Super AI</div>}
        <div className="headerRight">
          {sidePanel&&<button className="headerIcon" onClick={()=>setSidePanel(null)} title="Close side panel"><X size={17}/></button>}
          {sidebarOpen&&<button className="headerIcon" onClick={()=>setSidebarOpen(false)} title="Hide sidebar"><PanelLeft size={17}/></button>}
        </div>
      </header>

      {page==='chat'&&<section className="chatStage">
        {messages.length===0
          ? <div className={'emptyChat '+(mode==='work'?'workEmpty':'')}>
              <h1>{heading}</h1>
              <Composer
                product={product} mode={mode} prompt={prompt} setPrompt={setPrompt} send={send} busy={busy}
                selected={selected} connected={connected} setSelected={setSelected}
                modelMenu={modelMenu} setModelMenu={setModelMenu}
                effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef}
                mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                approvalMode={approvalMode} setApprovalMode={setApprovalMode} permissionPrefs={appPrefs}
                onBrowser={openBrowser}
                onComputer={isDesktop?()=>{setPlusMenu(false);setSidePanel('computer')}:null}
                onPlugins={()=>{setPlusMenu(false);setPage('plugins')}}
              />
              {appPrefs.suggestedPrompts!==false&&<StarterPrompts product={product} mode={mode} onChoose={setPrompt}/>} 
            </div>
          : <div className="conversationView">
              <div className="messageList">
                {messages.map((m,i)=><div key={i} className={'chatMessage '+m.role}>
                  {m.role!=='user'&&<div className="assistantMark"><Sparkles size={16}/></div>}
                  <div className="messageBubble">
                    {m.role!=='user'&&<div className="messageAuthor">{m.role==='error'?'Error':modelLabel(selected)}</div>}
                    <div className="messageBody">{m.text}</div>
                  </div>
                </div>)}
              </div>
              <div className="conversationComposer">
                <Composer
                  compact product={product} mode={mode} prompt={prompt} setPrompt={setPrompt} send={send} busy={busy}
                  selected={selected} connected={connected} setSelected={setSelected}
                  modelMenu={modelMenu} setModelMenu={setModelMenu}
                  effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                  plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef}
                  mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                  approvalMode={approvalMode} setApprovalMode={setApprovalMode} permissionPrefs={appPrefs}
                  onBrowser={openBrowser}
                  onComputer={isDesktop?()=>{setPlusMenu(false);setSidePanel('computer')}:null}
                  onPlugins={()=>{setPlusMenu(false);setPage('plugins')}}
                />
              </div>
            </div>
        }
        <div className="stageFooter">{product==='super'?'Super AI':'Free AI'} can make mistakes. Check important information.</div>
      </section>}

      {page==='plugins'&&<PluginsPage tools={mcpTools} connected={connected} onBack={()=>setPage('chat')} onRefresh={()=>window.desktopApi?.scanProviders?.().catch(()=>{})}/>}
      {page==='explore'&&<ExplorePage tools={mcpTools} chats={chats} onBack={()=>setPage('chat')}/>}
      {page==='images'&&<PlaceholderPage title="Images" subtitle="Image generation and visual workspaces will live here." icon={Image}/>}
      {page==='scheduled'&&<PlaceholderPage title="Scheduled" subtitle="Scheduled prompts and recurring jobs will appear here." icon={Clock3}/>}
    </main>

    {sidePanel==='browser'&&<BrowserPane onClose={()=>setSidePanel(null)}/>}
    {sidePanel==='file'&&<FilePane file={selectedFile} onClose={()=>setSidePanel(null)}/>}
    {sidePanel==='computer'&&<ComputerPane
      screens={screens} setScreens={setScreens} approvalMode={approvalMode}
      onSetApprovalMode={setApprovalMode} permissionPrefs={appPrefs}
      onClose={()=>setSidePanel(null)}
    />}

    {settingsOpen&&<SettingsView
      section={settingsSection} setSection={setSettingsSection} onClose={()=>setSettingsOpen(false)}
      prefs={appPrefs} setPrefs={persistPrefs} status={status} settings={settings} setSettings={setSettings}
      saveSettings={saveSettings} connected={connected} apiDraft={apiDraft} setApiDraft={setApiDraft}
      addApiConnection={addApiConnection} removeApiConnection={removeApiConnection} apiError={apiError}
      onComputer={()=>{setSettingsOpen(false);setSidePanel('computer')}}
      onPlugins={()=>{setSettingsOpen(false);setPage('plugins')}}
      onBrowser={()=>{setSettingsOpen(false);openBrowser()}}
    />}
  </div>
}

function ProductMenu({product,choose}){
  return <div className="productMenu" role="menu" aria-label="Product">
    <button className={product==='free'?'active':''} onClick={()=>choose('free')}>
      <BrandMark size={22}/>
      <span><b>Free AI</b><small>Chat and work with your connected models</small></span>
      {product==='free'&&<Check size={15}/>}
    </button>
    <button className={product==='super'?'active':''} onClick={()=>choose('super')}>
      <span className="superGlyph"><Code2 size={17}/></span>
      <span><b>Super AI</b><small>Build, debug, and work on code</small></span>
      {product==='super'&&<Check size={15}/>}
    </button>
  </div>
}

function StarterPrompts({product,mode,onChoose}){
  const items=product==='super'
    ? ['Fix a bug in my project','Review this repository','Plan a coding task']
    : mode==='work'
      ? ['Research and build a plan','Open the browser and investigate','Use my installed plugins']
      : ['Compare my connected models','Summarize an attached file','Research a topic'];
  return <div className="starterPrompts">{items.map(item=><button key={item} onClick={()=>onChoose(item)}>{item}</button>)}</div>
}

function NavItem({icon:Icon,label,active,onClick}){
  return <button className={'navItem '+(active?'active':'')} onClick={onClick}><Icon size={16}/><span>{label}</span></button>
}

function Composer(props){
  const {
    compact,product,mode,prompt,setPrompt,send,busy,selected,connected,setSelected,modelMenu,setModelMenu,
    effort,setEffort,effortMenu,setEffortMenu,plusMenu,setPlusMenu,fileRef,mcpTools,selectedTool,setSelectedTool,
    approvalMode,setApprovalMode,permissionPrefs,onBrowser,onComputer,onPlugins
  }=props;
  const [listening,setListening]=useState(false);
  const [dictationError,setDictationError]=useState('');
  const effortLabel={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High'}[effort]||'Instant';
  const reasoningLevels=Array.isArray(selected?.reasoningLevels)?selected.reasoningLevels:[];
  const dictationBaseRef=useRef('');
  const dictationTextRef=useRef('');
  const nativeVoiceHandlesRef=useRef([]);
  const webRecognitionRef=useRef(null);

  function voiceLanguage(){
    const configured=permissionPrefs?.voiceLanguage;
    return configured&&configured!=='system'?configured:(navigator.language||'en-US');
  }
  function applyTranscript(text){
    const clean=String(text||'').trim();
    dictationTextRef.current=clean;
    const base=dictationBaseRef.current.trimEnd();
    const next=[base,clean].filter(Boolean).join(base&&clean?' ':'');
    setPrompt(next);
    return next;
  }
  async function cleanupNativeVoice(){
    const handles=nativeVoiceHandlesRef.current.splice(0);
    for(const handle of handles){try{await handle?.remove?.()}catch{}}
  }
  async function stopVoice(){
    try{
      if(isNative)await SpeechRecognition.stop();
      else webRecognitionRef.current?.stop?.();
    }catch{}
    await cleanupNativeVoice();
    webRecognitionRef.current=null;
    setListening(false);
  }
  async function startNativeVoice(){
    const availability=await SpeechRecognition.available();
    if(!availability?.available)throw new Error('Speech recognition is not available on this device.');
    const permission=await SpeechRecognition.checkPermissions();
    let state=permission?.speechRecognition;
    if(state!=='granted'){
      const requested=await SpeechRecognition.requestPermissions();
      state=requested?.speechRecognition;
    }
    if(state!=='granted')throw new Error('Microphone permission was not granted.');

    dictationBaseRef.current=prompt;
    dictationTextRef.current='';
    await cleanupNativeVoice();

    nativeVoiceHandlesRef.current.push(await SpeechRecognition.addListener('partialResults',event=>{
      const text=event?.accumulatedText||event?.matches?.[0]||event?.accumulated||'';
      if(text)applyTranscript(text);
    }));
    nativeVoiceHandlesRef.current.push(await SpeechRecognition.addListener('listeningState',event=>{
      const active=event?.status==='started';
      setListening(active);
      if(event?.status==='stopped'){
        const finalText=[dictationBaseRef.current.trimEnd(),dictationTextRef.current.trim()].filter(Boolean).join(' ');
        if(permissionPrefs?.voiceAutoSend&&finalText.trim())setTimeout(()=>send(finalText),0);
        cleanupNativeVoice();
      }
    }));

    await SpeechRecognition.start({
      language:voiceLanguage(),
      maxResults:3,
      partialResults:true,
      popup:false,
      addPunctuation:true
    });
    setListening(true);
  }
  function startWebVoice(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition)throw new Error('Dictation is not available in this browser.');
    const recognition=new Recognition();
    dictationBaseRef.current=prompt;
    dictationTextRef.current='';
    recognition.lang=voiceLanguage();
    recognition.interimResults=true;
    recognition.continuous=false;
    recognition.maxAlternatives=1;
    recognition.onstart=()=>setListening(true);
    recognition.onerror=e=>{setListening(false);setDictationError(e?.error==='not-allowed'?'Microphone permission was denied.':'Dictation stopped unexpectedly.')};
    recognition.onresult=e=>{
      const text=[...e.results].map(r=>r[0]?.transcript||'').join(' ').trim();
      if(text)applyTranscript(text);
    };
    recognition.onend=()=>{
      setListening(false);
      const finalText=[dictationBaseRef.current.trimEnd(),dictationTextRef.current.trim()].filter(Boolean).join(' ');
      if(permissionPrefs?.voiceAutoSend&&finalText.trim())setTimeout(()=>send(finalText),0);
      webRecognitionRef.current=null;
    };
    webRecognitionRef.current=recognition;
    recognition.start();
  }
  async function startVoice(){
    setDictationError('');
    if(listening){await stopVoice();return}
    try{
      if(isNative)await startNativeVoice();
      else startWebVoice();
    }catch(e){
      setListening(false);
      setDictationError(e?.message||'Dictation could not start.');
    }
  }
  const startVoiceFromApp=useEffectEvent(()=>startVoice());
  useEffect(()=>{
    const handler=()=>startVoiceFromApp();
    window.addEventListener('freeai:start-voice',handler);
    return()=>{
      window.removeEventListener('freeai:start-voice',handler);
      try{webRecognitionRef.current?.stop?.()}catch{}
      if(isNative)SpeechRecognition.stop().catch(()=>{});
      cleanupNativeVoice();
    };
  },[]);

  return <div className={'gptComposer '+(mode==='work'?'workComposer':'')+' '+(compact?'compact':'')}>
    {selectedTool&&<div className="attachedTool"><Plug size={13}/><span>{selectedTool.mcp}</span><small>via {selectedTool.ownerName}</small><button onClick={()=>setSelectedTool(null)}><X size={12}/></button></div>}
    <textarea
      value={prompt} onChange={e=>setPrompt(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
      placeholder={product==='super'?'Ask Super AI to build, debug, or change code':mode==='work'?'Work with Free AI':selected?'Message '+modelLabel(selected):'Ask Free AI'}
    />
    <div className="composerBottom">
      <div className="composerLeft">
        <div className="menuAnchor">
          <button className="plusCircle" aria-label="Add" aria-haspopup="menu" aria-expanded={plusMenu} onClick={()=>setPlusMenu(v=>!v)}><Plus size={20}/></button>
          {plusMenu&&<PlusMenu
            fileRef={fileRef} onBrowser={onBrowser} onComputer={onComputer} onPlugins={onPlugins}
            tools={mcpTools} setSelectedTool={setSelectedTool} mode={mode}
          />}
        </div>
        {(mode==='work'||product==='super')&&<PermissionControl
          mode={approvalMode}
          setMode={setApprovalMode}
          autoReviewEnabled={!!permissionPrefs?.autoReviewEnabled}
          fullAccessEnabled={!!permissionPrefs?.fullAccessEnabled}
        />}
      </div>

      <div className="composerRight">
        <div className="menuAnchor">
          <button className="modelButton" aria-haspopup="listbox" aria-expanded={modelMenu} onClick={()=>setModelMenu(v=>!v)}>
            <span>{modelLabel(selected)}</span>{selected?.modelName&&selected.modelName!==selected.name&&<small>{selected.name}</small>}<ChevronDown size={13}/>
          </button>
          {modelMenu&&<ModelMenu connected={connected} selected={selected} choose={m=>{setSelected(m);setModelMenu(false)}}/>}
        </div>
        {reasoningLevels.length>1&&<div className="menuAnchor">
          <button className="effortButton" aria-haspopup="dialog" aria-expanded={effortMenu} onClick={()=>setEffortMenu(v=>!v)}><Brain size={14}/>{effortLabel}<ChevronDown size={12}/></button>
          {effortMenu&&<EffortMenu effort={effort} levels={reasoningLevels} choose={v=>{setEffort(v);setEffortMenu(false)}}/>}
        </div>}
        <button className={'micButton '+(listening?'listening':'')} onClick={startVoice} title={listening?'Stop dictation':'Dictation'} aria-label={listening?'Stop dictation':'Start dictation'}><Mic2 size={18}/></button>
        <button className={'voiceOrb '+(prompt.trim()&&selected?'sendReady':'')} onClick={prompt.trim()?send:undefined} disabled={busy||(!selected&&!!prompt.trim())}>
          {busy?<RefreshCw className="spin" size={17}/>:prompt.trim()?<ArrowUp size={18}/>:<Volume2 size={18}/>}
        </button>
      </div>
    </div>
    {dictationError&&<div className="dictationError">{dictationError}</div>}
    {listening&&<div className="dictationState"><span className="liveDot"/>Listening… tap the microphone to stop</div>}
    {mode==='work'&&permissionPrefs?.showBottomPanel!==false&&<div className="workActions">
      <button onClick={()=>fileRef.current?.click()}><Folder size={15}/>Choose project</button>
      <button onClick={onPlugins}><Plug size={15}/>Plugins</button>
      <button onClick={onBrowser}><Globe2 size={15}/>Browser</button>
    </div>}
  </div>
}

function ModelMenu({connected,selected,choose}){
  return <div className="floatingMenu modelPicker" role="listbox" aria-label="Select model">
    <div className="floatingTitle">Select model</div>
    {connected.length===0?<div className="menuEmpty"><b>No models connected</b><span>Open an AI tab in Chrome or add an API model in Settings.</span></div>:
      connected.map(model=><button role="option" aria-selected={selected?.id===model.id&&selected?.source===model.source} key={(model.source||'browser')+model.id} className="pickerRow" onClick={()=>choose(model)}>
        <span className={'providerBadge '+(model.source==='api'?'api':model.id)}>{modelLabel(model).slice(0,1)}</span>
        <span className="pickerText"><b>{modelLabel(model)}</b><small>{model.source==='api'?'API · '+model.model:'Browser · '+model.name}</small></span>
        {selected?.id===model.id&&selected?.source===model.source&&<Check size={16}/>}
      </button>)}
  </div>
}

function PermissionControl({mode,setMode,autoReviewEnabled,fullAccessEnabled}){
  const [open,setOpen]=useState(false);
  const labels={ask:'Ask for approval',auto:'Approve for me',full:'Full access'};
  const descriptions={
    ask:'Review actions before they go beyond the workspace',
    auto:'Automatically review eligible permission requests',
    full:'Allow broad file and network access without asking each time'
  };
  return <div className="menuAnchor permissionAnchor">
    <button className={'accessButton permissionButton '+mode} onClick={()=>setOpen(v=>!v)} aria-haspopup="menu" aria-expanded={open}>
      <ShieldCheck size={15}/><span>{labels[mode]||labels.ask}</span><ChevronDown size={12}/>
    </button>
    {open&&<div className="floatingMenu permissionPicker" role="menu" aria-label="Permissions">
      {[
        ['ask',true],
        ['auto',autoReviewEnabled],
        ['full',fullAccessEnabled]
      ].map(([value,enabled])=><button key={value} className={'permissionRow '+(mode===value?'selected':'')} disabled={!enabled} onClick={()=>{setMode(value);setOpen(false)}}>
        <span className={'permissionIcon '+value}><ShieldCheck size={16}/></span>
        <span><b>{labels[value]}</b><small>{enabled?descriptions[value]:'Enable this mode in Settings > General'}</small></span>
        {mode===value&&<Check size={15}/>}
      </button>)}
    </div>}
  </div>
}

function EffortMenu({effort,levels,choose}){
  const labels={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High'};
  const values=(Array.isArray(levels)&&levels.length?levels:['instant']).filter(v=>labels[v]);
  const index=Math.max(0,values.indexOf(effort));
  return <div className="floatingMenu effortPicker sliderPicker">
    <div className="effortHead"><Brain size={18}/><div><b>{labels[effort]}</b><small>Reasoning effort</small></div></div>
    <input
      className="effortSlider" type="range" min="0" max={Math.max(0,values.length-1)} step="1" value={index}
      aria-label="Reasoning effort" aria-valuetext={labels[effort]}
      onChange={e=>choose(values[Number(e.target.value)])}
    />
    <div className="effortTicks">{values.map(v=><span key={v}/>)}</div>
    <div className="effortScale"><span>Fast</span><span>Deep</span></div>
  </div>
}

function PlusMenu({fileRef,onBrowser,onComputer,onPlugins,tools,setSelectedTool,mode}){
  return <div className="floatingMenu plusPicker" role="menu" aria-label="Add">
    <div className="floatingTitle">Add</div>
    <MenuRow icon={Paperclip} label="Files and folders" onClick={()=>fileRef.current?.click()}/>
    <MenuRow icon={Chrome} label={isNative?'Free AI Browser':'Open browser'} sub={isNative?'Open an isolated browser inside the app':'Browse beside your chat'} onClick={onBrowser}/>
    {mode==='work'&&<MenuRow icon={Folder} label="Add project files" sub="Attach context to this Work task" onClick={()=>fileRef.current?.click()}/>} 
    <div className="floatingTitle section">Plugins</div>
    {tools.length===0?<div className="menuEmpty compact">No installed MCP tools detected.</div>:tools.slice(0,10).map(t=>
      <MenuRow key={t.key} icon={Plug} label={t.mcp} sub={t.ownerName} onClick={()=>setSelectedTool(t)}/>
    )}
    <MenuRow icon={Blocks} label="Manage plugins" onClick={onPlugins}/>
    {onComputer&&<MenuRow icon={Monitor} label="Computer" sub="View or control your desktop" onClick={onComputer}/>} 
  </div>
}

function MenuRow({icon:Icon,label,sub,onClick}){
  const body=<><Icon size={18}/><span><b>{label}</b>{sub&&<small>{sub}</small>}</span></>;
  if(!onClick)return <div className="menuRow staticRow">{body}</div>;
  return <button className="menuRow" role="menuitem" onClick={onClick}>{body}</button>
}

function ProfileMenu({session,onSettings}){
  const name=session?.user?.user_metadata?.full_name||session?.user?.email?.split('@')[0]||'User';
  return <div className="profileMenu" role="menu" aria-label="Account">
    <div className="profileMenuUser"><span className="avatar large">{initials(session)}</span><span><b>{name}</b><small>{session?.user?.email||'Free AI account'}</small></span></div>
    <MenuRow icon={Briefcase} label="Workspace settings" onClick={onSettings}/>
    <MenuRow icon={Settings} label="Settings" onClick={onSettings}/>
    <MenuRow icon={LogOut} label="Log out" onClick={()=>supabase?.auth.signOut()}/>
  </div>
}

function PluginsPage({tools,connected,onBack,onRefresh}){
  const [query,setQuery]=useState('');
  const needle=query.trim().toLowerCase();
  const visibleTools=needle?tools.filter(t=>(t.mcp+' '+t.ownerName).toLowerCase().includes(needle)):tools;
  const visibleProviders=needle?connected.filter(p=>(modelLabel(p)+' '+(p.mcps||[]).join(' ')).toLowerCase().includes(needle)):connected;
  return <div className="contentPage">
    <PageTop onBack={onBack} title="Plugins" action={isDesktop?'Refresh':null} onAction={onRefresh}/>
    <div className="contentInner">
      <h1>Plugins</h1>
      <p className="pageLead">Use MCP/connectors that are already installed and authorized in a connected AI provider.</p>
      <div className="searchBar"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search detected plugins"/></div>

      <section className="pluginSection">
        <div className="sectionHeading"><h2>Installed and detected</h2><span className="pluginMeta">{visibleTools.length} tools</span></div>
        <div className="installedStrip">
          {visibleTools.map(t=><div key={t.key} className="installedIcon tool" title={t.mcp}><Plug size={16}/></div>)}
          {!visibleTools.length&&<span className="muted">{query?'No plugin matches your search.':'No MCP tools are currently detected.'}</span>}
        </div>
      </section>

      <section className="pluginSection">
        <h2>Connected providers</h2>
        <div className="pluginGrid">
          {visibleProviders.map(provider=><div className="pluginCard" key={(provider.source||'browser')+provider.id}>
            <span className={'providerBadge '+(provider.source==='api'?'api':provider.id)}>{modelLabel(provider).slice(0,1)}</span>
            <span><b>{modelLabel(provider)}</b><small>{provider.source==='api'?'API connection':((provider.mcps?.length||0)+' MCP/connectors detected')}</small></span>
            <span className={'connectionStatus '+(provider.source==='browser'?'good':'')}>{provider.source==='browser'?'Live':'API'}</span>
          </div>)}
          {!visibleProviders.length&&<div className="pluginEmptyCard"><Plug size={22}/><b>No provider is connected</b><span>Open a supported AI site in Chrome with the Free AI extension, or add an API model in Settings.</span></div>}
        </div>
      </section>

      <section className="pluginSection">
        <h2>Tools available across models</h2>
        <div className="toolList">
          {visibleTools.map(t=><div className="detectedToolRow" key={t.key}>
            <span className="pluginIcon"><Plug size={18}/></span>
            <span><b>{t.mcp}</b><small>Installed in {t.ownerName}. Free AI can route its result to another connected model.</small></span>
          </div>)}
          {!visibleTools.length&&!query&&<div className="pluginHint"><Chrome size={20}/><div><b>Install or authorize the MCP in its provider first</b><span>Free AI only exposes tools that the connected provider reports as installed.</span></div></div>}
        </div>
      </section>
    </div>
  </div>
}

function ExplorePage({tools,chats,onBack}){
  return <div className="contentPage">
    <PageTop onBack={onBack} title="Explore"/>
    <div className="contentInner exploreInner">
      <div className="searchBar"><Search size={17}/><input placeholder="Search Free AI"/></div>
      <h3>Apps</h3><MenuRow icon={Monitor} label="Computer" sub="Control your desktop in Work mode"/>
      <MenuRow icon={Globe2} label="Browser" sub="Browse and research inside Free AI"/>
      <h3>Plugins</h3>{tools.slice(0,8).map(t=><MenuRow key={t.key} icon={Plug} label={t.mcp} sub={t.ownerName}/>)}
      <h3>Conversations</h3>{chats.slice(0,8).map(c=><MenuRow key={c.id} icon={Bot} label={c.title} sub={c.modelName}/>)}
    </div>
  </div>
}

function PageTop({onBack,title,action,onAction}){
  return <div className="pageTop"><button onClick={onBack}><ArrowLeft size={16}/>Back to app</button><b>{title}</b>{action?<button className="pillAction" onClick={onAction}>{action}{action==='Add'&&<ChevronDown size={13}/>}</button>:<span/>}</div>
}
function PlaceholderPage({title,subtitle,icon:Icon}){
  return <div className="placeholderPage"><Icon size={38}/><h1>{title}</h1><p>{subtitle}</p></div>
}

function BrowserPane({onClose}){
  const [url,setUrl]=useState('https://www.google.com/');
  const [state,setState]=useState({url:'',title:'New tab',canGoBack:false,canGoForward:false,loading:false});
  const surfaceRef=useRef(null);
  useEffect(()=>{
    if(!isDesktop)return;
    const off=window.desktopApi.onBrowserState?.(s=>{setState(s);if(s.url)setUrl(s.url)});
    return()=>{off?.();window.desktopApi.browserClose?.().catch(()=>{})};
  },[]);
  useEffect(()=>{
    if(!isDesktop||!surfaceRef.current)return;
    const el=surfaceRef.current;
    const sync=()=>{
      const r=el.getBoundingClientRect();
      window.desktopApi.browserSetBounds({x:r.x,y:r.y,width:r.width,height:r.height}).catch(()=>{});
    };
    const ro=new ResizeObserver(sync);ro.observe(el);window.addEventListener('resize',sync);sync();
    const r=el.getBoundingClientRect();
    window.desktopApi.browserOpen({url,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}).catch(()=>{});
    return()=>{ro.disconnect();window.removeEventListener('resize',sync)};
  },[]);
  function navigate(){if(isDesktop)window.desktopApi.browserNavigate(url).catch(()=>{})}
  return <aside className="sidePane browserPane">
    <div className="paneTabs"><div className="browserTab"><Globe2 size={14}/><span>{state.title||'New tab'}</span><X size={13}/></div><button onClick={onClose}><X size={16}/></button></div>
    <div className="browserToolbar">
      <button disabled={!state.canGoBack} onClick={()=>window.desktopApi?.browserBack()}><ArrowLeft size={15}/></button>
      <button disabled={!state.canGoForward} onClick={()=>window.desktopApi?.browserForward()}><ArrowRight size={15}/></button>
      <button onClick={()=>window.desktopApi?.browserReload()}><RefreshCw className={state.loading?'spin':''} size={15}/></button>
      <form onSubmit={e=>{e.preventDefault();navigate()}}><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Search or enter a URL"/></form>
      <button onClick={()=>window.desktopApi?.openAuthUrl?.(state.url||url)}><ExternalLink size={15}/></button>
    </div>
    <div className="nativeBrowserSurface" ref={surfaceRef}>{!isDesktop&&<div className="paneEmpty"><Globe2/><b>Browser is available on desktop.</b></div>}</div>
  </aside>
}

function FilePane({file,onClose}){
  return <aside className="sidePane filePane">
    <div className="paneTabs"><div className="browserTab"><File size={14}/><span>{file?.name||'File'}</span></div><button onClick={onClose}><X size={16}/></button></div>
    <div className="fileMeta"><span>{file?.name}</span><small>{file?.type||'File'} · {humanSize(file?.size)}</small></div>
    <div className="filePreview">
      {file?.kind==='image'&&<img src={file.url} alt={file.name}/>}
      {file?.kind==='text'&&<pre>{file.content}</pre>}
      {file?.kind==='archive'&&<div className="paneEmpty"><Archive size={38}/><b>Archive previews aren't supported yet</b><span>The file is attached to this chat.</span></div>}
      {file?.kind==='binary'&&<div className="paneEmpty"><File size={38}/><b>Preview unavailable</b><span>The file is attached to this chat.</span></div>}
    </div>
  </aside>
}

function ComputerPane({screens,setScreens,approvalMode,onSetApprovalMode,permissionPrefs,onClose}){
  const [loading,setLoading]=useState(false);
  const [lastPoint,setLastPoint]=useState(null);
  const [typeText,setTypeText]=useState('');
  const [pendingAction,setPendingAction]=useState(null);
  async function refresh(){
    if(!isDesktop)return;setLoading(true);
    try{setScreens(await window.desktopApi.captureScreens())}catch{setScreens([])}finally{setLoading(false)}
  }
  useEffect(()=>{refresh()},[]);
  async function performAction(action){
    if(!action)return;
    setLastPoint(action);
    try{
      if(typeText)await window.desktopApi.computerClickAndType({...action,text:typeText});
      else await window.desktopApi.computerClick(action);
      setTimeout(refresh,500);
    }catch{}
  }
  async function clickScreen(e,screen){
    if(!isDesktop)return;
    const rect=e.currentTarget.getBoundingClientRect();
    const action={displayId:screen.displayId,nx:(e.clientX-rect.left)/rect.width,ny:(e.clientY-rect.top)/rect.height};
    if(approvalMode==='ask'){setPendingAction(action);return}
    await performAction(action);
  }
  return <aside className="sidePane computerPane">
    <div className="paneTabs"><div className="browserTab"><Monitor size={14}/><span>Computer</span></div><button onClick={onClose}><X size={16}/></button></div>
    <div className="computerToolbar">
      <div><b>Computer use</b><small>{approvalMode==='ask'?'Ask before elevated actions':approvalMode==='auto'?'Approve eligible actions automatically':'Full access enabled'}</small></div>
      <PermissionControl mode={approvalMode} setMode={onSetApprovalMode} autoReviewEnabled={!!permissionPrefs?.autoReviewEnabled} fullAccessEnabled={!!permissionPrefs?.fullAccessEnabled}/>
    </div>
    <div className="computerType"><input value={typeText} onChange={e=>setTypeText(e.target.value)} placeholder="Optional text to type after clicking"/><small>{typeText?'Click a point on the screen to click and type.':'Click the screen to control the mouse.'}</small></div>
    <div className="computerScreens">
      {screens.map(screen=><div className="computerScreen" key={screen.id}>
        <img src={screen.thumbnail} alt={screen.name} onClick={e=>clickScreen(e,screen)}/><span>{screen.name}</span>
      </div>)}
      {!screens.length&&!loading&&<div className="paneEmpty"><Monitor size={34}/><b>No screen preview available</b></div>}
    </div>
    {pendingAction&&<div className="approvalCard">
      <div><ShieldCheck size={17}/><span><b>Allow this computer action?</b><small>Free AI wants to click the selected point{typeText?' and type your text':''}.</small></span></div>
      <div className="approvalActions"><button onClick={()=>setPendingAction(null)}>Deny</button><button className="primaryAction" onClick={async()=>{const action=pendingAction;setPendingAction(null);await performAction(action)}}>Allow once</button></div>
    </div>}
    {lastPoint&&<div className="controlStatus"><MousePointer2 size={13}/>Last control point sent</div>}
  </aside>
}

function SettingsView(props){
  const {section,setSection,onClose,prefs,setPrefs,status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError,onComputer,onPlugins,onBrowser}=props;
  const [mobileList,setMobileList]=useState(true);
  const [settingsQuery,setSettingsQuery]=useState('');
  const visibleSettingsSections=settingsSections.filter(([group,label])=>{
    if(isNative&&['Keyboard shortcuts','Computer use','Git','Environments'].includes(label))return false;
    const q=settingsQuery.trim().toLowerCase();
    return !q||label.toLowerCase().includes(q)||group.toLowerCase().includes(q);
  });
  return <div className={'settingsScreen '+(mobileList?'mobileSettingsList':'mobileSettingsDetail')} role="dialog" aria-modal="true" aria-label="Settings">
    <aside className="settingsNav">
      <button className="backToApp" onClick={onClose}><ArrowLeft size={15}/>Back to app</button>
      <div className="settingsSearch"><Search size={15}/><input value={settingsQuery} onChange={e=>setSettingsQuery(e.target.value)} placeholder="Search"/></div>
      {['personal','integrations','coding'].map(group=><div key={group} className="settingsGroup">
        <div className="settingsGroupLabel">{group==='personal'?'Personal':group==='integrations'?'Integrations':'Coding'}</div>
        {visibleSettingsSections.filter(x=>x[0]===group).map(([_,label,Icon])=><button key={label} className={section===label?'active':''} onClick={()=>{setSection(label);setMobileList(false)}}><Icon size={15}/>{label}</button>)}
      </div>)}
    </aside>
    <main className="settingsContent">
      <div className="settingsContentTop">
        <button className="mobileSettingsBack" onClick={()=>setMobileList(true)} aria-label="Back to settings"><ArrowLeft size={18}/></button>
        <h1>{section}</h1>
        <button className="settingsClose" onClick={onClose} aria-label="Close settings"><X size={18}/></button>
      </div>
      {section==='General'&&<GeneralSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Profile'&&<SimpleSettings title="Profile" rows={[['Account','Manage your Free AI identity'],['Workspace','Personal workspace']]}/>}
      {section==='Appearance'&&<AppearanceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Voice'&&<VoiceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Configuration'&&<ConfigurationSettings prefs={prefs} setPrefs={setPrefs}/>} 
      {section==='Keyboard shortcuts'&&<SimpleSettings title="Keyboard shortcuts" rows={[['New chat','Ctrl+N'],['Settings','Ctrl+,']]}/>}
      {section==='Computer use'&&<IntegrationSettings icon={Monitor} title="Computer use" text="Preview and control your desktop from Work or Super AI." status="Permission-aware" action={onComputer}/>}
      {section==='Plugins'&&<IntegrationSettings icon={Plug} title="Plugins" text="Use MCP/connectors already installed in connected AI services." status={(connected.filter(p=>p.mcps?.length).length)+' providers'} action={onPlugins}/>}
      {section==='Browser'&&<IntegrationSettings icon={Globe2} title="Browser" text={isNative?'Open Free AI Browser in an isolated in-app WebView.':'Open the Free AI browser beside your chat with its own browsing state.'} status={isNative?'In-app WebView':isDesktop?'Available':'Unavailable'} action={onBrowser}/>} 
      {section==='Connections'&&<ConnectionsSettings {...{status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError}}/>}
      {section==='Git'&&<SimpleSettings title="Git" rows={[['Git integration','Available through installed plugins'],['Repository context','Work mode']]}/>}
      {section==='Environments'&&<SimpleSettings title="Environments" rows={[['Desktop runtime',isDesktop?'Electron desktop':'Mobile'],['Browser bridge',status.extension?'Connected':'Disconnected']]}/>}
    </main>
  </div>
}

function Toggle({value,onChange}){return <button role="switch" aria-checked={value} className={'toggle '+(value?'on':'')} onClick={()=>onChange(!value)}><span/></button>}
function GeneralSettings({prefs,setPrefs}){
  return <div className="settingsPane">
    <h3>Permissions</h3>
    <div className="settingBlock">
      <SettingRow title="Default permissions" desc="Free AI can work inside the current workspace and asks before going beyond it." control={<span className="valuePill">Ask for approval</span>}/>
      <SettingRow title="Auto-review" desc="Make Approve for me available in Work and Super AI. Eligible requests can be reviewed automatically." control={<Toggle value={!!prefs.autoReviewEnabled} onChange={v=>setPrefs({...prefs,autoReviewEnabled:v})}/>}/>
      <SettingRow title="Full access" desc="Make Full access available. This allows broad file and network access without approval for each action." control={<Toggle value={!!prefs.fullAccessEnabled} onChange={v=>setPrefs({...prefs,fullAccessEnabled:v})}/>}/>
    </div>
    <h3>General</h3>
    <div className="settingBlock">
      <SettingRow title="Language" desc="The current UI build is English. Additional languages will be enabled after translation QA." control={<span className="valuePill">English</span>}/>
      <SettingRow title="Bottom panel" desc="Show panel controls in Work mode" control={<Toggle value={prefs.showBottomPanel} onChange={v=>setPrefs({...prefs,showBottomPanel:v})}/>}/>
      <SettingRow title="Speed" desc="Default reasoning speed" control={<span className="valuePill">Standard</span>}/>
      <SettingRow title="Suggested prompts" desc="Show starter actions in empty chats" control={<Toggle value={prefs.suggestedPrompts!==false} onChange={v=>setPrefs({...prefs,suggestedPrompts:v})}/>}/>
    </div>
  </div>
}
function SettingRow({title,desc,control}){return <div className="settingRow"><div><b>{title}</b><small>{desc}</small></div>{control}</div>}
function AppearanceSettings({prefs,setPrefs}){
  return <div className="settingsPane">
    <h3>Theme</h3>
    <div className="settingBlock">
      <SettingRow title="Appearance" desc="Follow the system or choose a fixed theme." control={<select value={prefs.appearance||'dark'} onChange={e=>setPrefs({...prefs,appearance:e.target.value})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>}/>
      {!isNative&&<SettingRow title="Contrast" desc="Adjust separation between controls and surfaces." control={<select value={prefs.contrast||'medium'} onChange={e=>setPrefs({...prefs,contrast:e.target.value})}><option value="system">System</option><option value="medium">Medium</option><option value="increased">Increased</option></select>}/>}
      <SettingRow title="Accent color" desc="Used for active controls and voice actions." control={<select value={prefs.accent||'blue'} onChange={e=>setPrefs({...prefs,accent:e.target.value})}><option value="blue">Blue</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="pink">Pink</option><option value="orange">Orange</option><option value="purple">Purple</option><option value="neutral">Neutral</option></select>}/>
      {!isNative&&<SettingRow title="Text size" desc="Scale interface text without changing window zoom." control={<select value={String(prefs.textSize||100)} onChange={e=>setPrefs({...prefs,textSize:Number(e.target.value)})}><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option></select>}/>} 
    </div>
  </div>
}
function ConfigurationSettings({prefs,setPrefs}){
  return <div className="settingsPane">
    <h3>Chat behavior</h3>
    <div className="settingBlock">
      <SettingRow title="Default mode" desc="Mode used when you create a new Free AI conversation." control={<select value={prefs.defaultMode||'chat'} onChange={e=>setPrefs({...prefs,defaultMode:e.target.value})}><option value="chat">Chat</option><option value="work">Work</option></select>}/>
      <SettingRow title="Suggested prompts" desc="Show starter actions in new chats." control={<Toggle value={prefs.suggestedPrompts!==false} onChange={v=>setPrefs({...prefs,suggestedPrompts:v})}/>}/>
    </div>
  </div>
}

function VoiceSettings({prefs,setPrefs}){
  return <div className="settingsPane">
    <h3>Dictation</h3>
    <div className="settingBlock">
      <SettingRow title="Language" desc="Language used for microphone dictation." control={<select value={prefs.voiceLanguage||'system'} onChange={e=>setPrefs({...prefs,voiceLanguage:e.target.value})}><option value="system">System</option><option value="he-IL">עברית</option><option value="en-US">English</option><option value="fr-FR">Français</option></select>}/>
      <SettingRow title="Auto-send" desc="Send automatically when dictation ends. Off keeps the transcript editable." control={<Toggle value={!!prefs.voiceAutoSend} onChange={v=>setPrefs({...prefs,voiceAutoSend:v})}/>}/>
    </div>
  </div>
}
function SimpleSettings({title,rows}){return <div className="settingsPane"><h3>{title}</h3><div className="settingBlock">{rows.map(([a,b])=><SettingRow key={a} title={a} desc="" control={<span className="valuePill">{b}</span>}/>)}</div></div>}
function IntegrationSettings({icon:Icon,title,text,status,action}){return <div className="settingsPane"><div className="integrationHero"><Icon size={34}/><h2>{title}</h2><p>{text}</p><span className="valuePill">{status}</span><button className="primaryAction" onClick={action}>Open</button></div></div>}

function ConnectionsSettings({status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError}){
  return <div className="settingsPane">
    <h3>Desktop bridge</h3>
    <div className="settingBlock">
      <SettingRow title="Chrome extension" desc="Browser models are detected automatically." control={<span className={'connectionStatus '+(status.extension?'good':'')}>{status.extension?'Connected':'Disconnected'}</span>}/>
      <label className="formLabel">Relay URL<input value={settings.relayUrl} onChange={e=>setSettings({...settings,relayUrl:e.target.value})} placeholder="wss://your-relay.example.com"/></label>
      <label className="formLabel">Android pairing API key<div className="keyLine"><input value={settings.pairKey} onChange={e=>setSettings({...settings,pairKey:e.target.value})}/>{isDesktop&&<button onClick={()=>setSettings({...settings,pairKey:randomKey()})}>Generate</button>}</div></label>
      <button className="primaryAction" onClick={saveSettings}>Save connection</button>
    </div>
    <h3>API models</h3>
    <div className="settingBlock">
      {connected.filter(p=>p.source==='api').map(api=><div className="apiItem" key={api.id}><div><b>{modelLabel(api)}</b><small>{api.model} · {api.baseUrl}</small></div>{isDesktop&&<button onClick={()=>removeApiConnection(api.id)}>Remove</button>}</div>)}
      {isDesktop&&<div className="apiForm">
        <input placeholder="Display name" value={apiDraft.name} onChange={e=>setApiDraft({...apiDraft,name:e.target.value})}/>
        <input placeholder="Base URL" value={apiDraft.baseUrl} onChange={e=>setApiDraft({...apiDraft,baseUrl:e.target.value})}/>
        <input placeholder="Model ID" value={apiDraft.model} onChange={e=>setApiDraft({...apiDraft,model:e.target.value})}/>
        <input type="password" placeholder="API key (optional for local servers)" value={apiDraft.apiKey} onChange={e=>setApiDraft({...apiDraft,apiKey:e.target.value})}/>
        <button className="primaryAction" onClick={addApiConnection}>Add API model</button>{apiError&&<div className="formError">{apiError}</div>}
      </div>}
    </div>
  </div>
}

function Auth(){
  const [mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[working,setWorking]=useState(false);

  useEffect(()=>{
    let desktopOff=null,nativeHandle=null,cancelled=false;
    async function finishOAuth(url){
      if(!url||!url.startsWith('freeai://auth'))return;
      setWorking(true);setMessage('');
      try{
        const parsed=new URL(url);
        const oauthError=parsed.searchParams.get('error_description')||parsed.searchParams.get('error');
        if(oauthError)throw new Error(oauthError);
        const code=parsed.searchParams.get('code');
        if(!code)throw new Error('Google did not return an authorization code.');
        const {error}=await supabase.auth.exchangeCodeForSession(code);if(error)throw error;
        if(isNative)try{await Browser.close()}catch{}
      }catch(e){if(!cancelled)setMessage(e?.message||String(e))}
      finally{if(!cancelled)setWorking(false)}
    }
    if(isDesktop&&window.desktopApi?.onAuthCallback)desktopOff=window.desktopApi.onAuthCallback(finishOAuth);
    if(isNative){
      CapacitorApp.addListener('appUrlOpen',({url})=>finishOAuth(url)).then(h=>nativeHandle=h).catch(()=>{});
      CapacitorApp.getLaunchUrl().then(r=>{if(r?.url)finishOAuth(r.url)}).catch(()=>{});
    }
    return()=>{cancelled=true;desktopOff?.();nativeHandle?.remove?.()};
  },[]);

  async function submit(e){
    e.preventDefault();setWorking(true);setMessage('');
    try{
      const result=mode==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      if(mode==='signup'&&!result.data.session)setMessage('Account created. Check your email if confirmation is enabled.');
    }catch(e){setMessage(e?.message||String(e))}finally{setWorking(false)}
  }
  async function google(){
    setWorking(true);setMessage('');
    try{
      const external=isDesktop||isNative;
      const {data,error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:external?AUTH_CALLBACK_URL:window.location.origin,skipBrowserRedirect:external}});
      if(error)throw error;
      if(external){
        if(!data?.url)throw new Error('Google sign-in URL was not created.');
        if(isDesktop)await window.desktopApi.openAuthUrl(data.url);
        else await Browser.open({url:data.url,presentationStyle:'popover'});
      }
    }catch(e){setMessage(e?.message||String(e));setWorking(false)}
  }

  return <div className="authScreen"><div className="authCard">
    <div className="authBrand"><BrandMark size={34}/></div>
    <h1>{mode==='signup'?'Create your account':'Welcome back'}</h1><p>Sign in to Free AI</p>
    <button className="googleButton" onClick={google} disabled={working}>Continue with Google</button>
    <div className="authDivider"><span/>or<span/></div>
    <form onSubmit={submit}><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" required/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" minLength="6" required/><button disabled={working}>{working?'Please wait…':mode==='signup'?'Create account':'Sign in'}</button></form>
    <button className="authSwitch" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('')}}>{mode==='signup'?'Already have an account? Sign in':'New to Free AI? Create account'}</button>
    {message&&<div className="formError">{message}</div>}
  </div></div>
}

function sendRemote(url,key,payload){
  return new Promise((resolve,reject)=>{
    if(!url||!key)return reject(new Error('Set the relay URL and pairing key in Settings first.'));
    let ws;try{ws=new WebSocket(url)}catch{return reject(new Error('The relay URL is invalid.'))}
    const id=crypto.randomUUID(),timer=setTimeout(()=>{try{ws.close()}catch{};reject(new Error('Desktop did not answer in time.'))},180000);
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',role:'mobile',key}));
    ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==='ready'){if(!m.desktopOnline){clearTimeout(timer);ws.close();reject(new Error('Paired desktop is offline.'));return}ws.send(JSON.stringify({type:'prompt',id,...payload}))}
      if(m.type==='response'&&m.id===id){clearTimeout(timer);ws.close();m.error?reject(new Error(m.error)):resolve(m)}
    };
    ws.onerror=()=>{clearTimeout(timer);reject(new Error('Cannot connect to relay.'))};
  });
}

createRoot(document.getElementById('root')).render(<App/>);
