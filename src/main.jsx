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
  CalendarDays,Check,ChevronDown,ChevronRight,Chrome,Clock3,Code2,Copy,Database,Download,ExternalLink,
  File,FileText,Folder,GitBranch,Globe2,HardDrive,HelpCircle,Image,Keyboard,Link2,
  LogOut,Mail,Menu,Mic2,Monitor,MoreHorizontal,MousePointer2,Palette,PanelLeft,Paperclip,PenLine,Pin,Plug,
  Plus,RefreshCw,RotateCcw,Search,Settings,ShieldCheck,SlidersHorizontal,Sparkles,Square,
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
const isWindowsDesktop=isDesktop&&desktopPlatform==='win32';
const androidMajor=Number((navigator.userAgent.match(/Android\s+(\d+)/i)||[])[1]||0);
const AUTH_CALLBACK_URL='freeai://auth/callback';
const GOOGLE_WEB_CLIENT_ID=import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID||'991329297292-fp0ciud251vjasflsjq4r7k2vgo4sij7.apps.googleusercontent.com';
const providerNames={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',deepseek:'DeepSeek',grok:'Grok',manus:'Manus'};
const projectIconOptions=[
  ['folder','Folder',Folder],['briefcase','Briefcase',Briefcase],['code','Code',Code2],
  ['sparkles','Ideas',Sparkles],['globe','Research',Globe2],['calendar','Planning',CalendarDays]
];
const projectColorOptions=['blue','green','orange','purple','pink','neutral'];

const settingsSections=[
  ['personal','General',Settings],['personal','Profile',UserRound],['personal','Appearance',Palette],['personal','Voice',Volume2],
  ['personal','Personalization',Sparkles],['personal','Data controls',Database],
  ['personal','Configuration',SlidersHorizontal],['personal','Keyboard shortcuts',Keyboard],
  ['integrations','Computer use',Monitor],['integrations','Plugins',Plug],['integrations','Browser',Globe2],
  ['coding','Connections',Link2],['coding','Git',GitBranch],['coding','Environments',SquareTerminal]
];

function readJSON(key,fallback){
  try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}
}
function applyInitialWindowsVisualPrefs(){
  if(!isWindowsDesktop)return;
  const prefs=readJSON('freeai.prefs',{});
  const root=document.documentElement;
  let appearance=prefs.appearance||'dark';
  if(appearance==='system')appearance=window.matchMedia?.('(prefers-color-scheme: light)')?.matches?'light':'dark';
  root.dataset.theme=appearance;
  root.dataset.contrast=prefs.contrast==='system'
    ? (window.matchMedia?.('(prefers-contrast: more)')?.matches?'increased':'medium')
    : (prefs.contrast||'medium');
  root.dataset.accent=prefs.accent||'blue';
  const scale=(Number(prefs.textSize)||100)/100;
  root.style.setProperty('--ui-scale',String(scale));
  if(document.body)document.body.style.zoom=String(scale);
}
applyInitialWindowsVisualPrefs();

function normalizeApprovalMode(value){
  if(value==='low'||value==='auto'||value==='full')return 'low';
  if(value==='read')return 'read';
  return 'ask';
}
function randomKey(){
  const b=new Uint8Array(32);crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function modelLabel(model){
  return model?.modelName||model?.name||providerNames[model?.id]||model?.model||'Select model';
}
function modelKey(model){
  return model?(String(model.source||'browser')+'::'+String(model.id||'')):'';
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
function readFileDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error||new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}
function attachmentMeta(item){
  return {id:item.id,name:item.name,type:item.type,size:item.size,kind:item.kind};
}

function BrandMark({size=22,className=''}) {
  return <span className={'freeAiMark '+className} style={{'--mark-size':size+'px'}} aria-hidden="true">
    <svg viewBox="0 0 512 512" focusable="false">
      <path className="markArc" d="M154 112 A182 182 0 0 1 400 358"/>
      <path className="markArc" d="M358 400 A182 182 0 0 1 112 154"/>
    </svg>
  </span>;
}

function ProjectMark({project,size=16}){
  const entry=projectIconOptions.find(([key])=>key===(project?.icon||'folder'))||projectIconOptions[0];
  const Icon=entry[2];
  return <span className="projectMark" data-color={project?.color||'blue'} style={{'--project-mark-size':size+'px'}} aria-hidden="true"><Icon size={Math.max(12,size-3)}/></span>;
}

function DesktopProductSwitcher({product,open,setOpen,onSelect}){
  const current=product==='super'?'Super AI':'Free AI';
  return <div className="productSwitcher">
    <button
      className="brandButton"
      title="Switch product"
      aria-label={'Switch product. Current: '+current}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={()=>setOpen(v=>!v)}
    >
      <BrandMark size={20} className={product==='super'?'superMark':''}/><b>{current}</b><ChevronDown size={14}/>
    </button>
    {open&&<div className="productMenu" role="menu" aria-label="Product">
      <button role="menuitemradio" aria-checked={product==='free'} className={product==='free'?'active':''} onClick={()=>onSelect('free')}>
        <BrandMark size={20}/><span><b>Free AI</b><small>Chat and Work with connected models</small></span>{product==='free'&&<Check size={16}/>}
      </button>
      <button role="menuitemradio" aria-checked={product==='super'} className={product==='super'?'active':''} onClick={()=>onSelect('super')}>
        <BrandMark size={20} className="superMark"/><span><b>Super AI</b><small>Agent workspace with repositories, browser and computer</small></span>{product==='super'&&<Check size={16}/>} 
      </button>
    </div>}
  </div>;
}

function WindowsChrome(){
  const menus=['File','Edit','View','Help'];
  return <div className="windowsChrome" role="menubar" aria-label="Application menu">
    <div className="windowsChromeSafe">
      <div className="windowsChromeMenus">
        {menus.map(label=><button key={label} role="menuitem" aria-haspopup="menu" onClick={()=>window.desktopApi?.showAppMenu?.(label)}>{label}</button>)}
      </div>
    </div>
  </div>;
}

function Root(){
  if(!isWindowsDesktop)return <App/>;
  return <div className="windowsDesktopRoot">
    <WindowsChrome/>
    <div className="appViewport"><App/></div>
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
  const [recentsFilter,setRecentsFilter]=useState('all');
  const [recentsFilterOpen,setRecentsFilterOpen]=useState(false);
  const [chatMenuId,setChatMenuId]=useState(null);
  const [responseMenuIndex,setResponseMenuIndex]=useState(null);
  const [copiedMessageIndex,setCopiedMessageIndex]=useState(null);
  const [projects,setProjects]=useState(()=>readJSON('freeai.projects',[]));
  const [activeProjectId,setActiveProjectId]=useState(null);
  const [projectDialogOpen,setProjectDialogOpen]=useState(false);
  const [projectDraft,setProjectDraft]=useState({name:'',icon:'folder',color:'blue'});
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
  const [attachments,setAttachments]=useState([]);
  const [attachmentError,setAttachmentError]=useState('');
  const [dragActive,setDragActive]=useState(false);
  const [screens,setScreens]=useState([]);
  const [workTask,setWorkTask]=useState(null);
  const [repositoryWorkspace,setRepositoryWorkspace]=useState(null);
  const [superTeamKeys,setSuperTeamKeys]=useState(()=>readJSON('freeai.super.team',[]));
  const handledWorkTerminalRef=useRef(null);
  const [chats,setChats]=useState(()=>readJSON('freeai.chats.free',readJSON('freeai.chats',[])));
  const [currentChatId,setCurrentChatId]=useState(null);
  const [appPrefs,setAppPrefs]=useState(()=>{
    const saved=readJSON('freeai.prefs',{});
    return {
      appearance:'dark',contrast:'medium',accent:'blue',textSize:100,suggestedPrompts:true,voiceLanguage:'auto',
      customizationEnabled:true,customInstructions:'',siteToolsEnabled:true,spellCheckEnabled:true,hapticsEnabled:true,showBottomPanel:true,
      ...saved,
      approvalMode:normalizeApprovalMode(saved.approvalMode)
    };
  });
  const [settings,setSettings]=useState(()=>({relayUrl:localStorage.getItem('relayUrl')||'',pairKey:localStorage.getItem('pairKey')||''}));
  const [apiDraft,setApiDraft]=useState({name:'',baseUrl:'',model:'',apiKey:''});
  const [apiError,setApiError]=useState('');
  const [mcpConnections,setMcpConnections]=useState([]);
  const [selectedMcpIds,setSelectedMcpIds]=useState([]);
  const [mcpDraft,setMcpDraft]=useState({name:'',url:'',token:''});
  const [mcpError,setMcpError]=useState('');
  const fileRef=useRef(null);
  const photoRef=useRef(null);
  const cameraRef=useRef(null);
  const messageEndRef=useRef(null);
  const activeRequestRef=useRef(null);
  const streamedTextRef=useRef('');
  const cancelledRequestRef=useRef(null);
  const activeWorkTaskIdRef=useRef(null);
  const workTaskModelRef=useRef(null);

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
    const offWork=window.desktopApi.onWorkTask?.(state=>{
      if(!active||!state?.id||state.id!==activeWorkTaskIdRef.current)return;
      setWorkTask(state);
    });
    const offCommand=window.desktopApi.onAppCommand?.(command=>{
      if(command==='new-chat')newChat();
      if(command==='about'){stopActiveWorkTask();setSettingsSection('General');setSettingsOpen(true)}
      if(command==='open-browser')openBrowser();
      if(command==='open-computer'){setSettingsOpen(false);setSidePanel('computer')}
      if(command==='toggle-sidebar')setSidebarOpen(v=>!v);
    });
    window.desktopApi.configureRelay(settings).then(s=>active&&setStatus(s)).catch(()=>{});
    window.desktopApi.scanProviders().catch(()=>{});
    window.desktopApi.listMcpConnections?.().then(items=>active&&setMcpConnections(Array.isArray(items)?items:[])).catch(()=>{});
    return()=>{active=false;offStatus?.();offWork?.();offCommand?.()};
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
    setSuperTeamKeys(current=>{
      const primary=modelKey(selected);
      const next=(Array.isArray(current)?current:[]).filter(key=>key!==primary&&connected.some(model=>modelKey(model)===key)).slice(0,3);
      localStorage.setItem('freeai.super.team',JSON.stringify(next));
      return next;
    });
  },[connected,selected?.id,selected?.source]);

  useEffect(()=>{
    if(!isWindowsDesktop)return;
    const levels=Array.isArray(selected?.effortLevels)?selected.effortLevels.filter(Boolean):[];
    if(!levels.length||selected?.effortControl!=='native'){
      setEffort(current=>current==='default'?current:'default');
      setEffortMenu(false);
      return;
    }
    setEffort(current=>{
      if(levels.includes(current))return current;
      if(selected?.activeEffort&&levels.includes(selected.activeEffort))return selected.activeEffort;
      return levels[0];
    });
  },[selected]);

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
      if(isWindowsDesktop){
        const styles=getComputedStyle(root);
        window.desktopApi?.setTitleBarTheme?.({
          color:styles.getPropertyValue('--canvas').trim(),
          symbolColor:styles.getPropertyValue('--text').trim()
        }).catch(()=>{});
      }
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
      if(projectDialogOpen){setProjectDialogOpen(false);return}
      if(profileMenu){setProfileMenu(false);return}
      if(responseMenuIndex!==null){setResponseMenuIndex(null);return}
      if(chatMenuId){setChatMenuId(null);return}
      if(recentsFilterOpen){setRecentsFilterOpen(false);return}
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
      if(!target.closest('.recentsFilterAnchor'))setRecentsFilterOpen(false);
      if(!target.closest('.recentRow'))setChatMenuId(null);
      if(!target.closest('.messageActions'))setResponseMenuIndex(null);
    };
    window.addEventListener('keydown',onKey);
    document.addEventListener('pointerdown',onPointer);
    return()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer)};
  },[projectDialogOpen,profileMenu,responseMenuIndex,chatMenuId,recentsFilterOpen,modelMenu,effortMenu,plusMenu,productMenu,mobileModeMenu,mobileNavOpen,settingsOpen,sidePanel]);

  useEffect(()=>{
    localStorage.setItem('freeai.product',product);
    setChats(readJSON('freeai.chats.'+product,[]));
    setCurrentChatId(null);
    setMessages([]);
    setAttachments(current=>{for(const item of current)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);return []});setAttachmentError('');setSelectedFile(null);
    setSelectedTool(null);
    setSidePanel(null);
    setRecentsFilter('all');
    setRecentsFilterOpen(false);
    setChatMenuId(null);
    setActiveProjectId(null);
    setProjectDialogOpen(false);
    if(product==='super')setMode('work');
  },[product]);

  useEffect(()=>{
    if(isDesktop)window.desktopApi?.browserSetSiteToolsEnabled?.(appPrefs.siteToolsEnabled!==false).catch(()=>{});
  },[appPrefs.siteToolsEnabled]);

  useEffect(()=>{
    if(!isWindowsDesktop||!messages.length)return;
    requestAnimationFrame(()=>messageEndRef.current?.scrollIntoView({block:'end'}));
  },[messages.length,busy,currentChatId]);

  useEffect(()=>{
    if(!isWindowsDesktop||!window.desktopApi?.onPromptStream)return;
    return window.desktopApi.onPromptStream(event=>{
      if(!event?.id||event.id!==activeRequestRef.current)return;
      const text=String(event.text||'');
      streamedTextRef.current=text;
      setMessages(prev=>prev.map(message=>message.requestId===event.id?{...message,text,streaming:true}:message));
    });
  },[]);

  useEffect(()=>{
    if(!workTask||!['completed','failed','stopped'].includes(workTask.status))return;
    const terminalKey=workTask.id+':'+workTask.status;
    if(handledWorkTerminalRef.current===terminalKey)return;
    handledWorkTerminalRef.current=terminalKey;
    if(activeWorkTaskIdRef.current===workTask.id)activeWorkTaskIdRef.current=null;
    if(workTask.status==='stopped')return;
    const taskModel=workTaskModelRef.current||selected;
    setMessages(prev=>{
      const entry=workTask.status==='completed'
        ? {role:'assistant',text:String(workTask.finalMessage||'Task completed.'),provider:taskModel?.id}
        : {role:'error',text:String(workTask.error||'Work task failed.')};
      const next=[...prev,entry];
      queueMicrotask(()=>saveCurrentChat(next,taskModel));
      return next;
    });
  },[workTask?.id,workTask?.status]);

  useEffect(()=>{
    if(product==='super'&&workTask?.workspace?.name){
      setRepositoryWorkspace(current=>current?.root?{...current,...workTask.workspace}:current);
    }
  },[product,workTask?.workspace?.name,workTask?.workspace?.branch,workTask?.workspace?.head,workTask?.workspace?.dirty]);

  const activeProject=useMemo(()=>projects.find(project=>project.id===activeProjectId)||null,[projects,activeProjectId]);
  const projectChats=useMemo(()=>activeProjectId
    ? chats.filter(chat=>chat.projectId===activeProjectId).sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0))
    : [],[chats,activeProjectId]);

  const visibleChats=useMemo(()=>{
    const q=sidebarSearch.trim().toLowerCase();
    let list=q?chats.filter(chat=>String(chat.title||'').toLowerCase().includes(q)):[...chats];
    if(isWindowsDesktop&&product==='free'&&recentsFilter!=='all'){
      list=list.filter(chat=>(chat.mode||'chat')===recentsFilter);
    }
    if(isWindowsDesktop){
      list=[...list].sort((a,b)=>{
        const pinDelta=Number(!!b.pinned)-Number(!!a.pinned);
        return pinDelta||((Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));
      });
    }
    return list;
  },[chats,sidebarSearch,product,recentsFilter]);

  function persistPrefs(next){
    const normalized={...next,approvalMode:normalizeApprovalMode(next.approvalMode)};
    setAppPrefs(normalized);localStorage.setItem('freeai.prefs',JSON.stringify(normalized));
  }
  function stopActiveWorkTask(){
    const taskId=activeWorkTaskIdRef.current;
    if(isWindowsDesktop&&taskId){
      activeWorkTaskIdRef.current=null;
      window.desktopApi?.stopWorkTask?.(taskId).catch(()=>{});
      setWorkTask(null);
    }
  }
  async function chooseRepositoryWorkspace(){
    if(!isWindowsDesktop)return;
    stopActiveWorkTask();
    setMode('work');setPage('chat');setMobileNavOpen(false);
    setAttachmentError('');
    try{
      const workspace=await window.desktopApi.chooseRepository();
      if(workspace)setRepositoryWorkspace(workspace);
    }catch(error){
      setAttachmentError(error?.message||'Could not open repository workspace.');
    }
  }
  function clearRepositoryWorkspace(){
    if(workBusy)return;
    setRepositoryWorkspace(null);
  }
  function persistProjects(next){setProjects(next);localStorage.setItem('freeai.projects',JSON.stringify(next))}
  function createProject(){
    stopActiveWorkTask();
    const name=String(projectDraft.name||'').trim();
    if(!name)return;
    const project={id:crypto.randomUUID(),name,icon:projectDraft.icon||'folder',color:projectDraft.color||'blue',instructions:'',createdAt:Date.now(),updatedAt:Date.now()};
    persistProjects([project,...projects]);
    setActiveProjectId(project.id);setProjectDialogOpen(false);setProjectDraft({name:'',icon:'folder',color:'blue'});setPage('project');
  }
  function updateProject(id,patch){
    const stamp=Date.now();
    setProjects(prev=>{
      const next=prev.map(project=>project.id===id?{...project,...patch,updatedAt:stamp}:project);
      localStorage.setItem('freeai.projects',JSON.stringify(next));
      return next;
    });
  }
  function openProject(project){stopActiveWorkTask();setActiveProjectId(project.id);setPage('project');setChatMenuId(null);setMobileNavOpen(false)}
  function openPluginsPage(){stopActiveWorkTask();setPlusMenu(false);setPage('plugins');setMobileNavOpen(false)}
  function startProjectConversation(projectId,nextMode){
    stopActiveWorkTask();
    setActiveProjectId(projectId);setCurrentChatId(null);setMessages([]);setPrompt('');setSelectedTool(null);
    setMode(nextMode);setModelMenu(false);setPlusMenu(false);setPage('chat');setSidePanel(null);setMobileNavOpen(false);
  }
  function saveCurrentChat(nextMessages,model=selected){
    if(!model||!nextMessages.length)return;
    const firstUser=nextMessages.find(m=>m.role==='user')?.text||'New chat';
    const title=firstUser.length>46?firstUser.slice(0,46)+'…':firstUser;
    let id=currentChatId;
    if(!id){id=crypto.randomUUID();setCurrentChatId(id)}
    setChats(prev=>{
      const existing=prev.find(c=>c.id===id);
      const chat={
        id,title,providerId:model.id,source:model.source,modelName:modelLabel(model),messages:nextMessages,
        mode:product==='super'?'work':mode,pinned:!!existing?.pinned,
        projectId:existing?.projectId||activeProjectId||null,
        workspace:product==='super'&&repositoryWorkspace?repositoryWorkspace:null,
        superTeamKeys:product==='super'?superTeamKeys:[],
        updatedAt:Date.now()
      };
      const next=[chat,...prev.filter(c=>c.id!==id)].slice(0,60);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));return next;
    });
  }
  function togglePinChat(id){
    setChats(prev=>{
      const next=prev.map(chat=>chat.id===id?{...chat,pinned:!chat.pinned}:chat);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));
      return next;
    });
    setChatMenuId(null);
  }
  function selectProduct(nextProduct){
    stopActiveWorkTask();
    setSelectedMcpIds([]);
    setProductMenu(false);
    if(nextProduct===product)return;
    setProduct(nextProduct);
    setMode(nextProduct==='super'?'work':'chat');
  }
  function selectExperience(nextMode){
    if(product!=='free'||nextMode===mode)return;
    stopActiveWorkTask();
    const hasThread=!!currentChatId||messages.length>0;
    setMode(nextMode);setModelMenu(false);setPlusMenu(false);setSelectedTool(null);setSelectedMcpIds([]);setPage('chat');
    if(hasThread){setCurrentChatId(null);setMessages([]);setPrompt('')}
  }
  function newChat(){
    stopActiveWorkTask();
    setActiveProjectId(null);setCurrentChatId(null);setMessages([]);setPrompt('');setSelectedTool(null);setSelectedMcpIds([]);
    setAttachments(current=>{for(const item of current)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);return []});setAttachmentError('');setSelectedFile(null);
    setModelMenu(false);setPlusMenu(false);setPage('chat');setSidePanel(null);setMobileNavOpen(false);
  }
  function openChat(chat){
    stopActiveWorkTask();
    setAttachments(current=>{for(const item of current)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);return []});setAttachmentError('');setSelectedFile(null);
    setCurrentChatId(chat.id);setMessages(Array.isArray(chat.messages)?chat.messages:[]);
    setSelected(connected.find(p=>p.id===chat.providerId&&p.source===chat.source)||null);
    if(product==='free')setMode(chat.mode||'chat');
    if(product==='super'){
      setRepositoryWorkspace(chat.workspace||null);
      setSuperTeamKeys(Array.isArray(chat.superTeamKeys)?chat.superTeamKeys:[]);
    }
    setActiveProjectId(chat.projectId||null);setSelectedTool(null);setSelectedMcpIds([]);setPage('chat');setChatMenuId(null);
  }
  const workBusy=isWindowsDesktop&&mode==='work'&&!!workTask&&['running','waiting_approval'].includes(workTask.status);

  async function runWorkGeneration(text){
    const userText=String(text||'').trim();
    if((!userText&&!attachments.length)||workBusy)return;
    if(!selected){setModelMenu(true);return}
    if(selectedTool){
      setAttachmentError('Plugin/MCP orchestration is not part of Windows 4. Remove the selected plugin or use Chat; plugin orchestration remains a Windows 5 checkpoint.');
      return;
    }
    const canUploadFiles=selected.source==='browser'&&selected.fileUpload===true;
    const inlineParts=[];
    const outbound=[];
    setAttachmentError('');
    if(canUploadFiles){
      for(const item of attachments){
        outbound.push({name:item.name,type:item.type,size:item.size,dataUrl:await readFileDataUrl(item.file)});
      }
    }else{
      for(const item of attachments){
        if(item.kind==='text'&&item.content)inlineParts.push('[File: '+item.name+']\n'+item.content);
        else{
          setAttachmentError(selected.source==='api'
            ? 'This API model cannot receive desktop screenshots or binary Work attachments. Choose a browser model with real file upload for Computer Use.'
            : 'The selected browser model does not expose real file upload. Choose a model with file upload for binary Work attachments or Computer Use.');
          return;
        }
      }
    }
    const taskText=userText||'Review the attached files and determine the next useful step.';
    const finalUserText=inlineParts.length?[taskText,'',...inlineParts].filter(Boolean).join('\n\n'):taskText;
    const userMessage={role:'user',text:userText,attachments:attachments.map(attachmentMeta),attachmentContext:inlineParts.join('\n\n')};
    const next=[...messages,userMessage];
    setMessages(next);saveCurrentChat(next,selected);
    setPrompt('');
    const taskId=crypto.randomUUID();
    handledWorkTerminalRef.current=null;
    activeWorkTaskIdRef.current=taskId;
    workTaskModelRef.current=selected;
    setWorkTask({id:taskId,product,status:'running',step:0,maxSteps:product==='super'?24:18,detail:product==='super'?'Starting Super AI task…':'Starting Work task…',approval:null,progress:[],agents:[],workspace:product==='super'?repositoryWorkspace:null,finalMessage:'',error:''});
    try{
      const projectInstructions=activeProject?String(activeProject.instructions||'').trim():'';
      const globalInstructions=appPrefs.customizationEnabled?String(appPrefs.customInstructions||'').trim():'';
      let workspace=repositoryWorkspace;
      if(product==='super'&&workspace?.root){
        workspace=await window.desktopApi.repositorySummary(workspace.root);
        setRepositoryWorkspace(workspace);
      }
      const team=product==='super'
        ? superTeamKeys.map(key=>connected.find(model=>modelKey(model)===key)).filter(Boolean).filter(model=>modelKey(model)!==modelKey(selected)).slice(0,3).map(model=>({
            id:model.id,source:model.source||'browser',name:modelLabel(model)
          }))
        : [];
      const state=await window.desktopApi.startWorkTask({
        id:taskId,
        provider:selected.id,
        source:selected.source||'browser',
        product,
        text:finalUserText,
        effort,
        approvalMode:normalizeApprovalMode(appPrefs.approvalMode),
        attachments:outbound,
        workspace:product==='super'?workspace:null,
        team,
        mcpConnectionIds:selectedMcpIds,
        instructions:projectInstructions||globalInstructions,
        history:messages.slice(-12).filter(message=>message?.role==='user'||message?.role==='assistant').map(message=>({
          role:message.role,
          text:String(message.text||'').slice(0,5000)
        }))
      });
      if(activeWorkTaskIdRef.current===taskId)setWorkTask(state);
      for(const item of attachments)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);
      setAttachments([]);setSelectedMcpIds([]);setSelectedFile(null);setSidePanel(current=>current==='file'?null:current);
    }catch(e){
      if(activeWorkTaskIdRef.current===taskId)activeWorkTaskIdRef.current=null;
      setWorkTask(null);
      const failed=[...next,{role:'error',text:e?.message||String(e)}];
      setMessages(failed);saveCurrentChat(failed,selected);
    }
  }

  async function runGeneration(text,baseMessages=messages,model=selected,retryContext=null){
    const userText=String(text||'').trim();
    const hasAttachmentIntent=isWindowsDesktop&&(
      (!retryContext&&attachments.length>0)||
      (retryContext&&(Array.isArray(retryContext.attachments)&&retryContext.attachments.length>0||String(retryContext.attachmentContext||'').trim()))
    );
    if((!userText&&!hasAttachmentIntent)||busy)return;
    if(!model){setModelMenu(true);return}
    const activeAttachments=isWindowsDesktop&&!retryContext?attachments:[];
    const retryAttachmentContext=String(retryContext?.attachmentContext||'');
    const retryAttachmentMeta=Array.isArray(retryContext?.attachments)?retryContext.attachments:[];
    const canUploadFiles=isWindowsDesktop&&model.source==='browser'&&model.fileUpload===true;
    const inlineTextParts=[];
    if(isWindowsDesktop){
      if(retryAttachmentContext)inlineTextParts.push(retryAttachmentContext);
      if(!retryContext&&!canUploadFiles){
        for(const item of activeAttachments){
          if(item.kind==='text'&&item.content)inlineTextParts.push('[File: '+item.name+']\n'+item.content);
          else{
            setAttachmentError(model.source==='api'
              ? 'This API connection does not advertise binary file upload support. Use a text file or a browser model with file upload available.'
              : 'The connected browser tab does not expose a real file-upload control right now. Open the provider chat and make sure file upload is available.');
            return;
          }
        }
      }
    }
    if(isNative&&appPrefs.hapticsEnabled!==false)Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});
    setAttachmentError('');
    setBusy(true);setPrompt('');setResponseMenuIndex(null);
    const userAttachmentMeta=retryContext?retryAttachmentMeta:activeAttachments.map(attachmentMeta);
    const attachmentContext=inlineTextParts.join('\n\n');
    const withUser=[...baseMessages,{role:'user',text:userText,attachments:userAttachmentMeta,attachmentContext}];
    const requestId=isWindowsDesktop&&isDesktop?crypto.randomUUID():null;
    streamedTextRef.current='';
    cancelledRequestRef.current=null;
    activeRequestRef.current=requestId;
    const initial=requestId?[...withUser,{role:'assistant',text:'',provider:model.id,requestId,streaming:true}]:withUser;
    setMessages(initial);saveCurrentChat(withUser,model);
    try{
      const projectInstructions=activeProject?String(activeProject.instructions||'').trim():'';
      const globalInstructions=appPrefs.customizationEnabled?String(appPrefs.customInstructions||'').trim():'';
      const instructions=projectInstructions||globalInstructions;
      const instructionsLabel=projectInstructions?'Free AI project instructions for this request:':'Free AI user preferences for this request:';
      const userRequestText=attachmentContext?[userText,'',attachmentContext].join('\n'):userText;
      const routedText=instructions
        ? [instructionsLabel,instructions,'','User request:',userRequestText].join('\n')
        : userRequestText;
      const historyMessages=withUser.filter(message=>message.role==='user'||message.role==='assistant');
      const lastUserIndex=historyMessages.map(message=>message.role).lastIndexOf('user');
      const history=historyMessages.map((message,index)=>{
        const priorAttachmentContext=message.role==='user'?String(message.attachmentContext||''):'';
        const priorText=priorAttachmentContext?[String(message.text||''),'',priorAttachmentContext].join('\n'):String(message.text||'');
        return {role:message.role,content:index===lastUserIndex?routedText:priorText};
      });
      const effortLevels=Array.isArray(model.effortLevels)?model.effortLevels.filter(Boolean):[];
      const routedEffort=isWindowsDesktop
        ? (model.effortControl==='native'&&effortLevels.includes(effort)?effort:'default')
        : effort;
      const outboundAttachments=isWindowsDesktop&&canUploadFiles&&!retryContext
        ? await Promise.all(activeAttachments.map(async item=>({
            name:item.name,type:item.type,size:item.size,dataUrl:await readFileDataUrl(item.file)
          })))
        : [];
      const payload={
        requestId,provider:model.id,source:model.source||'browser',text:routedText,history:isWindowsDesktop?history:undefined,effort:routedEffort,
        attachments:outboundAttachments,
        mode,product,approvalMode:mode==='work'?appPrefs.approvalMode:'ask',
        toolRequest:selectedTool?{mcp:selectedTool.mcp,ownerProviderId:selectedTool.ownerProviderId}:null
      };
      const result=isDesktop?await window.desktopApi.sendPrompt(payload):await sendRemote(settings.relayUrl,settings.pairKey,payload);
      const finalText=String(result?.text??streamedTextRef.current??(typeof result==='string'?result:''));
      const next=[...withUser,{role:'assistant',text:finalText,provider:model.id}];
      setMessages(next);saveCurrentChat(next,model);
      if(isWindowsDesktop&&!retryContext){
        for(const item of activeAttachments)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);
        setAttachments([]);setSelectedFile(null);setSidePanel(current=>current==='file'?null:current)
      }
    }catch(e){
      if(requestId&&cancelledRequestRef.current===requestId)return;
      const next=[...withUser,{role:'error',text:e?.message||String(e)}];
      setMessages(next);saveCurrentChat(next,model);
    }finally{
      if(activeRequestRef.current===requestId)activeRequestRef.current=null;
      setBusy(false);
    }
  }
  async function send(){
    if(isWindowsDesktop&&mode==='work')return runWorkGeneration(prompt);
    return runGeneration(prompt,messages,selected);
  }
  async function stopGeneration(){
    if(isWindowsDesktop&&mode==='work'&&workTask&&['running','waiting_approval'].includes(workTask.status)){
      try{await window.desktopApi.stopWorkTask(workTask.id)}catch{}
      return;
    }
    const requestId=activeRequestRef.current;
    if(!requestId||!isWindowsDesktop||!isDesktop)return;
    cancelledRequestRef.current=requestId;
    try{await window.desktopApi.cancelPrompt(requestId)}catch{}
    setMessages(prev=>{
      const next=prev.flatMap(message=>{
        if(message.requestId!==requestId)return [message];
        if(String(message.text||'').trim())return [{...message,streaming:false,stopped:true,requestId:undefined}];
        return [];
      });
      queueMicrotask(()=>saveCurrentChat(next,selected));
      return next;
    });
    activeRequestRef.current=null;
    setBusy(false);
  }
  function findUserIndexBefore(index){
    for(let i=index-1;i>=0;i--)if(messages[i]?.role==='user')return i;
    return -1;
  }
  function regenerateFrom(index){
    if(busy)return;
    const userIndex=findUserIndexBefore(index);
    if(userIndex<0)return;
    const original=messages[userIndex];
    runGeneration(original.text,messages.slice(0,userIndex),selected,{
      attachments:Array.isArray(original.attachments)?original.attachments:[],
      attachmentContext:String(original.attachmentContext||'')
    });
  }
  function retryFrom(index){regenerateFrom(index)}
  async function copyMessage(text,index){
    try{
      await navigator.clipboard.writeText(String(text||''));
      setCopiedMessageIndex(index);
      setTimeout(()=>setCopiedMessageIndex(current=>current===index?null:current),1200);
    }catch{}
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
  async function addMcpConnection(){
    if(!isWindowsDesktop)return;
    setMcpError('');
    try{
      const added=await window.desktopApi.addMcpConnection(mcpDraft);
      setMcpConnections(current=>[...current.filter(item=>item.id!==added.id),added]);
      setMcpDraft({name:'',url:'',token:''});
    }catch(error){setMcpError(error?.message||String(error))}
  }
  async function removeMcpConnection(id){
    if(!isWindowsDesktop)return;
    setMcpError('');
    try{
      const items=await window.desktopApi.removeMcpConnection(id);
      setMcpConnections(Array.isArray(items)?items:[]);
      setSelectedMcpIds(current=>current.filter(value=>value!==id));
    }catch(error){setMcpError(error?.message||String(error))}
  }
  async function refreshMcpConnections(){
    if(!isWindowsDesktop)return;
    setMcpError('');
    try{
      const items=await window.desktopApi.refreshAllMcpConnections();
      setMcpConnections(Array.isArray(items)?items:[]);
    }catch(error){setMcpError(error?.message||String(error))}
  }
  function toggleMcpConnection(id){
    if(workBusy)return;
    setSelectedMcpIds(current=>{
      const key=String(id||'');
      if(current.includes(key))return current.filter(value=>value!==key);
      if(current.length>=4)return current;
      return [...current,key];
    });
  }

  function clearLocalHistory(){
    localStorage.removeItem('freeai.chats');
    localStorage.removeItem('freeai.chats.free');
    localStorage.removeItem('freeai.chats.super');
    setChats([]);setMessages([]);setCurrentChatId(null);
  }

  async function exportLocalData(){
    const payload={
      product:'Free AI',
      exportedAt:new Date().toISOString(),
      account:session?.user?.email||null,
      chats:{free:readJSON('freeai.chats.free',[]),super:readJSON('freeai.chats.super',[])},
      projects:readJSON('freeai.projects',[]),
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
    if(isWindowsDesktop)setSettingsOpen(false);
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
    if(isWindowsDesktop&&product==='free'&&mode!=='work')selectExperience('work');
    setSidePanel('browser');
  }

  useEffect(()=>{
    if(!isWindowsDesktop||!isDesktop)return;
    const off=window.desktopApi.onAppCommand?.(command=>{
      if(command!=='toggle-browser')return;
      if(sidePanel==='browser'){
        setSidePanel(null);
        return;
      }
      openBrowser();
    });
    return()=>off?.();
  },[sidePanel,product,mode,currentChatId,messages.length]);

  async function openHelp(){
    const url='https://github.com/az0512124155azz-sys/free-ai#readme';
    try{
      if(isDesktop)await window.desktopApi.openAuthUrl(url);
      else if(isNative)await Browser.open({url,presentationStyle:'popover'});
      else window.open(url,'_blank','noopener,noreferrer');
    }catch{}
  }

  async function addWindowsAttachments(files){
    const list=[...files].filter(Boolean);if(!list.length)return;
    setAttachmentError('');
    const next=[];
    for(const file of list){
      const textLike=file.type.startsWith('text/')||/\.(txt|md|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|py|java|kt|swift|c|cpp|h|hpp|sh|ps1|sql)$/i.test(file.name);
      const item={id:crypto.randomUUID(),name:file.name,type:file.type,size:file.size,kind:'binary',content:'',url:'',file};
      if(file.type.startsWith('image/')){item.kind='image';item.url=URL.createObjectURL(file)}
      else if(textLike&&file.size<=2*1024*1024)item.kind='text';
      else if(/\.(zip|rar|7z|tar|gz)$/i.test(file.name))item.kind='archive';
      try{
        if(item.kind==='text')item.content=await file.text();
      }catch(e){
        if(item.url)URL.revokeObjectURL(item.url);
        setAttachmentError(e?.message||('Could not read '+file.name));return
      }
      next.push(item);
    }
    setAttachments(current=>[...current,...next]);
    if(next[0]){setSelectedFile(next[0]);setSidePanel('file')}
  }
  async function attachFiles(event){
    const files=[...(event.target.files||[])];if(!files.length)return;
    if(isWindowsDesktop){await addWindowsAttachments(files);event.target.value='';return}
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
  function removeAttachment(id){
    setAttachments(current=>{
      const removed=current.find(item=>item.id===id);
      if(String(removed?.url||'').startsWith('blob:'))URL.revokeObjectURL(removed.url);
      return current.filter(item=>item.id!==id);
    });
    if(selectedFile?.id===id){setSelectedFile(null);setSidePanel(current=>current==='file'?null:current)}
    setAttachmentError('');
  }

  if(!authReady)return <div className="splash"><BrandMark size={34}/><span>Free AI</span></div>;
  if(!session&&supabase)return <Auth/>;

  const sidebarName=session?.user?.user_metadata?.full_name||session?.user?.email?.split('@')[0]||'Free AI';
  const heading=product==='super'
    ? (isNative?'Continue on your desktop':'What should we build?')
    : mode==='work'?'What should we work on?':messages.length?'':'Ready when you are.';

  return <div
    className={'desktopShell '+(!sidebarOpen?'sidebarHidden':'')+' '+(sidePanel?'hasSidePanel':'')+' '+(mobileNavOpen?'mobileNavOpen':'')+' '+(dragActive?'dragActive':'')}
    onDragEnter={isWindowsDesktop?e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();setDragActive(true)}}:undefined}
    onDragOver={isWindowsDesktop?e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';setDragActive(true)}}:undefined}
    onDragLeave={isWindowsDesktop?e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragActive(false)}:undefined}
    onDrop={isWindowsDesktop?async e=>{e.preventDefault();setDragActive(false);await addWindowsAttachments(e.dataTransfer.files)}:undefined}
  >
    <input ref={fileRef} type="file" multiple hidden onChange={attachFiles}/>
    <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={attachFiles}/>
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={attachFiles}/>

    {(sidebarOpen||mobileNavOpen)&&<aside className={'gptSidebar '+(mobileNavOpen?'mobileOpen':'')}>
      <div className="brandRow">
        {isWindowsDesktop
          ? <DesktopProductSwitcher product={product} open={productMenu} setOpen={setProductMenu} onSelect={selectProduct}/>
          : <div className="productSwitcher">
              <button className="brandButton" title={isNative?'Free AI':'Switch product'} aria-haspopup={!isNative?'menu':undefined} aria-expanded={!isNative?productMenu:undefined} onClick={()=>!isNative&&setProductMenu(v=>!v)}>
                <BrandMark size={20}/><b>{isNative?'Free AI':product==='super'?'Super AI':'Free AI'}</b>{!isNative&&<ChevronDown size={14}/>}
              </button>
              {!isNative&&productMenu&&<div className="productMenu" role="menu">
                <button className={product==='free'?'active':''} onClick={()=>{setProduct('free');setProductMenu(false);setMode('chat')}}>
                  <BrandMark size={20}/><span><b>Free AI</b><small>Chat and Work with connected models</small></span>{product==='free'&&<Check size={16}/>}
                </button>
                <button className={product==='super'?'active':''} onClick={()=>{setProduct('super');setProductMenu(false);setMode('work')}}>
                  <BrandMark size={20} className="superMark"/><span><b>Super AI</b><small>Agent workspace with browser and computer control</small></span>{product==='super'&&<Check size={16}/>} 
                </button>
              </div>}
            </div>}
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
        <NavItem icon={SquarePen} label="New chat" active={page==='chat'&&!currentChatId} onClick={newChat}/>
        <NavItem icon={Plug} label="Plugins" active={page==='plugins'} onClick={openPluginsPage}/>
        {!isWindowsDesktop&&<NavItem icon={Blocks} label="Explore" active={page==='explore'} onClick={()=>{setPage('explore');setMobileNavOpen(false)}}/>}
      </nav>
      <div className="sidebarScroll">
        {isWindowsDesktop&&product==='free'?<>
          <div className="sidebarGroupTitle">Projects</div>
          <button className="newProjectItem" onClick={()=>{stopActiveWorkTask();setProjectDraft({name:'',icon:'folder',color:'blue'});setProjectDialogOpen(true)}}>
            <Plus size={15}/><span>New project</span>
          </button>
          {projects.length===0?<div className="sidebarEmpty projectEmpty">No projects yet</div>:projects.map(project=>
            <button key={project.id} className={'projectItem projectNavItem '+(activeProjectId===project.id?'active':'')} onClick={()=>openProject(project)}>
              <ProjectMark project={project} size={18}/><span>{project.name}</span>
            </button>
          )}
          <div className="sidebarSectionHeader">
            <span>Recents</span>
            <div className="recentsFilterAnchor">
              <button
                className={'recentsFilterButton '+(recentsFilter!=='all'?'active':'')}
                aria-label="Filter Recents"
                aria-haspopup="menu"
                aria-expanded={recentsFilterOpen}
                onClick={()=>setRecentsFilterOpen(v=>!v)}
              ><SlidersHorizontal size={13}/></button>
              {recentsFilterOpen&&<div className="recentsFilterMenu" role="menu" aria-label="Filter Recents">
                {[
                  ['all','All'],['chat','Chat'],['work','Work']
                ].map(([value,label])=><button
                  key={value}
                  className={recentsFilter===value?'active':''}
                  role="menuitemradio"
                  aria-checked={recentsFilter===value}
                  onClick={()=>{setRecentsFilter(value);setRecentsFilterOpen(false)}}
                ><span>{label}</span>{recentsFilter===value&&<Check size={14}/>}</button>)}
              </div>}
            </div>
          </div>
          {visibleChats.length===0?<div className="sidebarEmpty">{sidebarSearch?'No matching chats':recentsFilter==='all'?'No chats':'No '+(recentsFilter==='work'?'Work':'Chat')+' chats'}</div>:visibleChats.map(chat=>
            <div className={'recentRow '+(currentChatId===chat.id?'active':'')} key={chat.id}>
              <button className="recentItem" onClick={()=>{openChat(chat);setMobileNavOpen(false)}}>
                {chat.pinned&&<Pin size={11} className="recentPin"/>}
                <span>{chat.title}</span>
              </button>
              <button
                className="recentMore"
                aria-label={'More options for '+chat.title}
                aria-haspopup="menu"
                aria-expanded={chatMenuId===chat.id}
                onClick={e=>{e.stopPropagation();setChatMenuId(current=>current===chat.id?null:chat.id)}}
              ><MoreHorizontal size={15}/></button>
              {chatMenuId===chat.id&&<div className="recentContextMenu" role="menu">
                <button role="menuitem" onClick={()=>togglePinChat(chat.id)}><Pin size={14}/><span>{chat.pinned?'Unpin chat':'Pin chat'}</span></button>
              </div>}
            </div>
          )}
        </>:<>
          <div className="sidebarGroupTitle">{product==='super'?'Coding':'Projects'}</div>
          <button className="projectItem" onClick={()=>{if(product==='super')chooseRepositoryWorkspace();else{stopActiveWorkTask();setMode('work');setPage('chat');setMobileNavOpen(false)}}}>
            {product==='super'?<GitBranch size={15}/>:<Folder size={15}/>}
            {product==='super'?(repositoryWorkspace?.name||'Choose repository'):'Free AI Workspace'}
          </button>
          <div className="sidebarGroupTitle">Recents</div>
          {visibleChats.length===0?<div className="sidebarEmpty">{sidebarSearch?'No matching chats':'No chats yet'}</div>:visibleChats.map(chat=>
            <button key={chat.id} className={'recentItem '+(currentChatId===chat.id?'active':'')} onClick={()=>{openChat(chat);setMobileNavOpen(false)}}>{chat.title}</button>
          )}
        </>}
      </div>
      <div className="sidebarFooter">
        <button className="profileButton" onClick={()=>setProfileMenu(v=>!v)}>
          <span className="avatar">{initials(session)}</span>
          <span className="profileName">{sidebarName}</span>
          <span className={'connectionDot '+((isDesktop?status.extension:status.relay)?'online':'')}></span>
        </button>
        {!isNative&&(!isDesktop||desktopPlatform==='win32')&&<button className="voiceButton" onClick={()=>{setPage('chat');setMobileNavOpen(false);window.dispatchEvent(new CustomEvent('freeai:start-voice'))}}><Mic2 size={15}/>Dictate</button>}
        <button className="circleIcon" title="Help" onClick={openHelp}><HelpCircle size={16}/></button>
        {profileMenu&&<ProfileMenu session={session} onSettings={()=>{stopActiveWorkTask();setProfileMenu(false);setSettingsOpen(true)}}/>}
      </div>
    </aside>}
    {mobileNavOpen&&<button className="mobileNavScrim" aria-label="Close navigation" onClick={()=>setMobileNavOpen(false)}/>}

    <main className="workspace">
      <header className="workspaceHeader">
        <div className="headerLeft">
          <button className="headerIcon mobileNavTrigger" onClick={()=>setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={18}/></button>
          {!sidebarOpen&&<button className="headerIcon desktopSidebarTrigger" onClick={()=>setSidebarOpen(true)} aria-label="Open sidebar"><PanelLeft size={18}/></button>}
          {isWindowsDesktop&&!sidebarOpen&&<DesktopProductSwitcher compact product={product} open={productMenu} setOpen={setProductMenu} onSelect={selectProduct}/>}
        </div>
        {product==='free'?<div className={'modeSwitch '+(isWindowsDesktop?'windowsModeSwitch':'')} role="tablist" aria-label="Chat or Work">
          <button role="tab" aria-selected={mode==='chat'} className={mode==='chat'?'active':''} onClick={()=>isWindowsDesktop?selectExperience('chat'):setMode('chat')}>Chat</button>
          <button role="tab" aria-selected={mode==='work'} className={mode==='work'?'active':''} onClick={()=>isWindowsDesktop?selectExperience('work'):setMode('work')}>Work</button>
        </div>:(!isWindowsDesktop&&<div className="superHeaderLabel"><BrandMark size={16}/><span>Super AI</span></div>)}
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
          ? <div className={'emptyChat '+(mode==='work'&&!isWindowsDesktop?'workEmpty':'')}>
              <h1>{heading}</h1>
              <Composer
                windowsDesktop={isWindowsDesktop}
                stopGeneration={stopGeneration}
                attachments={attachments} attachmentError={attachmentError} onRemoveAttachment={removeAttachment} onOpenAttachment={item=>{setSelectedFile(item);setSidePanel('file')}}
                mode={mode} prompt={prompt} setPrompt={setPrompt} send={send} busy={isWindowsDesktop&&mode==='work'?workBusy:busy}
                selected={selected} connected={connected} setSelected={setSelected}
                modelMenu={modelMenu} setModelMenu={setModelMenu}
                effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef}
                mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                spellCheckEnabled={appPrefs.spellCheckEnabled!==false} hapticsEnabled={appPrefs.hapticsEnabled!==false}
                approvalMode={normalizeApprovalMode(appPrefs.approvalMode)} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                 workTask={isWindowsDesktop&&mode==='work'?workTask:null}
                 onWorkApproval={(taskId,allow)=>window.desktopApi.resolveWorkApproval({taskId,allow}).catch(()=>{})}
                repositoryWorkspace={repositoryWorkspace} onChooseRepository={chooseRepositoryWorkspace} onClearRepository={clearRepositoryWorkspace}
                superTeamKeys={superTeamKeys} setSuperTeamKeys={keys=>{const next=keys.slice(0,3);setSuperTeamKeys(next);localStorage.setItem('freeai.super.team',JSON.stringify(next))}}
                mcpConnections={mcpConnections} selectedMcpIds={selectedMcpIds} onToggleMcp={toggleMcpConnection}
                onBrowser={openBrowser}
                onComputer={()=>{setPlusMenu(false);setSidePanel('computer')}}
                onPlugins={openPluginsPage}
              />
            </div>
          : <div className={'conversationView '+(isWindowsDesktop?'windowsConversation':'')}>
              <div className="messageList">
                {messages.map((m,i)=><div key={i} className={'chatMessage '+m.role} role={m.role==='error'?'alert':m.streaming?'status':undefined} aria-live={m.streaming?'polite':undefined}>
                  {m.role!=='user'&&!isWindowsDesktop&&<div className="assistantMark"><Sparkles size={16}/></div>}
                  <div className="messageBubble">
                    {m.role!=='user'&&!isWindowsDesktop&&<div className="messageAuthor">{m.role==='error'?'Error':modelLabel(selected)}</div>}
                    <div className="messageBody">{m.streaming&&!m.text?<RefreshCw className="spin" size={16}/>:m.text}</div>
                    {isWindowsDesktop&&m.role==='user'&&Array.isArray(m.attachments)&&m.attachments.length>0&&<div className="messageAttachmentList">
                      {m.attachments.map((item,index)=><span key={(item.id||item.name)+index}><Paperclip size={12}/>{item.name}</span>)}
                    </div>}
                    {isWindowsDesktop&&m.role==='assistant'&&!m.streaming&&<div className="messageActions headerLeft">
                      <button className="headerIcon" aria-label={copiedMessageIndex===i?'Copied':'Copy response'} title={copiedMessageIndex===i?'Copied':'Copy'} onClick={()=>copyMessage(m.text,i)}>{copiedMessageIndex===i?<Check size={15}/>:<Copy size={15}/>}</button>
                      <div className="menuAnchor">
                        <button className="headerIcon" aria-label="Response options" aria-haspopup="menu" aria-expanded={responseMenuIndex===i} onClick={()=>setResponseMenuIndex(current=>current===i?null:i)}><MoreHorizontal size={15}/></button>
                        {responseMenuIndex===i&&<div className="floatingMenu responseActionMenu" role="menu">
                          <button className="menuRow" role="menuitem" onClick={()=>{setResponseMenuIndex(null);regenerateFrom(i)}}><RotateCcw size={15}/><span><b>Regenerate response</b></span></button>
                        </div>}
                      </div>
                    </div>}
                    {isWindowsDesktop&&m.role==='error'&&<div className="messageActions headerLeft"><button className="headerIcon" aria-label="Retry response" title="Retry" onClick={()=>retryFrom(i)}><RotateCcw size={15}/></button></div>}
                  </div>
                </div>)}
                <div ref={messageEndRef}/>
              </div>
              <div className="conversationComposer">
                <Composer
                  windowsDesktop={isWindowsDesktop}
                  stopGeneration={stopGeneration}
                  attachments={attachments} attachmentError={attachmentError} onRemoveAttachment={removeAttachment} onOpenAttachment={item=>{setSelectedFile(item);setSidePanel('file')}}
                  compact mode={mode} prompt={prompt} setPrompt={setPrompt} send={send} busy={isWindowsDesktop&&mode==='work'?workBusy:busy}
                  selected={selected} connected={connected} setSelected={setSelected}
                  modelMenu={modelMenu} setModelMenu={setModelMenu}
                  effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                  plusMenu={plusMenu} setPlusMenu={setPlusMenu} fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef}
                  mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                  product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                  spellCheckEnabled={appPrefs.spellCheckEnabled!==false} hapticsEnabled={appPrefs.hapticsEnabled!==false}
                  approvalMode={normalizeApprovalMode(appPrefs.approvalMode)} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                 workTask={isWindowsDesktop&&mode==='work'?workTask:null}
                 onWorkApproval={(taskId,allow)=>window.desktopApi.resolveWorkApproval({taskId,allow}).catch(()=>{})}
                repositoryWorkspace={repositoryWorkspace} onChooseRepository={chooseRepositoryWorkspace} onClearRepository={clearRepositoryWorkspace}
                superTeamKeys={superTeamKeys} setSuperTeamKeys={keys=>{const next=keys.slice(0,3);setSuperTeamKeys(next);localStorage.setItem('freeai.super.team',JSON.stringify(next))}}
                mcpConnections={mcpConnections} selectedMcpIds={selectedMcpIds} onToggleMcp={toggleMcpConnection}
                onBrowser={openBrowser}
                  onComputer={()=>{setPlusMenu(false);setSidePanel('computer')}}
                  onPlugins={openPluginsPage}
                />
              </div>
            </div>
        }
        <div className="stageFooter">{product==='super'?'Super AI can make mistakes. Review edits and important actions.':'Free AI can make mistakes. Check important information.'}</div>
      </section>}

      {page==='project'&&isWindowsDesktop&&activeProject&&<ProjectPage
        project={activeProject} chats={projectChats} onBack={()=>{setActiveProjectId(null);setPage('chat')}}
        onStart={nextMode=>startProjectConversation(activeProject.id,nextMode)}
        onOpenChat={openChat} onSave={patch=>updateProject(activeProject.id,patch)}
      />}
      {page==='plugins'&&<PluginsPage
        tools={mcpTools} connected={connected} directMcpConnections={mcpConnections}
        mcpDraft={mcpDraft} setMcpDraft={setMcpDraft} mcpError={mcpError}
        onAddMcp={addMcpConnection} onRemoveMcp={removeMcpConnection} onRefreshMcp={refreshMcpConnections}
        onBack={()=>setPage('chat')} onRefresh={()=>{window.desktopApi?.scanProviders?.().catch(()=>{});refreshMcpConnections().catch(()=>{})}}
      />}}
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
      setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
      onClose={()=>setSidePanel(null)}
    />}

    {projectDialogOpen&&isWindowsDesktop&&<NewProjectDialog draft={projectDraft} setDraft={setProjectDraft} onCreate={createProject} onClose={()=>setProjectDialogOpen(false)}/>}
    {settingsOpen&&<SettingsView
      section={settingsSection} setSection={setSettingsSection} onClose={()=>setSettingsOpen(false)}
      session={session} prefs={appPrefs} setPrefs={persistPrefs} status={status} settings={settings} setSettings={setSettings}
      saveSettings={saveSettings} connected={connected} apiDraft={apiDraft} setApiDraft={setApiDraft}
      addApiConnection={addApiConnection} removeApiConnection={removeApiConnection} apiError={apiError}
      onExportData={exportLocalData} onClearHistory={clearLocalHistory}
      onComputer={()=>{setSettingsOpen(false);setSidePanel('computer')}}
      onPlugins={()=>{setSettingsOpen(false);openPluginsPage()}}
      onBrowser={()=>{setSettingsOpen(false);openBrowser()}}
    />}
  </div>
}

function NavItem({icon:Icon,label,active,onClick}){
  return <button className={'navItem '+(active?'active':'')} onClick={onClick}><Icon size={16}/><span>{label}</span></button>
}

function NewProjectDialog({draft,setDraft,onCreate,onClose}){
  return <div className="projectDialogScrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <form className="projectDialog" onSubmit={e=>{e.preventDefault();onCreate()}}>
      <div className="projectDialogHeader"><div><b>New project</b><small>Keep related Chat and Work conversations together.</small></div><button type="button" onClick={onClose} aria-label="Close"><X size={17}/></button></div>
      <label className="projectNameField"><span>Name</span><input autoFocus value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Project name" maxLength={80}/></label>
      <div className="projectChoiceBlock"><span>Icon</span><div className="projectIconGrid">{projectIconOptions.map(([key,label,Icon])=><button type="button" key={key} className={draft.icon===key?'active':''} onClick={()=>setDraft({...draft,icon:key})} aria-label={label} title={label}><Icon size={17}/></button>)}</div></div>
      <div className="projectChoiceBlock"><span>Color</span><div className="projectColorGrid">{projectColorOptions.map(color=><button type="button" key={color} className={draft.color===color?'active':''} data-color={color} onClick={()=>setDraft({...draft,color})} aria-label={color+' color'}><span/></button>)}</div></div>
      <div className="projectDialogActions"><button type="button" onClick={onClose}>Cancel</button><button className="primaryProjectAction" type="submit" disabled={!String(draft.name||'').trim()}>Create project</button></div>
    </form>
  </div>
}

function ProjectPage({project,chats,onBack,onStart,onOpenChat,onSave}){
  const [draft,setDraft]=useState({name:project.name,icon:project.icon||'folder',color:project.color||'blue',instructions:project.instructions||''});
  const [saved,setSaved]=useState(false);
  useEffect(()=>{setDraft({name:project.name,icon:project.icon||'folder',color:project.color||'blue',instructions:project.instructions||''});setSaved(false)},[project.id,project.name,project.icon,project.color,project.instructions]);
  const save=()=>{const name=String(draft.name||'').trim();if(!name)return;onSave({name,icon:draft.icon||'folder',color:draft.color||'blue',instructions:String(draft.instructions||'')});setSaved(true);setTimeout(()=>setSaved(false),1400)};
  const preview={...project,...draft,name:String(draft.name||'').trim()||project.name};
  return <div className="contentPage projectPage">
    <PageTop onBack={onBack} title={project.name}/>
    <div className="contentInner projectInner">
      <div className="projectHero"><ProjectMark project={project} size={42}/><div><h1>{project.name}</h1><p className="pageLead">A local Free AI project. Project instructions apply only to conversations started here.</p></div><div className="projectStartActions"><button onClick={()=>onStart('chat')}><SquarePen size={15}/>Chat</button><button onClick={()=>onStart('work')}><Briefcase size={15}/>Work</button></div></div>
      <section className="projectSection"><div className="sectionHeading"><h2>Project conversations</h2><span className="pluginMeta">{chats.length}</span></div><div className="projectConversationList">
        {chats.map(chat=><button key={chat.id} onClick={()=>onOpenChat(chat)}><span className="projectConversationMode">{chat.mode==='work'?'Work':'Chat'}</span><span>{chat.title}</span><ChevronRight size={14}/></button>)}
        {!chats.length&&<div className="projectEmptyState"><Folder size={20}/><b>No conversations yet</b><span>Start a Chat or Work conversation to add it to this project.</span></div>}
      </div></section>
      <section className="projectSection projectSettingsCard"><div className="sectionHeading"><h2>Project settings</h2>{saved&&<span className="projectSaved"><Check size={13}/>Saved</span>}</div>
        <label className="projectNameField"><span>Name</span><input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} maxLength={80}/></label>
        <div className="projectChoiceBlock"><span>Icon</span><div className="projectIconGrid">{projectIconOptions.map(([key,label,Icon])=><button type="button" key={key} className={draft.icon===key?'active':''} onClick={()=>setDraft({...draft,icon:key})} aria-label={label} title={label}><Icon size={17}/></button>)}</div></div>
        <div className="projectChoiceBlock"><span>Color</span><div className="projectColorGrid">{projectColorOptions.map(color=><button type="button" key={color} className={draft.color===color?'active':''} data-color={color} onClick={()=>setDraft({...draft,color})} aria-label={color+' color'}><span/></button>)}</div></div>
        <label className="projectInstructionsField"><span>Project instructions</span><small>These instructions override your global custom instructions while you are in this project.</small><textarea value={draft.instructions} onChange={e=>setDraft({...draft,instructions:e.target.value})} placeholder="Add instructions for this project"/></label>
        <div className="projectSettingsActions"><div className="projectSettingsPreview"><ProjectMark project={preview} size={22}/><span>{preview.name}</span></div><button onClick={save} disabled={!String(draft.name||'').trim()}>Save</button></div>
      </section>
    </div>
  </div>
}

function Composer(props){
  const {
    windowsDesktop,stopGeneration,attachments=[],attachmentError,onRemoveAttachment,onOpenAttachment,compact,mode,prompt,setPrompt,send,busy,selected,connected,setSelected,modelMenu,setModelMenu,
    effort,setEffort,effortMenu,setEffortMenu,plusMenu,setPlusMenu,fileRef,photoRef,cameraRef,mcpTools,selectedTool,setSelectedTool,
    product,voiceLanguage,showBottomPanel,spellCheckEnabled,hapticsEnabled,approvalMode,setApprovalMode,workTask,onWorkApproval,
    repositoryWorkspace,onChooseRepository,onClearRepository,superTeamKeys=[],setSuperTeamKeys,
    mcpConnections=[],selectedMcpIds=[],onToggleMcp,onBrowser,onComputer,onPlugins
  }=props;
  const [listening,setListening]=useState(false);
  const [dictationError,setDictationError]=useState('');
  const [dictationNotice,setDictationNotice]=useState('');
  const [approvalMenu,setApprovalMenu]=useState(false);
  const [teamMenu,setTeamMenu]=useState(false);
  const textareaRef=useRef(null);
  const nativeSpeechHandles=useRef([]);
  const webRecognition=useRef(null);
  const dictationBase=useRef('');
  const effortLabel={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High','extra-high':'Extra High'}[effort]||'Reasoning';
  const selectedMcpConnections=mcpConnections.filter(connection=>selectedMcpIds.includes(connection.id));

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
        textareaRef.current?.focus();
        await new Promise(r=>setTimeout(r,60));
        await window.desktopApi.startSystemDictation();
        setDictationNotice('Windows voice typing opened. Review or edit the text before sending.');
        setTimeout(()=>setDictationNotice(''),3500);
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

  return <div className={'gptComposer '+(mode==='work'&&!windowsDesktop?'workComposer':'')+' '+(compact?'compact':'')}>
    {mode==='work'&&windowsDesktop&&workTask&&<WorkTaskStatus task={workTask} onApproval={onWorkApproval}/>}
    {product==='super'&&windowsDesktop&&repositoryWorkspace&&<div className="repositoryContextChip">
      <GitBranch size={13}/><span><b>{repositoryWorkspace.name}</b><small>{repositoryWorkspace.branch||'Git repository'}{Number(repositoryWorkspace.dirty)>0?' · '+repositoryWorkspace.dirty+' changed':''}</small></span>
      <button type="button" aria-label="Remove repository" disabled={busy} onClick={()=>!busy&&onClearRepository?.()}><X size={12}/></button>
    </div>}
    {windowsDesktop&&mode==='work'&&selectedMcpConnections.length>0&&<div className="mcpSelectionTray" aria-label="Selected MCP apps">
      {selectedMcpConnections.map(connection=><div className="mcpSelectionChip" key={connection.id}>
        <Plug size={12}/><span><b>{connection.name}</b><small>{connection.connected?'Connected':connection.hasToken?'Saved · connects on send':'Saved · connects on send'}</small></span>
        <button type="button" aria-label={'Remove '+connection.name} disabled={busy} onClick={()=>!busy&&onToggleMcp?.(connection.id)}><X size={11}/></button>
      </div>)}
    </div>}
    {selectedTool&&<div className="attachedTool"><Plug size={13}/><span>{selectedTool.mcp}</span><small>via {selectedTool.ownerName}</small><button onClick={()=>setSelectedTool(null)}><X size={12}/></button></div>}
    {windowsDesktop&&attachments.length>0&&<div className="attachmentTray" aria-label="Attachments">
      {attachments.map(item=><div className="attachmentChip" key={item.id}>
        <button className="attachmentOpen" type="button" onClick={()=>onOpenAttachment?.(item)}><File size={13}/><span>{item.name}</span><small>{humanSize(item.size)}</small></button>
        <button type="button" aria-label={'Remove '+item.name} onClick={()=>onRemoveAttachment?.(item.id)}><X size={12}/></button>
      </div>)}
    </div>}
    <textarea
      ref={textareaRef}
      value={prompt} onChange={e=>setPrompt(e.target.value)}
      spellCheck={spellCheckEnabled!==false}
      autoCorrect={spellCheckEnabled!==false?'on':'off'}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
      placeholder={product==='super'?(isNative?'Message your desktop task':'Give Super AI a task'):mode==='work'?'Work with Free AI':selected?'Message '+modelLabel(selected):'Ask Free AI'}
    />
    <div className="composerBottom">
      <div className="composerLeft">
        <div className="menuAnchor">
          <button className="plusCircle" aria-label="Add" aria-haspopup="menu" aria-expanded={plusMenu} disabled={busy} onClick={()=>!busy&&setPlusMenu(v=>!v)}><Plus size={20}/></button>
          {plusMenu&&<PlusMenu
            fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef} onBrowser={onBrowser} onComputer={onComputer} onPlugins={onPlugins}
            tools={mcpTools} setSelectedTool={setSelectedTool} mode={mode}
            directMcpConnections={mcpConnections} selectedMcpIds={selectedMcpIds} onToggleMcp={onToggleMcp}
          />}
        </div>
        {mode==='work'&&!isNative&&<div className="menuAnchor permissionAnchor">
          <button className={'accessButton '+(approvalMode==='low'?'enabled':'')} aria-haspopup="menu" aria-expanded={approvalMenu} disabled={busy} onClick={()=>!busy&&setApprovalMenu(v=>!v)}>
            <ShieldCheck size={15}/>{approvalMode==='low'?'Allow low-risk':approvalMode==='read'?'Allow reads':'Always ask'}<ChevronDown size={12}/>
          </button>
          {approvalMenu&&<PermissionModeMenu value={approvalMode} choose={value=>{setApprovalMode(value);setApprovalMenu(false)}}/>}
        </div>}
      </div>

      <div className="composerRight">
        {product==='super'&&windowsDesktop&&<div className="menuAnchor">
          <button className="teamButton" aria-haspopup="menu" aria-expanded={teamMenu} disabled={busy} onClick={()=>!busy&&setTeamMenu(v=>!v)}>
            <Bot size={14}/>Team {1+superTeamKeys.length}<ChevronDown size={12}/>
          </button>
          {teamMenu&&<AgentTeamMenu connected={connected} selected={selected} selectedKeys={superTeamKeys} choose={keys=>setSuperTeamKeys?.(keys)} onClose={()=>setTeamMenu(false)}/>}
        </div>}
        {!isNative&&<div className="menuAnchor">
          <button className="modelButton" aria-haspopup="listbox" aria-expanded={modelMenu} disabled={busy} onClick={()=>!busy&&setModelMenu(v=>!v)}>
            <span>{modelLabel(selected)}</span>{selected?.modelName&&selected.modelName!==selected.name&&<small>{selected.name}</small>}<ChevronDown size={13}/>
          </button>
          {modelMenu&&<ModelMenu connected={connected} selected={selected} choose={m=>{setSelected(m);setModelMenu(false)}}/>}
        </div>}
        {!isNative&&((windowsDesktop&&selected?.effortControl==='native'&&Array.isArray(selected?.effortLevels)&&selected.effortLevels.length>1)||(!windowsDesktop&&Array.isArray(selected?.effortLevels)&&selected.effortLevels.length>1))&&<div className="menuAnchor">
          <button className="effortButton" aria-haspopup="dialog" aria-expanded={effortMenu} onClick={()=>setEffortMenu(v=>!v)}><Brain size={14}/>{effortLabel}<ChevronDown size={12}/></button>
          {effortMenu&&<EffortMenu effort={effort} levels={selected.effortLevels} choose={v=>{setEffort(v);setEffortMenu(false)}}/>}
        </div>}
        {(isNative||!isDesktop||desktopPlatform==='win32')&&<button className={'micButton '+(listening?'listening':'')} onMouseDown={e=>e.preventDefault()} onClick={startVoice} title={windowsDesktop?'Dictate with Windows':listening?'Stop dictation':'Dictate'} aria-label={windowsDesktop?'Dictate with Windows':listening?'Stop dictation':'Dictate'}><Mic2 size={18}/></button>}
        {(busy||prompt.trim()||(windowsDesktop&&attachments.length>0))&&<button className={'voiceOrb '+(!busy&&(prompt.trim()||windowsDesktop&&attachments.length>0)&&selected?'sendReady':'')}
          onClick={busy?(windowsDesktop?stopGeneration:undefined):send}
          disabled={busy?!windowsDesktop:!selected}
          aria-label={busy?(windowsDesktop?'Stop generating':'Generating response'):'Send message'}
          title={busy?(windowsDesktop?'Stop generating':'Generating response'):'Send'}>
          {busy?(windowsDesktop?<Square size={15}/>:<RefreshCw className="spin" size={17}/>):<ArrowUp size={18}/>} 
        </button>}
      </div>
    </div>
    {attachmentError&&windowsDesktop&&<div className="dictationError" role="alert">{attachmentError}</div>}
    {dictationError&&<div className="dictationError">{dictationError}</div>}
    {dictationNotice&&windowsDesktop&&<div className="dictationStatus">{dictationNotice}</div>}
    {listening&&<div className="dictationStatus"><span className="dictationPulse"/>Listening… tap the microphone to stop</div>}
    {mode==='work'&&showBottomPanel!==false&&<div className="workActions">
      <button onClick={product==='super'&&windowsDesktop?onChooseRepository:()=>fileRef.current?.click()}><Folder size={15}/>{product==='super'?(repositoryWorkspace?.name||'Choose repository'):windowsDesktop?'Attach project files':'Choose project'}</button>
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
        <span className="pickerText"><b>{modelLabel(model)}</b><small>{model.source==='api'?'API · '+model.model:'Browser · '+model.name+' · current tab'}</small></span>
        {selected?.id===model.id&&selected?.source===model.source&&<Check size={16}/>}
      </button>)}
  </div>
}

function AgentTeamMenu({connected,selected,selectedKeys=[],choose,onClose}){
  const primary=modelKey(selected);
  const eligible=connected.filter(model=>modelKey(model)!==primary);
  const toggle=key=>{
    const current=Array.isArray(selectedKeys)?selectedKeys:[];
    if(current.includes(key)){choose(current.filter(item=>item!==key));return}
    if(current.length>=3)return;
    choose([...current,key]);
  };
  return <div className="floatingMenu teamPicker" role="menu" aria-label="Super AI team">
    <div className="teamPickerHead"><span><b>Super AI team</b><small>Controller + up to 3 specialist/reviewer models</small></span><button onClick={onClose} aria-label="Close team picker"><X size={14}/></button></div>
    {selected&&<div className="teamControllerRow"><span className={'providerBadge '+(selected.source==='api'?'api':selected.id)}>{modelLabel(selected).slice(0,1)}</span><span><b>{modelLabel(selected)}</b><small>Primary controller</small></span><Check size={14}/></div>}
    <div className="floatingTitle section">Specialists / reviewers</div>
    {eligible.length===0?<div className="menuEmpty compact">Connect another model to build a multi-agent team.</div>:eligible.map(model=>{
      const key=modelKey(model),checked=selectedKeys.includes(key),limitReached=!checked&&selectedKeys.length>=3;
      return <button key={key} className={'teamModelRow '+(checked?'active ':'')+(limitReached?'disabled':'')} disabled={limitReached} onClick={()=>toggle(key)}>
        <span className={'providerBadge '+(model.source==='api'?'api':model.id)}>{modelLabel(model).slice(0,1)}</span>
        <span><b>{modelLabel(model)}</b><small>{model.source==='api'?'API model':'Connected browser model'}</small></span>
        <span className={'teamCheck '+(checked?'checked':'')}>{checked?<Check size={13}/>:null}</span>
      </button>;
    })}
    <div className="teamPickerFoot">{selectedKeys.length?selectedKeys.length+' additional agent'+(selectedKeys.length===1?'':'s')+' selected':'Controller-only mode'}</div>
  </div>
}

function EffortMenu({effort,levels,choose}){
  const values=Array.isArray(levels)?levels.filter(Boolean):[];
  const labels={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High','extra-high':'Extra High'};
  const index=Math.max(0,values.indexOf(effort));
  return <div className="floatingMenu effortPicker sliderPicker">
    <div className="effortHead"><Brain size={18}/><div><b>{labels[effort]}</b><small>Reasoning effort</small></div></div>
    <input
      className="effortSlider" type="range" min="0" max={Math.max(0,values.length-1)} step="1" value={index}
      aria-label="Reasoning effort" aria-valuetext={labels[effort]}
      onChange={e=>choose(values[Number(e.target.value)])}
    />
    <div className="effortTicks">{values.map(level=><span key={level}/>)}</div>
    <div className="effortScale"><span>Fast</span><span>Deep</span></div>
  </div>
}

function PermissionModeMenu({value,choose}){
  const rows=[
    ['ask','Always ask','Ask before state-changing tool actions. Website and desktop reads still require explicit task access approval.'],
    ['read','Allow reads','Allow approved page/screen reads; ask before actions that change state.'],
    ['low','Allow low-risk','Also allow low-risk navigation, scrolling and pointer movement. Sensitive actions still ask.']
  ];
  return <div className="floatingMenu permissionPicker" role="menu" aria-label="Permission mode">
    <div className="floatingTitle">Permissions</div>
    {rows.map(([id,label,desc])=><button key={id} className={'permissionRow '+(value===id?'active ':'')} onClick={()=>choose(id)}>
      <ShieldCheck size={17}/><span><b>{label}</b><small>{desc}</small></span>{value===id&&<Check size={15}/>}
    </button>)}
  </div>
}

function WorkTaskStatus({task,onApproval}){
  const labels={running:'Running',waiting_approval:'Waiting for approval',completed:'Completed',failed:'Failed',stopped:'Stopped'};
  const active=task.status==='running'||task.status==='waiting_approval';
  const agents=Array.isArray(task.agents)?task.agents:[];
  return <div className={'workTaskStatus '+task.status} role="status" aria-live="polite">
    <div className="workTaskHead">
      <span className="workTaskStateIcon">{task.status==='completed'?<Check size={15}/>:task.status==='failed'?<X size={15}/>:task.status==='stopped'?<Square size={13}/>:<RefreshCw className={active?'spin':''} size={14}/>}</span>
      <span><b>{task.product==='super'?'Super AI · '+(labels[task.status]||task.status):(labels[task.status]||task.status)}</b><small>{task.detail||('Step '+(task.step||0)+' of '+(task.maxSteps||0))}</small></span>
    </div>
    {task.workspace&&<div className="workWorkspaceLine"><GitBranch size={12}/><span>{task.workspace.name}</span><small>{task.workspace.branch}{Number(task.workspace.dirty)>0?' · '+task.workspace.dirty+' changed':''}</small></div>}
    {agents.length>0&&<div className="workAgentList">{agents.map(agent=><div className={'workAgent '+agent.status} key={agent.id}>
      <span className="workAgentDot"/><span><b>{agent.name}</b><small>{agent.role} · {agent.detail||agent.status}</small></span>
    </div>)}</div>}
    {Array.isArray(task.progress)&&task.progress.length>0&&<div className="workTaskProgress">{task.progress.slice(-4).map(item=><span key={item.id}>{item.text}</span>)}</div>}
    {task.status==='waiting_approval'&&task.approval&&<div className="workApprovalCard">
      <ShieldCheck size={18}/>
      <div><b>{task.approval.title}</b><span>{task.approval.summary}</span>{task.approval.detail&&<small>{task.approval.detail}</small>}</div>
      <div className="workApprovalActions">
        <button onClick={()=>onApproval?.(task.id,false)}>Deny</button>
        <button className="approveAction" onClick={()=>onApproval?.(task.id,true)}>{task.approval.allowLabel||'Allow once'}</button>
      </div>
    </div>}
    {task.status==='failed'&&task.error&&<div className="computerError">{task.error}</div>}
  </div>
}

function PlusMenu({fileRef,photoRef,cameraRef,onBrowser,onComputer,onPlugins,tools,setSelectedTool,mode,directMcpConnections=[],selectedMcpIds=[],onToggleMcp}){
  return <div className="floatingMenu plusPicker" role="menu" aria-label="Add">
    <div className="floatingTitle">Add</div>
    {isNative?<>
      <MenuRow icon={Camera} label="Camera" onClick={()=>cameraRef.current?.click()}/>
      <MenuRow icon={Image} label="Photos" onClick={()=>photoRef.current?.click()}/>
      <MenuRow icon={Paperclip} label="Files" onClick={()=>fileRef.current?.click()}/>
    </>:<MenuRow icon={Paperclip} label={isWindowsDesktop?'Files':'Files and folders'} onClick={()=>fileRef.current?.click()}/>} 
    {!isNative&&<MenuRow icon={Chrome} label="Browser" sub="Browse beside your chat in Free AI's own browser" onClick={onBrowser}/>}
    {mode==='work'&&<MenuRow icon={Folder} label="Add project files" sub="Attach context to this Work task" onClick={()=>fileRef.current?.click()}/>} 
    {mode==='work'&&isWindowsDesktop&&<>
      <div className="floatingTitle section">Direct MCP apps</div>
      {directMcpConnections.length===0
        ? <div className="menuEmpty compact">No direct MCP apps configured.</div>
        : directMcpConnections.slice(0,10).map(connection=><button
            key={connection.id}
            className={'menuRow mcpMenuRow '+(selectedMcpIds.includes(connection.id)?'active':'')}
            role="menuitemcheckbox"
            aria-checked={selectedMcpIds.includes(connection.id)}
            onClick={()=>onToggleMcp?.(connection.id)}>
            <Plug size={18}/>
            <span><b>{connection.name}</b><small>{connection.connected?(connection.tools?.length||0)+' tools · MCP '+connection.protocolVersion:'Saved · connects when task starts'}</small></span>
            <span className={'teamCheck '+(selectedMcpIds.includes(connection.id)?'checked':'')}>{selectedMcpIds.includes(connection.id)&&<Check size={12}/>}</span>
          </button>)
      }
      <div className="menuHint">Select up to 4 apps for this Work task. Tool calls still follow approval rules.</div>
    </>}
    <div className="floatingTitle section">{mode==='work'&&isWindowsDesktop?'Provider hints':'Plugins'}</div>
    {tools.length===0?<div className="menuEmpty compact">No provider-managed connector hints detected.</div>:tools.slice(0,10).map(t=>
      <MenuRow key={t.key} icon={Plug} label={t.mcp} sub={t.ownerName+' · provider-managed, unverified'} onClick={()=>setSelectedTool(t)}/>
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

function PluginsPage({
  tools,connected,directMcpConnections=[],mcpDraft,setMcpDraft,mcpError,onAddMcp,onRemoveMcp,onRefreshMcp,onBack,onRefresh
}){
  const [query,setQuery]=useState('');
  const pageName=isNative?'Apps':'Plugins';
  const needle=query.trim().toLowerCase();
  const visibleTools=needle?tools.filter(t=>(t.mcp+' '+t.ownerName).toLowerCase().includes(needle)):tools;
  const visibleProviders=needle?connected.filter(p=>(modelLabel(p)+' '+(p.mcps||[]).join(' ')).toLowerCase().includes(needle)):connected;
  const visibleDirect=needle
    ? directMcpConnections.filter(connection=>(
        connection.name+' '+connection.url+' '+(connection.tools||[]).map(tool=>tool.name+' '+tool.title).join(' ')
      ).toLowerCase().includes(needle))
    : directMcpConnections;
  return <div className="contentPage">
    <PageTop onBack={onBack} title={pageName} action={isDesktop?'Refresh':null} onAction={onRefresh}/>
    <div className="contentInner">
      <h1>{pageName}</h1>
      <p className="pageLead">{isWindowsDesktop
        ? 'Connect remote MCP apps directly to Free AI, then select the apps you want to use for each Work or Super AI task.'
        : 'Provider-managed connectors are surfaced only when a connected AI provider exposes them in its own interface.'}</p>
      <div className="searchBar"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={isWindowsDesktop?'Search apps and tools':'Search provider hints'}/></div>

      {isWindowsDesktop&&<section className="pluginSection">
        <div className="sectionHeading"><h2>Direct MCP apps</h2><span className="pluginMeta">{visibleDirect.length} apps</span></div>
        <div className="directMcpGrid">
          {visibleDirect.map(connection=><div className="directMcpCard" key={connection.id}>
            <div className="directMcpTop">
              <span className="pluginIcon"><Plug size={17}/></span>
              <span><b>{connection.name}</b><small>{connection.url}</small></span>
              <span className={'connectionStatus '+(connection.connected?'good':'')}>{connection.connected?'Connected':'Saved'}</span>
            </div>
            <div className="directMcpMeta">
              <span>MCP {connection.protocolVersion||'2025-11-25'}</span>
              <span>{connection.tools?.length||0} tools</span>
              {connection.hasToken&&<span>Token saved securely</span>}
            </div>
            {connection.error&&<div className="formError">{connection.error}</div>}
            {Array.isArray(connection.tools)&&connection.tools.length>0&&<div className="directMcpTools">
              {connection.tools.slice(0,12).map(tool=><span key={tool.name} title={tool.description||tool.name}>
                {tool.title||tool.name}{tool.annotations?.readOnlyHint===true?' · read-only':''}
              </span>)}
              {connection.tools.length>12&&<span>+{connection.tools.length-12} more</span>}
            </div>}
            <div className="directMcpActions">
              <button onClick={()=>window.desktopApi?.refreshMcpConnection?.(connection.id).then(updated=>{
                if(updated)onRefreshMcp?.();
              }).catch(()=>onRefreshMcp?.())}>Refresh</button>
              <button className="dangerText" onClick={()=>onRemoveMcp?.(connection.id)}>Remove</button>
            </div>
          </div>)}
          {!visibleDirect.length&&<div className="pluginEmptyCard"><Plug size={22}/><b>{needle?'No direct MCP app matches':'No direct MCP apps yet'}</b><span>Add an HTTPS MCP endpoint below. Localhost HTTP is also allowed for local development.</span></div>}
        </div>
        <div className="mcpAddCard">
          <div><b>Add remote MCP app</b><small>This checkpoint supports Streamable HTTP MCP 2025-11-25. The token is stored by the desktop process, not in the renderer.</small></div>
          <div className="mcpAddForm">
            <input placeholder="App name" value={mcpDraft?.name||''} onChange={e=>setMcpDraft?.({...mcpDraft,name:e.target.value})}/>
            <input placeholder="https://example.com/mcp" value={mcpDraft?.url||''} onChange={e=>setMcpDraft?.({...mcpDraft,url:e.target.value})}/>
            <input type="password" placeholder="Bearer token (optional)" value={mcpDraft?.token||''} onChange={e=>setMcpDraft?.({...mcpDraft,token:e.target.value})}/>
            <button className="primaryAction" onClick={onAddMcp} disabled={!String(mcpDraft?.url||'').trim()}>Connect and add</button>
          </div>
          {mcpError&&<div className="formError">{mcpError}</div>}
        </div>
      </section>}

      <section className="pluginSection">
        <div className="sectionHeading"><h2>Provider-managed connector hints</h2><span className="pluginMeta">{visibleTools.length} hints</span></div>
        <div className="pluginHint warningHint"><Chrome size={20}/><div><b>Not direct MCP verification</b><span>These labels come from visible provider UI detected by the browser extension. Free AI does not treat them as proof that a tool exists or that a provider actually used it.</span></div></div>
        <div className="installedStrip">
          {visibleTools.map(t=><div key={t.key} className="installedIcon tool" title={t.mcp}><Plug size={16}/></div>)}
          {!visibleTools.length&&<span className="muted">{query?'No provider hint matches your search.':'No provider-managed connector hints detected.'}</span>}
        </div>
      </section>

      <section className="pluginSection">
        <h2>Connected AI providers</h2>
        <div className="pluginGrid">
          {visibleProviders.map(provider=><div className="pluginCard" key={(provider.source||'browser')+provider.id}>
            <span className={'providerBadge '+(provider.source==='api'?'api':provider.id)}>{modelLabel(provider).slice(0,1)}</span>
            <span><b>{modelLabel(provider)}</b><small>{provider.source==='api'?'API model':((provider.mcps?.length||0)+' provider UI hints')}</small></span>
            <span className={'connectionStatus '+(provider.source==='browser'?'good':'')}>{provider.source==='browser'?'Live':'API'}</span>
          </div>)}
          {!visibleProviders.length&&<div className="pluginEmptyCard"><Plug size={22}/><b>No AI provider is connected</b><span>Open a supported AI site in Chromium with the Free AI extension, or add an API model in Settings.</span></div>}
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
  const addressEditingRef=useRef(false);
  const [state,setState]=useState({url:'',title:'New tab',favicon:'',canGoBack:false,canGoForward:false,loading:false,tabs:[],activeTabId:null,downloads:[],siteTools:[],permissionRequests:[],error:null});
  const [siteToolsOpen,setSiteToolsOpen]=useState(false);
  const [downloadsOpen,setDownloadsOpen]=useState(false);
  const [downloadActionStatus,setDownloadActionStatus]=useState('');
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
      if(next.url&&!addressEditingRef.current)setUrl(next.url);
    });
    return()=>{off?.();window.desktopApi.browserCancelAnnotation?.().catch(()=>{});window.desktopApi.browserClose?.().catch(()=>{})};
  },[]);

  useEffect(()=>{
    if(!isDesktop||!surfaceRef.current)return;
    const el=surfaceRef.current;
    let frame=0;
    const measure=()=>{
      const r=el.getBoundingClientRect();
      const zoom=isWindowsDesktop?Math.max(.25,Number(window.desktopApi?.rendererZoomFactor?.())||1):1;
      return {x:r.x*zoom,y:r.y*zoom,width:r.width*zoom,height:r.height*zoom};
    };
    const syncNow=()=>{
      if(!el.isConnected)return;
      const bounds=measure();
      if(bounds.width<1||bounds.height<1)return;
      window.desktopApi.browserSetBounds(bounds).catch(()=>{});
    };
    const sync=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(syncNow);
    };
    const ro=new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize',sync);
    if(isWindowsDesktop)window.visualViewport?.addEventListener('resize',sync);
    syncNow();
    const bounds=measure();
    window.desktopApi.browserOpen({url,bounds}).then(next=>{
      if(next){setState(next);if(next.url)setUrl(next.url)}
    }).catch(()=>{});
    return()=>{
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize',sync);
      if(isWindowsDesktop)window.visualViewport?.removeEventListener('resize',sync);
    };
  },[]);

  async function navigate(){
    addressEditingRef.current=false;
    try{
      const next=await window.desktopApi?.browserNavigate(url);
      if(next){setState(next);if(next.url)setUrl(next.url)}
    }catch{}
  }
  function retryPage(){window.desktopApi?.browserReload?.()}
  async function resolvePermission(id,allow){
    try{
      const next=await window.desktopApi?.browserResolvePermission?.({id,allow});
      if(next)setState(next);
    }catch{}
  }
  async function dismissBrowserError(){
    try{
      const next=await window.desktopApi?.browserDismissError?.();
      if(next)setState(next);
    }catch{}
  }
  async function openExternalProtocol(){
    const target=state.error?.url;
    if(!target)return;
    try{
      const result=await window.desktopApi?.browserOpenExternalProtocol?.(target);
      if(result?.ok===false)setSiteToolStatus(result.error||'Could not open this link.');
    }catch(e){setSiteToolStatus(e?.message||'Could not open this link.')}
  }
  function chooseTab(id){
    addressEditingRef.current=false;
    window.desktopApi?.browserCancelAnnotation?.().catch(()=>{});
    setAnnotating(false);setAnnotation(null);setAnnotationNote('');
    window.desktopApi?.browserSelectTab(id).then(next=>{if(next?.url)setUrl(next.url)}).catch(()=>{})
  }
  function closeTab(e,id){
    e.stopPropagation();
    addressEditingRef.current=false;
    window.desktopApi?.browserCloseTab(id).then(next=>{if(next?.url)setUrl(next.url)}).catch(()=>{})
  }
  function newTab(){
    addressEditingRef.current=false;
    setSiteToolsOpen(false);setSelectedSiteTool(null);setSiteToolStatus('');
    window.desktopApi?.browserNewTab('https://www.google.com/').then(next=>{if(next?.url)setUrl(next.url)}).catch(()=>{})
  }
  async function cancelDownload(id){
    setDownloadActionStatus('');
    try{
      const next=await window.desktopApi?.browserCancelDownload?.(id);
      if(next)setState(next);
    }catch(e){setDownloadActionStatus(e?.message||'Could not cancel the download.')}
  }
  async function openDownload(id){
    setDownloadActionStatus('');
    try{
      const result=await window.desktopApi?.browserOpenDownload?.(id);
      if(result?.ok===false)setDownloadActionStatus(result.error||'Could not open the downloaded file.');
    }catch(e){setDownloadActionStatus(e?.message||'Could not open the downloaded file.')}
  }
  async function showDownload(id){
    setDownloadActionStatus('');
    try{
      const result=await window.desktopApi?.browserShowDownload?.(id);
      if(result?.ok===false)setDownloadActionStatus(result.error||'Could not show the downloaded file.');
    }catch(e){setDownloadActionStatus(e?.message||'Could not show the downloaded file.')}
  }
  async function startAnnotation(){
    setSiteToolsOpen(false);setDownloadsOpen(false);setDownloadActionStatus('');setAnnotation(null);setAnnotationNote('');setAnnotating(true);
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
  const permissionRequests=Array.isArray(state.permissionRequests)?state.permissionRequests:[];
  const permissionRequest=permissionRequests[0]||null;
  const permissionLabel=permission=>{
    const labels={media:'camera or microphone',geolocation:'your location',notifications:'notifications','clipboard-read':'clipboard access','clipboard-sanitized-write':'clipboard write',fullscreen:'fullscreen',pointerLock:'pointer lock',midi:'MIDI devices',midiSysex:'MIDI system access',openExternal:'external application access'};
    return labels[permission]||String(permission||'website permission').replace(/-/g,' ');
  };
  const permissionHost=request=>{
    try{return new URL(request?.origin||request?.requestingUrl||'').host||request?.origin||'This site'}catch{return request?.origin||'This site'}
  };
  const downloads=Array.isArray(state.downloads)?state.downloads:[];
  const activeDownloads=downloads.filter(d=>!d.terminal&&(d.state==='progressing'||d.state==='interrupted')).length;
  const siteTools=Array.isArray(state.siteTools)?state.siteTools:[];
  const downloadStateLabel=download=>{
    if(download.state==='completed')return 'Completed';
    if(download.state==='cancelled')return 'Cancelled';
    if(download.state==='interrupted')return download.terminal?'Failed':'Interrupted';
    if(download.totalBytes>0&&Number.isFinite(download.percentComplete))return `Downloading · ${Math.max(0,Math.min(100,Math.round(download.percentComplete)))}%`;
    return 'Downloading';
  };
  const downloadBytesLabel=download=>{
    if(download.totalBytes>0)return `${humanSize(download.receivedBytes||0)} / ${humanSize(download.totalBytes)}`;
    return download.receivedBytes>0?`${humanSize(download.receivedBytes)} downloaded`:'';
  };

  return <aside className="sidePane browserPane">
    <div className="paneTabs browserTabsBar">
      <div className="browserTabsScroll">
        {(state.tabs||[]).map(tab=><button key={tab.id} className={'browserTab '+(tab.id===state.activeTabId?'active':'')} aria-current={tab.id===state.activeTabId?'page':undefined} onClick={()=>chooseTab(tab.id)}>
          {tab.loading
            ? <RefreshCw className="spin" size={13}/>
            : tab.favicon
              ? <img className="browserFavicon" src={tab.favicon} alt=""/>
              : <Globe2 size={13}/>}
          <span>{tab.title||'New tab'}</span>
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
      <form onSubmit={e=>{e.preventDefault();navigate()}}><input value={url} onFocus={()=>{addressEditingRef.current=true}} onBlur={()=>{addressEditingRef.current=false;if(state.url)setUrl(state.url)}} onChange={e=>setUrl(e.target.value)} placeholder="Search or enter a URL" aria-label="Address and search"/></form>
      {isWindowsDesktop&&downloads.length>0&&<button className={downloadsOpen?'downloadStatus browserToolButton active':'downloadStatus browserToolButton'} onClick={()=>{setSiteToolsOpen(false);setDownloadsOpen(v=>!v);setDownloadActionStatus('')}} title={activeDownloads?activeDownloads+' active download'+(activeDownloads===1?'':'s'):'Downloads'}><Download size={14}/><small>{activeDownloads||downloads.length}</small></button>}
      {siteToolsEnabled&&siteTools.length>0&&<button className={siteToolsOpen?'browserToolButton active':'browserToolButton'} onClick={()=>{setDownloadsOpen(false);setDownloadActionStatus('');setSiteToolsOpen(v=>!v)}} title={siteTools.length+' site tool'+(siteTools.length===1?'':'s')}><ChevronDown size={15}/></button>}
      <button className={annotating?'active':''} onClick={annotating?cancelAnnotation:startAnnotation} title={annotating?'Cancel annotation':'Annotate page'}><PenLine size={15}/></button>
      <button onClick={()=>window.desktopApi?.openAuthUrl?.(state.url||url)} title="Open in system browser"><ExternalLink size={15}/></button>
    </div>

    {isWindowsDesktop&&permissionRequest&&<div className="siteToolsHeader browserPermissionBar" role="dialog" aria-label="Website permission request">
      <span><b>{permissionHost(permissionRequest)} wants {permissionLabel(permissionRequest.permission)}</b><small>{permissionRequest.userGesture?'Requested after your action.':'Requested by this page.'} Allow for this Free AI session?</small></span>
      <span className="browserPermissionActions"><button onClick={()=>resolvePermission(permissionRequest.id,false)}>Deny</button><button onClick={()=>resolvePermission(permissionRequest.id,true)}>Allow</button></span>
    </div>}

    {isWindowsDesktop&&state.error&&<div className="siteToolsHeader browserErrorBar" role="alert">
      <span><b>{state.error.type==='crash'?'Page stopped':state.error.type==='certificate'?'Certificate error':state.error.type==='protocol'?'Unsupported link':'Page unavailable'}</b><small>{state.error.description||'This page could not be loaded.'}</small></span>
      {state.error.type==='protocol'
        ? state.error.canOpenExternal
          ? <button onClick={openExternalProtocol}><ExternalLink size={14}/>Open externally</button>
          : <button onClick={dismissBrowserError}>Dismiss</button>
        : <button onClick={retryPage}><RefreshCw size={14}/>Retry</button>}
    </div>}

    {isWindowsDesktop&&downloadsOpen&&downloads.length>0&&<div className="siteToolsPanel">
      <div className="siteToolsHeader">
        <span><b>Downloads</b><small>{downloadActionStatus|| (activeDownloads?activeDownloads+' in progress':downloads.length+' recent download'+(downloads.length===1?'':'s'))}</small></span>
        <button onClick={()=>{setDownloadsOpen(false);setDownloadActionStatus('')}}><X size={14}/>Close</button>
      </div>
      <div className="downloadList">
        {downloads.map(download=><div className="downloadItem" key={download.id}>
          <Download size={14}/>
          <div className="downloadDetails">
            <b>{download.filename||download.suggestedFilename||'Download'}</b>
            <small>{downloadStateLabel(download)}{downloadBytesLabel(download)?' · '+downloadBytesLabel(download):''}</small>
            {!download.terminal&&download.totalBytes>0&&<progress max={download.totalBytes} value={Math.min(download.receivedBytes||0,download.totalBytes)} aria-label={'Download progress for '+(download.filename||'file')}/>}
            {download.savePath&&<small className="downloadPath" title={download.savePath}>{download.savePath}</small>}
          </div>
          <div className="downloadActions">
            {download.canCancel&&<button onClick={()=>cancelDownload(download.id)} title="Cancel download"><X size={13}/>Cancel</button>}
            {download.canOpen&&<button onClick={()=>openDownload(download.id)} title="Open downloaded file"><ExternalLink size={13}/>Open</button>}
            {download.canOpen&&<button onClick={()=>showDownload(download.id)} title="Show downloaded file in folder"><Folder size={13}/>Folder</button>}
          </div>
        </div>)}
      </div>
    </div>}

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
      {file?.kind==='archive'&&<div className="paneEmpty"><Archive size={38}/><b>Archive previews aren't supported yet</b><span>{isWindowsDesktop?'Selected for this message. It will be sent only if the selected provider exposes real file upload.':'The file is attached to this chat.'}</span></div>}
      {file?.kind==='binary'&&<div className="paneEmpty"><File size={38}/><b>Preview unavailable</b><span>{isWindowsDesktop?'Selected for this message. It will be sent only if the selected provider exposes real file upload.':'The file is attached to this chat.'}</span></div>}
    </div>
  </aside>
}

function ComputerPane({screens,setScreens,approvalMode,setApprovalMode,onClose}){
  const previewOnly=desktopPlatform==='linux';
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
      if(isWindowsDesktop){
        const viewport={width:action.viewportWidth,height:action.viewportHeight};
        const x=Math.round(action.nx*Math.max(1,viewport.width-1));
        const y=Math.round(action.ny*Math.max(1,viewport.height-1));
        let result=await window.desktopApi.computerPerformAction({
          displayId:action.displayId,
          viewport,
          action:{type:'click',button:'left',x,y}
        });
        if(action.text){
          result=await window.desktopApi.computerPerformAction({
            displayId:action.displayId,
            viewport,
            action:{type:'type',text:action.text}
          });
        }
        if(Array.isArray(result?.screens))setScreens(result.screens);
      }else{
        if(action.text)await window.desktopApi.computerClickAndType(action);
        else await window.desktopApi.computerClick(action);
        setTimeout(refresh,500);
      }
      setLastPoint(action);
      setPendingAction(null);
    }catch(e){setControlError(e?.message||'Computer action failed.')}
  }

  async function clickScreen(e,screen){
    if(screen?.interactive===false||screen?.displayId===null||screen?.displayId===undefined){
      setControlError('This screen is preview-only because Windows did not provide a reliable display mapping. Refresh Computer Use after reconnecting or reconfiguring the display.');
      return;
    }
    const rect=e.currentTarget.getBoundingClientRect();
    const action={
      displayId:screen.displayId,
      nx:(e.clientX-rect.left)/rect.width,
      ny:(e.clientY-rect.top)/rect.height,
      viewportWidth:Number(screen.width)||800,
      viewportHeight:Number(screen.height)||450,
      text:typeText||''
    };
    if(['ask','read','low'].includes(approvalMode)){setPendingAction(action);return}
    await executeAction(action);
  }

  const label=previewOnly?'Preview only':approvalMode==='low'?'Allow low-risk':approvalMode==='read'?'Allow reads':'Always ask';
  return <aside className="sidePane computerPane">
    <div className="paneTabs"><div className="browserTab"><Monitor size={14}/><span>Computer</span></div><button onClick={onClose}><X size={16}/></button></div>
    <div className="computerToolbar">
      <div><b>Computer use</b><small>{label}</small></div>
      {!previewOnly&&<select className="computerPermissionSelect" value={approvalMode} onChange={e=>setApprovalMode(e.target.value)}>
        <option value="ask">Always ask</option>
        <option value="read">Allow reads</option>
        <option value="low">Allow low-risk</option>
      </select>}
      <button onClick={refresh}><RefreshCw className={loading?'spin':''} size={15}/>Refresh</button>
    </div>
    {!previewOnly&&<div className="computerType"><input value={typeText} onChange={e=>setTypeText(e.target.value)} placeholder="Optional text to type after clicking"/><small>{typeText?'Click a point to propose a click + type action.':'Click a point to propose a mouse action.'}</small></div>}
    {previewOnly&&<div className="computerPreviewNotice">Linux supports screen preview here. Use the built-in browser for interactive web tasks.</div>}
    {pendingAction&&<div className="approvalPrompt">
      <ShieldCheck size={18}/><div><b>Approve this computer action?</b><small>{pendingAction.text?'Click the selected point and type the prepared text.':'Click the selected point.'}</small></div>
      <button onClick={()=>setPendingAction(null)}>Cancel</button>
      <button className="approveAction" onClick={()=>executeAction(pendingAction)}>Approve</button>
    </div>}
    {controlError&&<div className="computerError">{controlError}</div>}
    <div className="computerScreens">
      {screens.map(screen=>{
        const screenPreviewOnly=previewOnly||screen.interactive===false;
        return <div className={'computerScreen '+(screenPreviewOnly?'previewOnly':'')} key={screen.id}>
          <img src={screen.thumbnail} alt={screen.name} onClick={screenPreviewOnly?undefined:e=>clickScreen(e,screen)}/>
          <span>{screen.name}{screen.interactive===false&&isWindowsDesktop?' · Preview only (display mapping unavailable)':''}</span>
        </div>;
      })}
      {!screens.length&&!loading&&<div className="paneEmpty"><Monitor size={34}/><b>No screen preview available</b></div>}
    </div>
    {lastPoint&&<div className="controlStatus"><MousePointer2 size={13}/>Last action completed</div>}
  </aside>
}

function SettingsView(props){
  const {section,setSection,onClose,session,prefs,setPrefs,status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError,onExportData,onClearHistory,onComputer,onPlugins,onBrowser}=props;
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
      {section==='Profile'&&<ProfileSettings session={session}/>} 
      {section==='Appearance'&&<AppearanceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Voice'&&<VoiceSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Personalization'&&<PersonalizationSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Data controls'&&<DataControlsSettings onExportData={onExportData} onClearHistory={onClearHistory}/>}
      {section==='Configuration'&&<ConfigurationSettings prefs={prefs} setPrefs={setPrefs}/>}
      {section==='Keyboard shortcuts'&&!isNative&&<SimpleSettings title="Keyboard shortcuts" rows={[['New chat','Ctrl+N'],['Browser','Ctrl+Shift+B'],['Settings','Ctrl+,']]}/>}
      {section==='Computer use'&&!isNative&&<IntegrationSettings icon={Monitor} title="Computer use" text={desktopPlatform==='linux'?'Preview your Linux desktop. Interactive desktop-app control is not enabled on Linux.':'Preview and control your desktop from Work or Super AI.'} status={desktopPlatform==='linux'?'Preview only':normalizeApprovalMode(prefs.approvalMode)==='low'?'Allow low-risk':normalizeApprovalMode(prefs.approvalMode)==='read'?'Allow reads':'Always ask'} action={onComputer}/>}
      {section==='Plugins'&&<IntegrationSettings icon={Plug} title={isNative?'Apps':'Plugins'} text="Use MCP/connectors already installed in connected AI services." status={(connected.filter(p=>p.mcps?.length).length)+' providers'} action={onPlugins}/>}
      {section==='Browser'&&!isNative&&<BrowserSettings prefs={prefs} setPrefs={setPrefs} onBrowser={onBrowser} status={status}/>}
      {section==='Connections'&&<ConnectionsSettings {...{status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError}}/>}
      {section==='Git'&&!isNative&&<SimpleSettings title="Git" rows={[['Local repository workspace','Super AI · user-selected Git folder'],['Repository actions','Status, list, read, diff, and approval-gated writes']]}/>}
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
    </div>
  </div>;
  return <div className="settingsPane">
    <h3>Permissions</h3>
    <div className="settingBlock">
      <SettingRow title="Work approvals" desc="Choose how much low-risk browser and computer activity Work can continue without repeated prompts. Website access and sensitive actions still require explicit approval." control={<select value={normalizeApprovalMode(prefs.approvalMode)} onChange={e=>setPrefs({...prefs,approvalMode:e.target.value})}><option value="ask">Always ask</option><option value="read">Allow reads</option><option value="low">Allow low-risk</option></select>}/>
      <SettingRow title="Sensitive actions" desc="Typing, clicks that may change data, keyboard shortcuts, drag operations and closing tabs always pause for approval in the current Work loop." control={<span className="valuePill">Always confirm</span>}/>
    </div>
    <h3>General</h3>
    <div className="settingBlock">
      <SettingRow title="Bottom panel" desc="Show project, plugin and browser actions below the Work composer." control={<Toggle value={prefs.showBottomPanel!==false} onChange={v=>setPrefs({...prefs,showBottomPanel:v})}/>}/>
    </div>
  </div>
}
function SettingRow({title,desc,control}){return <div className="settingRow"><div><b>{title}</b><small>{desc}</small></div>{control}</div>}
function AppearanceSettings({prefs,setPrefs}){
  const textSizes=[90,100,110,125];
  const currentTextSize=Number(prefs.textSize)||100;
  const nearestIndex=textSizes.reduce((best,value,index)=>Math.abs(value-currentTextSize)<Math.abs(textSizes[best]-currentTextSize)?index:best,0);
  const setTextSizeIndex=index=>setPrefs({...prefs,textSize:textSizes[Math.max(0,Math.min(textSizes.length-1,index))]});
  return <div className="settingsPane">
    <h3>Theme</h3>
    <div className="settingBlock">
      <SettingRow title="Appearance" desc="Follow the system or choose a fixed theme." control={<select value={prefs.appearance||'dark'} onChange={e=>setPrefs({...prefs,appearance:e.target.value})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>}/>
      {!isNative&&(!isDesktop||desktopPlatform==='win32')&&<SettingRow title="Contrast" desc="Adjust separation between controls and surfaces." control={<select value={prefs.contrast||'medium'} onChange={e=>setPrefs({...prefs,contrast:e.target.value})}><option value="system">System</option><option value="medium">Medium</option><option value="increased">Increased</option></select>}/>}
      <SettingRow title="Accent color" desc="Used for active controls, message highlights and voice actions." control={<select value={prefs.accent||'blue'} onChange={e=>setPrefs({...prefs,accent:e.target.value})}><option value="blue">Blue</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="pink">Pink</option><option value="orange">Orange</option><option value="purple">Purple</option><option value="neutral">Neutral</option></select>}/>
      {isDesktop&&desktopPlatform==='win32'&&<SettingRow title="Text size" desc="Zoom the entire Free AI interface." control={<div className="confirmInline" role="group" aria-label="Text size">
        <button type="button" aria-label="Decrease text size" disabled={nearestIndex===0} onClick={()=>setTextSizeIndex(nearestIndex-1)}>−</button>
        <span className="valuePill">{textSizes[nearestIndex]}%</span>
        <button type="button" aria-label="Increase text size" disabled={nearestIndex===textSizes.length-1} onClick={()=>setTextSizeIndex(nearestIndex+1)}>+</button>
        <button type="button" disabled={textSizes[nearestIndex]===100} onClick={()=>setPrefs({...prefs,textSize:100})}>Reset</button>
      </div>}/>} 
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
      {isNative&&androidMajor>=12&&<SettingRow title="Haptic feedback" desc="Use subtle vibration feedback for supported actions on this Android device." control={<Toggle value={prefs.hapticsEnabled!==false} onChange={v=>setPrefs({...prefs,hapticsEnabled:v})}/>}/>}
      <label className="customInstructionsField">
        <span>Custom instructions</span>
        <small>These instructions are sent as request context to the connected model you choose.</small>
        <textarea value={prefs.customInstructions||''} onChange={e=>setPrefs({...prefs,customInstructions:e.target.value})} placeholder="What should connected models know about how you want them to respond?"/>
      </label>
    </div>
  </div>
}
function DataControlsSettings({onExportData,onClearHistory}){
  const [confirmClear,setConfirmClear]=useState(false);
  return <div className="settingsPane">
    <h3>Local data</h3>
    <div className="settingBlock">
      <SettingRow title="Export Free AI data" desc="Export locally stored chats and preferences as JSON." control={<button className="settingsInlineButton" onClick={onExportData}>Export</button>}/>
      <SettingRow title="Clear local chat history" desc="Delete locally stored Free AI and Super AI chats on this device." control={confirmClear
        ? <span className="confirmInline"><button onClick={()=>setConfirmClear(false)}>Cancel</button><button className="dangerAction" onClick={()=>{onClearHistory();setConfirmClear(false)}}>Clear</button></span>
        : <button className="settingsInlineButton dangerText" onClick={()=>setConfirmClear(true)}>Clear…</button>}/>
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

function BrowserSettings({prefs,setPrefs,onBrowser,status}){
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
      <SettingRow title="Open built-in browser" desc={isWindowsDesktop?"Use Free AI's separate browser profile. Sign-ins persist across app restarts; open tabs stay only while Free AI is running.":"Use Free AI's separate browser profile, tabs, sign-ins and downloads."} control={<button className="settingsInlineButton" onClick={onBrowser}>Open</button>}/>
      <SettingRow title="Browser extension" desc="Use your existing Chromium profile, signed-in sessions and open tabs as a separate Browser Use channel." control={<span className={'connectionStatus '+(status?.browserExtension?.connected?'good':'')}>{status?.browserExtension?.connected?'Connected · '+((status.browserExtension.tabCount||0))+' tabs':'Disconnected'}</span>}/>
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
      <SettingRow title="Browser extension" desc="Browser Use plus supported AI-provider bridge for Chromium browsers." control={<span className={'connectionStatus '+(status.extension?'good':'')}>{status.extension?'Connected · '+((status.browserExtension?.tabCount||0))+' tabs':'Disconnected'}</span>}/>
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

createRoot(document.getElementById('root')).render(<Root/>);
