import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {Capacitor} from '@capacitor/core';
import {App as CapacitorApp} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {SpeechRecognition} from '@capgo/capacitor-speech-recognition';
import {InAppBrowser} from '@capgo/capacitor-inappbrowser';
import {SocialLogin} from '@capgo/capacitor-social-login';
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
const desktopPlatform=window.desktopApi?.platform||'';
const isNative=Capacitor.isNativePlatform();
const AUTH_CALLBACK_URL='freeai://auth/callback';
const GOOGLE_WEB_CLIENT_ID=import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID||'991329297292-fp0ciud251vjasflsjq4r7k2vgo4sij7.apps.googleusercontent.com';
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
    <svg viewBox="0 0 512 512" focusable="false">
      <path className="markArc" d="M154 112 A182 182 0 0 1 400 358"/>
      <path className="markArc" d="M358 400 A182 182 0 0 1 112 154"/>
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
  const [product,setProduct]=useState(()=>localStorage.getItem('freeai.product')||'free');
  const [productMenu,setProductMenu]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [mobileModeMenu,setMobileModeMenu]=useState(false);
  const [sidebarSearchOpen,setSidebarSearchOpen]=useState(false);
  const [sidebarSearch,setSidebarSearch]=useState('');
  const [page,setPage]=useState('chat');
  const [mode,setMode]=useState('chat');
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
  const [chats,setChats]=useState(()=>readJSON('freeai.chats.free',readJSON('freeai.chats',[])));
  const [currentChatId,setCurrentChatId]=useState(null);
  const [appPrefs,setAppPrefs]=useState(()=>({
    appearance:'dark',contrast:'medium',accent:'blue',textSize:100,suggestedPrompts:true,approvalMode:'ask',browserAccess:'ask',voiceLanguage:'auto',
    ...readJSON('freeai.prefs',{approvalMode:'ask',defaultPermissions:true,language:'English',showBottomPanel:true})
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
      if(!target.closest('.productSwitcher'))setProductMenu(false);
      if(!target.closest('.profileMenu')&&!target.closest('.profileButton'))setProfileMenu(false);
      if(!target.closest('.mobileModeAnchor'))setMobileModeMenu(false);
    };
    window.addEventListener('keydown',onKey);
    document.addEventListener('pointerdown',onPointer);
    return()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer)};
  },[profileMenu,modelMenu,effortMenu,plusMenu,productMenu,mobileModeMenu,mobileNavOpen,settingsOpen,sidePanel]);

  useEffect(()=>{
    localStorage.setItem('freeai.product',product);
    setChats(readJSON('freeai.chats.'+product,[]));
    setCurrentChatId(null);
    setMessages([]);
    setSelectedTool(null);
    setSidePanel(null);
    if(product==='super')setMode('work');
  },[product]);

  const visibleChats=useMemo(()=>{
    const q=sidebarSearch.trim().toLowerCase();
    return q?chats.filter(chat=>String(chat.title||'').toLowerCase().includes(q)):chats;
  },[chats,sidebarSearch]);

  function persistPrefs(next){setAppPrefs(next);localStorage.setItem('freeai.prefs',JSON.stringify(next))}
  function saveCurrentChat(nextMessages,model=selected){
    if(!model||!nextMessages.length)return;
    const firstUser=nextMessages.find(m=>m.role==='user')?.text||'New chat';
    const title=firstUser.length>46?firstUser.slice(0,46)+'…':firstUser;
    let id=currentChatId;
    if(!id){id=crypto.randomUUID();setCurrentChatId(id)}
    setChats(prev=>{
      const chat={id,title,providerId:model.id,source:model.source,modelName:modelLabel(model),messages:nextMessages,updatedAt:Date.now()};
      const next=[chat,...prev.filter(c=>c.id!==id)].slice(0,60);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));return next;
    });
  }
  function newChat(){
    setCurrentChatId(null);setMessages([]);setPrompt('');setSelectedTool(null);
    setModelMenu(false);setPlusMenu(false);setPage('chat');setSidePanel(null);setMobileNavOpen(false);
  }
  function openChat(chat){
    setCurrentChatId(chat.id);setMessages(Array.isArray(chat.messages)?chat.messages:[]);
    setSelected(connected.find(p=>p.id===chat.providerId&&p.source===chat.source)||null);
    setSelectedTool(null);setPage('chat');
  }
  async function send(){
    const text=prompt.trim();
    if(!text||busy)return;
    if(!selected){setModelMenu(true);return}
    setBusy(true);setPrompt('');
    const withUser=[...messages,{role:'user',text}];setMessages(withUser);saveCurrentChat(withUser,selected);
    try{
      const payload={
        provider:selected.id,source:selected.source||'browser',text,effort,
        mode,product,approvalMode:mode==='work'?appPrefs.approvalMode:'ask',
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
        await InAppBrowser.openWebView({
          url:'https://www.google.com/',
          options:{
            toolbarType:'navigation',
            visibleTitle:true,
            toolbarColor:'#181818',
            toolbarTextColor:'#FFFFFF',
            activeNativeNavigationForWebview:true,
            handleDownloads:true,
            persistWebViewData:true,
            showReloadButton:true,
            closeModal:true
          }
        });
      }catch(e){console.error('Free AI mobile browser failed',e)}
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
  const heading=product==='super'
    ? 'What should we build?'
    : mode==='work'?'What should we work on?':messages.length?'':'Ready when you are.';

  return <div className={'desktopShell '+(!sidebarOpen?'sidebarHidden':'')+' '+(sidePanel?'hasSidePanel':'')+' '+(mobileNavOpen?'mobileNavOpen':'')}>
    <input ref={fileRef} type="file" multiple hidden onChange={attachFiles}/>

    {(sidebarOpen||mobileNavOpen)&&<aside className={'gptSidebar '+(mobileNavOpen?'mobileOpen':'')}>
      <div className="brandRow">
        <div className="productSwitcher">
          <button className="brandButton" title="Switch product" aria-haspopup="menu" aria-expanded={productMenu} onClick={()=>setProductMenu(v=>!v)}>
            <BrandMark size={20}/><b>{product==='super'?'Super AI':'Free AI'}</b><ChevronDown size={14}/>
          </button>
          {productMenu&&<div className="productMenu" role="menu">
            <button className={product==='free'?'active':''} onClick={()=>{setProduct('free');setProductMenu(false);setMode('chat')}}>
              <BrandMark size={20}/><span><b>Free AI</b><small>Chat and work with all connected models</small></span>{product==='free'&&<Check size={16}/>}
            </button>
            <button className={product==='super'?'active':''} onClick={()=>{setProduct('super');setProductMenu(false);setMode('work')}}>
              <BrandMark size={20} className="superMark"/><span><b>Super AI</b><small>Build, debug and run coding tasks</small></span>{product==='super'&&<Check size={16}/>}
            </button>
          </div>}
        </div>
        <div className="brandActions">
          <button title="Search chats" aria-label="Search chats" onClick={()=>setSidebarSearchOpen(v=>!v)}><Search size={16}/></button>
          <button className="mobileCloseNav" title="Close navigation" onClick={()=>setMobileNavOpen(false)}><X size={17}/></button>
        </div>
      </div>
      {sidebarSearchOpen&&<div className="sidebarSearch"><Search size={14}/><input autoFocus value={sidebarSearch} onChange={e=>setSidebarSearch(e.target.value)} placeholder="Search chats"/></div>}

      <div className="mobileQuickStart">
        <button className="mobileNewChat" onClick={newChat}><SquarePen size={17}/><span>New chat</span></button>
        <div className="mobileExperienceRail" aria-label="Experiences">
          <button className={product==='super'?'active':''} onClick={()=>{setProduct('super');setMode('work');setPage('chat');setMobileNavOpen(false)}}><BrandMark size={18} className="superMark"/><span>Super AI</span></button>
          <button className={page==='plugins'?'active':''} onClick={()=>{setPage('plugins');setMobileNavOpen(false)}}><Plug size={18}/><span>Plugins</span></button>
          <button className={page==='explore'?'active':''} onClick={()=>{setPage('explore');setMobileNavOpen(false)}}><Blocks size={18}/><span>Explore</span></button>
        </div>
      </div>

      <nav className="primaryNav desktopPrimaryNav">
        <NavItem icon={SquarePen} label="New chat" active={page==='chat'&&!currentChatId} onClick={newChat}/>
        <NavItem icon={Plug} label="Plugins" active={page==='plugins'} onClick={()=>{setPage('plugins');setMobileNavOpen(false)}}/>
        <NavItem icon={Blocks} label="Explore" active={page==='explore'} onClick={()=>{setPage('explore');setMobileNavOpen(false)}}/>
      </nav>
      <div className="sidebarScroll">
        <div className="sidebarGroupTitle">{product==='super'?'Coding':'Projects'}</div>
        <button className="projectItem" onClick={()=>{setMode('work');setPage('chat');setMobileNavOpen(false)}}>
          {product==='super'?<GitBranch size={15}/>:<Folder size={15}/>}
          {product==='super'?'Repository workspace':'Free AI Workspace'}
        </button>
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
        <button className="voiceButton" onClick={()=>{setPage('chat');setMobileNavOpen(false);window.dispatchEvent(new CustomEvent('freeai:start-voice'))}}><Mic2 size={15}/>Dictate</button>
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
        {product==='free'?<div className="modeSwitch" role="tablist" aria-label="Experience">
          <button role="tab" aria-selected={mode==='chat'} className={mode==='chat'?'active':''} onClick={()=>setMode('chat')}>Chat</button>
          <button role="tab" aria-selected={mode==='work'} className={mode==='work'?'active':''} onClick={()=>setMode('work')}>Work</button>
        </div>:<div className="superHeaderLabel"><BrandMark size={16}/><span>Super AI</span></div>}
        <div className="mobileModeAnchor">
          <button className="mobileModeButton" aria-haspopup={product==='free'?'menu':undefined} aria-expanded={product==='free'?mobileModeMenu:undefined} onClick={()=>product==='free'&&setMobileModeMenu(v=>!v)}>
            <span>{product==='super'?'Super AI':mode==='work'?'Free AI · Work':'Free AI · Chat'}</span>{product==='free'&&<ChevronDown size={14}/>}
          </button>
          {product==='free'&&mobileModeMenu&&<div className="mobileModeMenu" role="menu">
            <button className={mode==='chat'?'active':''} onClick={()=>{setMode('chat');setMobileModeMenu(false)}}>Chat</button>
            <button className={mode==='work'?'active':''} onClick={()=>{setMode('work');setMobileModeMenu(false)}}>Work</button>
          </div>}
        </div>
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
                mode={mode} prompt={prompt} setPrompt={setPrompt} send={send} busy={busy}
                selected={selected} connected={connected} setSelected={setSelected}
                modelMenu={modelMenu} setModelMenu={setModelMenu}
                effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef}
                mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                approvalMode={appPrefs.approvalMode||'ask'} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                onBrowser={openBrowser}
                onComputer={()=>{setPlusMenu(false);setSidePanel('computer')}}
                onPlugins={()=>{setPlusMenu(false);setPage('plugins')}}
              />
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
                  compact mode={mode} prompt={prompt} setPrompt={setPrompt} send={send} busy={busy}
                  selected={selected} connected={connected} setSelected={setSelected}
                  modelMenu={modelMenu} setModelMenu={setModelMenu}
                  effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                  plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef}
                  mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                  product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                  approvalMode={appPrefs.approvalMode||'ask'} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                  onBrowser={openBrowser}
                  onComputer={()=>{setPlusMenu(false);setSidePanel('computer')}}
                  onPlugins={()=>{setPlusMenu(false);setPage('plugins')}}
                />
              </div>
            </div>
        }
        <div className="stageFooter">Free AI can make mistakes. Check important information.</div>
      </section>}

      {page==='plugins'&&<PluginsPage tools={mcpTools} connected={connected} onBack={()=>setPage('chat')} onRefresh={()=>window.desktopApi?.scanProviders?.().catch(()=>{})}/>}
      {page==='explore'&&<ExplorePage tools={mcpTools} chats={chats} onBack={()=>setPage('chat')}/>}
    </main>

    {sidePanel==='browser'&&<BrowserPane onClose={()=>setSidePanel(null)}/>}
    {sidePanel==='file'&&<FilePane file={selectedFile} onClose={()=>setSidePanel(null)}/>}
    {sidePanel==='computer'&&<ComputerPane
      screens={screens} setScreens={setScreens} approvalMode={appPrefs.approvalMode||'ask'}
      setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
      onClose={()=>setSidePanel(null)}
    />}

    {settingsOpen&&<SettingsView
      section={settingsSection} setSection={setSettingsSection} onClose={()=>setSettingsOpen(false)}
      session={session} prefs={appPrefs} setPrefs={persistPrefs} status={status} settings={settings} setSettings={setSettings}
      saveSettings={saveSettings} connected={connected} apiDraft={apiDraft} setApiDraft={setApiDraft}
      addApiConnection={addApiConnection} removeApiConnection={removeApiConnection} apiError={apiError}
      onComputer={()=>{setSettingsOpen(false);setSidePanel('computer')}}
      onPlugins={()=>{setSettingsOpen(false);setPage('plugins')}}
      onBrowser={()=>{setSettingsOpen(false);openBrowser()}}
    />}
  </div>
}

function NavItem({icon:Icon,label,active,onClick}){
  return <button className={'navItem '+(active?'active':'')} onClick={onClick}><Icon size={16}/><span>{label}</span></button>
}

function Composer(props){
  const {
    compact,mode,prompt,setPrompt,send,busy,selected,connected,setSelected,modelMenu,setModelMenu,
    effort,setEffort,effortMenu,setEffortMenu,plusMenu,setPlusMenu,fileRef,mcpTools,selectedTool,setSelectedTool,
    product,voiceLanguage,showBottomPanel,approvalMode,setApprovalMode,onBrowser,onComputer,onPlugins
  }=props;
  const [listening,setListening]=useState(false);
  const [dictationError,setDictationError]=useState('');
  const [approvalMenu,setApprovalMenu]=useState(false);
  const textareaRef=useRef(null);
  const nativeSpeechHandles=useRef([]);
  const webRecognition=useRef(null);
  const dictationBase=useRef('');
  const effortLabel={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High'}[effort]||'Instant';

  async function stopVoice(){
    setDictationError('');
    try{
      if(isNative){
        try{
          const last=await SpeechRecognition.getLastPartialResult?.();
          const text=(last?.text||last?.matches?.[0]||'').trim();
          if(text)setPrompt((dictationBase.current?dictationBase.current+' ':'')+text);
        }catch{}
        await SpeechRecognition.stop().catch(()=>SpeechRecognition.forceStop?.({timeout:900}));
        for(const handle of nativeSpeechHandles.current.splice(0))await handle?.remove?.().catch(()=>{});
      }else if(webRecognition.current){
        webRecognition.current.stop();
        webRecognition.current=null;
      }
    }catch(e){setDictationError(e?.message||'Could not stop dictation.')}
    setListening(false);
  }

  async function startVoice(){
    if(listening){await stopVoice();return}
    setDictationError('');
    dictationBase.current=prompt.trimEnd();

    if(isDesktop){
      if(desktopPlatform!=='win32'){
        setDictationError('Desktop dictation is not available on this platform yet.');
        return;
      }
      try{
        textareaRef.current?.focus();
        await new Promise(r=>setTimeout(r,60));
        await window.desktopApi.startSystemDictation();
      }catch(e){setDictationError(e?.message||'Windows voice typing could not start.')}
      return;
    }

    const language=voiceLanguage==='auto'?(navigator.language||'en-US'):voiceLanguage;
    if(isNative){
      try{
        const available=await SpeechRecognition.available();
        if(!available?.available)throw new Error('Speech recognition is not available on this device.');
        let permission=await SpeechRecognition.checkPermissions();
        if(permission?.speechRecognition!=='granted')permission=await SpeechRecognition.requestPermissions();
        if(permission?.speechRecognition!=='granted')throw new Error('Microphone permission is required for dictation.');

        const partial=await SpeechRecognition.addListener('partialResults',event=>{
          const text=(event?.matches?.[0]||event?.text||'').trim();
          if(text)setPrompt((dictationBase.current?dictationBase.current+' ':'')+text);
        });
        const stateHandle=await SpeechRecognition.addListener('listeningState',event=>{
          const state=String(event?.state||event?.status||'').toLowerCase();
          if(['started','listening','active'].includes(state))setListening(true);
          if(['stopped','ended','idle','inactive'].includes(state))setListening(false);
        });
        const readyHandle=await SpeechRecognition.addListener('readyForNextSession',()=>setListening(false));
        const errorHandle=await SpeechRecognition.addListener('error',event=>{
          setListening(false);
          if(event?.message)setDictationError(event.message);
        });
        nativeSpeechHandles.current=[partial,stateHandle,readyHandle,errorHandle];
        let useOnDeviceRecognition=false;
        try{
          const local=await SpeechRecognition.isOnDeviceRecognitionAvailable?.({language});
          useOnDeviceRecognition=!!local?.available;
        }catch{}
        setListening(true);
        await SpeechRecognition.start({
          language,maxResults:3,partialResults:true,popup:false,addPunctuation:true,useOnDeviceRecognition
        });
      }catch(e){
        setListening(false);
        setDictationError(e?.message||'Dictation could not start.');
      }
      return;
    }

    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){setDictationError('Dictation is not supported by this desktop runtime.');return}
    const recognition=new Recognition();
    webRecognition.current=recognition;
    recognition.lang=language;
    recognition.interimResults=true;
    recognition.continuous=false;
    recognition.onstart=()=>setListening(true);
    recognition.onend=()=>{setListening(false);webRecognition.current=null};
    recognition.onerror=e=>{setListening(false);setDictationError(e?.error||'Dictation failed.');webRecognition.current=null};
    recognition.onresult=e=>{
      const text=[...e.results].map(r=>r[0]?.transcript||'').join(' ').trim();
      if(text)setPrompt((dictationBase.current?dictationBase.current+' ':'')+text);
    };
    recognition.start();
  }
  useEffect(()=>{
    const handler=()=>startVoice();
    window.addEventListener('freeai:start-voice',handler);
    return()=>{
      window.removeEventListener('freeai:start-voice',handler);
      if(isNative)SpeechRecognition.removeAllListeners().catch(()=>{});
      else webRecognition.current?.abort?.();
    };
  },[listening]);

  return <div className={'gptComposer '+(mode==='work'?'workComposer':'')+' '+(compact?'compact':'')}>
    {selectedTool&&<div className="attachedTool"><Plug size={13}/><span>{selectedTool.mcp}</span><small>via {selectedTool.ownerName}</small><button onClick={()=>setSelectedTool(null)}><X size={12}/></button></div>}
    <textarea
      ref={textareaRef}
      value={prompt} onChange={e=>setPrompt(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
      placeholder={product==='super'?'Ask Super AI to build or debug':mode==='work'?'Work with Free AI':selected?'Message '+modelLabel(selected):'Ask Free AI'}
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
        {mode==='work'&&!isNative&&<div className="menuAnchor permissionAnchor">
          <button className={'accessButton mode-'+approvalMode} aria-haspopup="menu" aria-expanded={approvalMenu} onClick={()=>setApprovalMenu(v=>!v)}>
            <ShieldCheck size={15}/>{approvalMode==='full'?'Full access':approvalMode==='auto'?'Automatic':'Manual'}<ChevronDown size={12}/>
          </button>
          {approvalMenu&&<PermissionModeMenu value={approvalMode} choose={value=>{setApprovalMode(value);setApprovalMenu(false)}}/>}
        </div>}
      </div>

      <div className="composerRight">
        <div className="menuAnchor">
          <button className="modelButton" aria-haspopup="listbox" aria-expanded={modelMenu} onClick={()=>setModelMenu(v=>!v)}>
            <span>{modelLabel(selected)}</span>{selected?.modelName&&selected.modelName!==selected.name&&<small>{selected.name}</small>}<ChevronDown size={13}/>
          </button>
          {modelMenu&&<ModelMenu connected={connected} selected={selected} choose={m=>{setSelected(m);setModelMenu(false)}}/>}
        </div>
        {Array.isArray(selected?.effortLevels)&&selected.effortLevels.length>1&&<div className="menuAnchor">
          <button className="effortButton" aria-haspopup="dialog" aria-expanded={effortMenu} onClick={()=>setEffortMenu(v=>!v)}><Brain size={14}/>{effortLabel}<ChevronDown size={12}/></button>
          {effortMenu&&<EffortMenu effort={effort} levels={selected.effortLevels} choose={v=>{setEffort(v);setEffortMenu(false)}}/>}
        </div>}
        {(isNative||!isDesktop||desktopPlatform==='win32')&&<button className={'micButton '+(listening?'listening':'')} onMouseDown={e=>e.preventDefault()} onClick={startVoice} title={listening?'Stop dictation':'Dictate'} aria-label={listening?'Stop dictation':'Dictate'}><Mic2 size={18}/></button>}
        {(busy||prompt.trim())&&<button className={'voiceOrb '+(prompt.trim()&&selected?'sendReady':'')} onClick={prompt.trim()?send:undefined} disabled={busy||(!selected&&!!prompt.trim())}>
          {busy?<RefreshCw className="spin" size={17}/>:<ArrowUp size={18}/>}
        </button>}
      </div>
    </div>
    {dictationError&&<div className="dictationError">{dictationError}</div>}
    {listening&&<div className="dictationStatus"><span className="dictationPulse"/>Listening… tap the microphone to stop</div>}
    {mode==='work'&&showBottomPanel!==false&&<div className="workActions">
      <button onClick={()=>fileRef.current?.click()}><Folder size={15}/>{product==='super'?'Add repository files':'Choose project'}</button>
      <button onClick={onPlugins}><Plug size={15}/>Plugins</button>
      {!isNative&&<button onClick={onBrowser}><Globe2 size={15}/>Browser</button>}
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

function EffortMenu({effort,levels,choose}){
  const fallback=['instant','medium','high','extra'];
  const values=Array.isArray(levels)&&levels.length?levels:fallback;
  const labels={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High','extra-high':'Extra High'};
  const index=Math.max(0,values.indexOf(effort));
  return <div className="floatingMenu effortPicker sliderPicker">
    <div className="effortHead"><Brain size={18}/><div><b>{labels[effort]}</b><small>Reasoning effort</small></div></div>
    <input
      className="effortSlider" type="range" min="0" max={Math.max(0,values.length-1)} step="1" value={index}
      aria-label="Reasoning effort" aria-valuetext={labels[effort]}
      onChange={e=>choose(values[Number(e.target.value)])}
    />
    <div className="effortTicks"><span/><span/><span/><span/></div>
    <div className="effortScale"><span>Fast</span><span>Deep</span></div>
  </div>
}

function PermissionModeMenu({value,choose}){
  const rows=[
    ['ask','Manual','Ask before every supported action that can affect your computer or another service.'],
    ['auto','Automatic','Allow low-risk actions automatically, but still pause for sensitive or consequential actions.'],
    ['full','Full access','Run supported computer actions without repeated approval prompts. Sensitive actions may still require confirmation.']
  ];
  return <div className="floatingMenu permissionPicker" role="menu" aria-label="Permission mode">
    <div className="floatingTitle">Permissions</div>
    {rows.map(([id,label,desc])=><button key={id} className={'permissionRow '+(value===id?'active':'')} onClick={()=>choose(id)}>
      <ShieldCheck size={17}/><span><b>{label}</b><small>{desc}</small></span>{value===id&&<Check size={15}/>}
    </button>)}
  </div>
}

function PlusMenu({fileRef,onBrowser,onComputer,onPlugins,tools,setSelectedTool,mode}){
  return <div className="floatingMenu plusPicker" role="menu" aria-label="Add">
    <div className="floatingTitle">Add</div>
    <MenuRow icon={Paperclip} label="Files and folders" onClick={()=>fileRef.current?.click()}/>
    {!isNative&&<MenuRow icon={Chrome} label="Browser" sub="Browse beside your chat in the isolated Free AI browser" onClick={onBrowser}/>} 
    {mode==='work'&&<MenuRow icon={Folder} label="Add project files" sub="Attach context to this Work task" onClick={()=>fileRef.current?.click()}/>} 
    <div className="floatingTitle section">Plugins</div>
    {tools.length===0?<div className="menuEmpty compact">No installed MCP tools detected.</div>:tools.slice(0,10).map(t=>
      <MenuRow key={t.key} icon={Plug} label={t.mcp} sub={t.ownerName} onClick={()=>setSelectedTool(t)}/>
    )}
    <MenuRow icon={Blocks} label="Manage plugins" onClick={onPlugins}/>
    {!isNative&&<MenuRow icon={Monitor} label="Computer" sub="View or control your desktop" onClick={onComputer}/>} 
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
  const [state,setState]=useState({url:'',title:'New tab',canGoBack:false,canGoForward:false,loading:false,activeTabId:null,tabs:[]});
  const surfaceRef=useRef(null);

  useEffect(()=>{
    if(!isDesktop)return;
    const off=window.desktopApi.onBrowserState?.(next=>{
      setState(next);
      if(next.url)setUrl(next.url);
    });
    return()=>{off?.();window.desktopApi.browserClose?.().catch(()=>{})};
  },[]);

  useEffect(()=>{
    if(!isDesktop||!surfaceRef.current)return;
    const el=surfaceRef.current;
    const sync=()=>{
      const r=el.getBoundingClientRect();
      window.desktopApi.browserSetBounds({x:r.x,y:r.y,width:r.width,height:r.height}).catch(()=>{});
    };
    const ro=new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize',sync);
    sync();
    const r=el.getBoundingClientRect();
    window.desktopApi.browserOpen({url,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}).then(next=>{
      if(next){setState(next);if(next.url)setUrl(next.url)}
    }).catch(()=>{});
    return()=>{ro.disconnect();window.removeEventListener('resize',sync)};
  },[]);

  async function navigate(){
    if(!isDesktop)return;
    const next=await window.desktopApi.browserNavigate(url).catch(()=>null);
    if(next){setState(next);if(next.url)setUrl(next.url)}
  }

  async function newTab(){
    if(!isDesktop)return;
    const next=await window.desktopApi.browserNewTab('https://www.google.com/').catch(()=>null);
    if(next){setState(next);setUrl(next.url||'https://www.google.com/')}
  }

  async function switchTab(id){
    const next=await window.desktopApi.browserSwitchTab(id).catch(()=>null);
    if(next){setState(next);setUrl(next.url||'')}
  }

  async function closeTab(e,id){
    e.stopPropagation();
    let next=await window.desktopApi.browserCloseTab(id).catch(()=>null);
    if(next?.tabs?.length===0)next=await window.desktopApi.browserNewTab('https://www.google.com/').catch(()=>next);
    if(next){setState(next);setUrl(next.url||'https://www.google.com/')}
  }

  return <aside className="sidePane browserPane">
    <div className="browserTabsBar">
      <div className="browserTabsScroller">
        {(state.tabs||[]).map(tab=><button
          key={tab.id}
          className={'browserTopTab '+(tab.id===state.activeTabId?'active':'')}
          onClick={()=>switchTab(tab.id)}
          title={tab.title||tab.url||'New tab'}
        >
          <Globe2 size={13}/>
          <span>{tab.title||'New tab'}</span>
          <span className="browserTabClose" role="button" tabIndex={0} onClick={e=>closeTab(e,tab.id)}><X size={12}/></span>
        </button>)}
        <button className="browserNewTab" onClick={newTab} aria-label="New browser tab"><Plus size={15}/></button>
      </div>
      <button className="browserPaneClose" onClick={onClose} aria-label="Close browser"><X size={16}/></button>
    </div>
    <div className="browserToolbar">
      <button disabled={!state.canGoBack} onClick={()=>window.desktopApi?.browserBack()}><ArrowLeft size={15}/></button>
      <button disabled={!state.canGoForward} onClick={()=>window.desktopApi?.browserForward()}><ArrowRight size={15}/></button>
      <button onClick={()=>window.desktopApi?.browserReload()}><RefreshCw className={state.loading?'spin':''} size={15}/></button>
      <form onSubmit={e=>{e.preventDefault();navigate()}}><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Search or enter a URL"/></form>
      <button onClick={()=>window.desktopApi?.openAuthUrl?.(state.url||url)} title="Open in default browser"><ExternalLink size={15}/></button>
    </div>
    <div className="nativeBrowserSurface" ref={surfaceRef}/>
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

function ComputerPane({screens,setScreens,approvalMode,setApprovalMode,onClose}){
  const [loading,setLoading]=useState(false);
  const [lastPoint,setLastPoint]=useState(null);
  const [typeText,setTypeText]=useState('');
  const [pendingAction,setPendingAction]=useState(null);
  const [controlError,setControlError]=useState('');

  async function refresh(){
    if(!isDesktop)return;setLoading(true);
    try{setScreens(await window.desktopApi.captureScreens())}catch{setScreens([])}finally{setLoading(false)}
  }
  useEffect(()=>{refresh()},[]);

  async function executeAction(action){
    setControlError('');
    try{
      if(action.text)await window.desktopApi.computerClickAndType(action);
      else await window.desktopApi.computerClick(action);
      setLastPoint(action);
      setPendingAction(null);
      setTimeout(refresh,500);
    }catch(e){setControlError(e?.message||'Computer action failed.')}
  }

  async function clickScreen(e,screen){
    const rect=e.currentTarget.getBoundingClientRect();
    const action={
      displayId:screen.displayId,
      nx:(e.clientX-rect.left)/rect.width,
      ny:(e.clientY-rect.top)/rect.height,
      text:typeText||''
    };
    if(approvalMode==='ask'||(approvalMode==='auto'&&!!action.text)){setPendingAction(action);return}
    await executeAction(action);
  }

  const label=approvalMode==='full'?'Full access':approvalMode==='auto'?'Automatic':'Manual';
  return <aside className="sidePane computerPane">
    <div className="paneTabs"><div className="browserTab"><Monitor size={14}/><span>Computer</span></div><button onClick={onClose}><X size={16}/></button></div>
    <div className="computerToolbar">
      <div><b>Computer use</b><small>{label}</small></div>
      <select className="computerPermissionSelect" value={approvalMode} onChange={e=>setApprovalMode(e.target.value)}>
        <option value="ask">Manual</option>
        <option value="auto">Automatic</option>
        <option value="full">Full access</option>
      </select>
      <button onClick={refresh}><RefreshCw className={loading?'spin':''} size={15}/>Refresh</button>
    </div>
    <div className="computerType"><input value={typeText} onChange={e=>setTypeText(e.target.value)} placeholder="Optional text to type after clicking"/><small>{typeText?'Click a point to propose a click + type action.':'Click a point to propose a mouse action.'}</small></div>
    {pendingAction&&<div className="approvalPrompt">
      <ShieldCheck size={18}/><div><b>Approve this computer action?</b><small>{pendingAction.text?'Click the selected point and type the prepared text.':'Click the selected point.'}</small></div>
      <button onClick={()=>setPendingAction(null)}>Cancel</button>
      <button className="approveAction" onClick={()=>executeAction(pendingAction)}>Approve</button>
    </div>}
    {controlError&&<div className="computerError">{controlError}</div>}
    <div className="computerScreens">
      {screens.map(screen=><div className="computerScreen" key={screen.id}>
        <img src={screen.thumbnail} alt={screen.name} onClick={e=>clickScreen(e,screen)}/><span>{screen.name}</span>
      </div>)}
      {!screens.length&&!loading&&<div className="paneEmpty"><Monitor size={34}/><b>No screen preview available</b></div>}
    </div>
    {lastPoint&&<div className="controlStatus"><MousePointer2 size={13}/>Last action completed</div>}
  </aside>
}

function SettingsView(props){
  const {section,setSection,onClose,session,prefs,setPrefs,status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError,onComputer,onPlugins,onBrowser}=props;
  const [mobileList,setMobileList]=useState(true);
  const [settingsQuery,setSettingsQuery]=useState('');
  const hiddenOnMobile=new Set(['General','Keyboard shortcuts','Computer use','Browser','Configuration','Git','Environments']);
  const visibleSettings=settingsSections.filter(([,label])=>(!isNative||!hiddenOnMobile.has(label))&&(!settingsQuery.trim()||label.toLowerCase().includes(settingsQuery.trim().toLowerCase())));
  return <div className={'settingsScreen '+(mobileList?'mobileSettingsList':'mobileSettingsDetail')} role="dialog" aria-modal="true" aria-label="Settings">
    <aside className="settingsNav">
      <button className="backToApp" onClick={onClose}><ArrowLeft size={15}/>Back to app</button>
      <div className="settingsSearch"><Search size={15}/><input value={settingsQuery} onChange={e=>setSettingsQuery(e.target.value)} placeholder="Search settings"/></div>
      {['personal','integrations','coding'].map(group=><div key={group} className="settingsGroup">
        <div className="settingsGroupLabel">{group==='personal'?'Personal':group==='integrations'?'Integrations':'Coding'}</div>
        {visibleSettings.filter(x=>x[0]===group).map(([_,label,Icon])=><button key={label} className={section===label?'active':''} onClick={()=>{setSection(label);setMobileList(false)}}><Icon size={15}/>{label}</button>)}
      </div>)}
    </aside>
    <main className="settingsContent">
      <div className="settingsContentTop">
        <button className="mobileSettingsBack" onClick={()=>setMobileList(true)} aria-label="Back to settings"><ArrowLeft size={18}/></button>
        <h1>{section}</h1>
        <button className="settingsClose" onClick={onClose} aria-label="Close settings"><X size={18}/></button>
      </div>
      {section==='General'&&<GeneralSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Profile'&&<ProfileSettings session={session}/>} 
      {section==='Appearance'&&<AppearanceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Voice'&&<VoiceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Configuration'&&<ConfigurationSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Keyboard shortcuts'&&!isNative&&<SimpleSettings title="Keyboard shortcuts" rows={[['New chat','Ctrl+N'],['Browser','Ctrl+Shift+B'],['Settings','Ctrl+,']]}/>}
      {section==='Computer use'&&!isNative&&<IntegrationSettings icon={Monitor} title="Computer use" text="Preview and control your desktop from Work or Super AI." status={prefs.approvalMode==='full'?'Full access':prefs.approvalMode==='auto'?'Automatic':'Manual'} action={onComputer}/>}
      {section==='Plugins'&&<IntegrationSettings icon={Plug} title="Plugins" text="Use MCP/connectors already installed in connected AI services." status={(connected.filter(p=>p.mcps?.length).length)+' providers'} action={onPlugins}/>}
      {section==='Browser'&&<IntegrationSettings icon={Globe2} title="Browser" text={isNative?'Open the managed Free AI browser.':'Open the real browser panel beside your chat.'} status="Available" action={onBrowser}/>}
      {section==='Connections'&&<ConnectionsSettings {...{status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError}}/>}
      {section==='Git'&&!isNative&&<SimpleSettings title="Git" rows={[['Git integration','Available through installed plugins'],['Repository context','Super AI / Work']]}/>}
      {section==='Environments'&&!isNative&&<SimpleSettings title="Environments" rows={[['Desktop runtime','Electron desktop'],['Browser bridge',status.extension?'Connected':'Disconnected']]}/>}
    </main>
  </div>
}

function Toggle({value,onChange}){return <button role="switch" aria-checked={value} className={'toggle '+(value?'on':'')} onClick={()=>onChange(!value)}><span/></button>}
function GeneralSettings({prefs,setPrefs}){
  return <div className="settingsPane">
    <h3>Permissions</h3>
    <div className="settingBlock">
      {!isNative&&<SettingRow title="Approval mode" desc="Choose how Work and Super AI review supported actions." control={<select value={prefs.approvalMode||'ask'} onChange={e=>setPrefs({...prefs,approvalMode:e.target.value})}><option value="ask">Manual</option><option value="auto">Automatic</option><option value="full">Full access</option></select>}/>} 
    </div>
    {!isNative&&<><h3>General</h3>
    <div className="settingBlock">
      <SettingRow title="Bottom panel" desc="Show project, plugin and browser actions below the Work composer." control={<Toggle value={prefs.showBottomPanel!==false} onChange={v=>setPrefs({...prefs,showBottomPanel:v})}/>}/>
    </div></>}
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
function ProfileSettings({session}){
  const [name,setName]=useState(session?.user?.user_metadata?.full_name||'');
  const [state,setState]=useState('');
  async function save(){
    if(!supabase)return;
    setState('Saving…');
    const {error}=await supabase.auth.updateUser({data:{full_name:name.trim()}});
    setState(error?(error.message||'Could not save'):'Saved');
  }
  return <div className="settingsPane">
    <h3>Account</h3>
    <div className="settingBlock profileSettingsBlock">
      <label className="profileField"><span>Display name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label>
      <SettingRow title="Email" desc={session?.user?.email||'No email available'} control={<span className="valuePill">Signed in</span>}/>
      <div className="profileActions"><span>{state}</span><button className="primaryAction" onClick={save}>Save profile</button></div>
    </div>
  </div>
}
function VoiceSettings({prefs,setPrefs}){
  const [permission,setPermission]=useState('unknown');
  useEffect(()=>{
    if(!isNative)return;
    SpeechRecognition.checkPermissions().then(p=>setPermission(p?.speechRecognition||'unknown')).catch(()=>setPermission('unknown'));
  },[]);
  async function request(){
    try{const p=await SpeechRecognition.requestPermissions();setPermission(p?.speechRecognition||'unknown')}catch{setPermission('denied')}
  }
  return <div className="settingsPane">
    <h3>Dictation</h3>
    <div className="settingBlock">
      {isDesktop&&desktopPlatform==='win32'&&<SettingRow title="Engine" desc="Uses Windows Voice Typing. Its language follows your current Windows input language." control={<span className="valuePill">Windows + H</span>}/>}
      {isDesktop&&desktopPlatform!=='win32'&&<SettingRow title="Desktop dictation" desc="No reliable native dictation engine is configured for this platform yet." control={<span className="valuePill">Unavailable</span>}/>}
      {!isDesktop&&<SettingRow title="Language" desc="Language used by the microphone dictation button." control={<select value={prefs.voiceLanguage||'auto'} onChange={e=>setPrefs({...prefs,voiceLanguage:e.target.value})}><option value="auto">Device language</option><option value="he-IL">עברית</option><option value="en-US">English (US)</option><option value="fr-FR">Français</option><option value="ar">العربية</option></select>}/>}
      {isNative&&<SettingRow title="Microphone permission" desc="Required for native Android dictation." control={<button className="settingsInlineButton" onClick={request}>{permission==='granted'?'Granted':'Request access'}</button>}/>}
    </div>
  </div>
}
function ConfigurationSettings({prefs,setPrefs}){
  return <div className="settingsPane"><h3>Work</h3><div className="settingBlock">
    <SettingRow title="Bottom panel" desc="Show project, plugin and browser actions below the Work composer." control={<Toggle value={prefs.showBottomPanel!==false} onChange={v=>setPrefs({...prefs,showBottomPanel:v})}/>}/>
  </div></div>
}
function SimpleSettings({title,rows}){return <div className="settingsPane"><h3>{title}</h3><div className="settingBlock">{rows.map(([a,b])=><SettingRow key={a} title={a} desc={b} control={<span className="valuePill">{b}</span>}/>)}</div></div>}
function IntegrationSettings({icon:Icon,title,text,status,action}){return <div className="settingsPane"><div className="integrationHero"><Icon size={34}/><h2>{title}</h2><p>{text}</p><span className="valuePill">{status}</span><button className="primaryAction" onClick={action}>Open</button></div></div>}

function BrowserSettings({prefs,setPrefs,onBrowser}){
  const [clearing,setClearing]=useState(false);
  const [state,setState]=useState('');
  async function clearData(){
    if(!isDesktop||!window.desktopApi?.browserClearData)return;
    setClearing(true);setState('');
    try{await window.desktopApi.browserClearData();setState('Browser cookies, storage and cache cleared.')}
    catch(e){setState(e?.message||'Could not clear browser data.')}
    finally{setClearing(false)}
  }
  return <div className="settingsPane">
    <h3>Built-in browser</h3>
    <div className="settingBlock">
      <SettingRow title="Website access" desc="Choose how agent website-access requests are reviewed. Consequential actions can still require confirmation." control={
        <select value={prefs.browserAccess||'ask'} onChange={e=>setPrefs({...prefs,browserAccess:e.target.value})}>
          <option value="ask">Always ask</option>
          <option value="auto">Auto approve</option>
          <option value="allow">Always allow</option>
        </select>
      }/>
      <SettingRow title="Browser profile" desc="The built-in browser uses its own cookies and signed-in sessions, separate from Chrome." control={<span className="valuePill">Isolated</span>}/>
    </div>
    <div className="browserSettingsActions">
      <button className="primaryAction" onClick={onBrowser}><Globe2 size={15}/>Open browser</button>
      <button className="settingsInlineButton" disabled={clearing} onClick={clearData}>{clearing?'Clearing…':'Clear browser data'}</button>
    </div>
    {state&&<div className="settingsFeedback">{state}</div>}
  </div>
}

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
  const nativeGoogleReady=useRef(false);

  async function initNativeGoogle(){
    if(!isNative||nativeGoogleReady.current)return;
    if(!GOOGLE_WEB_CLIENT_ID)throw new Error('Google native sign-in is not configured.');
    await SocialLogin.initialize({
      google:{webClientId:GOOGLE_WEB_CLIENT_ID,mode:'online'}
    });
    nativeGoogleReady.current=true;
  }

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
      initNativeGoogle().catch(()=>{});
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
      if(isNative){
        await initNativeGoogle();
        const login=await SocialLogin.login({
          provider:'google',
          options:{
            scopes:['openid','email','profile'],
            style:'bottom',
            filterByAuthorizedAccounts:false
          }
        });
        const idToken=login?.result?.idToken;
        if(!idToken)throw new Error('Google did not return an ID token.');
        const {error}=await supabase.auth.signInWithIdToken({provider:'google',token:idToken});
        if(error)throw error;
        setWorking(false);
        return;
      }

      const external=isDesktop;
      const {data,error}=await supabase.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo:external?AUTH_CALLBACK_URL:window.location.origin,skipBrowserRedirect:external}
      });
      if(error)throw error;
      if(external){
        if(!data?.url)throw new Error('Google sign-in URL was not created.');
        await window.desktopApi.openAuthUrl(data.url);
      }
    }catch(e){
      const raw=e?.message||String(e);
      const setup=/28444|developer console|configuration/i.test(raw)
        ? 'Google sign-in needs one Android OAuth client for com.freeai.mobile with this APK signing SHA-1 in Google Cloud.'
        : raw;
      setMessage(setup);setWorking(false);
    }
  }

  return <div className="authScreen"><div className="authCard">
    <div className="authBrand"><BrandMark size={34}/></div>
    <h1>{mode==='signup'?'Create your account':'Welcome back'}</h1><p>Sign in to Free AI</p>
    <button className="googleButton" onClick={google} disabled={working}><span className="googleGlyph" aria-hidden="true">G</span><span>Continue with Google</span></button>
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
