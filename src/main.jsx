import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {Capacitor} from '@capacitor/core';
import {App as CapacitorApp} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {Haptics,ImpactStyle} from '@capacitor/haptics';
import {SpeechRecognition} from '@capgo/capacitor-speech-recognition';
import {InAppBrowser} from '@capgo/capacitor-inappbrowser';
import {SocialLogin} from '@capgo/capacitor-social-login';
import {
  AppWindow,Archive,ArrowLeft,ArrowRight,ArrowUp,Bell,Blocks,Bot,Box,Brain,Briefcase,Camera,
  CalendarDays,Check,ChevronDown,ChevronRight,Chrome,Clock3,Code2,Database,Download,ExternalLink,
  Ellipsis,File,FileText,Folder,GitBranch,Globe2,HardDrive,HelpCircle,Image,Keyboard,Link2,
  LogOut,Mail,Menu,Mic2,Monitor,MousePointer2,Palette,PanelLeft,Paperclip,PenLine,Plug,
  Pin,Plus,RefreshCw,RotateCcw,Search,Settings,ShieldCheck,SlidersHorizontal,Sparkles,
  SquarePen,Table2,Target,SquareTerminal,Trash2,Upload,UserRound,Volume2,X
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
  ['personal','General',Settings],['personal','Import',Upload],['personal','Profile',UserRound],['personal','Appearance',Palette],['personal','Voice',Volume2],
  ['personal','Personalization',Sparkles],['personal','Data controls',Database],
  ['personal','Configuration',SlidersHorizontal],['personal','Keyboard shortcuts',Keyboard],
  ['integrations','Computer use',Monitor],['integrations','Appshots',Camera],['integrations','Plugins',Plug],['integrations','Browser',Globe2],
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

function mediaDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('freeai-media',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('images'))request.result.createObjectStore('images',{keyPath:'id'})};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function listImageAssets(){
  const db=await mediaDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readonly');
    const request=tx.objectStore('images').getAll();
    request.onsuccess=()=>resolve((request.result||[]).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
    request.onerror=()=>reject(request.error);
    tx.oncomplete=()=>db.close();
  });
}
async function saveImageAsset(asset){
  const db=await mediaDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');
    tx.objectStore('images').put(asset);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  db.close();
}
async function removeImageAsset(id){
  const db=await mediaDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');
    tx.objectStore('images').delete(id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  db.close();
}
function fileAsDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function BrandMark({size=22,className=''}) {
  return <span className={'freeAiMark '+className} style={{'--mark-size':size+'px'}} aria-hidden="true">
    <svg viewBox="0 0 512 512" focusable="false">
      <path className="markArc" d="M154 112 A182 182 0 0 1 400 358"/>
      <path className="markArc" d="M358 400 A182 182 0 0 1 112 154"/>
    </svg>
  </span>;
}

function WindowsTitlebar({onNewChat,onSettings,onToggleSidebar,onBrowser,onHelp}){
  const [open,setOpen]=useState('');
  const barRef=useRef(null);
  useEffect(()=>{
    const close=e=>{if(!barRef.current?.contains(e.target))setOpen('')};
    const esc=e=>{if(e.key==='Escape')setOpen('')};
    document.addEventListener('pointerdown',close);
    window.addEventListener('keydown',esc);
    return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('keydown',esc)};
  },[]);
  function edit(command){try{document.execCommand(command)}catch{}setOpen('')}
  function choose(name){setOpen(v=>v===name?'':name)}
  return <div className="windowsTitlebar" ref={barRef}>
    <div className="windowsTitlebarLeft">
      <BrandMark size={15}/>
      <button className="titleNavButton" aria-label="Back" onClick={()=>history.back()}><ArrowLeft size={14}/></button>
      <button className="titleNavButton" aria-label="Forward" onClick={()=>history.forward()}><ArrowRight size={14}/></button>
      <div className="titleMenuAnchor">
        <button className={open==='file'?'active':''} onClick={()=>choose('file')}>File</button>
        {open==='file'&&<div className="titleMenuPopup">
          <button onClick={()=>{setOpen('');onNewChat()}}><span>New chat</span><kbd>Ctrl+N</kbd></button>
          <button onClick={()=>{setOpen('');onSettings()}}><span>Settings</span><kbd>Ctrl+,</kbd></button>
          <span className="titleMenuDivider"/>
          <button onClick={()=>window.desktopApi?.quitApp?.()}><span>Exit</span></button>
        </div>}
      </div>
      <div className="titleMenuAnchor">
        <button className={open==='edit'?'active':''} onClick={()=>choose('edit')}>Edit</button>
        {open==='edit'&&<div className="titleMenuPopup">
          <button onClick={()=>edit('undo')}><span>Undo</span><kbd>Ctrl+Z</kbd></button>
          <button onClick={()=>edit('redo')}><span>Redo</span><kbd>Ctrl+Y</kbd></button>
          <span className="titleMenuDivider"/>
          <button onClick={()=>edit('cut')}><span>Cut</span><kbd>Ctrl+X</kbd></button>
          <button onClick={()=>edit('copy')}><span>Copy</span><kbd>Ctrl+C</kbd></button>
          <button onClick={()=>edit('paste')}><span>Paste</span><kbd>Ctrl+V</kbd></button>
          <button onClick={()=>edit('selectAll')}><span>Select all</span><kbd>Ctrl+A</kbd></button>
        </div>}
      </div>
      <div className="titleMenuAnchor">
        <button className={open==='view'?'active':''} onClick={()=>choose('view')}>View</button>
        {open==='view'&&<div className="titleMenuPopup">
          <button onClick={()=>{setOpen('');onToggleSidebar()}}><span>Toggle sidebar</span><kbd>Ctrl+Shift+S</kbd></button>
          <button onClick={()=>{setOpen('');onBrowser()}}><span>Browser</span><kbd>Ctrl+Shift+B</kbd></button>
          <span className="titleMenuDivider"/>
          <button onClick={()=>{setOpen('');window.desktopApi?.reloadApp?.()}}><span>Reload</span><kbd>Ctrl+R</kbd></button>
        </div>}
      </div>
      <div className="titleMenuAnchor">
        <button className={open==='help'?'active':''} onClick={()=>choose('help')}>Help</button>
        {open==='help'&&<div className="titleMenuPopup">
          <button onClick={()=>{setOpen('');onHelp()}}><span>Free AI help</span></button>
          <button onClick={()=>{setOpen('');onSettings()}}><span>About Free AI</span></button>
        </div>}
      </div>
    </div>
    <div className="windowsDragRegion" aria-hidden="true"/>
  </div>;
}

function WindowsVoiceOverlay({selected,onClose,onTurn}){
  const [listening,setListening]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const [heard,setHeard]=useState('');
  const [reply,setReply]=useState('');
  const [error,setError]=useState('');

  async function takeTurn(){
    if(listening||speaking)return;
    if(!selected){setError('Choose a connected model before starting Voice.');return}
    setError('');setHeard('');setReply('');setListening(true);
    try{
      const recognition=await window.desktopApi.recognizeSystemDictation?.();
      if(!recognition?.ok||!recognition.text)throw new Error(recognition?.error||'I did not hear anything.');
      const text=recognition.text.trim();
      setHeard(text);setListening(false);
      const result=await onTurn(text);
      const answer=String(result?.text||result||'').trim();
      setReply(answer);
      if(answer){
        setSpeaking(true);
        await window.desktopApi.speakText?.(answer);
      }
    }catch(e){setError(e?.message||'Voice could not continue.')}
    finally{setListening(false);setSpeaking(false)}
  }

  useEffect(()=>{
    const key=e=>{if(e.key==='Escape')onClose()};
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  },[onClose]);

  return <div className="voiceOverlay" role="dialog" aria-modal="true" aria-label="Voice">
    <div className="voiceTopbar">
      <span><BrandMark size={18}/><b>Voice</b><small>Standard</small></span>
      <button onClick={onClose} aria-label="Exit voice"><X size={18}/></button>
    </div>
    <div className="voiceStage">
      <div className={'voiceCore '+(listening?'listening ':'')+(speaking?'speaking':'')}>
        <span/><span/><span/>
      </div>
      <h2>{listening?'Listening…':speaking?'Speaking…':'Ready when you are.'}</h2>
      {heard&&<div className="voiceTranscript"><small>You</small><p>{heard}</p></div>}
      {reply&&<div className="voiceTranscript assistant"><small>{modelLabel(selected)}</small><p>{reply}</p></div>}
      {error&&<div className="voiceError">{error}</div>}
    </div>
    <div className="voiceControls">
      <button className={'voiceMicControl '+(listening?'active':'')} onClick={takeTurn} disabled={speaking} aria-label="Speak"><Mic2 size={20}/></button>
      <button className="voiceExitControl" onClick={onClose} aria-label="Exit voice"><X size={20}/></button>
    </div>
  </div>;
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
  const [voiceOpen,setVoiceOpen]=useState(false);
  const [settingsSection,setSettingsSection]=useState('General');
  const [sidePanel,setSidePanel]=useState(null);
  const [selectedFile,setSelectedFile]=useState(null);
  const [screens,setScreens]=useState([]);
  const [chats,setChats]=useState(()=>readJSON('freeai.chats.free',readJSON('freeai.chats',[])));
  const [archivedChats,setArchivedChats]=useState(()=>readJSON('freeai.archived.free',[]));
  const [projects,setProjects]=useState(()=>readJSON('freeai.projects',[]));
  const [currentProjectId,setCurrentProjectId]=useState(null);
  const [projectDialog,setProjectDialog]=useState(false);
  const [projectDraft,setProjectDraft]=useState('');
  const [imageAssets,setImageAssets]=useState([]);
  const [scheduledTasks,setScheduledTasks]=useState(()=>readJSON('freeai.scheduled',[]));
  const [recentsSort,setRecentsSort]=useState(()=>localStorage.getItem('freeai.recents.sort')||'recent');
  const [chatMenuId,setChatMenuId]=useState(null);
  const [currentChatId,setCurrentChatId]=useState(null);
  const [appPrefs,setAppPrefs]=useState(()=>({
    appearance:'dark',contrast:'medium',accent:'blue',textSize:100,suggestedPrompts:true,approvalMode:'ask',voiceLanguage:'auto',
    autoReviewEnabled:false,fullAccessEnabled:false,customizationEnabled:true,customInstructions:'',siteToolsEnabled:true,
    spellCheckEnabled:true,hapticsEnabled:true,
    ...readJSON('freeai.prefs',{approvalMode:'ask',defaultPermissions:true,autoReviewEnabled:false,fullAccessEnabled:false,customizationEnabled:true,customInstructions:'',siteToolsEnabled:true,spellCheckEnabled:true,hapticsEnabled:true,language:'English',showBottomPanel:true})
  }));
  const [settings,setSettings]=useState(()=>({relayUrl:localStorage.getItem('relayUrl')||'',pairKey:localStorage.getItem('pairKey')||''}));
  const [apiDraft,setApiDraft]=useState({name:'',baseUrl:'',model:'',apiKey:''});
  const [apiError,setApiError]=useState('');
  const fileRef=useRef(null);
  const photoRef=useRef(null);
  const cameraRef=useRef(null);

  useEffect(()=>{
    if(!supabase){setSession({user:{email:'Local workspace'}});setAuthReady(true);return}
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true)}).catch(()=>{setSession(null);setAuthReady(true)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setAuthReady(true)});
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    let live=true;
    listImageAssets().then(items=>live&&setImageAssets(items)).catch(()=>{});
    return()=>{live=false};
  },[]);

  useEffect(()=>{
    if(!isDesktop)return;
    let active=true;
    window.desktopApi.getStatus().then(s=>active&&setStatus(s)).catch(()=>{});
    const offStatus=window.desktopApi.onStatus(s=>active&&setStatus(s));
    const offCommand=window.desktopApi.onAppCommand?.(command=>{
      if(command==='new-chat')newChat();
      if(command==='about'||command==='settings'){setSettingsSection('General');setSettingsOpen(true)}
      if(command==='open-browser')openBrowser();
      if(command==='toggle-sidebar')setSidebarOpen(v=>!v);
    });
    const offAppshot=window.desktopApi.onAppshot?.(data=>applyAppshot(data));
    window.desktopApi.configureRelay(settings).then(s=>active&&setStatus(s)).catch(()=>{});
    window.desktopApi.scanProviders().catch(()=>{});
    return()=>{active=false;offStatus?.();offCommand?.();offAppshot?.()};
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
    const scheme=window.matchMedia?.('(prefers-color-scheme: light)');
    const highContrast=window.matchMedia?.('(prefers-contrast: more)');
    const apply=()=>{
      let resolved=appPrefs.appearance||'dark';
      if(resolved==='system')resolved=scheme?.matches?'light':'dark';
      root.dataset.theme=resolved;
      root.dataset.contrast=appPrefs.contrast==='system'?(highContrast?.matches?'increased':'medium'):(appPrefs.contrast||'medium');
      root.dataset.accent=appPrefs.accent||'blue';
      const scale=(Number(appPrefs.textSize)||100)/100;
      const canZoom=(!isNative&&!isDesktop)||(isDesktop&&desktopPlatform==='win32');
      root.style.setProperty('--ui-scale',String(canZoom?scale:1));
      document.body.style.zoom=String(canZoom?scale:1);
    };
    apply();
    if(appPrefs.appearance==='system')scheme?.addEventListener?.('change',apply);
    if(appPrefs.contrast==='system')highContrast?.addEventListener?.('change',apply);
    return()=>{
      scheme?.removeEventListener?.('change',apply);
      highContrast?.removeEventListener?.('change',apply);
    };
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
    setArchivedChats(readJSON('freeai.archived.'+product,[]));
    setCurrentChatId(null);
    setMessages([]);
    setSelectedTool(null);
    setSidePanel(null);
    if(product==='super')setMode('work');
  },[product]);

  useEffect(()=>{
    if(isDesktop)window.desktopApi?.browserSetSiteToolsEnabled?.(appPrefs.siteToolsEnabled!==false).catch(()=>{});
  },[appPrefs.siteToolsEnabled]);

  useEffect(()=>{
    if(appPrefs.approvalMode==='auto'&&!appPrefs.autoReviewEnabled){
      persistPrefs({...appPrefs,approvalMode:'ask'});
    }else if(appPrefs.approvalMode==='full'&&!appPrefs.fullAccessEnabled){
      persistPrefs({...appPrefs,approvalMode:'ask'});
    }
  },[appPrefs.autoReviewEnabled,appPrefs.fullAccessEnabled]);

  useEffect(()=>{
    if(!isDesktop)return;
    const tick=()=>{
      const now=Date.now();
      const due=scheduledTasks.find(task=>task.enabled&&!task.running&&Number(task.nextRun)<=now);
      if(due)runScheduledTask(due,false);
    };
    const timer=setInterval(tick,30000);
    tick();
    return()=>clearInterval(timer);
  },[scheduledTasks,connected]);

  const visibleChats=useMemo(()=>{
    const q=sidebarSearch.trim().toLowerCase();
    let active=chats.filter(chat=>!currentProjectId||chat.projectId===currentProjectId);
    if(q)active=active.filter(chat=>String(chat.title||'').toLowerCase().includes(q));
    active=[...active].sort((a,b)=>{
      if(recentsSort==='name')return String(a.title||'').localeCompare(String(b.title||''));
      return (b.updatedAt||0)-(a.updatedAt||0);
    });
    if(!q)return active;
    const archived=archivedChats.filter(chat=>String(chat.title||'').toLowerCase().includes(q)).map(chat=>({...chat,archived:true}));
    return [...active,...archived];
  },[chats,archivedChats,sidebarSearch,currentProjectId,recentsSort]);
  const pinnedChats=useMemo(()=>visibleChats.filter(chat=>chat.pinned&&!chat.archived),[visibleChats]);
  const unpinnedChats=useMemo(()=>visibleChats.filter(chat=>!chat.pinned||chat.archived),[visibleChats]);
  const currentProject=projects.find(project=>project.id===currentProjectId)||null;

  function persistPrefs(next){setAppPrefs(next);localStorage.setItem('freeai.prefs',JSON.stringify(next))}
  function saveCurrentChat(nextMessages,model=selected){
    if(!model||!nextMessages.length)return;
    const firstUser=nextMessages.find(m=>m.role==='user')?.text||'New chat';
    const title=firstUser.length>46?firstUser.slice(0,46)+'…':firstUser;
    let id=currentChatId;
    if(!id){id=crypto.randomUUID();setCurrentChatId(id)}
    setChats(prev=>{
      const existing=prev.find(c=>c.id===id);
      const chat={
        ...(existing||{}),id,title,providerId:model.id,source:model.source,modelName:modelLabel(model),
        projectId:currentProjectId||existing?.projectId||null,messages:nextMessages,updatedAt:Date.now()
      };
      const next=[chat,...prev.filter(c=>c.id!==id)].slice(0,100);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));return next;
    });
  }
  function archiveChat(chat){
    if(!chat)return;
    setChats(prev=>{
      const next=prev.filter(c=>c.id!==chat.id);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));
      return next;
    });
    setArchivedChats(prev=>{
      const next=[{...chat,archivedAt:Date.now()},...prev.filter(c=>c.id!==chat.id)];
      localStorage.setItem('freeai.archived.'+product,JSON.stringify(next));
      return next;
    });
    if(currentChatId===chat.id)newChat();
    setChatMenuId(null);
  }
  function unarchiveChat(chat){
    if(!chat)return;
    setArchivedChats(prev=>{
      const next=prev.filter(c=>c.id!==chat.id);
      localStorage.setItem('freeai.archived.'+product,JSON.stringify(next));
      return next;
    });
    setChats(prev=>{
      const clean={...chat};delete clean.archived;delete clean.archivedAt;
      const next=[clean,...prev.filter(c=>c.id!==chat.id)];
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));
      return next;
    });
  }
  function deleteChat(chat,fromArchive=false){
    if(!chat)return;
    if(fromArchive){
      setArchivedChats(prev=>{const next=prev.filter(c=>c.id!==chat.id);localStorage.setItem('freeai.archived.'+product,JSON.stringify(next));return next});
    }else{
      setChats(prev=>{const next=prev.filter(c=>c.id!==chat.id);localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));return next});
    }
    if(currentChatId===chat.id)newChat();
    setChatMenuId(null);
  }
  function archiveAllChats(){
    const merged=[...chats.map(c=>({...c,archivedAt:Date.now()})),...archivedChats.filter(a=>!chats.some(c=>c.id===a.id))];
    localStorage.setItem('freeai.archived.'+product,JSON.stringify(merged));
    localStorage.setItem('freeai.chats.'+product,'[]');
    setArchivedChats(merged);setChats([]);newChat();
  }
  function deleteAllChats(){
    localStorage.setItem('freeai.chats.'+product,'[]');
    localStorage.setItem('freeai.archived.'+product,'[]');
    setChats([]);setArchivedChats([]);newChat();
  }
  async function importLocalData(file){
    if(!file)return;
    const parsed=JSON.parse(await file.text());
    if(!parsed||parsed.product!=='Free AI'||!parsed.chats)throw new Error('This is not a Free AI data export.');
    const free=Array.isArray(parsed.chats.free)?parsed.chats.free:[];
    const superChats=Array.isArray(parsed.chats.super)?parsed.chats.super:[];
    localStorage.setItem('freeai.chats.free',JSON.stringify(free));
    localStorage.setItem('freeai.chats.super',JSON.stringify(superChats));
    if(parsed.preferences&&typeof parsed.preferences==='object')persistPrefs({...appPrefs,...parsed.preferences});
    setChats(product==='super'?superChats:free);
  }

  function newChat(){
    setCurrentChatId(null);setMessages([]);setPrompt('');setSelectedTool(null);
    setModelMenu(false);setPlusMenu(false);setPage('chat');setSidePanel(null);setMobileNavOpen(false);
  }
  function togglePinChat(chat){
    if(!chat||chat.archived)return;
    setChats(prev=>{
      const next=prev.map(c=>c.id===chat.id?{...c,pinned:!c.pinned}:c);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));
      return next;
    });
    setChatMenuId(null);
  }
  function createProject(){
    const name=projectDraft.trim();
    if(!name)return;
    const project={id:crypto.randomUUID(),name,createdAt:Date.now(),updatedAt:Date.now()};
    const next=[project,...projects];
    setProjects(next);localStorage.setItem('freeai.projects',JSON.stringify(next));
    setCurrentProjectId(project.id);setProjectDraft('');setProjectDialog(false);setMode('chat');newChat();
  }
  function openProject(project){
    setCurrentProjectId(project.id);setPage('chat');setMode('chat');setCurrentChatId(null);setMessages([]);setMobileNavOpen(false);
  }
  function leaveProject(){setCurrentProjectId(null);setCurrentChatId(null);setMessages([])}
  async function deleteImageAssetFromLibrary(id){
    await removeImageAsset(id).catch(()=>{});
    setImageAssets(prev=>prev.filter(item=>item.id!==id));
  }
  function openChat(chat){
    setCurrentChatId(chat.id);setMessages(Array.isArray(chat.messages)?chat.messages:[]);
    setCurrentProjectId(chat.projectId||null);
    setSelected(connected.find(p=>p.id===chat.providerId&&p.source===chat.source)||null);
    setSelectedTool(null);setPage('chat');
  }
  async function send(){
    const text=prompt.trim();
    if(!text||busy)return;
    if(!selected){setModelMenu(true);return}
    if(isNative&&appPrefs.hapticsEnabled!==false)Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});
    setBusy(true);setPrompt('');
    const withUser=[...messages,{role:'user',text}];setMessages(withUser);saveCurrentChat(withUser,selected);
    try{
      const instructions=appPrefs.customizationEnabled?String(appPrefs.customInstructions||'').trim():'';
      const routedText=instructions
        ? ['Free AI user preferences for this request:',instructions,'','User request:',text].join('\n')
        : text;
      const payload={
        provider:selected.id,source:selected.source||'browser',text:routedText,effort,
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
  async function sendVoiceTurn(text){
    if(!selected)throw new Error('Choose a connected model first.');
    const instructions=appPrefs.customizationEnabled?String(appPrefs.customInstructions||'').trim():'';
    const routedText=instructions
      ? ['Free AI user preferences for this request:',instructions,'','User request:',text].join('\n')
      : text;
    const payload={
      provider:selected.id,source:selected.source||'browser',text:routedText,effort,
      mode,product,approvalMode:mode==='work'?appPrefs.approvalMode:'ask',
      toolRequest:selectedTool?{mcp:selectedTool.mcp,ownerProviderId:selectedTool.ownerProviderId}:null
    };
    const result=await window.desktopApi.sendPrompt(payload);
    const next=[...messages,{role:'user',text},{role:'assistant',text:result?.text||String(result||''),provider:selected.id}];
    setMessages(next);saveCurrentChat(next,selected);
    return result;
  }

  function persistScheduled(next){setScheduledTasks(next);localStorage.setItem('freeai.scheduled',JSON.stringify(next))}
  function createScheduledTask(input){
    const when=new Date(input.when).getTime();
    if(!input.title?.trim()||!input.prompt?.trim()||!Number.isFinite(when))throw new Error('Title, task and schedule are required.');
    const task={
      id:crypto.randomUUID(),title:input.title.trim(),prompt:input.prompt.trim(),
      providerId:input.providerId||selected?.id||'',source:input.source||selected?.source||'browser',
      modelName:input.modelName||modelLabel(selected),frequency:input.frequency||'once',
      nextRun:when,enabled:true,createdAt:Date.now(),running:false,lastRun:null,lastResult:'',lastError:''
    };
    persistScheduled([task,...scheduledTasks]);
  }
  function scheduleNext(task,from=Date.now()){
    if(task.frequency==='daily')return from+24*60*60*1000;
    if(task.frequency==='weekly')return from+7*24*60*60*1000;
    return null;
  }
  async function runScheduledTask(task,manual=false){
    if(!isDesktop)return;
    const provider=connected.find(p=>p.id===task.providerId&&p.source===task.source);
    if(!provider){
      persistScheduled(scheduledTasks.map(t=>t.id===task.id?{...t,running:false,lastError:'The selected model is not connected.',lastRun:Date.now(),enabled:manual?t.enabled:t.frequency!=='once',nextRun:manual?t.nextRun:scheduleNext(t)}:t));
      return;
    }
    persistScheduled(scheduledTasks.map(t=>t.id===task.id?{...t,running:true,lastError:''}:t));
    try{
      const result=await window.desktopApi.sendPrompt({
        provider:provider.id,source:provider.source||'browser',text:task.prompt,effort:'instant',
        mode:'work',product:'free',approvalMode:'ask',toolRequest:null
      });
      const now=Date.now();
      const nextRun=manual?task.nextRun:scheduleNext(task,now);
      setScheduledTasks(prev=>{
        const next=prev.map(t=>t.id===task.id?{...t,running:false,lastRun:now,lastResult:result?.text||String(result||''),lastError:'',enabled:manual?t.enabled:!!nextRun,nextRun:nextRun||t.nextRun}:t);
        localStorage.setItem('freeai.scheduled',JSON.stringify(next));return next;
      });
      if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('Free AI task complete',{body:task.title});
    }catch(e){
      const now=Date.now(),nextRun=manual?task.nextRun:scheduleNext(task,now);
      setScheduledTasks(prev=>{
        const next=prev.map(t=>t.id===task.id?{...t,running:false,lastRun:now,lastError:e?.message||String(e),enabled:manual?t.enabled:!!nextRun,nextRun:nextRun||t.nextRun}:t);
        localStorage.setItem('freeai.scheduled',JSON.stringify(next));return next;
      });
    }
  }
  function toggleScheduledTask(id){
    setScheduledTasks(prev=>{const next=prev.map(t=>t.id===id?{...t,enabled:!t.enabled}:t);localStorage.setItem('freeai.scheduled',JSON.stringify(next));return next});
  }
  function deleteScheduledTask(id){
    setScheduledTasks(prev=>{const next=prev.filter(t=>t.id!==id);localStorage.setItem('freeai.scheduled',JSON.stringify(next));return next});
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

  function clearLocalHistory(){
    localStorage.removeItem('freeai.chats');
    localStorage.removeItem('freeai.chats.free');
    localStorage.removeItem('freeai.chats.super');
    localStorage.removeItem('freeai.archived.free');
    localStorage.removeItem('freeai.archived.super');
    setChats([]);setArchivedChats([]);setMessages([]);setCurrentChatId(null);
  }

  async function exportLocalData(){
    const payload={
      product:'Free AI',
      exportedAt:new Date().toISOString(),
      account:session?.user?.email||null,
      chats:{free:readJSON('freeai.chats.free',[]),super:readJSON('freeai.chats.super',[])},
      archived:{free:readJSON('freeai.archived.free',[]),super:readJSON('freeai.archived.super',[])},
      preferences:appPrefs
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const file=new File([blob],'free-ai-export.json',{type:'application/json'});
    if(isNative&&navigator.share){
      try{await navigator.share({files:[file],title:'Free AI data export'});return}catch(e){if(e?.name==='AbortError')return}
    }
    const href=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=href;a.download='free-ai-export.json';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1500);
  }

  async function openBrowser(){
    setPlusMenu(false);
    if(isDesktop&&mode!=='work')setMode('work');
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

  function applyAppshot(data){
    if(!data?.image)return;
    const title=data.title||'Appshot';
    setSelectedFile({name:title+'.png',type:'image/png',size:0,kind:'image',url:data.image});
    setSidePanel('file');setPage('chat');
    const block=['[Appshot: '+title+']',data.text?.trim()?'Accessible text:\n'+data.text.trim():''].filter(Boolean).join('\n');
    setPrompt(current=>(current?current+'\n\n':'')+block);
  }
  async function captureAppshot(){
    try{applyAppshot(await window.desktopApi.captureAppshot())}
    catch(e){setPrompt(current=>(current?current+'\n\n':'')+'[Appshot error] '+(e?.message||String(e)))}
  }

  async function attachFiles(event){
    const files=[...(event.target.files||[])];if(!files.length)return;
    const file=files[0];
    const preview={name:file.name,type:file.type,size:file.size,kind:'binary',content:'',url:''};
    const textLike=file.type.startsWith('text/')||/\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|py|java|kt|swift|c|cpp|h|hpp|sh|ps1|sql)$/i.test(file.name);
    if(file.type.startsWith('image/')){
      preview.kind='image';
      try{
        const dataUrl=await fileAsDataUrl(file);
        preview.url=dataUrl;
        const asset={id:crypto.randomUUID(),name:file.name,type:file.type,size:file.size,dataUrl,createdAt:Date.now()};
        await saveImageAsset(asset);
        setImageAssets(prev=>[asset,...prev]);
      }catch{preview.url=URL.createObjectURL(file)}
    }
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
    ? (isNative?'Continue on your desktop':'What should we build?')
    : mode==='work'?'What should we work on?':messages.length?'':'Ready when you are.';

  return <div className={'desktopShell '+(!sidebarOpen?'sidebarHidden':'')+' '+(sidePanel?'hasSidePanel':'')+' '+(mobileNavOpen?'mobileNavOpen':'')+' '+(isDesktop&&desktopPlatform==='win32'?'windowsDesktop':'')}>
    {isDesktop&&desktopPlatform==='win32'&&<WindowsTitlebar
      onNewChat={newChat}
      onSettings={()=>{setSettingsSection('General');setSettingsOpen(true)}}
      onToggleSidebar={()=>setSidebarOpen(v=>!v)}
      onBrowser={openBrowser}
      onHelp={openHelp}
    />}
    <input ref={fileRef} type="file" multiple hidden onChange={attachFiles}/>
    <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={attachFiles}/>
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={attachFiles}/>

    {(sidebarOpen||mobileNavOpen)&&<aside className={'gptSidebar '+(mobileNavOpen?'mobileOpen':'')}>
      <div className="brandRow">
        <div className="productSwitcher">
          <button className="brandButton" title={isNative?'Free AI':'Switch product'} aria-haspopup={!isNative?'menu':undefined} aria-expanded={!isNative?productMenu:undefined} onClick={()=>!isNative&&setProductMenu(v=>!v)}>
            <BrandMark size={20}/><b>{isNative?'Free AI':product==='super'?'Super AI':'Free AI'}</b>{!isNative&&<ChevronDown size={14}/>}
          </button>
          {!isNative&&productMenu&&<div className="productMenu" role="menu">
            <button className={product==='free'?'active':''} onClick={()=>{setProduct('free');setProductMenu(false);setMode('chat')}}>
              <BrandMark size={20}/><span><b>Free AI</b><small>Chat and Work with connected models</small></span>{product==='free'&&<Check size={16}/>}
            </button>
            <button className={product==='super'?'active':''} onClick={()=>{setProduct('super');setProductMenu(false);setMode('work')}}>
              <BrandMark size={20} className="superMark"/><span><b>Super AI</b><small>Local coding, repositories and computer tasks</small></span>{product==='super'&&<Check size={16}/>}
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
        <button className="mobileNewChat" onClick={()=>{setProduct('free');setMode('chat');newChat()}}><SquarePen size={17}/><span>New chat</span></button>
        <div className="mobileExperienceRail" aria-label="Experiences">
          <button className={product==='super'&&page==='chat'?'active':''} onClick={()=>{setProduct('super');setMode('work');setPage('chat');setMobileNavOpen(false)}}><Monitor size={18}/><span>Remote</span></button>
          <button className={page==='plugins'?'active':''} onClick={()=>{setProduct('free');setPage('plugins');setMobileNavOpen(false)}}><Plug size={18}/><span>Apps</span></button>
          <button className={page==='explore'?'active':''} onClick={()=>{setProduct('free');setPage('explore');setMobileNavOpen(false)}}><Blocks size={18}/><span>Explore</span></button>
        </div>
      </div>

      <nav className="primaryNav desktopPrimaryNav">
        <NavItem icon={SquarePen} label="New chat" active={page==='chat'&&!currentChatId&&!currentProjectId} onClick={()=>{setCurrentProjectId(null);newChat()}}/>
        {product==='free'&&<NavItem icon={Image} label="Images" active={page==='images'} onClick={()=>setPage('images')}/>}
        {product==='free'&&<NavItem icon={Clock3} label="Scheduled" active={page==='scheduled'} onClick={()=>setPage('scheduled')}/>}
        <NavItem icon={Plug} label="Plugins" active={page==='plugins'} onClick={()=>{setPage('plugins');setMobileNavOpen(false)}}/>
        <NavItem icon={Blocks} label="Explore" active={page==='explore'} onClick={()=>{setPage('explore');setMobileNavOpen(false)}}/>
      </nav>
      <div className="sidebarScroll">
        {pinnedChats.length>0&&<>
          <div className="sidebarGroupTitle">Pinned</div>
          {pinnedChats.map(chat=><div key={'pinned-'+chat.id} className={'recentRow '+(currentChatId===chat.id?'active':'')}>
            <button className="recentItem" onClick={()=>openChat(chat)}>{chat.title}</button>
            <button className="recentMore" aria-label="Pinned chat actions" onClick={()=>setChatMenuId(v=>v===chat.id?null:chat.id)}><Ellipsis size={15}/></button>
            {chatMenuId===chat.id&&<div className="recentMenu">
              <button onClick={()=>togglePinChat(chat)}><Pin size={14}/>Unpin</button>
              <button onClick={()=>archiveChat(chat)}><Archive size={14}/>Archive</button>
              <button className="dangerText" onClick={()=>deleteChat(chat,false)}><Trash2 size={14}/>Delete</button>
            </div>}
          </div>)}
        </>}
        <div className="sidebarGroupHeader">
          <span>{product==='super'?'Coding':'Projects'}</span>
          {product==='free'&&<button title="New project" onClick={()=>setProjectDialog(true)}><Plus size={14}/></button>}
        </div>
        {product==='super'
          ? <button className="projectItem" onClick={()=>{setMode('work');setPage('chat');setMobileNavOpen(false)}}><GitBranch size={15}/>Repository workspace</button>
          : <>
              {projects.map(project=><button key={project.id} className={'projectItem '+(currentProjectId===project.id?'active':'')} onClick={()=>openProject(project)}><Folder size={15}/><span>{project.name}</span></button>)}
              {!projects.length&&<div className="sidebarEmpty">No projects yet</div>}
            </>}
        <div className="sidebarGroupHeader">
          <span>Recents</span>
          <button title={recentsSort==='recent'?'Sort by name':'Sort by recent'} onClick={()=>{const next=recentsSort==='recent'?'name':'recent';setRecentsSort(next);localStorage.setItem('freeai.recents.sort',next)}}><ArrowUp size={13}/></button>
        </div>
        {unpinnedChats.length===0?<div className="sidebarEmpty">{sidebarSearch?'No matching chats':'No chats yet'}</div>:unpinnedChats.map(chat=>
          <div key={chat.id} className={'recentRow '+(currentChatId===chat.id?'active':'')}>
            <button className="recentItem" onClick={()=>{openChat(chat);setMobileNavOpen(false)}}>{chat.title}{chat.archived&&<small>Archived</small>}</button>
            {!chat.archived&&<button className="recentMore" aria-label="Chat actions" onClick={()=>setChatMenuId(v=>v===chat.id?null:chat.id)}><Ellipsis size={15}/></button>}
            {chatMenuId===chat.id&&<div className="recentMenu">
              {!chat.archived&&<button onClick={()=>togglePinChat(chat)}><Pin size={14}/>{chat.pinned?'Unpin':'Pin'}</button>}
              {!chat.archived&&<button onClick={()=>archiveChat(chat)}><Archive size={14}/>Archive</button>}
              <button className="dangerText" onClick={()=>deleteChat(chat,!!chat.archived)}><Trash2 size={14}/>Delete</button>
            </div>}
          </div>
        )}
      </div>
      <div className="sidebarFooter">
        <button className="profileButton" onClick={()=>setProfileMenu(v=>!v)}>
          <span className="avatar">{initials(session)}</span>
          <span className="profileName">{sidebarName}</span>
          <span className={'connectionDot '+((isDesktop?status.extension:status.relay)?'online':'')}></span>
        </button>
        {!isNative&&(!isDesktop||desktopPlatform==='win32')&&<button className="voiceButton" onClick={()=>{setPage('chat');setMobileNavOpen(false);window.dispatchEvent(new CustomEvent('freeai:start-voice'))}}><Mic2 size={15}/>Dictate</button>}
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
            <span>{product==='super'?(isNative?'Remote':'Super AI'):mode==='work'?'Free AI · Work':'Free AI · Chat'}</span>{product==='free'&&<ChevronDown size={14}/>}
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
        {isNative&&<MobileConversationPicker
          connected={connected} selected={selected} choose={model=>{setSelected(model);setModelMenu(false)}}
          open={modelMenu} setOpen={setModelMenu} effort={effort} setEffort={setEffort}
        />}
        {messages.length===0
          ? <div className={'emptyChat '+(mode==='work'?'workEmpty':'')}>
              <h1>{heading}</h1>
              <Composer
                mode={mode} prompt={prompt} setPrompt={setPrompt} send={send} busy={busy}
                selected={selected} connected={connected} setSelected={setSelected}
                modelMenu={modelMenu} setModelMenu={setModelMenu}
                effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef}
                mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                spellCheckEnabled={appPrefs.spellCheckEnabled!==false} hapticsEnabled={appPrefs.hapticsEnabled!==false}
                approvalMode={appPrefs.approvalMode||'ask'} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                permissionOptions={{auto:!!appPrefs.autoReviewEnabled,full:!!appPrefs.fullAccessEnabled}}
                onVoice={()=>setVoiceOpen(true)}
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
                  plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef}
                  mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                  product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                  spellCheckEnabled={appPrefs.spellCheckEnabled!==false} hapticsEnabled={appPrefs.hapticsEnabled!==false}
                  approvalMode={appPrefs.approvalMode||'ask'} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                  permissionOptions={{auto:!!appPrefs.autoReviewEnabled,full:!!appPrefs.fullAccessEnabled}}
                  onVoice={()=>setVoiceOpen(true)}
                  onBrowser={openBrowser}
                  onComputer={()=>{setPlusMenu(false);setSidePanel('computer')}}
                  onPlugins={()=>{setPlusMenu(false);setPage('plugins')}}
                />
              </div>
            </div>
        }
        <div className="stageFooter">Free AI can make mistakes. Check important information.</div>
      </section>}

      {page==='images'&&<ImagesPage assets={imageAssets} onBack={()=>setPage('chat')} onUpload={()=>photoRef.current?.click()} onCreate={()=>{setCurrentProjectId(null);newChat();setPrompt('Create an image of ')}} onOpen={asset=>{setSelectedFile({name:asset.name,type:asset.type,size:asset.size,kind:'image',url:asset.dataUrl});setSidePanel('file')}} onDelete={deleteImageAssetFromLibrary}/>}
      {page==='scheduled'&&<ScheduledPage tasks={scheduledTasks} connected={connected} onBack={()=>setPage('chat')} onCreate={createScheduledTask} onRun={task=>runScheduledTask(task,true)} onToggle={toggleScheduledTask} onDelete={deleteScheduledTask}/>}
      {page==='plugins'&&<PluginsPage tools={mcpTools} connected={connected} onBack={()=>setPage('chat')} onRefresh={()=>window.desktopApi?.scanProviders?.().catch(()=>{})}/>}
      {page==='explore'&&<ExplorePage tools={mcpTools} chats={chats} onBack={()=>setPage('chat')}/>}
    </main>

    {sidePanel==='browser'&&<BrowserPane
      siteToolsEnabled={appPrefs.siteToolsEnabled!==false}
      onAnnotate={(annotation,note)=>{
        const block=[
          '[Browser annotation]',
          'URL: '+(annotation?.url||''),
          'Element: '+(annotation?.selector||annotation?.tag||''),
          annotation?.ariaLabel?'Label: '+annotation.ariaLabel:'',
          annotation?.text?'Visible text: '+annotation.text:'',
          note?.trim()?'Comment: '+note.trim():''
        ].filter(Boolean).join('\n');
        setPrompt(current=>(current?current+'\n\n':'')+block);
      }}
      onClose={()=>setSidePanel(null)}
    />}
    {sidePanel==='file'&&<FilePane file={selectedFile} onClose={()=>setSidePanel(null)}/>}
    {sidePanel==='computer'&&<ComputerPane
      screens={screens} setScreens={setScreens} approvalMode={appPrefs.approvalMode||'ask'}
      permissionOptions={{auto:!!appPrefs.autoReviewEnabled,full:!!appPrefs.fullAccessEnabled}}
      setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
      onClose={()=>setSidePanel(null)}
    />}

    {projectDialog&&<div className="modalScrim" onMouseDown={e=>{if(e.target===e.currentTarget)setProjectDialog(false)}}>
      <div className="projectDialog" role="dialog" aria-modal="true" aria-label="New project">
        <div className="dialogHead"><b>New project</b><button onClick={()=>setProjectDialog(false)}><X size={16}/></button></div>
        <label>Project name<input autoFocus value={projectDraft} onChange={e=>setProjectDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createProject()}} placeholder="Project name"/></label>
        <div className="dialogActions"><button onClick={()=>setProjectDialog(false)}>Cancel</button><button className="primaryAction" disabled={!projectDraft.trim()} onClick={createProject}>Create</button></div>
      </div>
    </div>}
    {voiceOpen&&isDesktop&&desktopPlatform==='win32'&&<WindowsVoiceOverlay selected={selected} onClose={()=>setVoiceOpen(false)} onTurn={sendVoiceTurn}/>}
    {settingsOpen&&<SettingsView
      section={settingsSection} setSection={setSettingsSection} onClose={()=>setSettingsOpen(false)}
      session={session} prefs={appPrefs} setPrefs={persistPrefs} status={status} settings={settings} setSettings={setSettings}
      saveSettings={saveSettings} connected={connected} apiDraft={apiDraft} setApiDraft={setApiDraft}
      addApiConnection={addApiConnection} removeApiConnection={removeApiConnection} apiError={apiError}
      onExportData={exportLocalData} onImportData={importLocalData} onClearHistory={clearLocalHistory}
      archivedChats={archivedChats} onUnarchiveChat={unarchiveChat} onDeleteArchived={chat=>deleteChat(chat,true)} onArchiveAll={archiveAllChats} onDeleteAll={deleteAllChats}
      onComputer={()=>{setSettingsOpen(false);setSidePanel('computer')}}
      onAppshot={()=>{setSettingsOpen(false);captureAppshot()}}
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
    effort,setEffort,effortMenu,setEffortMenu,plusMenu,setPlusMenu,fileRef,photoRef,cameraRef,mcpTools,selectedTool,setSelectedTool,
    product,voiceLanguage,showBottomPanel,spellCheckEnabled,hapticsEnabled,approvalMode,setApprovalMode,permissionOptions,onVoice,onBrowser,onComputer,onPlugins
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
        await SpeechRecognition.stop().catch(()=>SpeechRecognition.forceStop?.({timeout:700}));
        const last=await SpeechRecognition.getLastPartialResult?.().catch(()=>null);
        const text=last?.text||last?.matches?.[0]||'';
        if(text)setPrompt((dictationBase.current?dictationBase.current+' ':'')+text.trim());
        for(const handle of nativeSpeechHandles.current.splice(0))await handle?.remove?.().catch(()=>{});
      }else if(webRecognition.current){
        webRecognition.current.stop();
        webRecognition.current=null;
      }
    }catch(e){setDictationError(e?.message||'Could not stop dictation.')}
    setListening(false);
  }

  async function startVoice(){
    if(isNative&&hapticsEnabled)Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});
    if(listening){await stopVoice();return}
    setDictationError('');
    dictationBase.current=prompt.trimEnd();

    if(isDesktop){
      if(desktopPlatform!=='win32'){
        setDictationError('Desktop dictation is not available on this platform yet.');
        return;
      }
      try{
        setListening(true);
        const result=await window.desktopApi.recognizeSystemDictation?.();
        if(result?.ok&&result.text){
          setPrompt((dictationBase.current?dictationBase.current+' ':'')+result.text.trim());
        }else if(result?.fallback){
          textareaRef.current?.focus();
          await new Promise(r=>setTimeout(r,60));
          await window.desktopApi.startSystemDictation();
        }else if(result?.error){
          throw new Error(result.error);
        }
      }catch(e){
        setDictationError(e?.message||'Windows dictation could not start.');
      }finally{
        setListening(false);
      }
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
          const text=(event?.accumulatedText||event?.accumulated||event?.matches?.[0]||'').trim();
          if(text)setPrompt((dictationBase.current?dictationBase.current+' ':'')+text);
        });
        const stateHandle=await SpeechRecognition.addListener('listeningState',event=>{
          const state=event?.state||event?.status;
          setListening(state==='started'||state==='listening');
        });
        const errorHandle=await SpeechRecognition.addListener('error',event=>{
          setListening(false);
          if(event?.message)setDictationError(event.message);
        });
        nativeSpeechHandles.current=[partial,stateHandle,errorHandle];
        const onDevice=await SpeechRecognition.isOnDeviceRecognitionAvailable?.({language}).catch(()=>({available:false}));
        setListening(true);
        await SpeechRecognition.start({
          language,
          maxResults:3,
          partialResults:true,
          popup:false,
          addPunctuation:true,
          useOnDeviceRecognition:!!onDevice?.available
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
      spellCheck={spellCheckEnabled!==false}
      autoCorrect={spellCheckEnabled!==false?'on':'off'}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
      placeholder={product==='super'?(isNative?'Message your desktop task':'Ask Super AI to build or debug'):mode==='work'?'Work with Free AI':selected?'Message '+modelLabel(selected):'Ask Free AI'}
    />
    <div className="composerBottom">
      <div className="composerLeft">
        <div className="menuAnchor">
          <button className="plusCircle" aria-label="Add" aria-haspopup="menu" aria-expanded={plusMenu} onClick={()=>setPlusMenu(v=>!v)}><Plus size={20}/></button>
          {plusMenu&&<PlusMenu
            fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef} onBrowser={onBrowser} onComputer={onComputer} onPlugins={onPlugins}
            tools={mcpTools} setSelectedTool={setSelectedTool} mode={mode}
          />}
        </div>
        {mode==='work'&&!isNative&&<div className="menuAnchor permissionAnchor">
          <button className={'accessButton '+(approvalMode==='full'?'enabled':'')} aria-haspopup="menu" aria-expanded={approvalMenu} onClick={()=>setApprovalMenu(v=>!v)}>
            <ShieldCheck size={15}/>{approvalMode==='full'?'Full access':approvalMode==='auto'?'Auto':'Read-only'}<ChevronDown size={12}/>
          </button>
          {approvalMenu&&<PermissionModeMenu value={approvalMode} options={permissionOptions} choose={value=>{setApprovalMode(value);setApprovalMenu(false)}}/>}
        </div>}
      </div>

      <div className="composerRight">
        {!isNative&&<div className="menuAnchor">
          <button className="modelButton" aria-haspopup="listbox" aria-expanded={modelMenu} onClick={()=>setModelMenu(v=>!v)}>
            <span>{modelLabel(selected)}</span>{selected?.modelName&&selected.modelName!==selected.name&&<small>{selected.name}</small>}<ChevronDown size={13}/>
          </button>
          {modelMenu&&<ModelMenu connected={connected} selected={selected} choose={m=>{setSelected(m);setModelMenu(false)}}/>}
        </div>}
        {!isNative&&Array.isArray(selected?.effortLevels)&&selected.effortLevels.length>1&&<div className="menuAnchor">
          <button className="effortButton" aria-haspopup="dialog" aria-expanded={effortMenu} onClick={()=>setEffortMenu(v=>!v)}><Brain size={14}/>{effortLabel}<ChevronDown size={12}/></button>
          {effortMenu&&<EffortMenu effort={effort} levels={selected.effortLevels} choose={v=>{setEffort(v);setEffortMenu(false)}}/>}
        </div>}
        {(isNative||!isDesktop||desktopPlatform==='win32')&&<button className={'micButton '+(listening?'listening':'')} onMouseDown={e=>e.preventDefault()} onClick={startVoice} title={listening?'Stop dictation':'Dictate'} aria-label={listening?'Stop dictation':'Dictate'}><Mic2 size={18}/></button>}
        {!busy&&!prompt.trim()&&isDesktop&&desktopPlatform==='win32'&&<button className="voiceOrb" onClick={onVoice} title="Voice" aria-label="Start Voice"><Volume2 size={18}/></button>}
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

function MobileConversationPicker({connected,selected,choose,open,setOpen,effort,setEffort}){
  const levels=Array.isArray(selected?.effortLevels)&&selected.effortLevels.length?selected.effortLevels:[];
  const labels={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High','extra-high':'Extra High','pro-standard':'Pro Standard','pro-extended':'Pro Extended'};
  const currentEffort=labels[effort]||effort||'Instant';
  return <div className="mobileConversationPicker menuAnchor">
    <button className="mobileModelTrigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className={'providerBadge small '+(selected?.source==='api'?'api':selected?.id||'')}>{selected?modelLabel(selected).slice(0,1):'+'}</span>
      <span className="mobileModelTriggerText"><b>{selected?modelLabel(selected):'Select model'}</b>{levels.length>1&&<small>{currentEffort}</small>}</span>
      <ChevronDown size={14}/>
    </button>
    {open&&<div className="mobileTopModelPanel" role="dialog" aria-label="Model and intelligence">
      <div className="mobilePickerSectionTitle">Models</div>
      <div className="mobileModelList">
        {connected.length===0?<div className="menuEmpty"><b>No models connected</b><span>Connect your desktop or add an API model first.</span></div>:connected.map(model=><button key={(model.source||'browser')+model.id} className={(selected?.id===model.id&&selected?.source===model.source)?'active':''} onClick={()=>choose(model)}>
          <span className={'providerBadge '+(model.source==='api'?'api':model.id)}>{modelLabel(model).slice(0,1)}</span>
          <span><b>{modelLabel(model)}</b><small>{model.source==='api'?'API · '+model.model:'Desktop · '+model.name}</small></span>
          {selected?.id===model.id&&selected?.source===model.source&&<Check size={16}/>}
        </button>)}
      </div>
      {levels.length>1&&<div className="mobileIntelligenceSection">
        <div className="mobilePickerSectionTitle">Intelligence</div>
        {levels.map(level=><button key={level} className={effort===level?'active':''} onClick={()=>{setEffort(level);setOpen(false)}}>
          <span><b>{labels[level]||level}</b><small>{level==='instant'?'Fast everyday responses':'More reasoning for complex requests'}</small></span>
          {effort===level&&<Check size={16}/>}
        </button>)}
      </div>}
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

function PermissionModeMenu({value,options={},choose}){
  const rows=[
    ['ask','Read-only','Read the current workspace and ask explicitly before actions that need write or broader access.',true],
    ['auto','Auto','Use the current workspace automatically, but ask before access outside the workspace.',!!options.auto],
    ['full','Full access','Read files anywhere and run supported commands with network access without repeated approval prompts.',!!options.full]
  ];
  return <div className="floatingMenu permissionPicker" role="menu" aria-label="Permission mode">
    <div className="floatingTitle">Permissions</div>
    {rows.map(([id,label,desc,enabled])=><button key={id} disabled={!enabled} className={'permissionRow '+(value===id?'active ':'')+(!enabled?'disabled':'')} onClick={()=>enabled&&choose(id)}>
      <ShieldCheck size={17}/><span><b>{label}</b><small>{enabled?desc:'Enable this mode in Settings → General first.'}</small></span>{value===id&&<Check size={15}/>}
    </button>)}
  </div>
}

function PlusMenu({fileRef,photoRef,cameraRef,onBrowser,onComputer,onPlugins,tools,setSelectedTool,mode}){
  return <div className="floatingMenu plusPicker" role="menu" aria-label="Add">
    <div className="floatingTitle">Add</div>
    {isNative?<>
      <MenuRow icon={Camera} label="Camera" onClick={()=>cameraRef.current?.click()}/>
      <MenuRow icon={Image} label="Photos" onClick={()=>photoRef.current?.click()}/>
      <MenuRow icon={Paperclip} label="Files" onClick={()=>fileRef.current?.click()}/>
    </>:<MenuRow icon={Paperclip} label="Files and folders" onClick={()=>fileRef.current?.click()}/>} 
    {!isNative&&mode==='work'&&<MenuRow icon={Chrome} label="Browser" sub="Browse beside Work or Super AI in Free AI's own browser" onClick={onBrowser}/>}
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

function ImagesPage({assets,onBack,onUpload,onCreate,onOpen,onDelete}){
  return <div className="contentPage">
    <PageTop onBack={onBack} title="Images"/>
    <div className="contentInner imageLibraryInner">
      <div className="pageHeroRow">
        <div><h1>Images</h1><p className="pageLead">Create with a connected model or keep reference images in your Free AI library.</p></div>
        <div className="pageHeroActions"><button className="secondaryAction" onClick={onUpload}><Upload size={15}/>Add image</button><button className="primaryAction" onClick={onCreate}><Image size={15}/>Create</button></div>
      </div>
      {assets.length===0?<div className="emptyLibrary"><Image size={34}/><b>No images yet</b><span>Add a reference image or start an image request in Chat.</span></div>:
      <div className="imageGrid">{assets.map(asset=><div className="imageCard" key={asset.id}>
        <button className="imageThumb" onClick={()=>onOpen(asset)}><img src={asset.dataUrl} alt={asset.name}/></button>
        <div className="imageCardMeta"><span><b>{asset.name}</b><small>{humanSize(asset.size)}</small></span><button title="Remove" onClick={()=>onDelete(asset.id)}><Trash2 size={14}/></button></div>
      </div>)}</div>}
    </div>
  </div>
}

function ScheduledPage({tasks,connected,onBack,onCreate,onRun,onToggle,onDelete}){
  const first=connected[0]||null;
  const toInput=timestamp=>{
    const date=new Date(timestamp||Date.now()+60*60*1000);
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  };
  const [form,setForm]=useState(()=>({title:'',prompt:'',when:toInput(),frequency:'once',providerKey:first?(first.source||'browser')+'::'+first.id:''}));
  const [showForm,setShowForm]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!form.providerKey&&connected[0])setForm(v=>({...v,providerKey:(connected[0].source||'browser')+'::'+connected[0].id}));
  },[connected]);
  function submit(){
    setError('');
    try{
      const [source,providerId]=form.providerKey.split('::');
      const provider=connected.find(p=>p.id===providerId&&(p.source||'browser')===source);
      onCreate({...form,providerId,source,modelName:modelLabel(provider)});
      setForm(v=>({...v,title:'',prompt:'',when:toInput(Date.now()+60*60*1000)}));
      setShowForm(false);
    }catch(e){setError(e?.message||String(e))}
  }
  return <div className="contentPage">
    <PageTop onBack={onBack} title="Scheduled" action="New task" onAction={()=>setShowForm(v=>!v)}/>
    <div className="contentInner scheduledInner">
      <h1>Scheduled</h1>
      <p className="pageLead">Local Free AI schedules run while the desktop app is open and the selected model is connected.</p>
      {showForm&&<div className="scheduleComposer">
        <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Daily research brief"/></label>
        <label>Task<textarea value={form.prompt} onChange={e=>setForm({...form,prompt:e.target.value})} placeholder="What should Free AI do?"/></label>
        <div className="scheduleFields">
          <label>When<input type="datetime-local" value={form.when} onChange={e=>setForm({...form,when:e.target.value})}/></label>
          <label>Repeat<select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <label>Model<select value={form.providerKey} onChange={e=>setForm({...form,providerKey:e.target.value})}><option value="">Select model</option>{connected.map(p=><option key={(p.source||'browser')+'::'+p.id} value={(p.source||'browser')+'::'+p.id}>{modelLabel(p)}</option>)}</select></label>
        </div>
        {error&&<div className="formError">{error}</div>}
        <div className="dialogActions"><button onClick={()=>setShowForm(false)}>Cancel</button><button className="primaryAction" onClick={submit}>Schedule</button></div>
      </div>}
      <div className="scheduledList">
        {tasks.length===0?<div className="emptyLibrary"><Clock3 size={34}/><b>No scheduled tasks</b><span>Create a one-time, daily, or weekly task.</span></div>:tasks.map(task=><div className="scheduledCard" key={task.id}>
          <div className="scheduledCardIcon"><Clock3 size={17}/></div>
          <div className="scheduledCardBody"><div className="scheduledCardTitle"><b>{task.title}</b><span className={'taskState '+(task.enabled?'on':'')}>{task.running?'Running':task.enabled?'Active':'Paused'}</span></div>
            <p>{task.prompt}</p>
            <small>{task.modelName||'Model'} · {task.frequency==='once'?'Once':task.frequency==='daily'?'Daily':'Weekly'} · Next {new Date(task.nextRun).toLocaleString()}</small>
            {task.lastResult&&<details><summary>Last result</summary><div>{task.lastResult}</div></details>}
            {task.lastError&&<div className="taskError">{task.lastError}</div>}
          </div>
          <div className="scheduledActions"><button onClick={()=>onRun(task)}>Run now</button><button onClick={()=>onToggle(task.id)}>{task.enabled?'Pause':'Resume'}</button><button className="dangerText" onClick={()=>onDelete(task.id)}>Delete</button></div>
        </div>)}
      </div>
    </div>
  </div>
}

function PluginsPage({tools,connected,onBack,onRefresh}){
  const [query,setQuery]=useState('');
  const pageName=isNative?'Apps':'Plugins';
  const needle=query.trim().toLowerCase();
  const visibleTools=needle?tools.filter(t=>(t.mcp+' '+t.ownerName).toLowerCase().includes(needle)):tools;
  const visibleProviders=needle?connected.filter(p=>(modelLabel(p)+' '+(p.mcps||[]).join(' ')).toLowerCase().includes(needle)):connected;
  return <div className="contentPage">
    <PageTop onBack={onBack} title={pageName} action={isDesktop?'Refresh':null} onAction={onRefresh}/>
    <div className="contentInner">
      <h1>{pageName}</h1>
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
      {!isNative&&<><h3>Desktop tools</h3><MenuRow icon={Monitor} label="Computer" sub="Control your desktop in Work mode"/><MenuRow icon={Globe2} label="Browser" sub="Browse and research inside Free AI"/></>}
      <h3>{isNative?'Apps':'Plugins'}</h3>{tools.slice(0,8).map(t=><MenuRow key={t.key} icon={Plug} label={t.mcp} sub={t.ownerName}/>)}
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

function BrowserPane({siteToolsEnabled=true,onAnnotate,onClose}){
  const [url,setUrl]=useState('https://www.google.com/');
  const [state,setState]=useState({url:'',title:'New tab',canGoBack:false,canGoForward:false,loading:false,tabs:[],activeTabId:null,downloads:[],siteTools:[]});
  const [siteToolsOpen,setSiteToolsOpen]=useState(false);
  const [selectedSiteTool,setSelectedSiteTool]=useState(null);
  const [siteToolInput,setSiteToolInput]=useState('{}');
  const [siteToolStatus,setSiteToolStatus]=useState('');
  const [annotating,setAnnotating]=useState(false);
  const [annotation,setAnnotation]=useState(null);
  const [annotationNote,setAnnotationNote]=useState('');
  const surfaceRef=useRef(null);

  useEffect(()=>{
    if(!isDesktop)return;
    const off=window.desktopApi.onBrowserState?.(next=>{
      setState(next);
      if(next.url)setUrl(next.url);
    });
    return()=>{off?.();window.desktopApi.browserCancelAnnotation?.().catch(()=>{});window.desktopApi.browserClose?.().catch(()=>{})};
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

  function navigate(){window.desktopApi?.browserNavigate(url).catch(()=>{})}
  function chooseTab(id){
    window.desktopApi?.browserCancelAnnotation?.().catch(()=>{});
    setAnnotating(false);setAnnotation(null);setAnnotationNote('');
    window.desktopApi?.browserSelectTab(id).then(next=>{if(next?.url)setUrl(next.url)}).catch(()=>{})
  }
  function closeTab(e,id){e.stopPropagation();window.desktopApi?.browserCloseTab(id).then(next=>{if(next?.url)setUrl(next.url)}).catch(()=>{})}
  function newTab(){
    setSiteToolsOpen(false);setSelectedSiteTool(null);setSiteToolStatus('');
    window.desktopApi?.browserNewTab('https://www.google.com/').then(next=>{if(next?.url)setUrl(next.url)}).catch(()=>{})
  }
  async function startAnnotation(){
    setSiteToolsOpen(false);setAnnotation(null);setAnnotationNote('');setAnnotating(true);
    try{
      const result=await window.desktopApi?.browserStartAnnotation?.();
      setAnnotating(false);
      if(result)setAnnotation(result);
    }catch(e){
      setAnnotating(false);
      setSiteToolStatus(e?.message||'Could not start annotation mode.');
    }
  }
  async function cancelAnnotation(){
    await window.desktopApi?.browserCancelAnnotation?.().catch(()=>{});
    setAnnotating(false);setAnnotation(null);setAnnotationNote('');
  }
  function attachAnnotation(){
    if(!annotation)return;
    onAnnotate?.(annotation,annotationNote);
    setAnnotation(null);setAnnotationNote('');
  }

  async function refreshSiteTools(){
    setSiteToolStatus('Scanning this page…');
    try{
      await window.desktopApi?.browserRefreshSiteTools?.();
      setSiteToolStatus('');
    }catch(e){setSiteToolStatus(e?.message||'Could not scan this page.')}
  }
  function chooseSiteTool(tool){
    setSelectedSiteTool(tool);
    setSiteToolInput('{}');
    setSiteToolStatus('');
  }
  async function runSiteTool(){
    if(!selectedSiteTool)return;
    let input={};
    try{
      const parsed=siteToolInput.trim()?JSON.parse(siteToolInput):{};
      if(parsed===null||Array.isArray(parsed)||typeof parsed!=='object')throw new Error('Input must be a JSON object.');
      input=parsed;
    }catch(e){setSiteToolStatus(e?.message||'Invalid JSON input.');return}
    setSiteToolStatus('Running…');
    try{
      const result=await window.desktopApi?.browserExecuteSiteTool?.({tabId:state.activeTabId,name:selectedSiteTool.name,input});
      const value=result?.value;
      setSiteToolStatus(typeof value==='string'?value:JSON.stringify(value??'Done',null,2));
    }catch(e){setSiteToolStatus(e?.message||'Site tool failed.')}
  }
  const activeDownloads=(state.downloads||[]).filter(d=>d.state==='progressing').length;
  const siteTools=Array.isArray(state.siteTools)?state.siteTools:[];

  return <aside className="sidePane browserPane">
    <div className="paneTabs browserTabsBar">
      <div className="browserTabsScroll">
        {(state.tabs||[]).map(tab=><button key={tab.id} className={'browserTab '+(tab.id===state.activeTabId?'active':'')} onClick={()=>chooseTab(tab.id)}>
          <Globe2 size={13}/><span>{tab.title||'New tab'}</span>
          <span className="tabClose" role="button" aria-label="Close tab" onClick={e=>closeTab(e,tab.id)}><X size={12}/></span>
        </button>)}
        <button className="newBrowserTab" onClick={newTab} title="New tab"><Plus size={15}/></button>
      </div>
      <button className="closePaneButton" onClick={onClose} title="Close browser"><X size={16}/></button>
    </div>

    <div className="browserToolbar">
      <button disabled={!state.canGoBack} onClick={()=>window.desktopApi?.browserBack()}><ArrowLeft size={15}/></button>
      <button disabled={!state.canGoForward} onClick={()=>window.desktopApi?.browserForward()}><ArrowRight size={15}/></button>
      <button onClick={()=>window.desktopApi?.browserReload()}><RefreshCw className={state.loading?'spin':''} size={15}/></button>
      <form onSubmit={e=>{e.preventDefault();navigate()}}><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Search or enter a URL"/></form>
      {activeDownloads>0&&<span className="downloadStatus" title={activeDownloads+' active download'+(activeDownloads===1?'':'s')}><Download size={14}/><small>{activeDownloads}</small></span>}
      {siteToolsEnabled&&siteTools.length>0&&<button className={siteToolsOpen?'browserToolButton active':'browserToolButton'} onClick={()=>setSiteToolsOpen(v=>!v)} title={siteTools.length+' site tool'+(siteTools.length===1?'':'s')}><ChevronDown size={15}/></button>}
      <button className={annotating?'active':''} onClick={annotating?cancelAnnotation:startAnnotation} title={annotating?'Cancel annotation':'Annotate page'}><PenLine size={15}/></button>
      <button onClick={()=>window.desktopApi?.openAuthUrl?.(state.url||url)} title="Open in system browser"><ExternalLink size={15}/></button>
    </div>

    {siteToolsOpen&&<div className="siteToolsPanel">
      <div className="siteToolsHeader">
        <span><b>Site tools</b><small>{!siteToolsEnabled?'Disabled in Browser settings':siteTools.length?'WebMCP tools exposed by this page':'No site tools detected on this page'}</small></span>
        <button disabled={!siteToolsEnabled} onClick={refreshSiteTools}><RefreshCw size={14}/>Scan</button>
      </div>
      {siteToolsEnabled&&siteTools.length>0&&<div className="siteToolsBody">
        <div className="siteToolsList">
          {siteTools.map(tool=><button key={tool.name} className={selectedSiteTool?.name===tool.name?'active':''} onClick={()=>chooseSiteTool(tool)}>
            <Target size={14}/><span><b>{tool.title||tool.name}</b><small>{tool.description||tool.origin}</small></span>
          </button>)}
        </div>
        {selectedSiteTool&&<div className="siteToolRunner">
          <div className="siteToolTitle"><b>{selectedSiteTool.title||selectedSiteTool.name}</b>{selectedSiteTool.annotations?.consequentialHint&&<span className="consequentialBadge">May change data</span>}</div>
          <small>{selectedSiteTool.description||'No description provided by this site.'}</small>
          <textarea spellCheck="false" value={siteToolInput} onChange={e=>setSiteToolInput(e.target.value)} aria-label="Site tool JSON input"/>
          <button className={selectedSiteTool.annotations?.consequentialHint?'siteToolRun consequential':'siteToolRun'} onClick={runSiteTool}>{selectedSiteTool.annotations?.consequentialHint?'Review & run':'Run tool'}</button>
          {siteToolStatus&&<pre className="siteToolStatus">{siteToolStatus}</pre>}
        </div>}
      </div>}
      {!siteToolsEnabled&&<div className="siteToolsDisabled">Enable site tools in Settings → Browser to discover WebMCP tools on supported pages.</div>}
      {siteToolsEnabled&&!siteTools.length&&siteToolStatus&&<pre className="siteToolStatus empty">{siteToolStatus}</pre>}
    </div>}

    {annotating&&<div className="annotationGuide"><PenLine size={15}/><span>Move over the page and select an element. Press Esc to cancel.</span><button onClick={cancelAnnotation}>Cancel</button></div>}
    {annotation&&<div className="annotationPanel">
      <div className="annotationElement"><b>{annotation.ariaLabel||annotation.tag||'Selected element'}</b><small>{annotation.selector}</small>{annotation.text&&<span>{annotation.text}</span>}</div>
      <textarea value={annotationNote} onChange={e=>setAnnotationNote(e.target.value)} placeholder="Add a specific comment about this element…"/>
      <div className="annotationActions"><button onClick={cancelAnnotation}>Discard</button><button className="primaryAnnotation" onClick={attachAnnotation}>Add to chat</button></div>
    </div>}
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

function ComputerPane({screens,setScreens,approvalMode,permissionOptions={},setApprovalMode,onClose}){
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

  const label=approvalMode==='full'?'Full access':approvalMode==='auto'?'Auto':'Read-only';
  return <aside className="sidePane computerPane">
    <div className="paneTabs"><div className="browserTab"><Monitor size={14}/><span>Computer</span></div><button onClick={onClose}><X size={16}/></button></div>
    <div className="computerToolbar">
      <div><b>Computer use</b><small>{label}</small></div>
      <select className="computerPermissionSelect" value={approvalMode} onChange={e=>setApprovalMode(e.target.value)}>
        <option value="ask">Read-only</option>
        <option value="auto" disabled={!permissionOptions.auto}>Auto</option>
        <option value="full" disabled={!permissionOptions.full}>Full access</option>
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
  const {section,setSection,onClose,session,prefs,setPrefs,status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError,onExportData,onImportData,onClearHistory,archivedChats,onUnarchiveChat,onDeleteArchived,onArchiveAll,onDeleteAll,onComputer,onAppshot,onPlugins,onBrowser}=props;
  const [mobileList,setMobileList]=useState(true);
  const [settingsQuery,setSettingsQuery]=useState('');
  const hiddenOnMobile=new Set(['Keyboard shortcuts','Computer use','Configuration','Browser','Git','Environments']);
  const visibleSettings=settingsSections.filter(([,label])=>(!isNative||!hiddenOnMobile.has(label))&&(!settingsQuery.trim()||label.toLowerCase().includes(settingsQuery.trim().toLowerCase())));
  return <div className={'settingsScreen '+(mobileList?'mobileSettingsList':'mobileSettingsDetail')} role="dialog" aria-modal="true" aria-label="Settings">
    <aside className="settingsNav">
      <button className="backToApp" onClick={onClose}><ArrowLeft size={15}/>Back to app</button>
      <div className="settingsSearch"><Search size={15}/><input value={settingsQuery} onChange={e=>setSettingsQuery(e.target.value)} placeholder="Search settings"/></div>
      {['personal','integrations','coding'].map(group=><div key={group} className="settingsGroup">
        <div className="settingsGroupLabel">{group==='personal'?'Personal':group==='integrations'?'Integrations':'Coding'}</div>
        {visibleSettings.filter(x=>x[0]===group).map(([_,label,Icon])=><button key={label} className={section===label?'active':''} onClick={()=>{setSection(label);setMobileList(false)}}><Icon size={15}/>{isNative&&label==='Plugins'?'Apps':label}</button>)}
      </div>)}
    </aside>
    <main className="settingsContent">
      <div className="settingsContentTop">
        <button className="mobileSettingsBack" onClick={()=>setMobileList(true)} aria-label="Back to settings"><ArrowLeft size={18}/></button>
        <h1>{section}</h1>
        <button className="settingsClose" onClick={onClose} aria-label="Close settings"><X size={18}/></button>
      </div>
      {section==='General'&&<GeneralSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Import'&&!isNative&&<ImportSettings onImportData={onImportData}/>}
      {section==='Profile'&&<ProfileSettings session={session}/>} 
      {section==='Appearance'&&<AppearanceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Voice'&&<VoiceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Personalization'&&<PersonalizationSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Data controls'&&<DataControlsSettings onExportData={onExportData} onClearHistory={onClearHistory}/>}
      {section==='Configuration'&&<ConfigurationSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Keyboard shortcuts'&&!isNative&&<SimpleSettings title="Keyboard shortcuts" rows={[['New chat','Ctrl+N'],['Browser','Ctrl+Shift+B'],['Settings','Ctrl+,']]}/>}
      {section==='Computer use'&&!isNative&&<IntegrationSettings icon={Monitor} title="Computer use" text="Preview and control your desktop from Work or Super AI." status={prefs.approvalMode==='full'?'Full access':prefs.approvalMode==='auto'?'Auto':'Read-only'} action={onComputer}/>}
      {section==='Appshots'&&isDesktop&&desktopPlatform==='win32'&&<AppshotsSettings onCapture={onAppshot}/>}
      {section==='Plugins'&&<IntegrationSettings icon={Plug} title={isNative?'Apps':'Plugins'} text="Use MCP/connectors already installed in connected AI services." status={(connected.filter(p=>p.mcps?.length).length)+' providers'} action={onPlugins}/>}
      {section==='Browser'&&!isNative&&<BrowserSettings prefs={prefs} setPrefs={setPrefs} onBrowser={onBrowser}/>}
      {section==='Connections'&&<ConnectionsSettings {...{status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError}}/>}
      {section==='Git'&&!isNative&&<SimpleSettings title="Git" rows={[['Git integration','Available through installed plugins'],['Repository context','Super AI / Work']]}/>}
      {section==='Environments'&&!isNative&&<SimpleSettings title="Environments" rows={[['Desktop runtime','Electron desktop'],['Browser bridge',status.extension?'Connected':'Disconnected']]}/>}
    </main>
  </div>
}

function Toggle({value,onChange}){return <button role="switch" aria-checked={value} className={'toggle '+(value?'on':'')} onClick={()=>onChange(!value)}><span/></button>}
function GeneralSettings({prefs,setPrefs}){
  if(isNative)return <div className="settingsPane">
    <h3>General</h3>
    <div className="settingBlock">
      <SettingRow title="App language" desc="Free AI currently follows the Android system language." control={<span className="valuePill">{navigator.language||'System'}</span>}/>
      <SettingRow title="Auto-correct spelling" desc="Allow Android keyboard spelling and correction in the message composer." control={<Toggle value={prefs.spellCheckEnabled!==false} onChange={v=>setPrefs({...prefs,spellCheckEnabled:v})}/>}/>
      <SettingRow title="Haptic feedback" desc="Use subtle vibration feedback for send and dictation controls." control={<Toggle value={prefs.hapticsEnabled!==false} onChange={v=>setPrefs({...prefs,hapticsEnabled:v})}/>}/>
    </div>
  </div>;
  return <div className="settingsPane">
    <h3>Permissions</h3>
    <div className="settingBlock">
      <SettingRow title="Default permissions" desc="Supported computer actions ask for approval by default." control={<span className="valuePill">On</span>}/>
      <SettingRow title="Auto" desc="Makes Auto available: tasks can work inside the current workspace automatically and ask before broader access." control={<Toggle value={!!prefs.autoReviewEnabled} onChange={v=>setPrefs({...prefs,autoReviewEnabled:v,approvalMode:!v&&prefs.approvalMode==='auto'?'ask':prefs.approvalMode})}/>}/>
      <SettingRow title="Full access" desc="Makes Full access available for supported computer actions without repeated prompts." control={<Toggle value={!!prefs.fullAccessEnabled} onChange={v=>setPrefs({...prefs,fullAccessEnabled:v,approvalMode:!v&&prefs.approvalMode==='full'?'ask':prefs.approvalMode})}/>}/>
    </div>
    <h3>General</h3>
    <div className="settingBlock">
      <SettingRow title="Bottom panel" desc="Show project, plugin and browser actions below the Work composer." control={<Toggle value={prefs.showBottomPanel!==false} onChange={v=>setPrefs({...prefs,showBottomPanel:v})}/>}/>
    </div>
  </div>
}
function SettingRow({title,desc,control}){return <div className="settingRow"><div><b>{title}</b><small>{desc}</small></div>{control}</div>}
function AppearanceSettings({prefs,setPrefs}){
  return <div className="settingsPane">
    <h3>Theme</h3>
    <div className="settingBlock">
      <SettingRow title="Appearance" desc="Follow the system or choose a fixed theme." control={<select value={prefs.appearance||'dark'} onChange={e=>setPrefs({...prefs,appearance:e.target.value})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>}/>
      {!isNative&&(!isDesktop||desktopPlatform==='win32')&&<SettingRow title="Contrast" desc="Adjust separation between controls and surfaces." control={<select value={prefs.contrast||'medium'} onChange={e=>setPrefs({...prefs,contrast:e.target.value})}><option value="system">System</option><option value="medium">Medium</option><option value="increased">Increased</option></select>}/>}
      <SettingRow title="Accent color" desc="Used for active controls, message highlights and voice actions." control={<select value={prefs.accent||'blue'} onChange={e=>setPrefs({...prefs,accent:e.target.value})}><option value="blue">Blue</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="pink">Pink</option><option value="orange">Orange</option><option value="purple">Purple</option><option value="neutral">Neutral</option></select>}/>
      {isDesktop&&desktopPlatform==='win32'&&<SettingRow title="Text size" desc="Zoom the entire Free AI interface." control={<div className="zoomControl"><button aria-label="Zoom out" onClick={()=>setPrefs({...prefs,textSize:Math.max(80,(Number(prefs.textSize)||100)-10)})}>−</button><span>{Number(prefs.textSize)||100}%</span><button aria-label="Zoom in" onClick={()=>setPrefs({...prefs,textSize:Math.min(150,(Number(prefs.textSize)||100)+10)})}>+</button><button className="resetZoom" onClick={()=>setPrefs({...prefs,textSize:100})}>Reset</button></div>}/>} 
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
function PersonalizationSettings({prefs,setPrefs}){
  return <div className="settingsPane">
    <h3>Personalization</h3>
    <div className="settingBlock">
      <SettingRow title="Enable customization" desc="Apply your instructions to requests sent through Free AI." control={<Toggle value={prefs.customizationEnabled!==false} onChange={v=>setPrefs({...prefs,customizationEnabled:v})}/>}/>
      <label className="customInstructionsField">
        <span>Custom instructions</span>
        <small>These instructions are sent as request context to the connected model you choose.</small>
        <textarea value={prefs.customInstructions||''} onChange={e=>setPrefs({...prefs,customInstructions:e.target.value})} placeholder="What should connected models know about how you want them to respond?"/>
      </label>
    </div>
  </div>
}
function ImportSettings({onImportData}){
  const inputRef=useRef(null);
  const [state,setState]=useState('');
  async function importFile(event){
    const file=event.target.files?.[0];if(!file)return;
    setState('Importing…');
    try{await onImportData(file);setState('Import complete')}catch(e){setState(e?.message||'Import failed')}
    event.target.value='';
  }
  return <div className="settingsPane">
    <h3>Import</h3>
    <div className="settingBlock">
      <SettingRow title="Free AI data export" desc="Import chats and preferences from a Free AI JSON export on this computer." control={<button className="settingsInlineButton" onClick={()=>inputRef.current?.click()}>Choose file</button>}/>
      <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={importFile}/>
    </div>
    {state&&<div className="settingsStatus">{state}</div>}
  </div>
}
function DataControlsSettings({archivedChats=[],onUnarchiveChat,onDeleteArchived,onArchiveAll,onDeleteAll,onExportData,onClearHistory}){
  const [confirm,setConfirm]=useState('');
  return <div className="settingsPane">
    <h3>Chat history</h3>
    <div className="settingBlock">
      <SettingRow title="Archived chats" desc={archivedChats.length?archivedChats.length+' archived chat'+(archivedChats.length===1?'':'s'):'No archived chats'} control={<span className="valuePill">{archivedChats.length}</span>}/>
      {archivedChats.slice(0,20).map(chat=><div className="archivedChatRow" key={chat.id}><span>{chat.title}</span><div><button onClick={()=>onUnarchiveChat(chat)}>Unarchive</button><button className="dangerText" onClick={()=>onDeleteArchived(chat)}>Delete</button></div></div>)}
      <SettingRow title="Archive all chats" desc="Remove every active chat from the sidebar without deleting it." control={<button className="settingsInlineButton" onClick={onArchiveAll}>Archive all</button>}/>
      <SettingRow title="Delete all chats" desc="Delete active and archived local chats from this device." control={confirm==='delete'
        ? <span className="confirmInline"><button onClick={()=>setConfirm('')}>Cancel</button><button className="dangerAction" onClick={()=>{onDeleteAll();setConfirm('')}}>Delete all</button></span>
        : <button className="settingsInlineButton dangerText" onClick={()=>setConfirm('delete')}>Delete all…</button>}/>
    </div>
    <h3>Data</h3>
    <div className="settingBlock">
      <SettingRow title="Export Free AI data" desc="Export locally stored chats and preferences as JSON." control={<button className="settingsInlineButton" onClick={onExportData}>Export</button>}/>
      <SettingRow title="Clear local data" desc="Clear local Free AI chat data on this device." control={confirm==='clear'
        ? <span className="confirmInline"><button onClick={()=>setConfirm('')}>Cancel</button><button className="dangerAction" onClick={()=>{onClearHistory();setConfirm('')}}>Clear</button></span>
        : <button className="settingsInlineButton dangerText" onClick={()=>setConfirm('clear')}>Clear…</button>}/>
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

function AppshotsSettings({onCapture}){
  return <div className="settingsPane">
    <h3>Appshots</h3>
    <div className="settingBlock">
      <SettingRow title="Shortcut" desc="Share the frontmost Windows app with Free AI." control={<span className="valuePill">Both Alt keys</span>}/>
      <SettingRow title="Attachment" desc="Includes a screenshot plus text exposed by Windows accessibility APIs." control={<span className="valuePill">Screenshot + text</span>}/>
      <SettingRow title="Capture now" desc="Capture the current foreground app and attach it to the active chat." control={<button className="settingsInlineButton" onClick={onCapture}>Capture</button>}/>
    </div>
  </div>
}
function BrowserSettings({prefs,setPrefs,onBrowser}){
  const [clearState,setClearState]=useState('');
  const [confirmClear,setConfirmClear]=useState(false);
  async function clearData(){
    setClearState('Clearing…');
    try{
      await window.desktopApi?.browserClearData?.();
      setClearState('Browsing data cleared');
    }catch(e){setClearState(e?.message||'Could not clear browsing data')}
    setConfirmClear(false);
  }
  return <div className="settingsPane">
    <h3>Browser</h3>
    <div className="settingBlock">
      <SettingRow title="Enable site tools" desc="Discover WebMCP tools exposed by supported websites in Free AI's built-in browser." control={<Toggle value={prefs.siteToolsEnabled!==false} onChange={v=>setPrefs({...prefs,siteToolsEnabled:v})}/>}/>
      <SettingRow title="Open built-in browser" desc="Use Free AI's separate browser profile, tabs, sign-ins and downloads." control={<button className="settingsInlineButton" onClick={onBrowser}>Open</button>}/>
      <SettingRow title="Clear browsing data" desc="Clear cookies, signed-in website state, local storage and browser cache for the Free AI browser profile." control={confirmClear
        ? <span className="confirmInline"><button onClick={()=>setConfirmClear(false)}>Cancel</button><button className="dangerAction" onClick={clearData}>Clear</button></span>
        : <button className="settingsInlineButton dangerText" onClick={()=>setConfirmClear(true)}>Clear…</button>}/>
    </div>
    {clearState&&<div className="settingsStatus">{clearState}</div>}
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
