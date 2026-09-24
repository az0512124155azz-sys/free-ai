import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {Capacitor,SystemBars,SystemBarsStyle} from '@capacitor/core';
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
  SquarePen,Table2,Target,SquareTerminal,Trash2,UserRound,Volume2,X
} from 'lucide-react';
import './styles.css';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL||'https://xquntkgjlmrxkwkrwsjl.supabase.co';
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY||'sb_publishable_5jLA64uA5h7NICd9sQLwUg_aQquD67t';
const isVisualTestBuild=import.meta.env.VITE_VISUAL_TEST==='1';
const isAndroidAuthQaBuild=import.meta.env.VITE_ANDROID_AUTH_QA==='1';
const supabase=!isVisualTestBuild&&supabaseUrl&&supabaseKey
  ? createClient(supabaseUrl,supabaseKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})
  : null;

const isDesktop=!!window.desktopApi;
const desktopPlatform=window.desktopApi?.platform||'';
const isNative=Capacitor.isNativePlatform();
const isAndroidNative=isNative&&Capacitor.getPlatform()==='android';

function updateAndroidDictationQaState(patch={}){
  if(!isAndroidNative||!isVisualTestBuild||typeof window==='undefined')return;
  const previous=window.__FREEAI_ANDROID_DICTATION_QA_STATE__||{};
  window.__FREEAI_ANDROID_DICTATION_QA_STATE__={...previous,...patch};
}
function readAndroidDictationQaState(){
  return typeof window==='undefined'?{}:(window.__FREEAI_ANDROID_DICTATION_QA_STATE__||{});
}

function updateAndroidSystemBarsQaState(patch={}){
  if(!isAndroidNative||!isVisualTestBuild||typeof window==='undefined')return;
  const previous=window.__FREEAI_ANDROID_SYSTEM_BARS_QA_STATE__||{};
  window.__FREEAI_ANDROID_SYSTEM_BARS_QA_STATE__={...previous,...patch};
}
function readAndroidSystemBarsQaState(){
  return typeof window==='undefined'?{}:(window.__FREEAI_ANDROID_SYSTEM_BARS_QA_STATE__||{});
}

const isWindowsDesktop=isDesktop&&desktopPlatform==='win32';
const androidMajor=Number((navigator.userAgent.match(/Android\s+(\d+)/i)||[])[1]||0);
const AUTH_CALLBACK_URL='freeai://auth/callback';
function isAuthCallbackUrl(value){
  try{
    const parsed=new URL(String(value||''));
    const expected=new URL(AUTH_CALLBACK_URL);
    return parsed.protocol===expected.protocol
      && parsed.hostname===expected.hostname
      && parsed.port===expected.port
      && parsed.pathname===expected.pathname
      && !parsed.username
      && !parsed.password;
  }catch{return false}
}
const GOOGLE_WEB_CLIENT_ID=import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID||'991329297292-fp0ciud251vjasflsjq4r7k2vgo4sij7.apps.googleusercontent.com';

async function googleQaIdentityFingerprint(user){
  if(!isAndroidAuthQaBuild||!user?.id||!globalThis.crypto?.subtle)return '';
  const encoded=new TextEncoder().encode('free-ai-google-qa:'+String(user.id));
  const digest=await crypto.subtle.digest('SHA-256',encoded);
  return Array.from(new Uint8Array(digest))
    .map(value=>value.toString(16).padStart(2,'0'))
    .join('')
    .slice(0,16);
}

function setAndroidGoogleQaState(status,code='',requested,identity){
  if(!isAndroidAuthQaBuild||typeof window==='undefined')return;
  const previous=window.__FREEAI_ANDROID_GOOGLE_QA_STATE__||{};
  const nextIdentity=identity===undefined
    ? String(previous.identity||'')
    : String(identity||'').replace(/[^a-f0-9]/gi,'').slice(0,24);
  window.__FREEAI_ANDROID_GOOGLE_QA_STATE__={
    status:String(status||'idle'),
    code:String(code||'').replace(/[^a-z0-9_.-]/gi,'_').slice(0,96),
    requested:requested===undefined?!!previous.requested:!!requested,
    identity:nextIdentity
  };
}

function classifyNativeGoogleError(error){
  const code=String(error?.code||'');
  const name=String(error?.name||'');
  const message=String(error?.message||error||'');
  const detail=[code,name,message].filter(Boolean).join(' ');

  if(/USER_CANCELLED|GetCredentialCancellationException|\bcancel(?:led|ed)?\b/i.test(detail)){
    return {kind:'cancelled',code:'user_cancelled'};
  }
  if(/NoCredentialException|No credentials available/i.test(detail)){
    return {kind:'no_credential',code:'no_credential'};
  }
  if(/\[16\]|Account reauth failed|reauth/i.test(detail)){
    return {kind:'reauth',code:'account_reauth_failed'};
  }
  if(/28444|Developer console is not set up correctly|not configured|webClientId|web client id|SHA-1|client ID/i.test(detail)){
    return {kind:'config',code:'google_config'};
  }

  const sanitized=(code||name||'google_error').replace(/[^a-z0-9_.-]/gi,'_').slice(0,96);
  return {kind:'error',code:sanitized||'google_error'};
}
const BRAND_LOGO_SRC=new URL('free-ai-logo.svg',document.baseURI).href;
const providerNames={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',deepseek:'DeepSeek',grok:'Grok',manus:'Manus'};
const projectIconOptions=[
  ['folder','Folder',Folder],['briefcase','Briefcase',Briefcase],['code','Code',Code2],
  ['sparkles','Ideas',Sparkles],['globe','Research',Globe2],['calendar','Planning',CalendarDays]
];
const projectColorOptions=['blue','green','orange','purple','pink','neutral'];
const DEFAULT_RESEARCH_PLAN=[
  'Understand the research question and constraints',
  'Identify primary and authoritative sources',
  'Search current information',
  'Compare conflicting evidence',
  'Verify important claims against retrieved sources',
  'Synthesize a cited final report'
];
function researchDomains(value){
  return [...new Set(String(value||'').split(/[\n,]+/).map(item=>item.trim().toLowerCase()).filter(Boolean))].slice(0,20);
}

const settingsSections=[
  ['personal','General',Settings],['personal','App',AppWindow],['personal','Profile',UserRound],['personal','Appearance',Palette],['personal','Voice',Volume2],
  ['personal','Personalization',Sparkles],['personal','Data controls',Database],
  ['personal','Configuration',SlidersHorizontal],['personal','Keyboard shortcuts',Keyboard],
  ['integrations','Computer use',Monitor],['integrations','Files',Folder],['integrations','Plugins',Plug],['integrations','Browser',Globe2],
  ['coding','Connections',Link2],['coding','Git',GitBranch],['coding','Environments',SquareTerminal]
];

const PUBLIC_PLUGIN_DIRECTORY_URL='https://chatgpt.com/plugins?show_chat_button=true';
const publicPluginDirectory=[
  {id:'gmail',name:'Gmail',category:'Popular',description:'Work with Gmail messages'},
  {id:'google-drive',name:'Google Drive',category:'Popular',description:'Work across Drive, Docs, Sheets, and Slides'},
  {id:'github',name:'GitHub',category:'Popular',description:'Work with PRs, issues, CI, and publishing'},
  {id:'outlook-email',name:'Outlook Email',category:'Popular',description:'Work with Outlook inboxes'},
  {id:'health',name:'Health',category:'Popular',description:'Explore supported health data'},
  {id:'remote-desktop-commander',name:'Remote Desktop Commander',category:'Popular',description:'Remote build and automation workflows'},
  {id:'chatgpt-ads-manager',name:'ChatGPT Ads Manager',category:'New & Noteworthy',description:'Manage ads and performance'},
  {id:'stack-overflow-for-agents',name:'Stack Overflow For Agents',category:'New & Noteworthy',description:'Agent-focused knowledge exchange'},
  {id:'data',name:'Data',category:'New & Noteworthy',description:'Answer questions using connected data'},
  {id:'tableau',name:'Tableau',category:'New & Noteworthy',description:'Explore and understand analytics'},
  {id:'microsoft-power-bi',name:'Microsoft Power BI',category:'New & Noteworthy',description:'Explore and author browser analytics'},
  {id:'aws-data-analytics',name:'AWS Data Analytics',category:'New & Noteworthy',description:'Work with AWS analytics capabilities'},
  {id:'notion',name:'Notion',category:'Productivity',description:'Work with Notion docs and workflows'},
  {id:'google-calendar',name:'Google Calendar',category:'Productivity',description:'Manage Google Calendar events'},
  {id:'outlook-calendar',name:'Outlook Calendar',category:'Productivity',description:'Manage Outlook schedules'},
  {id:'monday',name:'monday.com',category:'Productivity',description:'Manage projects, tasks, and CRM'},
  {id:'metricool',name:'Metricool',category:'Productivity',description:'Analyze and schedule social posts'},
  {id:'fathom',name:'Fathom',category:'Productivity',description:'Work with meeting insights'},
  {id:'canva',name:'Canva',category:'Creativity',description:'Create, review, and edit designs'},
  {id:'higgsfield',name:'Higgsfield',category:'Creativity',description:'Create images and videos with AI models'},
  {id:'runway',name:'Runway',category:'Creativity',description:'Generate creative media with AI models'},
  {id:'figma',name:'Figma',category:'Creativity',description:'Create designs and ship them to code'},
  {id:'invideo',name:'invideo',category:'Creativity',description:'Create videos with AI'},
  {id:'openart',name:'OpenArt',category:'Creativity',description:'Create images and videos'}
];

function directMcpCapabilitySummary(connection){
  const tools=Array.isArray(connection?.tools)?connection.tools:[];
  const readOnly=tools.filter(tool=>tool.annotations?.readOnlyHint===true&&tool.annotations?.destructiveHint!==true);
  const destructive=tools.filter(tool=>tool.annotations?.destructiveHint===true);
  const writeLike=tools.filter(tool=>!readOnly.includes(tool));
  return {
    tools:tools.length,
    readOnly:readOnly.length,
    writeLike:writeLike.length,
    destructive:destructive.length
  };
}

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
function modelProviderId(model){
  return String(model?.providerId||model?.id||'').split(':')[0];
}
function modelLabel(model){
  return model?.modelName||model?.model||model?.name||providerNames[modelProviderId(model)]||'Select model';
}
function modelKey(model){
  return model?(String(model.source||'browser')+'::'+String(model.id||'')):'';
}
function modelGroupKey(model){
  return model?[
    String(model.source||'browser'),
    modelProviderId(model),
    String(modelLabel(model)||'').trim().toLowerCase()
  ].join('::'):'';
}
function modelInstanceLabel(model){
  if(model?.source==='api')return 'API · '+String(model?.model||modelLabel(model));
  const title=String(model?.title||'').trim();
  const provider=model?.name||providerNames[modelProviderId(model)]||'Browser';
  return 'Browser · '+provider+(Number.isFinite(Number(model?.tabId))?' · Tab '+model.tabId:'')+(title&&title!==provider?' · '+title:'');
}
function modelConnectionDetail(model){
  if(model?.connected!==false)return '';
  if(model?.adapterReady===false)return ' · adapter unavailable';
  return ' · reconnecting…';
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

function safeExportFileName(value){
  const base=String(value||'Free AI chat').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/\s+/g,' ').trim().slice(0,90)||'Free AI chat';
  return base+'.md';
}
function chatExportMarkdown(chat){
  const lines=[
    '# '+String(chat?.title||'Free AI chat'),
    '',
    '- Exported from: Free AI',
    '- Exported at: '+new Date().toISOString(),
    '- Mode: '+String(chat?.mode||'chat'),
    '- Model: '+String(chat?.modelName||chat?.providerId||'Unknown'),
    ...(chat?.isMasterThread?['- Thread: Master']:chat?.isAgentThread?['- Thread: '+String(chat?.agentRole||'Agent')]:[]),
    '',
    '---',
    ''
  ];
  for(const message of Array.isArray(chat?.messages)?chat.messages:[]){
    const role=message?.role==='user'?'You':message?.role==='error'?'Error':'Assistant';
    lines.push('## '+role,'',String(message?.text||'').trim()||'_(empty message)_');
    if(Array.isArray(message?.attachments)&&message.attachments.length){
      lines.push('','Attachments:');
      for(const item of message.attachments)lines.push('- '+String(item?.name||'attachment'));
    }
    lines.push('');
  }
  return lines.join('\n').trim()+'\n';
}

function ChatContextMenu({chat,onPin,onExport,onDelete}){
  return <div className="recentContextMenu" role="menu" aria-label={'Chat options for '+chat.title}>
    <button role="menuitem" onClick={()=>onPin?.(chat.id)}><Pin size={14}/><span>{chat.pinned?'Unpin chat':'Pin chat'}</span></button>
    <button role="menuitem" onClick={()=>onExport?.(chat)}><Download size={14}/><span>Export chat</span></button>
    <div className="contextMenuSeparator"/>
    <button className="dangerMenuItem" role="menuitem" onClick={()=>onDelete?.(chat)}><Trash2 size={14}/><span>Delete chat</span></button>
  </div>;
}

function DeleteChatDialog({chat,onClose,onConfirm}){
  if(!chat)return null;
  return <div className="projectDialogScrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
    <div className="deleteChatDialog" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title">
      <div className="projectDialogHeader">
        <div><b id="delete-chat-title">Delete chat?</b><small>This removes “{chat.title}” from Free AI on this device.</small></div>
        <button type="button" onClick={onClose} aria-label="Close"><X size={17}/></button>
      </div>
      <p>This action cannot be undone. It does not delete the original conversations in ChatGPT, Claude, Gemini, or another connected provider.</p>
      <div className="projectDialogActions"><button type="button" onClick={onClose}>Cancel</button><button className="dangerAction" type="button" onClick={()=>onConfirm?.(chat)}>Delete</button></div>
    </div>
  </div>;
}

function MessageSources({sources,onOpen}){
  const items=Array.isArray(sources)?sources.filter(item=>item?.url).slice(0,8):[];
  if(!items.length)return null;
  return <div className="messageSources" aria-label="Web sources">
    <div className="messageSourcesLabel"><Globe2 size={12}/><span>Sources</span><small>{items.length}</small></div>
    <div className="messageSourceList">{items.map((source,index)=><button type="button" key={source.url+'::'+index} onClick={()=>onOpen?.(source.url)} title={source.url}>
      <span className="sourceIndex">{index+1}</span>
      <span className="sourceText"><b>{source.title||source.domain||'Web source'}</b><small>{source.domain||(()=>{try{return new URL(source.url).hostname.replace(/^www\./,'')}catch{return ''}})()}</small></span>
      <ExternalLink size={12}/>
    </button>)}</div>
  </div>;
}

function BrandMark({size=22,className=''}) {
  return <span className={'freeAiMark '+className} style={{'--mark-size':size+'px'}} aria-hidden="true">
    <img src={BRAND_LOGO_SRC} alt="" draggable="false"/>
  </span>;
}

function ProviderBadge({model,small=false}){
  const providerId=modelProviderId(model);
  const [failed,setFailed]=useState(false);
  const icon=String(model?.iconDataUrl||model?.favIconUrl||model?.iconUrl||'');
  useEffect(()=>setFailed(false),[icon]);
  return <span className={'providerBadge '+(small?'small ':'')+(model?.source==='api'?'api':providerId)} aria-hidden="true">
    {icon&&!failed?<img src={icon} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span>{model?modelLabel(model).slice(0,1).toUpperCase():'+'}</span>}
  </span>;
}

class MenuErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null}}
  static getDerivedStateFromError(error){return {error}}
  componentDidCatch(error,info){console.error('Free AI picker error',error,info)}
  render(){
    if(!this.state.error)return this.props.children;
    return <div className="floatingMenu modelPicker pickerError" role="alert">
      <div className="floatingTitle">Model picker could not open</div>
      <p>Free AI kept the rest of the app running. Close this panel and refresh the connected models.</p>
      <button onClick={()=>this.props.onClose?.()}>Close</button>
    </div>;
  }
}

function MobileMenuGlyph({size=20}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 8h14M5 16h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
  </svg>;
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
  const [status,setStatus]=useState({
    extension:false,
    relay:false,
    desktopOnline:false,
    browserExtension:{connected:false,tabCount:0},
    remoteCapabilities:{browser:{available:false},computer:{available:false}},
    providers:[]
  });
  const [selected,setSelected]=useState(null);
  const [parallelCount,setParallelCount]=useState(1);
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
  const [deleteChatTarget,setDeleteChatTarget]=useState(null);
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
  const [webSearchEnabled,setWebSearchEnabled]=useState(false);
  const [deepResearchEnabled,setDeepResearchEnabled]=useState(false);
  const [researchSetupOpen,setResearchSetupOpen]=useState(false);
  const [pendingResearch,setPendingResearch]=useState(null);
  const [profileMenu,setProfileMenu]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsSection,setSettingsSection]=useState('General');
  const [mobileSettingsList,setMobileSettingsList]=useState(true);
  const [sidePanel,setSidePanel]=useState(null);
  const [selectedFile,setSelectedFile]=useState(null);
  const [attachments,setAttachments]=useState([]);
  const [attachmentError,setAttachmentError]=useState('');
  const [dragActive,setDragActive]=useState(false);
  const [screens,setScreens]=useState([]);
  const [workTask,setWorkTask]=useState(null);
  const [repositoryWorkspace,setRepositoryWorkspace]=useState(null);
  const [localFolderWorkspace,setLocalFolderWorkspace]=useState(null);
  const [superTeamKeys,setSuperTeamKeys]=useState(()=>readJSON('freeai.super.team',[]));
  const handledWorkTerminalRef=useRef(null);
  const [chats,setChats]=useState(()=>readJSON('freeai.chats.free',readJSON('freeai.chats',[])));
  const [currentChatId,setCurrentChatId]=useState(null);
  const [appPrefs,setAppPrefs]=useState(()=>{
    const saved=readJSON('freeai.prefs',{});
    return {
      appearance:'dark',contrast:'medium',accent:'blue',textSize:100,suggestedPrompts:true,voiceLanguage:'auto',
      customizationEnabled:true,customInstructions:'',siteToolsEnabled:true,spellCheckEnabled:true,hapticsEnabled:true,showBottomPanel:true,researchSearchUrl:'',
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
  const activeRemoteRequestRef=useRef(null);
  const activeParallelRequestIdsRef=useRef([]);
  const parallelCancelledRef=useRef(false);
  const streamedTextRef=useRef('');
  const cancelledRequestRef=useRef(null);
  const activeWorkTaskIdRef=useRef(null);
  const workTaskModelRef=useRef(null);
  const workTaskProjectIdRef=useRef(null);
  const workTaskMasterChatIdRef=useRef(null);
  const androidAuthQaStateRef=useRef({status:'idle',code:'',accessToken:''});

  useEffect(()=>{
    if(!supabase){setSession({user:{email:'Local workspace'}});setAuthReady(true);return}
    let cancelled=false,appStateHandle=null;
    const applySession=next=>{
      if(cancelled)return;
      setSession(next||null);
      setAuthReady(true);
    };
    const syncStoredSession=async()=>{
      try{
        const {data,error}=await supabase.auth.getSession();
        if(error)throw error;
        applySession(data.session);
      }catch{
        applySession(null);
      }
    };
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>applySession(next));
    syncStoredSession();

    if(isAndroidNative){
      supabase.auth.startAutoRefresh().catch(()=>{});
      CapacitorApp.addListener('appStateChange',({isActive})=>{
        if(isActive){
          supabase.auth.startAutoRefresh().catch(()=>{});
          syncStoredSession();
        }else{
          supabase.auth.stopAutoRefresh().catch(()=>{});
        }
      }).then(handle=>{appStateHandle=handle}).catch(()=>{});
    }

    return()=>{
      cancelled=true;
      subscription.unsubscribe();
      appStateHandle?.remove?.();
      if(isAndroidNative)supabase.auth.stopAutoRefresh().catch(()=>{});
    };
  },[]);

  async function signOutAccount(){
    if(!supabase)return;
    const {error}=await supabase.auth.signOut();
    if(isAndroidNative){
      await SocialLogin.logout({provider:'google'}).catch(()=>{});
    }
    if(error)throw error;
  }

  useEffect(()=>{
    if(!isAndroidNative||!isAndroidAuthQaBuild||!supabase)return;
    const qa=androidAuthQaStateRef.current;
    const snapshot=()=>[
      'ready='+authReady,
      'session='+!!session,
      'authScreen='+!!document.querySelector('.authScreen'),
      'status='+(qa.status||'idle'),
      'code='+(qa.code||''),
      'googleStatus='+(window.__FREEAI_ANDROID_GOOGLE_QA_STATE__?.status||'idle'),
      'googleCode='+(window.__FREEAI_ANDROID_GOOGLE_QA_STATE__?.code||''),
      'googleRequested='+!!window.__FREEAI_ANDROID_GOOGLE_QA_STATE__?.requested,
      'googleIdentity='+(window.__FREEAI_ANDROID_GOOGLE_QA_STATE__?.identity||''),
      'authProvider='+String(session?.user?.app_metadata?.provider||'').replace(/[^a-z0-9_.-]/gi,'_').slice(0,32)
    ].join(';');
    const run=(label,task)=>{
      qa.status=label+':running';
      qa.code='';
      Promise.resolve()
        .then(task)
        .then(()=>{qa.status=label+':success';qa.code=''})
        .catch(error=>{qa.status=label+':error';qa.code=String(error?.code||error?.name||'auth_error').replace(/[^a-z0-9_.-]/gi,'_')});
    };
    window.__FREEAI_ANDROID_AUTH_QA__=(payload={})=>{
      const command=String(payload?.command||'authAudit');
      if(command==='authSignInPassword'){
        const email=String(payload?.email||'').trim().toLowerCase();
        const password=String(payload?.password||'');
        run('signInPassword',async()=>{
          if(!email||!password)throw Object.assign(new Error('Missing auth QA credentials.'),{code:'missing_credentials'});
          const {error}=await supabase.auth.signInWithPassword({email,password});
          if(error)throw error;
        });
      }else if(command==='authCaptureAccessToken'){
        run('captureAccessToken',async()=>{
          const {data,error}=await supabase.auth.getSession();
          if(error)throw error;
          const accessToken=String(data.session?.access_token||'');
          if(!accessToken)throw Object.assign(new Error('Missing auth QA access token.'),{code:'session_not_found'});
          qa.accessToken=accessToken;
        });
      }else if(command==='authReadAccessToken'){
        const accessToken=String(qa.accessToken||'');
        qa.accessToken='';
        return snapshot()+';accessToken='+accessToken;
      }else if(command==='authRefreshSession'){
        run('refreshSession',async()=>{
          const {error}=await supabase.auth.refreshSession();
          if(error){
            const code=String(error?.code||'');
            const terminalSessionError=
              code==='refresh_token_not_found'||
              code==='refresh_token_already_used'||
              code==='session_not_found'||
              code==='session_expired';
            if(terminalSessionError){
              await supabase.auth.signOut({scope:'local'}).catch(()=>{});
              qa.accessToken='';
              setSession(null);
              setAuthReady(true);
            }
            throw error;
          }
        });
      }else if(command==='authSignOut'){
        run('signOut',()=>signOutAccount());
      }else if(command==='authResetGoogleQa'){
        setAndroidGoogleQaState('idle','',false,'');
        qa.status='resetGoogle:success';
        qa.code='';
      }else if(command==='authStartGoogle'){
        const button=document.querySelector('.googleButton');
        if(button){
          setAndroidGoogleQaState('button_clicked','',false);
          qa.status='startGoogle:started';
          qa.code='';
          button.click();
        }else{
          qa.status='startGoogle:error';
          qa.code='google_button_missing';
        }
      }
      return snapshot();
    };
    return()=>{delete window.__FREEAI_ANDROID_AUTH_QA__};
  },[authReady,session]);

  useEffect(()=>{
    if(!isAndroidNative)return;
    const root=document.documentElement;
    root.dataset.nativePlatform='android';
    const visualViewport=window.visualViewport;
    const updateKeyboardOffset=()=>{
      const viewport=window.visualViewport;
      const offset=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
      root.style.setProperty('--keyboard-offset',offset+'px');
      if(offset>80)root.setAttribute('data-keyboard-open','');
      else root.removeAttribute('data-keyboard-open');
    };
    updateKeyboardOffset();
    visualViewport?.addEventListener('resize',updateKeyboardOffset);
    visualViewport?.addEventListener('scroll',updateKeyboardOffset);
    return()=>{
      visualViewport?.removeEventListener('resize',updateKeyboardOffset);
      visualViewport?.removeEventListener('scroll',updateKeyboardOffset);
      root.style.removeProperty('--keyboard-offset');
      root.removeAttribute('data-keyboard-open');
      delete root.dataset.nativePlatform;
    };
  },[]);

  useEffect(()=>{
    if(!isAndroidNative)return;
    const scheme=window.matchMedia?.('(prefers-color-scheme: light)');
    const applySystemBars=()=>{
      const light=appPrefs.appearance==='light'||(appPrefs.appearance==='system'&&scheme?.matches);
      const requested=light?'light':'dark';
      updateAndroidSystemBarsQaState({requested,applied:'pending',error:''});
      SystemBars.setStyle({style:light?SystemBarsStyle.Light:SystemBarsStyle.Dark})
        .then(()=>updateAndroidSystemBarsQaState({requested,applied:requested,error:''}))
        .catch(error=>updateAndroidSystemBarsQaState({requested,applied:'error',error:String(error?.message||error||'unknown')}));
      SystemBars.show().catch(()=>{});
    };
    applySystemBars();
    if(appPrefs.appearance==='system')scheme?.addEventListener?.('change',applySystemBars);
    return()=>scheme?.removeEventListener?.('change',applySystemBars);
  },[appPrefs.appearance]);

  useEffect(()=>{
    if(!isAndroidNative)return;
    let handle;
    CapacitorApp.addListener('backButton',()=>{
      if(deleteChatTarget){setDeleteChatTarget(null);return}
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
      if(settingsOpen){
        if(!mobileSettingsList){setMobileSettingsList(true);return}
        setSettingsOpen(false);return
      }
      if(sidePanel){setSidePanel(null);return}
      if(page!=='chat'){setPage('chat');return}
      CapacitorApp.exitApp().catch(()=>{});
    }).then(value=>{handle=value}).catch(()=>{});
    return()=>handle?.remove?.();
  },[deleteChatTarget,projectDialogOpen,profileMenu,responseMenuIndex,chatMenuId,recentsFilterOpen,modelMenu,effortMenu,plusMenu,mobileModeMenu,mobileNavOpen,settingsOpen,mobileSettingsList,sidePanel,page]);

  useEffect(()=>{
    if(!isAndroidNative||!isVisualTestBuild)return;
    const visible=element=>{
      if(!element)return false;
      const style=getComputedStyle(element);
      const rect=element.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
    };
    const audit=()=>{
      const root=document.documentElement;
      const rootStyle=getComputedStyle(root);
      const shell=document.querySelector('.desktopShell');
      const drawerElement=document.querySelector('.gptSidebar');
      const drawerRect=drawerElement?.getBoundingClientRect();
      const direction=root.dir||rootStyle.direction||'ltr';
      const drawerInlineStart=drawerRect
        ? Math.max(0,Math.round(direction==='rtl'?window.innerWidth-drawerRect.right:drawerRect.left))
        : 0;
      const horizontalOverflow=document.body.scrollWidth>window.innerWidth+2||root.scrollWidth>window.innerWidth+2;
      const systemBarsQa=readAndroidSystemBarsQaState();
      return [
        'shell='+(!!shell&&shell.classList.contains('nativeMobileShell')),
        'auth='+!!document.querySelector('.authScreen'),
        'drawer='+!!document.querySelector('.gptSidebar.mobileOpen'),
        'theme='+String(root.dataset.theme||''),
        'dir='+String(direction),
        'lang='+String(root.lang||''),
        'systemBars='+String(systemBarsQa.applied||systemBarsQa.requested||'unknown'),
        'horizontalOverflow='+horizontalOverflow,
        'drawerInlineStart='+drawerInlineStart,
        'mobileNav='+visible(document.querySelector('.mobileNavTrigger')),
        'desktopNav='+visible(document.querySelector('.desktopPrimaryNav')),
        'modelPicker='+visible(document.querySelector('.mobileConversationPicker')),
        'modelOpen='+!!document.querySelector('.mobileTopModelPanel'),
        'composer='+visible(document.querySelector('.gptComposer')),
        'width='+Math.round(window.innerWidth),
        'height='+Math.round(window.innerHeight),
        'keyboard='+Math.round(parseFloat(rootStyle.getPropertyValue('--keyboard-offset'))||0),
        'safeTop='+(rootStyle.getPropertyValue('--safe-area-inset-top').trim()||'0px'),
        'safeBottom='+(rootStyle.getPropertyValue('--safe-area-inset-bottom').trim()||'0px'),
        'dictationMic='+visible(document.querySelector('.micButton')),
        'dictationListening='+!!document.querySelector('.micButton.listening'),
        'dictationError='+!!document.querySelector('.voiceDictationError'),
        'dictationPermission='+String(readAndroidDictationQaState().permission||'unknown'),
        'dictationStarted='+!!readAndroidDictationQaState().started,
        'dictationStopped='+!!readAndroidDictationQaState().stopped,
        'dictationDenied='+!!readAndroidDictationQaState().denied,
        'dictationPartial='+!!readAndroidDictationQaState().partial,
        'dictationFinal='+!!readAndroidDictationQaState().final,
        'dictationFinalized='+!!readAndroidDictationQaState().finalized,
        'dictationLanguage='+String(readAndroidDictationQaState().language||'unknown'),
        'settingsOpen='+!!document.querySelector('.settingsScreen'),
        'settingsList='+!!document.querySelector('.settingsScreen.mobileSettingsList'),
        'settingsDetail='+!!document.querySelector('.settingsScreen.mobileSettingsDetail'),
        'settingsSection='+String(document.querySelector('.settingsScreen')?.dataset?.section||''),
        'appsPage='+!!document.querySelector('.mobileAppsPage'),
        'appsDiscover='+!!document.querySelector('.mobileAppsDiscover'),
        'appsSearch='+!!document.querySelector('.mobileAppsSearch input'),
        'explorePage='+!!document.querySelector('.mobileExplorePage'),
        'exploreApps='+!!document.querySelector('.mobileExploreApps'),
        'exploreSearch='+!!document.querySelector('.mobileExploreSearch input'),
        'desktopAppControls='+!!document.querySelector('.mobileAppsPage .mcpAddCard,.mobileAppsPage .directMcpGrid,.mobileExplorePage .directMcpGrid'),
        'remoteDesktopSettings='+!!document.querySelector('.remoteDesktopSettings'),
        'remoteDesktopOnline='+!!document.querySelector('.remoteDesktopSettings .connectionStatus.good'),
        'remoteBrowserLabel='+!![...document.querySelectorAll('.remoteDesktopSettings .settingRow')].find(row=>row.textContent?.includes('Remote Browser')),
        'remoteComputerLabel='+!![...document.querySelectorAll('.remoteDesktopSettings .settingRow')].find(row=>row.textContent?.includes('Remote Computer')),
        'remoteDesktopApiForm='+!!document.querySelector('.remoteDesktopSettings .apiForm'),
        'remotePairingKey='+!!document.querySelector('.remoteDesktopSettings input[type="password"]')
      ].join(';');
    };
    window.__FREEAI_ANDROID_QA__=(command='audit')=>{
      if(command==='setThemeLight')setAppPrefs(current=>({...current,appearance:'light'}));
      if(command==='setThemeDark')setAppPrefs(current=>({...current,appearance:'dark'}));
      if(command==='setRtl'){
        document.documentElement.dir='rtl';
        document.documentElement.lang='he';
      }
      if(command==='setLtr'){
        document.documentElement.dir='ltr';
        document.documentElement.lang='en';
      }
      if(command==='openDrawer')document.querySelector('.mobileNavTrigger')?.click();
      if(command==='openModel')document.querySelector('.mobileModelTrigger')?.click();
      if(command==='focusComposer'){
        const field=document.querySelector('.gptComposer textarea');
        field?.focus();
        field?.click();
      }
      if(command==='startDictation')window.dispatchEvent(new CustomEvent('freeai:start-voice'));
      if(command==='stopDictation')window.dispatchEvent(new CustomEvent('freeai:stop-voice'));
      if(command==='openSettings'){
        setSettingsSection('General');
        setMobileSettingsList(true);
        setSettingsOpen(true);
      }
      if(command==='openSettingsVoice'){
        setSettingsSection('Voice');
        setMobileSettingsList(false);
        setSettingsOpen(true);
      }
      if(command==='openApps'){
        setSettingsOpen(false);
        setMobileNavOpen(false);
        setPage('plugins');
      }
      if(command==='openExplore'){
        setSettingsOpen(false);
        setMobileNavOpen(false);
        setPage('explore');
      }
      if(command==='openRemoteDesktop'){
        setPage('chat');
        setSettingsSection('Connections');
        setMobileSettingsList(false);
        setSettingsOpen(true);
      }
      return audit();
    };
    return()=>{delete window.__FREEAI_ANDROID_QA__};
  },[]);

  useEffect(()=>{
    if(!isDesktop)return;
    let active=true;
    window.desktopApi.getStatus().then(s=>active&&setStatus(s)).catch(()=>{});
    const offStatus=window.desktopApi.onStatus(s=>active&&setStatus(s));
    const offWork=window.desktopApi.onWorkTask?.(state=>{
      if(!active||!state?.id||state.id!==activeWorkTaskIdRef.current)return;
      syncWorkTaskAgentChats(state);
      setWorkTask(state);
    });
    const offCommand=window.desktopApi.onAppCommand?.(command=>{
      if(command==='new-chat')newChat();
      if(command==='about'){stopActiveWorkTask();setSettingsSection('General');setMobileSettingsList(true);setSettingsOpen(true)}
      if(command==='open-browser')openBrowser();
      if(command==='open-computer'){setSettingsOpen(false);setSidePanel(null);setProduct('free');setMode('work');setPage('chat')}
      if(command==='toggle-sidebar')setSidebarOpen(v=>!v);
    });
    window.desktopApi.configureRelay(settings).then(s=>active&&setStatus(s)).catch(()=>{});
    window.desktopApi.scanProviders().catch(()=>{});
    window.desktopApi.listMcpConnections?.().then(items=>active&&setMcpConnections(Array.isArray(items)?items:[])).catch(()=>{});
    return()=>{active=false;offStatus?.();offWork?.();offCommand?.()};
  },[]);

  useEffect(()=>{
    if(isDesktop)return;
    const offlineStatus={
      extension:false,
      relay:false,
      desktopOnline:false,
      browserExtension:{connected:false,tabCount:0},
      remoteCapabilities:{browser:{available:false},computer:{available:false}},
      providers:[]
    };
    if(!settings.relayUrl||!settings.pairKey){setStatus(offlineStatus);return}
    let stopped=false,socket=null,retry=null;
    const connect=()=>{
      if(stopped)return;
      try{socket=new WebSocket(settings.relayUrl)}catch{retry=setTimeout(connect,3000);return}
      socket.onopen=()=>{
        setStatus(current=>({...current,relay:true,desktopOnline:false}));
        socket.send(JSON.stringify({type:'hello',role:'mobile',key:settings.pairKey}));
      };
      socket.onmessage=event=>{
        let m;try{m=JSON.parse(event.data)}catch{return}
        if(m.type==='ready'){
          const readyStatus=m.providerStatus&&typeof m.providerStatus==='object'
            ? {...m.providerStatus,relay:true,desktopOnline:m.desktopOnline===true}
            : {...offlineStatus,relay:true,desktopOnline:m.desktopOnline===true};
          setStatus(readyStatus);
          socket.send(JSON.stringify({type:'getProviderStatus'}));
        }
        if(m.type==='providerStatus')setStatus({
          ...offlineStatus,
          ...m,
          relay:true,
          desktopOnline:m.desktopOnline===true,
          providers:Array.isArray(m.providers)?m.providers:[]
        });
      };
      socket.onclose=()=>{setStatus(offlineStatus);if(!stopped)retry=setTimeout(connect,3000)};
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
    const fresh=selected?connected.find(p=>p.id===selected.id&&p.source===selected.source):null;
    if(fresh){
      if(fresh!==selected)setSelected(fresh);
      return;
    }
    if(product==='super'){
      const automatic=connected.find(model=>model.connected!==false&&model.adapterReady!==false)
        ||connected.find(model=>model.connected!==false)
        ||null;
      if(automatic){setSelected(automatic);setSelectedTool(null);setParallelCount(1);return}
    }
    if(selected){setSelected(null);setSelectedTool(null);setParallelCount(1)}
  },[connected,product]);

  useEffect(()=>{
    if(!selected||selected.source!=='browser'){setParallelCount(1);return}
    const count=connected.filter(model=>model.connected!==false&&modelGroupKey(model)===modelGroupKey(selected)).length;
    setParallelCount(current=>Math.max(1,Math.min(Number(current)||1,Math.max(1,count))));
  },[connected,selected?.id,selected?.source,selected?.modelName]);

  useEffect(()=>{
    setSuperTeamKeys(current=>{
      const primary=modelKey(selected);
      const eligible=connected.filter(model=>model.connected!==false&&modelKey(model)!==primary).map(modelKey);
      const retained=(Array.isArray(current)?current:[]).filter(key=>key!==primary&&eligible.includes(key));
      const next=product==='super'?eligible:retained;
      localStorage.setItem('freeai.super.team',JSON.stringify(next));
      return next;
    });
  },[connected,selected?.id,selected?.source,product]);

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
      if(deleteChatTarget){setDeleteChatTarget(null);return}
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
  },[deleteChatTarget,projectDialogOpen,profileMenu,responseMenuIndex,chatMenuId,recentsFilterOpen,modelMenu,effortMenu,plusMenu,productMenu,mobileModeMenu,mobileNavOpen,settingsOpen,sidePanel]);

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
    if(!messages.length)return;
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
    if(!isWindowsDesktop||!window.desktopApi?.onPromptActivity)return;
    return window.desktopApi.onPromptActivity(event=>{
      if(!event?.id||event.id!==activeRequestRef.current)return;
      const activity=String(event.text||'').trim();
      if(!activity)return;
      setMessages(prev=>prev.map(message=>{
        if(message.requestId!==event.id)return message;
        const history=Array.isArray(message.activityHistory)?message.activityHistory:[];
        const nextHistory=history.at(-1)===activity?history:[...history,activity].slice(-8);
        return {...message,activity,activityHistory:nextHistory,streaming:true};
      }));
    });
  },[]);

  useEffect(()=>{
    if(!workTask||!['completed','failed','stopped'].includes(workTask.status))return;
    const terminalKey=workTask.id+':'+workTask.status;
    if(handledWorkTerminalRef.current===terminalKey)return;
    handledWorkTerminalRef.current=terminalKey;
    if(activeWorkTaskIdRef.current===workTask.id)activeWorkTaskIdRef.current=null;
    syncWorkTaskAgentChats(workTask);
    if(workTask.status==='stopped')return;
    const taskModel=workTaskModelRef.current||selected;
    if(!taskModel)return;
    const masterChatId=workTask.masterChatId||workTaskMasterChatIdRef.current||currentChatId;
    const projectId=workTask.projectId||workTaskProjectIdRef.current||activeProjectId||null;
    const masterRecord=chats.find(chat=>chat.id===masterChatId)||null;
    const baseMessages=Array.isArray(masterRecord?.messages)
      ? masterRecord.messages
      : (currentChatId===masterChatId?messages:[]);
    const entry=workTask.status==='completed'
      ? {role:'assistant',text:String(workTask.finalMessage||'Task completed.'),provider:taskModel.id,masterResult:true}
      : {role:'error',text:String(workTask.error||'Work task failed.'),masterResult:true};
    const next=[...baseMessages,entry];
    saveCurrentChat(next,taskModel,{
      chatId:masterChatId||undefined,
      projectId,
      mode:'work',
      meta:workTask.product==='super'?{
        isMasterThread:true,
        orchestration:true,
        taskId:workTask.id,
        agentCount:Array.isArray(workTask.agents)?workTask.agents.length:0
      }:{}
    });
    if(!masterChatId||currentChatId===masterChatId)setMessages(next);
  },[workTask?.id,workTask?.status]);

  useEffect(()=>{
    if(product==='super'&&workTask?.workspace?.name){
      setRepositoryWorkspace(current=>current?.root?{...current,...workTask.workspace}:current);
    }
  },[product,workTask?.workspace?.name,workTask?.workspace?.branch,workTask?.workspace?.head,workTask?.workspace?.dirty]);

  const activeProject=useMemo(()=>projects.find(project=>project.id===activeProjectId)||null,[projects,activeProjectId]);
  const currentChatRecord=useMemo(()=>chats.find(chat=>chat.id===currentChatId)||null,[chats,currentChatId]);
  const projectChats=useMemo(()=>activeProjectId
    ? chats.filter(chat=>chat.projectId===activeProjectId).sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0))
    : [],[chats,activeProjectId]);
  const visibleProjects=useMemo(()=>projects.filter(project=>(project.product||'free')===product),[projects,product]);

  useEffect(()=>{
    if(product!=='super'||!currentChatRecord?.isAgentThread||currentChatRecord.detachedFromTask)return;
    setMessages(Array.isArray(currentChatRecord.messages)?currentChatRecord.messages:[]);
  },[product,currentChatRecord?.id,currentChatRecord?.updatedAt,currentChatRecord?.detachedFromTask]);

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
  async function chooseLocalFolderWorkspace(){
    if(!isWindowsDesktop||workBusy)return;
    stopActiveWorkTask();
    setMode('work');setPage('chat');setMobileNavOpen(false);
    setAttachmentError('');
    try{
      const folder=await window.desktopApi.chooseLocalFolder();
      if(folder)setLocalFolderWorkspace(folder);
    }catch(error){
      setAttachmentError(error?.message||'Could not open local folder.');
    }
  }
  function clearLocalFolderWorkspace(){
    if(workBusy)return;
    setLocalFolderWorkspace(null);
  }
  function persistProjects(next){setProjects(next);localStorage.setItem('freeai.projects',JSON.stringify(next))}
  function orchestrationProjectTitle(text){
    const value=String(text||'').replace(/\s+/g,' ').trim();
    if(!value)return 'Super AI task';
    return value.length>56?value.slice(0,56)+'…':value;
  }
  function ensureOrchestrationProject(taskText,teamCount){
    if(activeProject&&activeProject.product==='super'){
      workTaskProjectIdRef.current=activeProject.id;
      return activeProject.id;
    }
    const project={
      id:crypto.randomUUID(),
      name:orchestrationProjectTitle(taskText),
      icon:'sparkles',
      color:'purple',
      instructions:'',
      product:'super',
      kind:'orchestration',
      agentCount:Number(teamCount)||0,
      createdAt:Date.now(),
      updatedAt:Date.now()
    };
    setProjects(prev=>{
      const next=[project,...prev];
      localStorage.setItem('freeai.projects',JSON.stringify(next));
      return next;
    });
    setActiveProjectId(project.id);
    workTaskProjectIdRef.current=project.id;
    return project.id;
  }
  function syncWorkTaskAgentChats(state){
    if(!state||state.product!=='super'||!Array.isArray(state.agents))return;
    const projectId=state.projectId||workTaskProjectIdRef.current;
    const masterChatId=state.masterChatId||workTaskMasterChatIdRef.current;
    if(!projectId||!masterChatId)return;
    const now=Date.now();
    const agentChats=state.agents.filter(agent=>!agent.controller).map(agent=>{
      const thread=Array.isArray(agent.thread)?agent.thread.map(message=>({
        role:message.role==='assistant'?'assistant':'user',
        text:String(message.text||''),
        phase:message.phase||'',
        at:message.at||0
      })):[];
      const latestAt=thread.reduce((max,message)=>Math.max(max,Number(message.at)||0),0);
      return {
        id:'agent:'+state.id+':'+agent.id,
        title:(agent.modelName||agent.name||'Agent')+' · '+(agent.role||'Agent'),
        providerId:agent.providerId||'',
        source:agent.source||'browser',
        modelName:agent.modelName||agent.name||'Agent',
        messages:thread,
        mode:'chat',
        pinned:false,
        projectId,
        parentChatId:masterChatId,
        isAgentThread:true,
        agentId:agent.id,
        agentRole:agent.role||'Agent',
        agentStatus:agent.status||'idle',
        agentDetail:agent.detail||'',
        taskId:state.id,
        superTeamKeys:[],
        updatedAt:latestAt||now
      };
    });
    const storageKey='freeai.chats.super';
    setChats(prev=>{
      const viewingSuper=localStorage.getItem('freeai.product')==='super';
      const base=viewingSuper?prev:readJSON(storageKey,[]);
      const incomingIds=new Set(agentChats.map(chat=>chat.id));
      const existingById=new Map(base.map(chat=>[chat.id,chat]));
      const merged=agentChats.map(chat=>{
        const existing=existingById.get(chat.id);
        if(existing?.detachedFromTask)return existing;
        return {...existing,...chat,pinned:!!existing?.pinned};
      });
      const next=[
        ...merged,
        ...base.filter(chat=>!incomingIds.has(chat.id))
      ].sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)).slice(0,120);
      localStorage.setItem(storageKey,JSON.stringify(next));
      return viewingSuper?next:prev;
    });
  }
  function createProject(){
    stopActiveWorkTask();
    const name=String(projectDraft.name||'').trim();
    if(!name)return;
    const project={id:crypto.randomUUID(),name,icon:projectDraft.icon||'folder',color:projectDraft.color||'blue',instructions:'',product,kind:product==='super'?'orchestration':'standard',createdAt:Date.now(),updatedAt:Date.now()};
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
  function openProject(project){
    const sameLiveProject=!!activeWorkTaskIdRef.current&&workTaskProjectIdRef.current===project.id;
    if(!sameLiveProject)stopActiveWorkTask();
    setLocalFolderWorkspace(null);setActiveProjectId(project.id);setPage('project');setChatMenuId(null);setMobileNavOpen(false);
  }
  async function refreshProviderModels(){
    if(!isWindowsDesktop||!isDesktop)return;
    setAttachmentError('');
    try{await window.desktopApi.scanProviders({probeModels:true})}
    catch(error){setAttachmentError(error?.message||String(error))}
  }
  async function selectProviderModelOption(modelName){
    if(!isWindowsDesktop||!isDesktop||selected?.source!=='browser')return;
    setAttachmentError('');
    try{
      await window.desktopApi.setProviderModel(selected.id,modelName);
      await window.desktopApi.scanProviders({probeModels:true});
    }catch(error){setAttachmentError(error?.message||String(error))}
  }
  async function selectProviderEffortOption(nextEffort){
    if(!isWindowsDesktop||!isDesktop||selected?.source!=='browser'){setEffort(nextEffort);return}
    setAttachmentError('');
    try{
      await window.desktopApi.setProviderEffort(selected.id,nextEffort);
      setEffort(nextEffort);
      await window.desktopApi.scanProviders({probeModels:true});
    }catch(error){setAttachmentError(error?.message||String(error))}
  }
  function openPluginsPage(){
    stopActiveWorkTask();setPlusMenu(false);setPage('plugins');setMobileNavOpen(false);
    if(isWindowsDesktop&&isDesktop)window.desktopApi?.scanProviders?.({probeTools:true}).catch(()=>{});
  }
  function startProjectConversation(projectId,nextMode){
    stopActiveWorkTask();
    setActiveProjectId(projectId);setCurrentChatId(null);setMessages([]);setPrompt('');setSelectedTool(null);setLocalFolderWorkspace(null);
    setMode(nextMode);setModelMenu(false);setPlusMenu(false);setPage('chat');setSidePanel(null);setMobileNavOpen(false);
  }
  function saveCurrentChat(nextMessages,model=selected,options={}){
    if(!model||!nextMessages.length)return null;
    const firstUser=nextMessages.find(m=>m.role==='user')?.text||'New chat';
    const defaultTitle=firstUser.length>46?firstUser.slice(0,46)+'…':firstUser;
    const id=options.chatId||currentChatId||crypto.randomUUID();
    if(!options.chatId&&!currentChatId&&options.setCurrent!==false)setCurrentChatId(id);
    setChats(prev=>{
      const existing=prev.find(c=>c.id===id);
      const metadata=options.meta&&typeof options.meta==='object'?options.meta:{};
      const chat={
        ...existing,
        id,
        title:options.title||existing?.title||defaultTitle,
        providerId:model.id,
        source:model.source,
        modelName:modelLabel(model),
        messages:nextMessages,
        mode:options.mode||existing?.mode||(product==='super'?'work':mode),
        pinned:!!existing?.pinned,
        projectId:options.projectId!==undefined?options.projectId:(existing?.projectId||activeProjectId||null),
        workspace:product==='super'&&repositoryWorkspace?repositoryWorkspace:(existing?.workspace||null),
        localFolder:mode==='work'&&localFolderWorkspace?localFolderWorkspace:(existing?.localFolder||null),
        superTeamKeys:product==='super'&&!metadata.isAgentThread?superTeamKeys:(existing?.superTeamKeys||[]),
        ...metadata,
        updatedAt:Date.now()
      };
      const limit=product==='super'?120:60;
      const next=[chat,...prev.filter(c=>c.id!==id)].slice(0,limit);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));
      return next;
    });
    return id;
  }
  function togglePinChat(id){
    setChats(prev=>{
      const next=prev.map(chat=>chat.id===id?{...chat,pinned:!chat.pinned}:chat);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));
      return next;
    });
    setChatMenuId(null);
  }
  async function exportChat(chat){
    setChatMenuId(null);
    const content=chatExportMarkdown(chat);
    const defaultName=safeExportFileName(chat?.title);
    if(isDesktop&&window.desktopApi?.saveTextFile){
      try{await window.desktopApi.saveTextFile({defaultName,content});return}catch(error){console.error('Chat export failed',error)}
    }
    const blob=new Blob([content],{type:'text/markdown;charset=utf-8'});
    const href=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=href;a.download=defaultName;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1500);
  }
  function askDeleteChat(chat){
    setChatMenuId(null);
    setDeleteChatTarget(chat);
  }
  function deleteChat(chat){
    const id=String(chat?.id||'');
    if(!id)return;
    if(activeWorkTaskIdRef.current&&chat?.taskId===activeWorkTaskIdRef.current)stopActiveWorkTask();
    setChats(prev=>{
      const next=prev.filter(item=>item.id!==id);
      localStorage.setItem('freeai.chats.'+product,JSON.stringify(next));
      return next;
    });
    if(currentChatId===id){
      setCurrentChatId(null);setMessages([]);setPrompt('');setSelectedTool(null);
      if(chat?.isMasterThread||chat?.isAgentThread)setPage('chat');
    }
    setDeleteChatTarget(null);
  }
  function selectProduct(nextProduct){
    stopActiveWorkTask();
    setSelectedMcpIds([]);
    setLocalFolderWorkspace(null);
    setWebSearchEnabled(false);setDeepResearchEnabled(false);
    setProductMenu(false);
    if(nextProduct===product)return;
    setProduct(nextProduct);
    setMode(nextProduct==='super'?'work':'chat');
  }
  function selectExperience(nextMode){
    if(product!=='free'||nextMode===mode)return;
    stopActiveWorkTask();
    const hasThread=!!currentChatId||messages.length>0;
    setMode(nextMode);setModelMenu(false);setPlusMenu(false);setWebSearchEnabled(false);setDeepResearchEnabled(false);setSelectedTool(null);setSelectedMcpIds([]);setLocalFolderWorkspace(null);setPage('chat');
    if(hasThread){setCurrentChatId(null);setMessages([]);setPrompt('')}
  }
  function newChat(){
    stopActiveWorkTask();
    setActiveProjectId(null);setCurrentChatId(null);setMessages([]);setPrompt('');setWebSearchEnabled(false);setDeepResearchEnabled(false);setSelectedTool(null);setSelectedMcpIds([]);setLocalFolderWorkspace(null);
    setAttachments(current=>{for(const item of current)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);return []});setAttachmentError('');setSelectedFile(null);
    setModelMenu(false);setPlusMenu(false);setPage('chat');setSidePanel(null);setMobileNavOpen(false);
  }
  function openChat(chat){
    const sameLiveTask=!!activeWorkTaskIdRef.current&&chat?.taskId===activeWorkTaskIdRef.current;
    if(!sameLiveTask)stopActiveWorkTask();
    setAttachments(current=>{for(const item of current)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);return []});setAttachmentError('');setSelectedFile(null);
    setCurrentChatId(chat.id);setMessages(Array.isArray(chat.messages)?chat.messages:[]);
    setSelected(connected.find(p=>p.id===chat.providerId&&p.source===chat.source)||null);
    if(product==='free')setMode(chat.mode||'chat');
    if(product==='super'){
      setRepositoryWorkspace(chat.workspace||null);
      setSuperTeamKeys(chat.isAgentThread?[]:(Array.isArray(chat.superTeamKeys)?chat.superTeamKeys:[]));
      setMode(chat.isAgentThread?'chat':'work');
    }
    setLocalFolderWorkspace((chat.mode==='work'||(product==='super'&&!chat.isAgentThread))?(chat.localFolder||null):null);
    setActiveProjectId(chat.projectId||null);setSelectedTool(null);setSelectedMcpIds([]);setPage('chat');setChatMenuId(null);
  }
  const workBusy=isWindowsDesktop&&mode==='work'&&!!workTask&&['running','waiting_approval'].includes(workTask.status);

  async function runWorkGeneration(text){
    const userText=String(text||'').trim();
    if((!userText&&!attachments.length)||workBusy)return;
    if(!selected){
      if(product==='super'){
        setAttachmentError('Super AI needs at least one connected AI tab or API model. Open one and the team will be assembled automatically.');
        window.desktopApi?.scanProviders?.({probeModels:true}).catch(()=>{});
      }else setModelMenu(true);
      return;
    }
    if(selectedTool){
      setAttachmentError('That item is only a provider-managed connector hint, not a verified direct MCP app. Remove it and select a Direct MCP app from Add → Direct MCP apps.');
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
    const teamModels=product==='super'
      ? connected.filter(model=>model.connected!==false&&model.adapterReady!==false&&modelKey(model)!==modelKey(selected))
      : [];
    const team=teamModels.map(model=>({
      id:model.id,
      source:model.source||'browser',
      name:modelLabel(model)
    }));

    const taskId=crypto.randomUUID();
    let projectId=activeProjectId||null;
    let masterChatId=currentChatId||null;
    const currentRecord=chats.find(chat=>chat.id===currentChatId)||null;

    if(product==='super'&&team.length>0){
      projectId=ensureOrchestrationProject(taskText,team.length+1);
      if(!masterChatId||currentRecord?.isAgentThread||currentRecord?.projectId!==projectId){
        masterChatId=crypto.randomUUID();
        setCurrentChatId(masterChatId);
      }
      workTaskProjectIdRef.current=projectId;
      workTaskMasterChatIdRef.current=masterChatId;
      setPage('chat');
    }else{
      workTaskProjectIdRef.current=projectId;
      workTaskMasterChatIdRef.current=masterChatId;
    }

    const userMessage={role:'user',text:userText,attachments:attachments.map(attachmentMeta),attachmentContext:inlineParts.join('\n\n')};
    const next=[...messages,userMessage];
    setMessages(next);
    const savedMasterId=saveCurrentChat(next,selected,{
      chatId:masterChatId||undefined,
      projectId,
      mode:'work',
      meta:product==='super'&&team.length>0
        ? {isMasterThread:true,orchestration:true,taskId,agentCount:team.length+1}
        : {}
    });
    if(!masterChatId&&savedMasterId){
      masterChatId=savedMasterId;
      workTaskMasterChatIdRef.current=savedMasterId;
    }

    setPrompt('');
    handledWorkTerminalRef.current=null;
    activeWorkTaskIdRef.current=taskId;
    workTaskModelRef.current=selected;
    setWorkTask({
      id:taskId,
      product,
      projectId:projectId||'',
      masterChatId:masterChatId||'',
      status:'running',
      step:0,
      maxSteps:product==='super'?24:18,
      detail:product==='super'?'Starting Super AI task…':'Starting Work task…',
      approval:null,
      progress:[],
      agents:[],
      workspace:product==='super'?repositoryWorkspace:null,
      folder:localFolderWorkspace?{name:localFolderWorkspace.name}:null,
      finalMessage:'',
      error:''
    });

    try{
      const projectForTask=projects.find(project=>project.id===projectId)||activeProject;
      const projectInstructions=projectForTask?String(projectForTask.instructions||'').trim():'';
      const globalInstructions=appPrefs.customizationEnabled?String(appPrefs.customInstructions||'').trim():'';
      let workspace=repositoryWorkspace;
      if(product==='super'&&workspace?.root){
        workspace=await window.desktopApi.repositorySummary(workspace.root);
        setRepositoryWorkspace(workspace);
      }
      let localFolder=localFolderWorkspace;
      if(localFolder?.root){
        localFolder=await window.desktopApi.localFolderSummary(localFolder.root);
        setLocalFolderWorkspace(localFolder);
      }

      const state=await window.desktopApi.startWorkTask({
        id:taskId,
        provider:selected.id,
        source:selected.source||'browser',
        product,
        projectId:projectId||'',
        masterChatId:masterChatId||'',
        text:finalUserText,
        effort,
        approvalMode:normalizeApprovalMode(appPrefs.approvalMode),
        attachments:outbound,
        workspace:product==='super'?workspace:null,
        localFolder,
        team,
        mcpConnectionIds:selectedMcpIds,
        instructions:projectInstructions||globalInstructions,
        history:messages.slice(-12).filter(message=>message?.role==='user'||message?.role==='assistant').map(message=>({
          role:message.role,
          text:String(message.text||'').slice(0,5000)
        }))
      });
      if(activeWorkTaskIdRef.current===taskId){
        syncWorkTaskAgentChats(state);
        setWorkTask(state);
      }
      for(const item of attachments)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);
      setAttachments([]);setSelectedMcpIds([]);setSelectedFile(null);setSidePanel(current=>current==='file'?null:current);
    }catch(e){
      if(activeWorkTaskIdRef.current===taskId)activeWorkTaskIdRef.current=null;
      setWorkTask(null);
      const failed=[...next,{role:'error',text:e?.message||String(e)}];
      setMessages(failed);
      saveCurrentChat(failed,selected,{
        chatId:masterChatId||undefined,
        projectId,
        mode:'work',
        meta:product==='super'&&team.length>0
          ? {isMasterThread:true,orchestration:true,taskId,agentCount:team.length+1}
          : {}
      });
    }
  }

  async function runParallelGeneration(text,researchConfigOverride=null){
    const userText=String(text||'').trim();
    if(!isWindowsDesktop||!isDesktop||busy||!selected||!userText)return runGeneration(text,messages,selected);
    const groupKey=modelGroupKey(selected);
    const siblings=connected.filter(model=>model.connected!==false&&model.source==='browser'&&modelGroupKey(model)===groupKey);
    const ordered=[selected,...siblings.filter(model=>model.id!==selected.id)];
    const targets=ordered.slice(0,Math.max(1,Math.min(Number(parallelCount)||1,ordered.length)));
    if(targets.length<=1)return runGeneration(text,messages,selected);

    const activeAttachments=attachments;
    const allCanUpload=targets.every(model=>model.fileUpload===true);
    const inlineTextParts=[];
    if(!allCanUpload){
      for(const item of activeAttachments){
        if(item.kind==='text'&&item.content)inlineTextParts.push('[File: '+item.name+']\n'+item.content);
        else{
          setAttachmentError('Parallel model mode requires every selected browser tab to expose file upload for binary attachments. Use text files, reduce the instance count, or open file upload in every matching tab.');
          return;
        }
      }
    }

    setAttachmentError('');
    setBusy(true);setPrompt('');setResponseMenuIndex(null);
    parallelCancelledRef.current=false;
    const userAttachmentMeta=activeAttachments.map(attachmentMeta);
    const attachmentContext=inlineTextParts.join('\n\n');
    const withUser=[...messages,{role:'user',text:userText,attachments:userAttachmentMeta,attachmentContext}];
    setMessages(withUser);saveCurrentChat(withUser,selected);

    try{
      const projectInstructions=activeProject?String(activeProject.instructions||'').trim():'';
      const globalInstructions=appPrefs.customizationEnabled?String(appPrefs.customInstructions||'').trim():'';
      const instructions=projectInstructions||globalInstructions;
      const instructionsLabel=projectInstructions?'Free AI project instructions for this request:':'Free AI user preferences for this request:';
      const userRequestText=attachmentContext?[userText,'',attachmentContext].join('\n'):userText;
      const researchPlanText=researchConfigOverride?.plan?.length
        ? ['User-reviewed research plan:',...researchConfigOverride.plan.map((step,index)=>(index+1)+'. '+step)].join('\n')
        : '';
      const routedText=[instructions?[instructionsLabel,instructions].join('\n'):'',researchPlanText,userRequestText].filter(Boolean).join('\n\n');
      const historyMessages=withUser.filter(message=>message.role==='user'||message.role==='assistant');
      const lastUserIndex=historyMessages.map(message=>message.role).lastIndexOf('user');
      const history=historyMessages.map((message,index)=>{
        const priorAttachmentContext=message.role==='user'?String(message.attachmentContext||''):'';
        const priorText=priorAttachmentContext?[String(message.text||''),'',priorAttachmentContext].join('\n'):String(message.text||'');
        return {role:message.role,content:index===lastUserIndex?routedText:priorText};
      });
      const outboundAttachments=allCanUpload
        ? await Promise.all(activeAttachments.map(async item=>({
            name:item.name,type:item.type,size:item.size,dataUrl:await readFileDataUrl(item.file)
          })))
        : [];
      const requestIds=targets.map(()=>crypto.randomUUID());
      activeParallelRequestIdsRef.current=requestIds;
      const settled=await Promise.allSettled(targets.map((model,index)=>{
        const effortLevels=Array.isArray(model.effortLevels)?model.effortLevels.filter(Boolean):[];
        const routedEffort=model.effortControl==='native'&&effortLevels.includes(effort)?effort:'default';
        return window.desktopApi.sendPrompt({
          requestId:requestIds[index],
          provider:model.id,
          source:model.source||'browser',
          text:routedText,
          history,
          effort:routedEffort,
          attachments:outboundAttachments,
          mode,product,approvalMode:'ask',
          nativeTool:deepResearchEnabled?'deep-research':webSearchEnabled?'search':null,
          researchConfig:researchConfigOverride||undefined,
          toolRequest:selectedTool?{mcp:selectedTool.mcp,ownerProviderId:selectedTool.ownerProviderId}:null
        });
      }));
      if(parallelCancelledRef.current)return;
      const responses=settled.map((result,index)=>{
        const model=targets[index];
        const meta={provider:model.id,providerLabel:modelLabel(model)+' · Tab '+(model.tabId||'?'),parallel:true};
        if(result.status==='fulfilled')return {role:'assistant',text:String(result.value?.text??result.value??''),sources:Array.isArray(result.value?.sources)?result.value.sources.slice(0,12):[],webSearch:webSearchEnabled,deepResearch:deepResearchEnabled,researchCompleted:deepResearchEnabled,research:deepResearchEnabled?{status:'complete',mode:'provider-native',plan:researchConfigOverride?.plan||DEFAULT_RESEARCH_PLAN,sourceScope:{mode:'provider-managed'}}:null,...meta};
        return {role:'error',text:result.reason?.message||String(result.reason||'Parallel model request failed.'),...meta};
      });
      const next=[...withUser,...responses];
      setMessages(next);saveCurrentChat(next,selected);
      for(const item of activeAttachments)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);
      setAttachments([]);setSelectedFile(null);setSidePanel(current=>current==='file'?null:current);
    }finally{
      activeParallelRequestIdsRef.current=[];
      setBusy(false);
    }
  }

  async function runGeneration(text,baseMessages=messages,model=selected,retryContext=null,researchConfigOverride=null){
    const userText=String(text||'').trim();
    const chatAttachmentPlatform=isWindowsDesktop||isAndroidNative;
    const hasAttachmentIntent=chatAttachmentPlatform&&(
      (!retryContext&&attachments.length>0)||
      (retryContext&&(Array.isArray(retryContext.attachments)&&retryContext.attachments.length>0||String(retryContext.attachmentContext||'').trim()))
    );
    if((!userText&&!hasAttachmentIntent)||busy)return;
    if(!model){setModelMenu(true);return}
    const nativeSearch=isWindowsDesktop&&mode==='chat'&&webSearchEnabled;
    const nativeDeepResearch=isWindowsDesktop&&mode==='chat'&&deepResearchEnabled;
    const ownedResearch=nativeDeepResearch&&model.source==='api'&&researchConfigOverride?.owned===true;
    if(nativeSearch&&model.source!=='browser'){
      setAttachmentError('Web Search currently requires a connected browser AI with its live Search tool available.');
      return;
    }
    if(nativeDeepResearch&&model.source==='api'&&!ownedResearch){
      setAttachmentError('Independent Deep Research for API models requires a reviewed research plan and a configured SearXNG Search API.');
      return;
    }
    const activeAttachments=chatAttachmentPlatform&&!retryContext?attachments:[];
    const retryAttachmentContext=String(retryContext?.attachmentContext||'');
    const retryAttachmentMeta=Array.isArray(retryContext?.attachments)?retryContext.attachments:[];
    const canUploadFiles=chatAttachmentPlatform&&model.source==='browser'&&model.fileUpload===true;
    const inlineTextParts=[];
    if(chatAttachmentPlatform){
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
    const requestId=((isWindowsDesktop&&isDesktop)||isAndroidNative)?crypto.randomUUID():null;
    streamedTextRef.current='';
    cancelledRequestRef.current=null;
    activeRequestRef.current=requestId;
    const initial=requestId?[...withUser,{role:'assistant',text:'',provider:model.id,requestId,streaming:true,activity:nativeDeepResearch?'Preparing deep research…':nativeSearch?'Searching the web…':'',activityHistory:nativeDeepResearch?['Preparing deep research…']:[]}]:withUser;
    const currentChatMeta=chats.find(chat=>chat.id===currentChatId)||null;
    const directAgentMeta=currentChatMeta?.isAgentThread
      ? {isAgentThread:true,parentChatId:currentChatMeta.parentChatId,agentId:currentChatMeta.agentId,agentRole:currentChatMeta.agentRole,taskId:currentChatMeta.taskId,detachedFromTask:true}
      : {};
    setMessages(initial);saveCurrentChat(withUser,model,{mode:currentChatMeta?.isAgentThread?'chat':undefined,meta:directAgentMeta});
    try{
      const projectInstructions=activeProject?String(activeProject.instructions||'').trim():'';
      const globalInstructions=appPrefs.customizationEnabled?String(appPrefs.customInstructions||'').trim():'';
      const instructions=projectInstructions||globalInstructions;
      const instructionsLabel=projectInstructions?'Free AI project instructions for this request:':'Free AI user preferences for this request:';
      const userRequestText=attachmentContext?[userText,'',attachmentContext].join('\n'):userText;
      const researchPlanText=researchConfigOverride?.plan?.length
        ? ['User-reviewed research plan:',...researchConfigOverride.plan.map((step,index)=>(index+1)+'. '+step)].join('\n')
        : '';
      const routedText=[instructions?[instructionsLabel,instructions].join('\n'):'',researchPlanText,userRequestText].filter(Boolean).join('\n\n');
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
      const outboundAttachments=chatAttachmentPlatform&&canUploadFiles&&!retryContext
        ? await Promise.all(activeAttachments.map(async item=>({
            name:item.name,type:item.type,size:item.size,dataUrl:await readFileDataUrl(item.file)
          })))
        : [];
      const payload={
        requestId,provider:model.id,source:model.source||'browser',text:routedText,history:chatAttachmentPlatform?history:undefined,effort:routedEffort,
        attachments:outboundAttachments,
        mode,product,approvalMode:mode==='work'?appPrefs.approvalMode:'ask',
        nativeTool:nativeDeepResearch&&model.source==='browser'?'deep-research':nativeSearch?'search':null,
        researchConfig:ownedResearch?researchConfigOverride:undefined,
        toolRequest:selectedTool?{mcp:selectedTool.mcp,ownerProviderId:selectedTool.ownerProviderId}:null
      };
      const result=isDesktop
        ? await window.desktopApi.sendPrompt(payload)
        : await sendRemote(settings.relayUrl,settings.pairKey,payload,{
            onStream:text=>{
              if(!requestId||requestId!==activeRequestRef.current)return;
              streamedTextRef.current=String(text||'');
              setMessages(prev=>prev.map(message=>message.requestId===requestId?{...message,text:streamedTextRef.current,streaming:true}:message));
            },
            onControl:control=>{
              if(requestId&&requestId===activeRequestRef.current)activeRemoteRequestRef.current=control;
            }
          });
      const finalText=String(result?.text??streamedTextRef.current??(typeof result==='string'?result:''));
      const resultSources=Array.isArray(result?.sources)?result.sources.filter(item=>item?.url).slice(0,12).map(item=>({
        title:String(item.title||''),url:String(item.url||''),domain:String(item.domain||''),
        retrievedAt:String(item.retrievedAt||''),excerpt:String(item.excerpt||'')
      })):[];
      const researchMeta=nativeDeepResearch
        ? (result?.research||{status:'complete',mode:'provider-native',title:userText.slice(0,96)||'Research report',plan:researchConfigOverride?.plan||DEFAULT_RESEARCH_PLAN,sourceScope:{mode:'provider-managed'},completedAt:new Date().toISOString()})
        : null;
      const next=[...withUser,{role:'assistant',text:finalText,provider:model.id,webSearch:nativeSearch,deepResearch:nativeDeepResearch,sources:resultSources,researchCompleted:nativeDeepResearch,research:researchMeta}];
      setMessages(next);saveCurrentChat(next,model);
      if(chatAttachmentPlatform&&!retryContext){
        for(const item of activeAttachments)if(String(item.url||'').startsWith('blob:'))URL.revokeObjectURL(item.url);
        setAttachments([]);setSelectedFile(null);setSidePanel(current=>current==='file'?null:current)
      }
    }catch(e){
      if(requestId&&cancelledRequestRef.current===requestId)return;
      const next=[...withUser,{role:'error',text:e?.message||String(e)}];
      setMessages(next);saveCurrentChat(next,model);
    }finally{
      if(activeRequestRef.current===requestId)activeRequestRef.current=null;
      if(activeRemoteRequestRef.current?.id===requestId)activeRemoteRequestRef.current=null;
      setBusy(false);
    }
  }
  function openResearchSetup(){
    const userText=String(prompt||'').trim();
    if(!deepResearchEnabled||busy||!selected||(!userText&&attachments.length===0))return;
    setPendingResearch({text:prompt,baseMessages:messages,model:selected});
    setResearchSetupOpen(true);
  }
  async function startReviewedResearch(config){
    const pending=pendingResearch;
    if(!pending)return;
    setResearchSetupOpen(false);
    setPendingResearch(null);
    if(config?.owned&&config?.searchBackend?.url){
      persistPrefs({...appPrefs,researchSearchUrl:String(config.searchBackend.url).trim()});
    }
    if(pending.model?.source==='browser'&&parallelCount>1)return runParallelGeneration(pending.text,config);
    return runGeneration(pending.text,pending.baseMessages,pending.model,null,config);
  }
  async function send(){
    if(isWindowsDesktop&&mode==='work')return runWorkGeneration(prompt);
    if(isWindowsDesktop&&mode==='chat'&&deepResearchEnabled)return openResearchSetup();
    if(isWindowsDesktop&&selected?.source==='browser'&&parallelCount>1)return runParallelGeneration(prompt);
    return runGeneration(prompt,messages,selected);
  }
  async function stopGeneration(){
    if(isWindowsDesktop&&mode==='work'&&workTask&&['running','waiting_approval'].includes(workTask.status)){
      try{await window.desktopApi.stopWorkTask(workTask.id)}catch{}
      return;
    }
    const parallelIds=[...activeParallelRequestIdsRef.current];
    if(parallelIds.length&&isWindowsDesktop&&isDesktop){
      parallelCancelledRef.current=true;
      activeParallelRequestIdsRef.current=[];
      await Promise.allSettled(parallelIds.map(id=>window.desktopApi.cancelPrompt(id)));
      setBusy(false);
      return;
    }
    const requestId=activeRequestRef.current;
    if(!requestId)return;
    cancelledRequestRef.current=requestId;
    if(isAndroidNative){
      try{activeRemoteRequestRef.current?.cancel?.()}catch{}
    }else{
      if(!isWindowsDesktop||!isDesktop)return;
      try{await window.desktopApi.cancelPrompt(requestId)}catch{}
    }
    setMessages(prev=>{
      const next=prev.flatMap(message=>{
        if(message.requestId!==requestId)return [message];
        if(String(message.text||'').trim())return [{...message,streaming:false,stopped:true,requestId:undefined}];
        return [];
      });
      queueMicrotask(()=>saveCurrentChat(next,selected));
      return next;
    });
    activeRemoteRequestRef.current=null;
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
  async function openWebSource(url){
    const value=String(url||'');
    if(!/^https:\/\//i.test(value))return;
    try{await window.desktopApi?.openExternal?.(value)}catch{}
  }
  async function exportResearchMessage(message,format){
    if(!isWindowsDesktop||!message?.deepResearch||message?.streaming)return;
    const chat=chats.find(item=>item.id===currentChatId);
    const research=message.research||{};
    try{
      await window.desktopApi?.researchExportReport?.({
        format,
        report:{
          title:research.title||chat?.title||'Research report',
          content:String(message.text||''),
          mode:research.mode||'provider-native',
          plan:Array.isArray(research.plan)?research.plan:[],
          completedAt:research.completedAt||new Date().toISOString(),
          sources:Array.isArray(message.sources)?message.sources:[]
        }
      });
    }catch(error){setAttachmentError(error?.message||String(error))}
  }
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

  function toggleWebSearch(){
    if(!isWindowsDesktop||mode!=='chat')return;
    if(selected?.source==='api'){
      setAttachmentError('Web Search currently uses the selected browser AI\'s live Search tool. Choose a connected browser model first.');
      return;
    }
    setAttachmentError('');
    setSelectedTool(null);
    setDeepResearchEnabled(false);
    setPlusMenu(false);
    setWebSearchEnabled(value=>!value);
  }

  function toggleDeepResearch(){
    if(!isWindowsDesktop||mode!=='chat')return;
    setAttachmentError('');
    setSelectedTool(null);
    setWebSearchEnabled(false);
    setPlusMenu(false);
    setDeepResearchEnabled(value=>!value);
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

  async function openPublicPluginDirectory(){
    try{
      if(isDesktop)await window.desktopApi.openAuthUrl(PUBLIC_PLUGIN_DIRECTORY_URL);
      else if(isNative)await Browser.open({url:PUBLIC_PLUGIN_DIRECTORY_URL,presentationStyle:'popover'});
      else window.open(PUBLIC_PLUGIN_DIRECTORY_URL,'_blank','noopener,noreferrer');
    }catch{}
  }

  async function openHelp(){
    const url='https://github.com/az0512124155azz-sys/free-ai#readme';
    try{
      if(isDesktop)await window.desktopApi.openAuthUrl(url);
      else if(isNative)await Browser.open({url,presentationStyle:'popover'});
      else window.open(url,'_blank','noopener,noreferrer');
    }catch{}
  }

  async function addChatAttachments(files){
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
    if(isWindowsDesktop||isAndroidNative){await addChatAttachments(files);event.target.value='';return}
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
    className={'desktopShell '+(isAndroidNative?'nativeMobileShell ':'')+(!sidebarOpen?'sidebarHidden':'')+' '+(sidePanel?'hasSidePanel':'')+' '+(mobileNavOpen?'mobileNavOpen':'')+' '+(dragActive?'dragActive':'')}
    onDragEnter={isWindowsDesktop?e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();setDragActive(true)}}:undefined}
    onDragOver={isWindowsDesktop?e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';setDragActive(true)}}:undefined}
    onDragLeave={isWindowsDesktop?e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragActive(false)}:undefined}
    onDrop={isWindowsDesktop?async e=>{e.preventDefault();setDragActive(false);await addChatAttachments(e.dataTransfer.files)}:undefined}
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
          <button className={product==='super'&&page==='chat'?'active':''} onClick={()=>{selectProduct('super');setMode('work');setPage('chat');setMobileNavOpen(false)}}><Monitor size={18}/><span>Remote</span></button>
          <button className={page==='plugins'?'active':''} onClick={()=>{selectProduct('free');openPluginsPage()}}><Plug size={18}/><span>Apps</span></button>
          <button className={page==='explore'?'active':''} onClick={()=>{selectProduct('free');stopActiveWorkTask();setPage('explore');setMobileNavOpen(false)}}><Blocks size={18}/><span>Explore</span></button>
        </div>
      </div>

      <nav className="primaryNav desktopPrimaryNav">
        <NavItem icon={SquarePen} label="New chat" active={page==='chat'&&!currentChatId} onClick={newChat}/>
        <NavItem icon={Plug} label="Plugins" active={page==='plugins'} onClick={openPluginsPage}/>
        <NavItem icon={Blocks} label="Explore" active={page==='explore'} onClick={()=>{stopActiveWorkTask();setPage('explore');setMobileNavOpen(false)}}/>
      </nav>
      <div className="sidebarScroll">
        {isWindowsDesktop&&product==='free'?<>
          <div className="sidebarGroupTitle">Projects</div>
          <button className="newProjectItem" onClick={()=>{stopActiveWorkTask();setProjectDraft({name:'',icon:'folder',color:'blue'});setProjectDialogOpen(true)}}>
            <Plus size={15}/><span>New project</span>
          </button>
          {visibleProjects.length===0?<div className="sidebarEmpty projectEmpty">No projects yet</div>:visibleProjects.map(project=>
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
              {chatMenuId===chat.id&&<ChatContextMenu chat={chat} onPin={togglePinChat} onExport={exportChat} onDelete={askDeleteChat}/>}

            </div>
          )}
        </>:<>
          {isWindowsDesktop&&product==='super'&&<>
            <div className="sidebarGroupTitle">Projects</div>
            <button className="newProjectItem" onClick={()=>{stopActiveWorkTask();setProjectDraft({name:'',icon:'sparkles',color:'purple'});setProjectDialogOpen(true)}}>
              <Plus size={15}/><span>New project</span>
            </button>
            {visibleProjects.length===0
              ? <div className="sidebarEmpty projectEmpty">Multi-agent tasks create projects automatically</div>
              : visibleProjects.map(project=><button key={project.id} className={'projectItem projectNavItem '+(activeProjectId===project.id?'active':'')} onClick={()=>openProject(project)}>
                  <ProjectMark project={project} size={18}/><span>{project.name}</span>
                </button>)
            }
          </>}
          <div className="sidebarGroupTitle">{product==='super'?'Coding':'Projects'}</div>
          <button className="projectItem" onClick={()=>{if(product==='super')chooseRepositoryWorkspace();else{stopActiveWorkTask();setMode('work');setPage('chat');setMobileNavOpen(false)}}}>
            {product==='super'?<GitBranch size={15}/>:<Folder size={15}/>}
            {product==='super'?(repositoryWorkspace?.name||'Choose repository'):'Free AI Workspace'}
          </button>
          <div className="sidebarGroupTitle">Recents</div>
          {visibleChats.length===0?<div className="sidebarEmpty">{sidebarSearch?'No matching chats':'No chats yet'}</div>:visibleChats.map(chat=>
            <div className={'recentRow '+(currentChatId===chat.id?'active':'')} key={chat.id}>
              <button className="recentItem" onClick={()=>{openChat(chat);setMobileNavOpen(false)}}>
                {chat.pinned&&<Pin size={11} className="recentPin"/>}
                <span>{chat.title}</span>
              </button>
              <button className="recentMore" aria-label={'More options for '+chat.title} aria-haspopup="menu" aria-expanded={chatMenuId===chat.id} onClick={e=>{e.stopPropagation();setChatMenuId(current=>current===chat.id?null:chat.id)}}><MoreHorizontal size={15}/></button>
              {chatMenuId===chat.id&&<ChatContextMenu chat={chat} onPin={togglePinChat} onExport={exportChat} onDelete={askDeleteChat}/>}
            </div>
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
        {profileMenu&&<ProfileMenu session={session} onSettings={()=>{stopActiveWorkTask();setProfileMenu(false);setMobileSettingsList(true);setSettingsOpen(true)}} onLogout={()=>{setProfileMenu(false);signOutAccount().catch(()=>{})}}/>}
      </div>
    </aside>}
    {mobileNavOpen&&<button className="mobileNavScrim" aria-label="Close navigation" onClick={()=>setMobileNavOpen(false)}/>}

    <main className="workspace">
      <header className="workspaceHeader">
        <div className="headerLeft">
          <button className="headerIcon mobileNavTrigger" onClick={()=>setMobileNavOpen(true)} aria-label="Open navigation"><MobileMenuGlyph size={20}/></button>
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
                modelMenu={modelMenu} setModelMenu={setModelMenu} onRefreshModels={refreshProviderModels} onSelectProviderModel={selectProviderModelOption} onSelectProviderEffort={selectProviderEffortOption}
                parallelCount={parallelCount} setParallelCount={setParallelCount}
                effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                plusMenu={plusMenu} setPlusMenu={setPlusMenu} webSearchEnabled={webSearchEnabled} onToggleWebSearch={toggleWebSearch} deepResearchEnabled={deepResearchEnabled} onToggleDeepResearch={toggleDeepResearch} fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef}
                mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                spellCheckEnabled={appPrefs.spellCheckEnabled!==false} hapticsEnabled={appPrefs.hapticsEnabled!==false}
                approvalMode={normalizeApprovalMode(appPrefs.approvalMode)} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                 workTask={isWindowsDesktop&&mode==='work'?workTask:null}
                 onWorkApproval={(taskId,allow)=>window.desktopApi.resolveWorkApproval({taskId,allow}).catch(()=>{})}
                 onWorkProject={task=>{const project=projects.find(item=>item.id===task?.projectId);if(project){setActiveProjectId(project.id);setPage('project');setMobileNavOpen(false)}}}
                 onWorkAgent={(task,agent)=>{const chat=chats.find(item=>item.taskId===task?.id&&item.agentId===agent?.id);if(chat)openChat(chat)}}
                repositoryWorkspace={repositoryWorkspace} onChooseRepository={chooseRepositoryWorkspace} onClearRepository={clearRepositoryWorkspace}
                localFolderWorkspace={localFolderWorkspace} onChooseLocalFolder={chooseLocalFolderWorkspace} onClearLocalFolder={clearLocalFolderWorkspace}
                superTeamKeys={superTeamKeys} setSuperTeamKeys={keys=>{const next=[...new Set(keys)];setSuperTeamKeys(next);localStorage.setItem('freeai.super.team',JSON.stringify(next))}}
                mcpConnections={mcpConnections} selectedMcpIds={selectedMcpIds} onToggleMcp={toggleMcpConnection}
                onBrowser={openBrowser}
                onPlugins={openPluginsPage}
              />
            </div>
          : <div className={'conversationView '+(isWindowsDesktop?'windowsConversation':'')}>
              <div className="messageList">
                {messages.map((m,i)=><div key={i} className={'chatMessage '+m.role} role={m.role==='error'?'alert':m.streaming?'status':undefined} aria-live={m.streaming?'polite':undefined}>
                  {m.role!=='user'&&!isWindowsDesktop&&<div className="assistantMark"><Sparkles size={16}/></div>}
                  <div className="messageBubble">
                    {m.role!=='user'&&!isWindowsDesktop&&<div className="messageAuthor">{m.role==='error'?'Error':modelLabel(selected)}</div>}
                    {isWindowsDesktop&&m.role!=='user'&&m.providerLabel&&<div className="messageAuthor">{m.role==='error'?'Error · ':''}{m.providerLabel}</div>}
                    <div className="messageBody" dir="auto">{m.streaming&&!m.text?<span className="messageActivity"><RefreshCw className="spin" size={14}/>{m.activity||'Working…'}</span>:m.text}</div>
                    {isWindowsDesktop&&m.role==='assistant'&&m.deepResearch&&<div className={'deepResearchStatus '+(m.streaming?'running':'complete')}>
                      <Sparkles size={13}/><span>{m.streaming?(m.activity||'Deep research in progress…'):'Deep research report'}</span>{!m.streaming&&<Check size={13}/>}
                      {!m.streaming&&<div className="researchReportActions" aria-label="Export research report">
                        <button onClick={()=>exportResearchMessage(m,'md')}>Markdown</button>
                        <button onClick={()=>exportResearchMessage(m,'pdf')}>PDF</button>
                        <button onClick={()=>exportResearchMessage(m,'docx')}>Word</button>
                      </div>}
                    </div>}
                    {isWindowsDesktop&&m.role==='assistant'&&!m.streaming&&<MessageSources sources={m.sources} onOpen={openWebSource}/>} 
                    {m.role==='user'&&Array.isArray(m.attachments)&&m.attachments.length>0&&<div className="messageAttachmentList">
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
                  modelMenu={modelMenu} setModelMenu={setModelMenu} onRefreshModels={refreshProviderModels} onSelectProviderModel={selectProviderModelOption} onSelectProviderEffort={selectProviderEffortOption}
                  parallelCount={parallelCount} setParallelCount={setParallelCount}
                  effort={effort} setEffort={setEffort} effortMenu={effortMenu} setEffortMenu={setEffortMenu}
                  plusMenu={plusMenu} setPlusMenu={setPlusMenu} webSearchEnabled={webSearchEnabled} onToggleWebSearch={toggleWebSearch} deepResearchEnabled={deepResearchEnabled} onToggleDeepResearch={toggleDeepResearch} fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef}
                  mcpTools={mcpTools} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
                  product={product} voiceLanguage={appPrefs.voiceLanguage||'auto'} showBottomPanel={appPrefs.showBottomPanel}
                  spellCheckEnabled={appPrefs.spellCheckEnabled!==false} hapticsEnabled={appPrefs.hapticsEnabled!==false}
                  approvalMode={normalizeApprovalMode(appPrefs.approvalMode)} setApprovalMode={v=>persistPrefs({...appPrefs,approvalMode:v})}
                 workTask={isWindowsDesktop&&mode==='work'?workTask:null}
                 onWorkApproval={(taskId,allow)=>window.desktopApi.resolveWorkApproval({taskId,allow}).catch(()=>{})}
                 onWorkProject={task=>{const project=projects.find(item=>item.id===task?.projectId);if(project){setActiveProjectId(project.id);setPage('project');setMobileNavOpen(false)}}}
                 onWorkAgent={(task,agent)=>{const chat=chats.find(item=>item.taskId===task?.id&&item.agentId===agent?.id);if(chat)openChat(chat)}}
                repositoryWorkspace={repositoryWorkspace} onChooseRepository={chooseRepositoryWorkspace} onClearRepository={clearRepositoryWorkspace}
                localFolderWorkspace={localFolderWorkspace} onChooseLocalFolder={chooseLocalFolderWorkspace} onClearLocalFolder={clearLocalFolderWorkspace}
                superTeamKeys={superTeamKeys} setSuperTeamKeys={keys=>{const next=[...new Set(keys)];setSuperTeamKeys(next);localStorage.setItem('freeai.super.team',JSON.stringify(next))}}
                mcpConnections={mcpConnections} selectedMcpIds={selectedMcpIds} onToggleMcp={toggleMcpConnection}
                onBrowser={openBrowser}
                  onPlugins={openPluginsPage}
                />
              </div>
            </div>
        }
        <div className="stageFooter">{product==='super'?'Super AI can make mistakes. Review edits and important actions.':'Free AI can make mistakes. Check important information.'}</div>
      </section>}

      {page==='project'&&isWindowsDesktop&&activeProject&&<ProjectPage
        project={activeProject} chats={projectChats}
        task={workTask?.projectId===activeProject.id?workTask:null}
        onApproval={(taskId,allow)=>window.desktopApi.resolveWorkApproval({taskId,allow}).catch(()=>{})}
        onBack={()=>{setActiveProjectId(null);setPage('chat')}}
        onStart={nextMode=>startProjectConversation(activeProject.id,nextMode)}
        onOpenChat={openChat} onSave={patch=>updateProject(activeProject.id,patch)}
      />}
      {page==='plugins'&&<PluginsPage
        tools={mcpTools} connected={connected} directMcpConnections={mcpConnections}
        selectedMcpIds={selectedMcpIds} onToggleMcp={toggleMcpConnection}
        mcpDraft={mcpDraft} setMcpDraft={setMcpDraft} mcpError={mcpError}
        onAddMcp={addMcpConnection} onRemoveMcp={removeMcpConnection} onRefreshMcp={refreshMcpConnections}
        onBack={()=>setPage('chat')} onExplore={()=>setPage('explore')} onOpenPublicDirectory={openPublicPluginDirectory}
        onRefresh={()=>{window.desktopApi?.scanProviders?.().catch(()=>{});refreshMcpConnections().catch(()=>{})}}
      />}
      {page==='explore'&&<ExplorePage
        tools={mcpTools} chats={chats} directMcpConnections={mcpConnections}
        selectedMcpIds={selectedMcpIds} onToggleMcp={toggleMcpConnection}
        onRefreshMcp={refreshMcpConnections} onRemoveMcp={removeMcpConnection}
        onBack={()=>setPage('chat')} onManagePlugins={openPluginsPage} onOpenPublicDirectory={openPublicPluginDirectory} onOpenChat={openChat}
      />}
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

    {deleteChatTarget&&<DeleteChatDialog chat={deleteChatTarget} onClose={()=>setDeleteChatTarget(null)} onConfirm={deleteChat}/>}
    {researchSetupOpen&&pendingResearch&&<ResearchSetupDialog
      model={pendingResearch.model}
      attachments={attachments}
      defaultSearchUrl={appPrefs.researchSearchUrl||''}
      onClose={()=>{setResearchSetupOpen(false);setPendingResearch(null)}}
      onStart={startReviewedResearch}
    />}
    {projectDialogOpen&&isWindowsDesktop&&<NewProjectDialog draft={projectDraft} setDraft={setProjectDraft} onCreate={createProject} onClose={()=>setProjectDialogOpen(false)}/>}
    {settingsOpen&&<SettingsView
      section={settingsSection} setSection={setSettingsSection} mobileList={mobileSettingsList} setMobileList={setMobileSettingsList}
      onClose={()=>{setMobileSettingsList(true);setSettingsOpen(false)}}
      session={session} prefs={appPrefs} setPrefs={persistPrefs} status={status} settings={settings} setSettings={setSettings}
      saveSettings={saveSettings} connected={connected} mcpConnections={mcpConnections} apiDraft={apiDraft} setApiDraft={setApiDraft}
      addApiConnection={addApiConnection} removeApiConnection={removeApiConnection} apiError={apiError}
      onExportData={exportLocalData} onClearHistory={clearLocalHistory}
      onPlugins={()=>{setSettingsOpen(false);openPluginsPage()}}
      onBrowser={()=>{setSettingsOpen(false);openBrowser()}}
    />}
  </div>
}

function NavItem({icon:Icon,label,active,onClick}){
  return <button className={'navItem '+(active?'active':'')} onClick={onClick}><Icon size={16}/><span>{label}</span></button>
}

function ResearchSetupDialog({model,attachments=[],defaultSearchUrl='',onClose,onStart}){
  const owned=model?.source==='api';
  const [plan,setPlan]=useState(()=>[...DEFAULT_RESEARCH_PLAN]);
  const [scopeMode,setScopeMode]=useState('web');
  const [sites,setSites]=useState('');
  const [exclude,setExclude]=useState('');
  const [searchUrl,setSearchUrl]=useState(defaultSearchUrl);
  const [error,setError]=useState('');
  function updateStep(index,value){setPlan(current=>current.map((step,i)=>i===index?value:step))}
  function moveStep(index,direction){
    setPlan(current=>{
      const target=index+direction;
      if(target<0||target>=current.length)return current;
      const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next;
    });
  }
  function start(){
    const cleanPlan=plan.map(step=>String(step||'').trim()).filter(Boolean);
    const siteList=researchDomains(sites),excludeList=researchDomains(exclude);
    if(!cleanPlan.length){setError('Add at least one research-plan step.');return}
    if(owned&&!String(searchUrl||'').trim()){setError('Enter a SearXNG Search API URL for independent API-model research.');return}
    if(owned&&scopeMode==='only'&&!siteList.length){setError('Add at least one site for Only these sites.');return}
    onStart?.({
      owned,
      plan:cleanPlan,
      sourceScope:owned?{mode:scopeMode,sites:siteList,exclude:excludeList}:{mode:'provider-managed',sites:[],exclude:[]},
      searchBackend:owned?{kind:'searxng',url:String(searchUrl||'').trim()}:null
    });
  }
  return <div className="projectDialogScrim researchSetupScrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
    <div className="researchSetupDialog" role="dialog" aria-modal="true" aria-labelledby="research-setup-title">
      <div className="projectDialogHeader">
        <div><b id="research-setup-title">Research plan</b><small>Review the plan and source access before research starts.</small></div>
        <button onClick={onClose} aria-label="Close"><X size={17}/></button>
      </div>
      <section className="researchSetupSection">
        <div className="researchSetupHeading"><span><b>Plan</b><small>Free AI sends this reviewed plan with the research request.</small></span><button onClick={()=>setPlan(current=>[...current,''])}><Plus size={13}/>Add step</button></div>
        <div className="researchPlanEditor">{plan.map((step,index)=><div className="researchPlanRow" key={index}>
          <span className="researchStepNumber">{index+1}</span>
          <input value={step} onChange={e=>updateStep(index,e.target.value)} aria-label={'Research step '+(index+1)}/>
          <button disabled={index===0} onClick={()=>moveStep(index,-1)} aria-label="Move step up">↑</button>
          <button disabled={index===plan.length-1} onClick={()=>moveStep(index,1)} aria-label="Move step down">↓</button>
          <button disabled={plan.length<=1} onClick={()=>setPlan(current=>current.filter((_,i)=>i!==index))} aria-label="Remove step"><Trash2 size={13}/></button>
        </div>)}</div>
      </section>
      <section className="researchSetupSection">
        <div className="researchSetupHeading"><span><b>Sources</b><small>{owned?'Free AI enforces these controls in its own retrieval runtime.':'This browser provider manages its own research sources.'}</small></span></div>
        {owned?<>
          <div className="researchScopeChoices">
            <button className={scopeMode==='web'?'active':''} onClick={()=>setScopeMode('web')}><Globe2 size={14}/><span><b>Public web</b><small>Search broadly, minus excluded sites.</small></span></button>
            <button className={scopeMode==='only'?'active':''} onClick={()=>setScopeMode('only')}><Target size={14}/><span><b>Only these sites</b><small>Results outside the entered domains are rejected.</small></span></button>
            <button className={scopeMode==='prioritize'?'active':''} onClick={()=>setScopeMode('prioritize')}><Pin size={14}/><span><b>Prioritize sites</b><small>Rank entered domains first, while allowing the wider web.</small></span></button>
          </div>
          {scopeMode!=='web'&&<label className="researchField"><span>{scopeMode==='only'?'Allowed sites':'Priority sites'}</span><textarea value={sites} onChange={e=>setSites(e.target.value)} placeholder={'openai.com\nmicrosoft.com'}/><small>One domain per line or comma-separated.</small></label>}
          <label className="researchField"><span>Exclude sites</span><textarea value={exclude} onChange={e=>setExclude(e.target.value)} placeholder="reddit.com"/><small>Excluded domains are filtered after search as well as added to the query.</small></label>
          <label className="researchField"><span>SearXNG Search API</span><input value={searchUrl} onChange={e=>setSearchUrl(e.target.value)} placeholder="https://search.example.com"/><small>Use your own SearXNG instance with JSON search enabled. Free AI does not silently route through a random public instance.</small></label>
        </>:<div className="researchProviderNotice">
          <ProviderBadge model={model}/><span><b>{modelLabel(model)} · provider-managed sources</b><small>Free AI will pass the reviewed plan to the provider's native Deep Research mode. Website allow/prioritize/exclude controls are not shown because Free AI cannot prove it can enforce them in that provider UI.</small></span>
        </div>}
        <div className="researchCapabilityGrid">
          <span><Check size={12}/>Public web: {owned?'Free AI retrieval':'Provider managed'}</span>
          <span><FileText size={12}/>Uploaded files: {attachments.length?attachments.length+' attached':'none attached'}</span>
          <span><Plug size={12}/>Connected apps: {owned?'not available in owned runtime':'provider managed where available'}</span>
          <span><ShieldCheck size={12}/>Citations: {owned?'only from pages Free AI read':'provider returned sources'}</span>
        </div>
      </section>
      {error&&<div className="formError">{error}</div>}
      <div className="projectDialogActions"><button onClick={onClose}>Cancel</button><button className="primaryProjectAction" onClick={start}>Start research</button></div>
    </div>
  </div>
}

function NewProjectDialog({draft,setDraft,onCreate,onClose}){
  return <div className="projectDialogScrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <form className="projectDialog" onSubmit={e=>{e.preventDefault();onCreate()}}>
      <div className="projectDialogHeader"><div><b>New project</b><small>Keep related Chat and Work conversations together.</small></div><button type="button" onClick={onClose} aria-label="Close"><X size={17}/></button></div>
      <label className="projectNameField"><span>Name</span><input autoFocus dir="auto" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Project name" maxLength={80}/></label>
      <div className="projectChoiceBlock"><span>Icon</span><div className="projectIconGrid">{projectIconOptions.map(([key,label,Icon])=><button type="button" key={key} className={draft.icon===key?'active':''} onClick={()=>setDraft({...draft,icon:key})} aria-label={label} title={label}><Icon size={17}/></button>)}</div></div>
      <div className="projectChoiceBlock"><span>Color</span><div className="projectColorGrid">{projectColorOptions.map(color=><button type="button" key={color} className={draft.color===color?'active':''} data-color={color} onClick={()=>setDraft({...draft,color})} aria-label={color+' color'}><span/></button>)}</div></div>
      <div className="projectDialogActions"><button type="button" onClick={onClose}>Cancel</button><button className="primaryProjectAction" type="submit" disabled={!String(draft.name||'').trim()}>Create project</button></div>
    </form>
  </div>
}

function ProjectPage({project,chats,task,onApproval,onBack,onStart,onOpenChat,onSave}){
  const [draft,setDraft]=useState({name:project.name,icon:project.icon||'folder',color:project.color||'blue',instructions:project.instructions||''});
  const [saved,setSaved]=useState(false);
  const orchestration=project.kind==='orchestration'||project.product==='super';
  const masterChats=orchestration?chats.filter(chat=>chat.isMasterThread||(!chat.isAgentThread&&chat.mode==='work')):[];
  const agentChats=orchestration?chats.filter(chat=>chat.isAgentThread):[];
  const otherChats=orchestration?chats.filter(chat=>!chat.isMasterThread&&!chat.isAgentThread&&chat.mode!=='work'):chats;
  useEffect(()=>{setDraft({name:project.name,icon:project.icon||'folder',color:project.color||'blue',instructions:project.instructions||''});setSaved(false)},[project.id,project.name,project.icon,project.color,project.instructions]);
  const save=()=>{const name=String(draft.name||'').trim();if(!name)return;onSave({name,icon:draft.icon||'folder',color:draft.color||'blue',instructions:String(draft.instructions||'')});setSaved(true);setTimeout(()=>setSaved(false),1400)};
  const preview={...project,...draft,name:String(draft.name||'').trim()||project.name};
  const conversationRow=(chat,label)=><button key={chat.id} className={chat.isAgentThread?'agentConversationRow':''} onClick={()=>onOpenChat(chat)}>
    {chat.isAgentThread
      ? <span className="projectAgentIdentity"><span className="projectAgentBadge">{String(chat.modelName||chat.title||'A').slice(0,1).toUpperCase()}</span><span><b>{chat.modelName||chat.title}</b><small>{chat.agentRole||'Agent'}{chat.agentStatus?' · '+chat.agentStatus:''}{chat.agentDetail?' · '+chat.agentDetail:''}</small></span></span>
      : <><span className="projectConversationMode">{label||((chat.mode==='work')?'Work':'Chat')}</span><span>{chat.title}</span></>}
    <ChevronRight size={14}/>
  </button>;
  return <div className="contentPage projectPage">
    <PageTop onBack={onBack} title={project.name}/>
    <div className="contentInner projectInner">
      <div className="projectHero">
        <ProjectMark project={project} size={42}/>
        <div><h1>{project.name}</h1><p className="pageLead">{orchestration?'A Super AI Master project. The Master delegates work to isolated agent chats and combines their results.':'A local Free AI project. Project instructions apply only to conversations started here.'}</p></div>
        <div className="projectStartActions">
          {orchestration
            ? <button onClick={()=>onStart('work')}><Sparkles size={15}/>New Master task</button>
            : <><button onClick={()=>onStart('chat')}><SquarePen size={15}/>Chat</button><button onClick={()=>onStart('work')}><Briefcase size={15}/>Work</button></>}
        </div>
      </div>
      {orchestration&&task&&<div className="projectLiveTask">
        <WorkTaskStatus
          task={task}
          onApproval={onApproval}
          onOpenAgent={(_task,agent)=>{
            const chat=agentChats.find(item=>item.agentId===agent.id);
            if(chat)onOpenChat(chat);
          }}
        />
      </div>}

      {orchestration?<>
        <section className="projectSection">
          <div className="sectionHeading"><h2>Master</h2><span className="pluginMeta">{masterChats.length}</span></div>
          <div className="projectConversationList masterConversationList">
            {masterChats.map(chat=>conversationRow(chat,'Master'))}
            {!masterChats.length&&<div className="projectEmptyState"><Sparkles size={20}/><b>No Master thread yet</b><span>Start a Master task and Super AI will coordinate the selected models here.</span></div>}
          </div>
        </section>
        <section className="projectSection">
          <div className="sectionHeading"><h2>Agents</h2><span className="pluginMeta">{agentChats.length}</span></div>
          <div className="projectConversationList agentConversationList">
            {agentChats.map(chat=>conversationRow(chat))}
            {!agentChats.length&&<div className="projectEmptyState"><Bot size={20}/><b>No agent chats yet</b><span>Agent threads appear here as soon as the Master delegates work.</span></div>}
          </div>
        </section>
        {otherChats.length>0&&<section className="projectSection">
          <div className="sectionHeading"><h2>Other conversations</h2><span className="pluginMeta">{otherChats.length}</span></div>
          <div className="projectConversationList">{otherChats.map(chat=>conversationRow(chat))}</div>
        </section>}
      </>:<section className="projectSection">
        <div className="sectionHeading"><h2>Project conversations</h2><span className="pluginMeta">{chats.length}</span></div>
        <div className="projectConversationList">
          {chats.map(chat=>conversationRow(chat))}
          {!chats.length&&<div className="projectEmptyState"><Folder size={20}/><b>No conversations yet</b><span>Start a Chat or Work conversation to add it to this project.</span></div>}
        </div>
      </section>}

      <section className="projectSection projectSettingsCard"><div className="sectionHeading"><h2>Project settings</h2>{saved&&<span className="projectSaved"><Check size={13}/>Saved</span>}</div>
        <label className="projectNameField"><span>Name</span><input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} maxLength={80}/></label>
        <div className="projectChoiceBlock"><span>Icon</span><div className="projectIconGrid">{projectIconOptions.map(([key,label,Icon])=><button type="button" key={key} className={draft.icon===key?'active':''} onClick={()=>setDraft({...draft,icon:key})} aria-label={label} title={label}><Icon size={17}/></button>)}</div></div>
        <div className="projectChoiceBlock"><span>Color</span><div className="projectColorGrid">{projectColorOptions.map(color=><button type="button" key={color} className={draft.color===color?'active':''} data-color={color} onClick={()=>setDraft({...draft,color})} aria-label={color+' color'}><span/></button>)}</div></div>
        <label className="projectInstructionsField"><span>Project instructions</span><small>{orchestration?'Shared instructions for the Master and delegated agents in this project.':'These instructions override your global custom instructions while you are in this project.'}</small><textarea value={draft.instructions} onChange={e=>setDraft({...draft,instructions:e.target.value})} placeholder="Add instructions for this project"/></label>
        <div className="projectSettingsActions"><div className="projectSettingsPreview"><ProjectMark project={preview} size={22}/><span>{preview.name}</span></div><button onClick={save} disabled={!String(draft.name||'').trim()}>Save</button></div>
      </section>
    </div>
  </div>
}

function Composer(props){
  const {
    windowsDesktop,stopGeneration,attachments=[],attachmentError,onRemoveAttachment,onOpenAttachment,compact,mode,prompt,setPrompt,send,busy,selected,connected,setSelected,modelMenu,setModelMenu,onRefreshModels,onSelectProviderModel,onSelectProviderEffort,
    parallelCount=1,setParallelCount,effort,setEffort,effortMenu,setEffortMenu,plusMenu,setPlusMenu,webSearchEnabled=false,onToggleWebSearch,deepResearchEnabled=false,onToggleDeepResearch,fileRef,photoRef,cameraRef,mcpTools,selectedTool,setSelectedTool,
    product,voiceLanguage,showBottomPanel,spellCheckEnabled,hapticsEnabled,approvalMode,setApprovalMode,workTask,onWorkApproval,onWorkProject,onWorkAgent,
    repositoryWorkspace,onChooseRepository,onClearRepository,localFolderWorkspace,onChooseLocalFolder,onClearLocalFolder,superTeamKeys=[],setSuperTeamKeys,
    mcpConnections=[],selectedMcpIds=[],onToggleMcp,onBrowser,onPlugins
  }=props;
  const [listening,setListening]=useState(false);
  const [dictationError,setDictationError]=useState('');
  const [dictationNotice,setDictationNotice]=useState('');
  const [approvalMenu,setApprovalMenu]=useState(false);
  const [teamMenu,setTeamMenu]=useState(false);
  const textareaRef=useRef(null);
  const nativeSpeechHandles=useRef([]);
  const nativeSpeechSession=useRef(0);
  const nativeSpeechFinalizing=useRef(false);
  const nativeLastTranscript=useRef('');
  const webRecognition=useRef(null);
  const dictationBase=useRef('');
  const startVoiceRef=useRef(null);
  const stopVoiceRef=useRef(null);
  const effortLabel={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High','extra-high':'Extra High','pro-standard':'Pro Standard','pro-extended':'Pro Extended','deep-think':'Deep Think',heavy:'Heavy'}[effort]||'Reasoning';
  const selectedMcpConnections=mcpConnections.filter(connection=>selectedMcpIds.includes(connection.id));

  function nativeTranscriptText(event){
    return String(event?.accumulatedText||event?.accumulated||event?.text||event?.matches?.[0]||'').trim();
  }
  function commitNativeTranscript(text,final=false){
    const clean=String(text||'').trim();
    if(!clean)return;
    nativeLastTranscript.current=clean;
    setPrompt((dictationBase.current?dictationBase.current+' ':'')+clean);
    updateAndroidDictationQaState(final?{final:true,finalized:true}:{partial:true});
  }
  async function removeNativeSpeechHandles(){
    const handles=nativeSpeechHandles.current.splice(0);
    await Promise.all(handles.map(handle=>handle?.remove?.().catch(()=>{})));
  }
  async function finalizeNativeVoice(session,{stopped=false}={}){
    if(!session||session!==nativeSpeechSession.current||nativeSpeechFinalizing.current)return;
    nativeSpeechFinalizing.current=true;
    try{
      const last=await SpeechRecognition.getLastPartialResult?.().catch(()=>null);
      const text=nativeTranscriptText(last)||nativeLastTranscript.current;
      if(text)commitNativeTranscript(text,true);
      updateAndroidDictationQaState({finalized:true,stopped:stopped||readAndroidDictationQaState().stopped===true});
    }finally{
      setListening(false);
      await removeNativeSpeechHandles();
      if(nativeSpeechSession.current===session)nativeSpeechSession.current=0;
      nativeSpeechFinalizing.current=false;
    }
  }
  function nativeDictationErrorMessage(event){
    const detail=[event?.code,event?.errorCode,event?.message].filter(Boolean).join(' ');
    if(/permission|insufficient/i.test(detail))return 'Microphone access is denied. Enable microphone permission for Free AI in Android Settings.';
    if(/no[_ -]?match|speech[_ -]?timeout|no speech/i.test(detail))return 'No speech was detected. Try again.';
    return event?.message||event?.code||'Dictation failed.';
  }

  async function stopVoice(){
    setDictationError('');
    try{
      if(isNative){
        const session=nativeSpeechSession.current;
        updateAndroidDictationQaState({stopRequested:true});
        if(session){
          if(SpeechRecognition.forceStop)await SpeechRecognition.forceStop({timeout:1200}).catch(()=>SpeechRecognition.stop().catch(()=>{}));
          else await SpeechRecognition.stop().catch(()=>{});
          updateAndroidDictationQaState({stopped:true});
          await finalizeNativeVoice(session,{stopped:true});
        }else{
          await removeNativeSpeechHandles();
          setListening(false);
          updateAndroidDictationQaState({stopped:true,finalized:true});
        }
      }else if(webRecognition.current){
        webRecognition.current.stop();
        webRecognition.current=null;
      }
    }catch(e){
      setDictationError(e?.message||'Could not stop dictation.');
      updateAndroidDictationQaState({error:String(e?.message||e||'stop_failed')});
    }
    setListening(false);
  }

  async function startVoice(){
    if(isNative&&hapticsEnabled)Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});
    if(isNative&&nativeSpeechSession.current){await stopVoice();return}
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

    const nativeLanguage=voiceLanguage==='auto'?undefined:voiceLanguage;
    const webLanguage=nativeLanguage||(navigator.language||'en-US');
    if(isNative){
      const session=Date.now();
      nativeSpeechSession.current=session;
      nativeSpeechFinalizing.current=false;
      nativeLastTranscript.current='';
      updateAndroidDictationQaState({
        permission:'checking',started:false,stopped:false,stopRequested:false,
        denied:false,partial:false,final:false,finalized:false,error:'',
        language:nativeLanguage||'device'
      });
      try{
        await removeNativeSpeechHandles();
        const available=await SpeechRecognition.available();
        if(!available?.available)throw new Error('Speech recognition is not available on this device.');

        let permission=await SpeechRecognition.checkPermissions();
        let permissionState=permission?.speechRecognition||'prompt';
        updateAndroidDictationQaState({permission:permissionState});
        if(permissionState!=='granted'){
          permission=await SpeechRecognition.requestPermissions();
          permissionState=permission?.speechRecognition||'denied';
          updateAndroidDictationQaState({permission:permissionState});
        }
        if(permissionState!=='granted'){
          const denied=permissionState==='denied';
          updateAndroidDictationQaState({denied,error:'permission_denied'});
          throw new Error(denied
            ? 'Microphone access is denied. Enable microphone permission for Free AI in Android Settings.'
            : 'Microphone permission is required for dictation.');
        }

        const partial=await SpeechRecognition.addListener('partialResults',event=>{
          if(session!==nativeSpeechSession.current)return;
          const text=nativeTranscriptText(event);
          if(text)commitNativeTranscript(text,!!event?.forced);
        });
        const segment=await SpeechRecognition.addListener('segmentResults',event=>{
          if(session!==nativeSpeechSession.current)return;
          const text=nativeTranscriptText(event);
          if(text)commitNativeTranscript(text,true);
        });
        const stateHandle=await SpeechRecognition.addListener('listeningState',event=>{
          if(session!==nativeSpeechSession.current)return;
          const state=event?.state||event?.status||'';
          const active=state==='startingListening'||state==='started'||event?.status==='started';
          if(active)setListening(true);
          if(state==='stoppingListening'||state==='stopped'||event?.status==='stopped'){
            setListening(false);
            if(state==='stopped'||event?.status==='stopped')setTimeout(()=>finalizeNativeVoice(session),80);
          }
          updateAndroidDictationQaState({listening:active,state:String(state),reason:String(event?.reason||'')});
        });
        const errorHandle=await SpeechRecognition.addListener('error',event=>{
          if(session!==nativeSpeechSession.current)return;
          const message=nativeDictationErrorMessage(event);
          setListening(false);
          setDictationError(message);
          updateAndroidDictationQaState({
            listening:false,
            error:String(event?.code||event?.errorCode||event?.message||'recognition_error'),
            denied:/permission|insufficient/i.test([event?.code,event?.errorCode,event?.message].filter(Boolean).join(' '))
          });
          setTimeout(()=>finalizeNativeVoice(session),0);
        });
        const readyHandle=await SpeechRecognition.addListener('readyForNextSession',()=>{
          if(session!==nativeSpeechSession.current)return;
          finalizeNativeVoice(session).catch(()=>{});
        });
        nativeSpeechHandles.current=[partial,segment,stateHandle,errorHandle,readyHandle];

        const options={
          maxResults:3,
          partialResults:true,
          popup:false,
          addPunctuation:true
        };
        if(nativeLanguage)options.language=nativeLanguage;

        setListening(true);
        updateAndroidDictationQaState({listening:true});
        await SpeechRecognition.start(options);
        updateAndroidDictationQaState({started:true});
      }catch(e){
        setListening(false);
        const message=e?.message||'Dictation could not start.';
        setDictationError(message);
        updateAndroidDictationQaState({
          listening:false,
          error:String(e?.message||e||'start_failed'),
          denied:/denied|permission/i.test(message)
        });
        if(nativeSpeechSession.current===session){
          await removeNativeSpeechHandles();
          nativeSpeechSession.current=0;
        }
      }
      return;
    }

    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){setDictationError('Dictation is not supported by this desktop runtime.');return}
    const recognition=new Recognition();
    webRecognition.current=recognition;
    recognition.lang=webLanguage;
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

  startVoiceRef.current=startVoice;
  stopVoiceRef.current=stopVoice;
  useEffect(()=>{
    const startHandler=()=>startVoiceRef.current?.();
    const stopHandler=()=>stopVoiceRef.current?.();
    window.addEventListener('freeai:start-voice',startHandler);
    window.addEventListener('freeai:stop-voice',stopHandler);
    return()=>{
      window.removeEventListener('freeai:start-voice',startHandler);
      window.removeEventListener('freeai:stop-voice',stopHandler);
      if(isNative){
        nativeSpeechSession.current=0;
        if(SpeechRecognition.forceStop)SpeechRecognition.forceStop({timeout:500}).catch(()=>SpeechRecognition.stop().catch(()=>{}));
        else SpeechRecognition.stop().catch(()=>{});
        SpeechRecognition.removeAllListeners().catch(()=>{});
      }else webRecognition.current?.abort?.();
    };
  },[]);

  return <div className={'gptComposer '+(mode==='work'&&!windowsDesktop?'workComposer':'')+' '+(compact?'compact':'')}>
    {mode==='work'&&windowsDesktop&&workTask&&<WorkTaskStatus task={workTask} onApproval={onWorkApproval} onOpenProject={onWorkProject} onOpenAgent={onWorkAgent}/>} 
    {product==='super'&&windowsDesktop&&repositoryWorkspace&&<div className="repositoryContextChip">
      <GitBranch size={13}/><span><b>{repositoryWorkspace.name}</b><small>{repositoryWorkspace.branch||'Git repository'}{Number(repositoryWorkspace.dirty)>0?' · '+repositoryWorkspace.dirty+' changed':''}</small></span>
      <button type="button" aria-label="Remove repository" disabled={busy} onClick={()=>!busy&&onClearRepository?.()}><X size={12}/></button>
    </div>}
    {windowsDesktop&&mode==='work'&&localFolderWorkspace&&<div className="repositoryContextChip localFolderContextChip">
      <Folder size={13}/><span><b>{localFolderWorkspace.name}</b><small>Local folder · access confirmed per task</small></span>
      <button type="button" aria-label="Remove local folder" disabled={busy} onClick={()=>!busy&&onClearLocalFolder?.()}><X size={12}/></button>
    </div>}
    {windowsDesktop&&mode==='work'&&selectedMcpConnections.length>0&&<div className="mcpSelectionTray" aria-label="Selected MCP apps">
      {selectedMcpConnections.map(connection=><div className="mcpSelectionChip" key={connection.id}>
        <Plug size={12}/><span><b>{connection.name}</b><small>{connection.connected?'Connected':connection.hasToken?'Saved · connects on send':'Saved · connects on send'}</small></span>
        <button type="button" aria-label={'Remove '+connection.name} disabled={busy} onClick={()=>!busy&&onToggleMcp?.(connection.id)}><X size={11}/></button>
      </div>)}
    </div>}
    {webSearchEnabled&&<div className="attachedTool searchModeChip"><Globe2 size={13}/><span>Search</span><small>Live web sources via the selected browser AI</small><button onClick={()=>onToggleWebSearch?.()} aria-label="Turn off web search"><X size={12}/></button></div>}
    {deepResearchEnabled&&<div className="attachedTool deepResearchModeChip"><Sparkles size={13}/><span>Deep research</span><small>{selected?.source==='api'?'Free AI-owned research with reviewed plan and retrieved sources':'Provider-native research with a reviewed Free AI plan'}</small><button onClick={()=>onToggleDeepResearch?.()} aria-label="Turn off deep research"><X size={12}/></button></div>}
    {selectedTool&&<div className="attachedTool"><Plug size={13}/><span>{selectedTool.mcp}</span><small>via {selectedTool.ownerName}</small><button onClick={()=>setSelectedTool(null)}><X size={12}/></button></div>}
    {(windowsDesktop||isAndroidNative)&&attachments.length>0&&<div className="attachmentTray" aria-label="Attachments">
      {attachments.map(item=><div className="attachmentChip" key={item.id}>
        <button className="attachmentOpen" type="button" onClick={()=>onOpenAttachment?.(item)}><File size={13}/><span>{item.name}</span><small>{humanSize(item.size)}</small></button>
        <button type="button" aria-label={'Remove '+item.name} onClick={()=>onRemoveAttachment?.(item.id)}><X size={12}/></button>
      </div>)}
    </div>}
    <textarea
      ref={textareaRef}
      dir="auto"
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
            fileRef={fileRef} photoRef={photoRef} cameraRef={cameraRef} onBrowser={onBrowser} onPlugins={onPlugins}
            tools={mcpTools} setSelectedTool={tool=>{if(tool&&webSearchEnabled)onToggleWebSearch?.();if(tool&&deepResearchEnabled)onToggleDeepResearch?.();setSelectedTool(tool)}} mode={mode} showBottomPanel={showBottomPanel}
            webSearchEnabled={webSearchEnabled} onToggleWebSearch={onToggleWebSearch}
            deepResearchEnabled={deepResearchEnabled} onToggleDeepResearch={onToggleDeepResearch}
            directMcpConnections={mcpConnections} selectedMcpIds={selectedMcpIds} onToggleMcp={onToggleMcp}
            localFolderWorkspace={localFolderWorkspace} onChooseLocalFolder={onChooseLocalFolder} onClearLocalFolder={onClearLocalFolder}
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
        {product==='super'&&windowsDesktop&&mode==='work'&&<div className="menuAnchor">
          <button className="teamButton" aria-haspopup="dialog" aria-expanded={teamMenu} disabled={busy} onClick={()=>!busy&&setTeamMenu(v=>!v)}>
            <Bot size={14}/>All AI · {connected.filter(model=>model.connected!==false&&model.adapterReady!==false).length}<ChevronDown size={12}/>
          </button>
          {teamMenu&&<AgentTeamMenu connected={connected} selected={selected} onClose={()=>setTeamMenu(false)}/>}
        </div>}
        {!isNative&&product!=='super'&&<div className="menuAnchor">
          <button className="modelButton" aria-haspopup="listbox" aria-expanded={modelMenu} disabled={busy} onClick={()=>{if(busy)return;const next=!modelMenu;setModelMenu(next);if(next)onRefreshModels?.()}}>
            <span>{modelLabel(selected)}</span>{selected?.modelName&&selected.modelName!==selected.name&&<small>{selected.name}</small>}<ChevronDown size={13}/>
          </button>
          {modelMenu&&<MenuErrorBoundary onClose={()=>setModelMenu(false)}><ModelMenu connected={connected} selected={selected} parallelCount={parallelCount} setParallelCount={setParallelCount} onRefreshModels={onRefreshModels} onSelectProviderModel={onSelectProviderModel} choose={m=>{setSelected(m);setParallelCount?.(1)}}/></MenuErrorBoundary>}
        </div>}
        {!isNative&&product!=='super'&&((windowsDesktop&&selected?.effortControl==='native'&&Array.isArray(selected?.effortLevels)&&selected.effortLevels.length>1)||(!windowsDesktop&&Array.isArray(selected?.effortLevels)&&selected.effortLevels.length>1))&&<div className="menuAnchor">
          <button className="effortButton" aria-haspopup="dialog" aria-expanded={effortMenu} onClick={()=>setEffortMenu(v=>!v)}><Brain size={14}/>{effortLabel}<ChevronDown size={12}/></button>
          {effortMenu&&<EffortMenu effort={effort} levels={selected.effortLevels} choose={v=>{onSelectProviderEffort?.(v);setEffortMenu(false)}}/>}
        </div>}
        {(isNative||!isDesktop||desktopPlatform==='win32')&&<button className={'micButton '+(listening?'listening':'')} onMouseDown={e=>e.preventDefault()} onClick={startVoice} title={windowsDesktop?'Dictate with Windows':listening?'Stop dictation':'Dictate'} aria-label={windowsDesktop?'Dictate with Windows':listening?'Stop dictation':'Dictate'}><Mic2 size={18}/></button>}
        {(busy||prompt.trim()||attachments.length>0)&&<button className={'voiceOrb '+(!busy&&(prompt.trim()||attachments.length>0)&&selected?'sendReady':'')}
          onClick={busy?(windowsDesktop||isAndroidNative?stopGeneration:undefined):send}
          disabled={busy?!(windowsDesktop||isAndroidNative):!selected}
          aria-label={busy?(windowsDesktop||isAndroidNative?'Stop generating':'Generating response'):'Send message'}
          title={busy?(windowsDesktop||isAndroidNative?'Stop generating':'Generating response'):'Send'}>
          {busy?(windowsDesktop||isAndroidNative?<Square size={15}/>:<RefreshCw className="spin" size={17}/>):<ArrowUp size={18}/>} 
        </button>}
      </div>
    </div>
    {attachmentError&&<div className="dictationError" role="alert">{attachmentError}</div>}
    {dictationError&&<div className="dictationError voiceDictationError" role="alert">{dictationError}</div>}
    {dictationNotice&&windowsDesktop&&<div className="dictationStatus">{dictationNotice}</div>}
    {listening&&<div className="dictationStatus"><span className="dictationPulse"/>Listening… tap the microphone to stop</div>}
    {mode==='work'&&showBottomPanel!==false&&<div className="workActions">
      {product==='super'&&windowsDesktop&&<button onClick={onChooseRepository}><GitBranch size={15}/>{repositoryWorkspace?.name||'Choose repository'}</button>}
      {windowsDesktop?<button onClick={onChooseLocalFolder}><Folder size={15}/>{localFolderWorkspace?.name||'Open local folder'}</button>:<button onClick={()=>fileRef.current?.click()}><Folder size={15}/>Choose project</button>}
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
      <ProviderBadge model={selected} small/>
      <span className="mobileModelTriggerText"><b>{selected?modelLabel(selected):'Select model'}</b>{levels.length>1&&<small>{currentEffort}</small>}</span>
      <ChevronDown size={14}/>
    </button>
    {open&&<div className="mobileTopModelPanel" role="dialog" aria-label="Model and intelligence">
      <div className="mobilePickerSectionTitle">Models</div>
      <div className="mobileModelList">
        {connected.length===0?<div className="menuEmpty"><b>No models connected</b><span>Connect your desktop or add an API model first.</span></div>:connected.map(model=><button
          key={(model.source||'browser')+model.id}
          className={((selected?.id===model.id&&selected?.source===model.source)?'active ':'')+(model.connected===false?'disconnected':'')}
          disabled={model.connected===false}
          title={model.adapterIssue||undefined}
          onClick={()=>model.connected!==false&&choose(model)}
        >
          <ProviderBadge model={model}/>
          <span><b>{modelLabel(model)}</b><small>{modelInstanceLabel(model)}{modelConnectionDetail(model)}</small></span>
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

function ModelMenu({connected,selected,choose,parallelCount=1,setParallelCount,onSelectProviderModel,onRefreshModels}){
  const selectedGroupKey=modelGroupKey(selected);
  const matchingInstances=selectedGroupKey
    ? connected.filter(model=>model.connected!==false&&modelGroupKey(model)===selectedGroupKey)
    : [];
  const maxParallel=Math.max(1,matchingInstances.length);
  const parallel=Math.max(1,Math.min(Number(parallelCount)||1,maxParallel));
  return <div className="floatingMenu modelPicker" role="listbox" aria-label="Select model">
    <div className="modelPickerHeader"><div className="floatingTitle">Select model</div><button type="button" onClick={onRefreshModels} title="Refresh connected models"><RefreshCw size={13}/>Refresh</button></div>
    {connected.length===0?<div className="menuEmpty"><b>No models connected</b><span>Open an AI tab in Chrome or add an API model in Settings.</span></div>:
      connected.map(model=>{
        const active=selected?.id===model.id&&selected?.source===model.source;
        const siblings=connected.filter(item=>item.connected!==false&&modelGroupKey(item)===modelGroupKey(model)).length;
        return <button
          role="option"
          aria-selected={active}
          aria-disabled={model.connected===false}
          disabled={model.connected===false}
          key={(model.source||'browser')+model.id}
          className={'pickerRow '+(model.connected===false?'disconnected':'')}
          title={model.adapterIssue||undefined}
          onClick={()=>choose(model)}
        >
          <ProviderBadge model={model}/>
          <span className="pickerText">
            <b>{modelLabel(model)}</b>
            <small>{modelInstanceLabel(model)}{siblings>1?' · '+siblings+' matching tabs':''}{modelConnectionDetail(model)}</small>
          </span>
          {active&&<Check size={16}/>}
        </button>;
      })}
    {selected?.source==='browser'&&<div className="providerModelPicker">
      <span><b>Provider model</b><small>Switch the actual model inside Tab {selected.tabId||'?'}, not only the Free AI routing target.</small></span>
      {Array.isArray(selected.modelOptions)&&selected.modelOptions.length>1
        ? <select value={selected.modelName||selected.modelOptions[0]} onChange={e=>onSelectProviderModel?.(e.target.value)} aria-label="Provider model">
            {selected.modelOptions.map(option=><option value={option} key={option}>{option}</option>)}
          </select>
        : <button type="button" onClick={onRefreshModels}><RefreshCw size={12}/>Detect models</button>}
    </div>}
    {selected?.source==='browser'&&maxParallel>1&&<div className="parallelPicker">
      <span><b>Parallel instances</b><small>Send this prompt to multiple open tabs of the same model.</small></span>
      <select value={parallel} onChange={e=>setParallelCount?.(Number(e.target.value))} aria-label="Parallel model instances">
        {matchingInstances.map((_,index)=><option value={index+1} key={index+1}>{index+1===maxParallel?'All '+maxParallel:index+1}</option>)}
      </select>
    </div>}
  </div>
}

function AgentTeamMenu({connected,selected,onClose}){
  const available=connected.filter(model=>model.connected!==false&&model.adapterReady!==false);
  const primary=modelKey(selected);
  return <div className="floatingMenu teamPicker" role="dialog" aria-label="Super AI automatic team">
    <div className="teamPickerHead"><span><b>Automatic AI team</b><small>Every available AI participates automatically. No model selection is required in Super AI.</small></span><button onClick={onClose} aria-label="Close team picker"><X size={14}/></button></div>
    {available.length===0?<div className="menuEmpty compact">Open AI chats in your connected browser or add an API model. Super AI will add them automatically.</div>:<div className="teamControllerChoices">
      {available.map(model=>{
        const controller=modelKey(model)===primary;
        return <div key={modelKey(model)} className={'teamControllerChoice '+(controller?'active':'')}>
          <ProviderBadge model={model}/>
          <span><b>{modelLabel(model)}</b><small>{controller?'Automatic coordinator · ':'Parallel agent · '}{modelInstanceLabel(model)}</small></span>
          <Check size={14}/>
        </div>;
      })}
    </div>}
    <div className="teamPickerFoot">{available.length
      ? available.length+' connected AI'+(available.length===1?'':'s')+' · all will work on the next Super AI task'
      : 'Waiting for a connected AI'}</div>
  </div>
}

function EffortMenu({effort,levels,choose}){
  const values=Array.isArray(levels)?levels.filter(Boolean):[];
  const labels={instant:'Instant',medium:'Medium',high:'High',extra:'Extra High','extra-high':'Extra High','pro-standard':'Pro Standard','pro-extended':'Pro Extended','deep-think':'Deep Think',heavy:'Heavy'};
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

function WorkTaskStatus({task,onApproval,onOpenProject,onOpenAgent}){
  const labels={running:'Running',waiting_approval:'Waiting for approval',completed:'Completed',failed:'Failed',stopped:'Stopped'};
  const active=task.status==='running'||task.status==='waiting_approval';
  const agents=Array.isArray(task.agents)?task.agents:[];
  return <div className={'workTaskStatus '+task.status} role="status" aria-live="polite">
    <div className="workTaskHead">
      <span className="workTaskStateIcon">{task.status==='completed'?<Check size={15}/>:task.status==='failed'?<X size={15}/>:task.status==='stopped'?<Square size={13}/>:<RefreshCw className={active?'spin':''} size={14}/>}</span>
      <span><b>{task.product==='super'?'Super AI · '+(labels[task.status]||task.status):(labels[task.status]||task.status)}</b><small>{task.detail||('Step '+(task.step||0)+' of '+(task.maxSteps||0))}</small></span>
      {task.projectId&&onOpenProject&&<button className="workTaskProjectButton" onClick={()=>onOpenProject(task)}><Folder size={12}/>Project</button>}
    </div>
    {task.workspace&&<div className="workWorkspaceLine"><GitBranch size={12}/><span>{task.workspace.name}</span><small>{task.workspace.branch}{Number(task.workspace.dirty)>0?' · '+task.workspace.dirty+' changed':''}</small></div>}
    {task.folder&&<div className="workWorkspaceLine"><Folder size={12}/><span>{task.folder.name}</span><small>Local Files</small></div>}
    {Array.isArray(task.apps)&&task.apps.length>0&&<div className="workAppsLine"><Plug size={12}/><span>{task.apps.map(app=>app.name).join(' · ')}</span><small>{task.apps.reduce((sum,app)=>sum+(Number(app.toolCount)||0),0)} direct MCP tools</small></div>}
    {agents.length>0&&<div className="workAgentList">{agents.map(agent=>{
      const body=<><ProviderBadge model={agent} small/><span><b>{agent.name}</b><small>{agent.role} · {agent.detail||agent.status}</small></span>{Array.isArray(agent.thread)&&agent.thread.length>0&&<span className="agentMessageCount">{agent.thread.length}</span>}</>;
      return onOpenAgent&&!agent.controller
        ? <button type="button" className={'workAgent '+agent.status+' clickable'} key={agent.id} onClick={()=>onOpenAgent(task,agent)}>{body}</button>
        : <div className={'workAgent '+agent.status} key={agent.id}>{body}</div>;
    })}</div>}
    {Array.isArray(task.progress)&&task.progress.length>0&&<div className="workTaskProgress">{task.progress.slice(-6).map(item=><span key={item.id}>{item.text}</span>)}</div>}
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

function PlusMenu({fileRef,photoRef,cameraRef,onBrowser,onPlugins,tools,setSelectedTool,mode,showBottomPanel=true,webSearchEnabled=false,onToggleWebSearch,deepResearchEnabled=false,onToggleDeepResearch,directMcpConnections=[],selectedMcpIds=[],onToggleMcp,localFolderWorkspace,onChooseLocalFolder,onClearLocalFolder}){
  return <div className="floatingMenu plusPicker" role="menu" aria-label="Add">
    <div className="floatingTitle">Add</div>
    {isNative?<>
      <MenuRow icon={Camera} label="Camera" onClick={()=>cameraRef.current?.click()}/>
      <MenuRow icon={Image} label="Photos" onClick={()=>photoRef.current?.click()}/>
      <MenuRow icon={Paperclip} label="Files" onClick={()=>fileRef.current?.click()}/>
    </>:!(mode==='work'&&isWindowsDesktop)&&<MenuRow icon={Paperclip} label={isWindowsDesktop?'Files':'Files and folders'} onClick={()=>fileRef.current?.click()}/>} 
    {!isNative&&mode==='chat'&&isWindowsDesktop&&<MenuRow icon={Globe2} label="Search the web" sub={webSearchEnabled?'Live Search is enabled for the next message':'Use the selected browser AI’s live Search tool and return sources'} active={webSearchEnabled} onClick={onToggleWebSearch}/>}
    {!isNative&&mode==='chat'&&isWindowsDesktop&&<MenuRow icon={Sparkles} label="Deep research" sub={deepResearchEnabled?'Deep Research is enabled for the next message':'Review a plan first; browser models use native research and API models can use configured Free AI retrieval'} active={deepResearchEnabled} onClick={onToggleDeepResearch}/>}
    {!isNative&&!(mode==='work'&&isWindowsDesktop&&showBottomPanel)&&<MenuRow icon={Chrome} label="Browser" sub="Browse beside your chat in Free AI's own browser" onClick={onBrowser}/>}
    {mode==='work'&&<MenuRow icon={Paperclip} label="Attach files" sub="Attach specific files to this message" onClick={()=>fileRef.current?.click()}/>}
    {mode==='work'&&isWindowsDesktop&&!showBottomPanel&&<MenuRow icon={Folder} label={localFolderWorkspace?'Change local folder':'Open local folder'} sub={localFolderWorkspace?localFolderWorkspace.name:'Give Work scoped access to a local folder'} onClick={onChooseLocalFolder}/>}
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
      <MenuRow key={t.key} icon={Plug} label={t.mcp} sub={t.ownerName+' · provider-managed, unverified'} onClick={mode==='work'&&isWindowsDesktop?undefined:()=>setSelectedTool(t)}/>
    )}
    {!(mode==='work'&&isWindowsDesktop&&showBottomPanel)&&<MenuRow icon={Blocks} label="Manage plugins" onClick={onPlugins}/>} 
  </div>
}

function MenuRow({icon:Icon,label,sub,onClick,active=false}){
  const body=<><Icon size={18}/><span><b>{label}</b>{sub&&<small>{sub}</small>}</span>{active&&<Check size={14}/>}</>;
  if(!onClick)return <div className={'menuRow staticRow '+(active?'active':'')}>{body}</div>;
  return <button className={'menuRow '+(active?'active':'')} role="menuitem" aria-checked={active||undefined} onClick={onClick}>{body}</button>
}

function ProfileMenu({session,onSettings,onLogout}){
  const name=session?.user?.user_metadata?.full_name||session?.user?.email?.split('@')[0]||'User';
  return <div className="profileMenu" role="menu" aria-label="Account">
    <div className="profileMenuUser"><span className="avatar large">{initials(session)}</span><span><b>{name}</b><small>{session?.user?.email||'Free AI account'}</small></span></div>
    <MenuRow icon={Briefcase} label="Workspace settings" onClick={onSettings}/>
    <MenuRow icon={Settings} label="Settings" onClick={onSettings}/>
    <MenuRow icon={LogOut} label="Log out" onClick={onLogout}/>
  </div>
}

function pluginSearchMatch(values,needle){
  if(!needle)return true;
  return values.filter(Boolean).join(' ').toLowerCase().includes(needle);
}

function PluginDetailsDialog({item,onClose,onOpenPublicDirectory,onRefreshMcp,onRemoveMcp,onToggleMcp,selectedMcpIds=[]}){
  if(!item)return null;
  const direct=item.kind==='direct'?item.connection:null;
  const publicItem=item.kind==='public'?item.entry:null;
  const hint=item.kind==='hint'?item.hint:null;
  const capability=direct?directMcpCapabilitySummary(direct):null;
  const selected=direct&&selectedMcpIds.includes(direct.id);
  return <div className="projectDialogScrim pluginDetailsScrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
    <div className="pluginDetailsDialog" role="dialog" aria-modal="true" aria-label="Plugin details">
      <div className="projectDialogHeader">
        <div>
          <b>{direct?.name||publicItem?.name||hint?.mcp||'Plugin'}</b>
          <small>{item.kind==='direct'?'Configured direct MCP app':item.kind==='public'?'Public ChatGPT directory listing':'Provider-managed connector hint'}</small>
        </div>
        <button onClick={onClose} aria-label="Close"><X size={17}/></button>
      </div>

      {direct&&<>
        <div className="pluginDetailsStatusRow">
          <span className={'connectionStatus '+(direct.connected?'good':'')}>{direct.connected?'Connected':'Saved'}</span>
          <span>{direct.protocolVersion?('MCP '+direct.protocolVersion):'Unknown protocol version'}</span>
          <span>{direct.hasToken?'Bearer token stored securely':'No stored token'}</span>
        </div>
        <div className="pluginDetailsBlock"><b>Endpoint</b><code>{direct.url}</code></div>
        <div className="pluginDetailsBlock">
          <b>Capabilities</b>
          <span>{capability.tools} tools · {capability.readOnly} declared read-only · {capability.writeLike} may modify state{capability.destructive?(' · '+capability.destructive+' marked destructive'):''}</span>
          <small>Free AI derives these labels from MCP tool annotations. Missing annotations are not treated as read-only.</small>
        </div>
        {direct.error&&<div className="formError">{direct.error}</div>}
        <div className="pluginPermissionList">
          {(direct.tools||[]).map(tool=><div key={tool.name}>
            <span><b>{tool.title||tool.name}</b><small>{tool.description||tool.name}</small></span>
            <span className={'capabilityBadge '+(tool.annotations?.readOnlyHint===true&&tool.annotations?.destructiveHint!==true?'read':'write')}>
              {tool.annotations?.destructiveHint===true?'Destructive':tool.annotations?.readOnlyHint===true?'Read-only':'May write'}
            </span>
          </div>)}
          {!direct.tools?.length&&<div className="muted">No MCP tools were returned by this endpoint.</div>}
        </div>
        <div className="pluginDetailsActions">
          <button onClick={()=>onRefreshMcp?.()}>Refresh tools</button>
          <button className={selected?'selectedPluginAction':''} onClick={()=>onToggleMcp?.(direct.id)}>{selected?'Remove from next Work task':'Use in next Work task'}</button>
          <button className="dangerText" onClick={()=>{onRemoveMcp?.(direct.id);onClose?.()}}>Remove</button>
        </div>
      </>}

      {publicItem&&<>
        <div className="pluginDetailsStatusRow"><span>Public directory</span><span>{publicItem.category}</span></div>
        <div className="pluginDetailsBlock"><b>What it does</b><span>{publicItem.description}</span></div>
        <div className="pluginDetailsBlock">
          <b>Connection</b>
          <span>This is a discovery listing from ChatGPT's public plugin directory, not a Free AI installation.</span>
          <small>Free AI does not have this app's authorization backend or provider account connection. Open the public directory to review its current setup requirements and connect it there.</small>
        </div>
        <div className="pluginDetailsBlock">
          <b>Verification</b>
          <span>Not asserted by Free AI.</span>
          <small>OpenAI Verified is a separate directory badge. Free AI does not infer that badge from an app name.</small>
        </div>
        <div className="pluginDetailsActions"><button className="primaryAction" onClick={onOpenPublicDirectory}><ExternalLink size={13}/>Open ChatGPT directory</button></div>
      </>}

      {hint&&<>
        <div className="pluginDetailsStatusRow"><span className="warningBadge">Unverified hint</span><span>{hint.ownerName||'Browser provider'}</span></div>
        <div className="pluginDetailsBlock"><b>Detected label</b><span>{hint.mcp}</span></div>
        <div className="pluginDetailsBlock">
          <b>What Free AI knows</b>
          <span>This label was observed in a connected AI provider's browser UI.</span>
          <small>It is not proof that an MCP server is reachable, that a tool exists, or that the provider used it. Provider authorization and permissions remain outside Free AI.</small>
        </div>
      </>}
    </div>
  </div>;
}

function PublicDirectoryCard({entry,onOpen}){
  return <button className="directoryCard" onClick={onOpen}>
    <span className="directoryIcon">{entry.name.slice(0,1).toUpperCase()}</span>
    <span><b>{entry.name}</b><small>{entry.description}</small></span>
    <span className="directoryCategory">{entry.category}</span>
  </button>;
}

function PluginsPage({
  tools,connected,directMcpConnections=[],selectedMcpIds=[],onToggleMcp,
  mcpDraft,setMcpDraft,mcpError,onAddMcp,onRemoveMcp,onRefreshMcp,onBack,onRefresh,onExplore,onOpenPublicDirectory
}){
  const [query,setQuery]=useState('');
  const [view,setView]=useState(()=>isNative?'discover':'configured');
  const [category,setCategory]=useState('All');
  const [details,setDetails]=useState(null);
  const pageName=isNative?'Apps':'Plugins';
  const needle=query.trim().toLowerCase();
  if(!isWindowsDesktop){
    const visibleTools=needle?tools.filter(t=>pluginSearchMatch([t.mcp,t.ownerName],needle)):tools;
    const visibleProviders=needle?connected.filter(p=>pluginSearchMatch([modelLabel(p),...(p.mcps||[])],needle)):connected;
    if(isNative){
      const mobileCategories=['All',...new Set(publicPluginDirectory.map(item=>item.category))];
      const visiblePublic=publicPluginDirectory.filter(entry=>
        (category==='All'||entry.category===category)&&pluginSearchMatch([entry.name,entry.category,entry.description],needle)
      );
      return <div className="contentPage mobileAppsPage" data-app-view={view}>
        <PageTop onBack={onBack} title="Apps" action="Explore" onAction={onExplore}/>
        <div className="contentInner pluginsDirectoryInner">
          <div className="pluginPageHero">
            <div><h1>Apps</h1><p className="pageLead">Discover app listings, review capabilities exposed by connected AI providers, and keep authorization status explicit.</p></div>
          </div>
          <div className="searchBar mobileAppsSearch"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps and providers"/></div>
          <div className="directoryTabs mobileAppsTabs" role="tablist" aria-label="Apps sections">
            {[['discover','Discover'],['available','Available'],['providers','Providers']].map(([id,label])=>
              <button key={id} role="tab" aria-selected={view===id} className={view===id?'active':''} onClick={()=>setView(id)}>{label}</button>
            )}
          </div>

          {view==='discover'&&<section className="pluginSection mobileAppsDiscover">
            <div className="sectionHeading"><div><h2>Discover</h2><small>Public ChatGPT directory listings. A listing is not an installation or account connection in Free AI.</small></div><button className="textLinkButton" onClick={onOpenPublicDirectory}><ExternalLink size={13}/>Directory</button></div>
            <div className="directoryChips">{mobileCategories.map(name=><button key={name} className={category===name?'active':''} onClick={()=>setCategory(name)}>{name}</button>)}</div>
            <div className="directoryGrid">
              {visiblePublic.map(entry=><PublicDirectoryCard key={entry.id} entry={entry} onOpen={()=>setDetails({kind:'public',entry})}/>)}
              {!visiblePublic.length&&<div className="pluginEmptyCard"><Search size={22}/><b>No app listing matches</b><span>Try another category or search term.</span></div>}
            </div>
          </section>}

          {view==='available'&&<section className="pluginSection mobileAppsAvailable">
            <div className="sectionHeading"><div><h2>Available from connected providers</h2><small>Observed provider labels only. They are not treated as installed apps or verified MCP tools.</small></div><span className="pluginMeta">{visibleTools.length}</span></div>
            <div className="pluginHint warningHint"><Chrome size={20}/><div><b>Provider-managed</b><span>Account authorization, permissions, and supported actions remain controlled by the provider or its app connection.</span></div></div>
            <div className="hintGrid">
              {visibleTools.map(tool=><button className="hintCard" key={tool.key} onClick={()=>setDetails({kind:'hint',hint:tool})}><span className="directoryIcon"><Plug size={15}/></span><span><b>{tool.mcp}</b><small>{tool.ownerName}</small></span><ChevronRight size={14}/></button>)}
              {!visibleTools.length&&<div className="pluginEmptyCard"><Plug size={22}/><b>No provider app hints</b><span>Connect a supported AI provider on your paired desktop to surface its available labels here.</span></div>}
            </div>
          </section>}

          {view==='providers'&&<section className="pluginSection mobileAppsProviders">
            <div className="sectionHeading"><div><h2>Connected AI providers</h2><small>Provider connectivity is separate from app authorization.</small></div><span className="pluginMeta">{visibleProviders.length}</span></div>
            <div className="pluginGrid">
              {visibleProviders.map(provider=><div className="pluginCard" key={(provider.source||'browser')+provider.id}>
                <span className={'providerBadge '+(provider.source==='api'?'api':provider.id)}>{modelLabel(provider).slice(0,1)}</span>
                <span><b>{modelLabel(provider)}</b><small>{provider.source==='api'?'API model':((provider.mcps?.length||0)+' provider app hints')}</small></span>
                <span className={'connectionStatus '+(provider.source==='browser'?'good':'')}>{provider.source==='browser'?'Live':'API'}</span>
              </div>)}
              {!visibleProviders.length&&<div className="pluginEmptyCard"><Bot size={22}/><b>No AI provider is connected</b><span>Pair your desktop or add an API model in Settings.</span></div>}
            </div>
          </section>}
        </div>
        {details&&<PluginDetailsDialog item={details} onClose={()=>setDetails(null)} onOpenPublicDirectory={onOpenPublicDirectory}
          onRefreshMcp={onRefreshMcp} onRemoveMcp={onRemoveMcp} onToggleMcp={onToggleMcp} selectedMcpIds={selectedMcpIds}/>}
      </div>;
    }
    return <div className="contentPage">
      <PageTop onBack={onBack} title={pageName} action={isDesktop?'Refresh':null} onAction={onRefresh}/>
      <div className="contentInner">
        <h1>{pageName}</h1>
        <p className="pageLead">Provider-managed connectors are surfaced only when a connected AI provider exposes them in its own interface.</p>
        <div className="searchBar"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search provider hints"/></div>
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
    </div>;
  }
  const categories=['All',...new Set(publicPluginDirectory.map(item=>item.category))];
  const visibleTools=tools.filter(t=>pluginSearchMatch([t.mcp,t.ownerName],needle));
  const visibleProviders=connected.filter(p=>pluginSearchMatch([modelLabel(p),...(p.mcps||[])],needle));
  const visibleDirect=directMcpConnections.filter(connection=>pluginSearchMatch([
    connection.name,connection.url,...(connection.tools||[]).flatMap(tool=>[tool.name,tool.title,tool.description])
  ],needle));
  const visiblePublic=publicPluginDirectory.filter(entry=>
    (category==='All'||entry.category===category)&&pluginSearchMatch([entry.name,entry.category,entry.description],needle)
  );

  return <div className="contentPage">
    <PageTop onBack={onBack} title={pageName} action={isWindowsDesktop?'Explore':null} onAction={onExplore}/>
    <div className="contentInner pluginsDirectoryInner">
      <div className="pluginPageHero">
        <div><h1>{pageName}</h1><p className="pageLead">{isWindowsDesktop
          ? 'Manage apps Free AI can actually call, and separately browse public directory listings and unverified provider hints.'
          : 'Provider-managed connectors are surfaced only when a connected AI provider exposes them in its own interface.'}</p></div>
        {isWindowsDesktop&&<button className="secondaryAction" onClick={onRefresh}><RefreshCw size={14}/>Refresh connections</button>}
      </div>

      <div className="searchBar"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={isWindowsDesktop?'Search configured apps, public listings, or hints':'Search provider hints'}/></div>
      {isWindowsDesktop&&<div className="directoryTabs" role="tablist" aria-label="Plugin directory sections">
        {[['configured','Configured'],['discover','Discover'],['hints','Provider hints'],['providers','AI providers']].map(([id,label])=>
          <button key={id} role="tab" aria-selected={view===id} className={view===id?'active':''} onClick={()=>setView(id)}>{label}</button>
        )}
      </div>}

      {isWindowsDesktop&&view==='configured'&&<section className="pluginSection">
        <div className="sectionHeading"><div><h2>Configured in Free AI</h2><small>Only these direct MCP apps are callable by the Windows Work runtime.</small></div><span className="pluginMeta">{visibleDirect.length} apps</span></div>
        <div className="directMcpGrid">
          {visibleDirect.map(connection=>{
            const cap=directMcpCapabilitySummary(connection);
            const selected=selectedMcpIds.includes(connection.id);
            return <div className="directMcpCard directoryManagedCard" key={connection.id}>
              <button className="directMcpMain" onClick={()=>setDetails({kind:'direct',connection})}>
                <span className="pluginIcon"><Plug size={17}/></span>
                <span><b>{connection.name}</b><small>{connection.url}</small></span>
                <span className={'connectionStatus '+(connection.connected?'good':'')}>{connection.connected?'Connected':'Saved'}</span>
              </button>
              <div className="directMcpMeta">
                <span>{cap.tools} tools</span><span>{cap.readOnly} read-only</span><span>{cap.writeLike} may write</span>
                {connection.hasToken&&<span>Secure token</span>}
              </div>
              {connection.error&&<div className="formError">{connection.error}</div>}
              <div className="directMcpActions">
                <button onClick={()=>setDetails({kind:'direct',connection})}>Details</button>
                <button className={selected?'selectedPluginAction':''} onClick={()=>onToggleMcp?.(connection.id)}>{selected?'Selected':'Use in Work'}</button>
              </div>
            </div>;
          })}
          {!visibleDirect.length&&<div className="pluginEmptyCard"><Plug size={22}/><b>{needle?'No configured MCP app matches':'No direct MCP apps configured'}</b><span>Free AI does not pretend public directory entries are installed. Add an MCP endpoint below to create a real callable connection.</span></div>}
        </div>

        <div className="mcpAddCard">
          <div><b>Connect a direct MCP app</b><small>Real Streamable HTTP MCP 2025-11-25. The optional bearer token is stored by the desktop process, not exposed to the renderer.</small></div>
          <div className="mcpAddForm">
            <input placeholder="App name" value={mcpDraft?.name||''} onChange={e=>setMcpDraft?.({...mcpDraft,name:e.target.value})}/>
            <input placeholder="https://example.com/mcp" value={mcpDraft?.url||''} onChange={e=>setMcpDraft?.({...mcpDraft,url:e.target.value})}/>
            <input type="password" placeholder="Bearer token (optional)" value={mcpDraft?.token||''} onChange={e=>setMcpDraft?.({...mcpDraft,token:e.target.value})}/>
            <button className="primaryAction" onClick={onAddMcp} disabled={!String(mcpDraft?.url||'').trim()}>Connect and add</button>
          </div>
          {mcpError&&<div className="formError">{mcpError}</div>}
        </div>
      </section>}

      {isWindowsDesktop&&view==='discover'&&<section className="pluginSection">
        <div className="sectionHeading"><div><h2>Discover</h2><small>Examples from ChatGPT's public plugin directory. Availability can change; use the live directory for current setup.</small></div><button className="textLinkButton" onClick={onOpenPublicDirectory}><ExternalLink size={13}/>Open public directory</button></div>
        <div className="pluginHint directoryNotice"><Blocks size={20}/><div><b>Discovery is separate from connection</b><span>Free AI can browse public listings, but it only calls apps that you explicitly configure as direct MCP connections. Public app authorization remains in the provider or ChatGPT.</span></div></div>
        <div className="directoryChips">{categories.map(name=><button key={name} className={category===name?'active':''} onClick={()=>setCategory(name)}>{name}</button>)}</div>
        <div className="directoryGrid">
          {visiblePublic.map(entry=><PublicDirectoryCard key={entry.id} entry={entry} onOpen={()=>setDetails({kind:'public',entry})}/>)}
          {!visiblePublic.length&&<div className="pluginEmptyCard"><Search size={22}/><b>No public listing matches</b><span>Try another category or search term.</span></div>}
        </div>
      </section>}

      {(!isWindowsDesktop||view==='hints')&&<section className="pluginSection">
        <div className="sectionHeading"><div><h2>Provider-managed connector hints</h2><small>Labels observed in provider UI; not direct MCP verification.</small></div><span className="pluginMeta">{visibleTools.length} hints</span></div>
        <div className="pluginHint warningHint"><Chrome size={20}/><div><b>Unverified</b><span>These labels do not prove a tool exists, that it is connected, or that the provider used it. Free AI never promotes them to callable MCP tools.</span></div></div>
        <div className="hintGrid">
          {visibleTools.map(t=><button key={t.key} className="hintCard" onClick={()=>setDetails({kind:'hint',hint:t})}><span className="pluginIcon"><Plug size={16}/></span><span><b>{t.mcp}</b><small>{t.ownerName||'Provider UI'} · unverified</small></span><ChevronRight size={14}/></button>)}
          {!visibleTools.length&&<div className="pluginEmptyCard"><Plug size={22}/><b>{query?'No provider hint matches':'No provider-managed hints detected'}</b><span>Hints appear only when the browser extension can observe them in a connected provider UI.</span></div>}
        </div>
      </section>}

      {isWindowsDesktop&&view==='providers'&&<section className="pluginSection">
        <div className="sectionHeading"><div><h2>Connected AI providers</h2><small>Controller models are not plugin installations.</small></div><span className="pluginMeta">{visibleProviders.length} providers</span></div>
        <div className="pluginGrid">
          {visibleProviders.map(provider=><div className="pluginCard" key={(provider.source||'browser')+provider.id}>
            <span className={'providerBadge '+(provider.source==='api'?'api':provider.id)}>{modelLabel(provider).slice(0,1)}</span>
            <span><b>{modelLabel(provider)}</b><small>{provider.source==='api'?'API model':((provider.mcps?.length||0)+' provider UI hints')}</small></span>
            <span className={'connectionStatus '+(provider.source==='browser'?'good':'')}>{provider.source==='browser'?'Live':'API'}</span>
          </div>)}
          {!visibleProviders.length&&<div className="pluginEmptyCard"><Bot size={22}/><b>No AI provider is connected</b><span>Open a supported AI site in Chromium with the Free AI extension, or add an API model in Settings.</span></div>}
        </div>
      </section>}
    </div>

    {details&&<PluginDetailsDialog item={details} onClose={()=>setDetails(null)} onOpenPublicDirectory={onOpenPublicDirectory}
      onRefreshMcp={onRefreshMcp} onRemoveMcp={onRemoveMcp} onToggleMcp={onToggleMcp} selectedMcpIds={selectedMcpIds}/>}
  </div>;
}

function ExplorePage({tools,chats=[],directMcpConnections=[],selectedMcpIds=[],onToggleMcp,onRefreshMcp,onRemoveMcp,onBack,onManagePlugins,onOpenPublicDirectory,onOpenChat}){
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [category,setCategory]=useState('All');
  const [details,setDetails]=useState(null);
  if(!isWindowsDesktop){
    if(isNative){
      const mobileNeedle=query.trim().toLowerCase();
      const visibleApps=publicPluginDirectory.filter(entry=>pluginSearchMatch([entry.name,entry.category,entry.description],mobileNeedle));
      const visibleHints=tools.filter(tool=>pluginSearchMatch([tool.mcp,tool.ownerName],mobileNeedle));
      const visibleChats=chats.filter(chat=>pluginSearchMatch([chat.title,chat.modelName,chat.providerId],mobileNeedle));
      const showApps=filter==='all'||filter==='apps';
      const showChats=filter==='all'||filter==='chats';
      return <div className="contentPage mobileExplorePage" data-explore-filter={filter}>
        <PageTop onBack={onBack} title="Explore" action="Apps" onAction={onManagePlugins}/>
        <div className="contentInner exploreDirectoryInner">
          <div className="exploreHero"><span className="exploreMark"><Blocks size={22}/></span><div><h1>Explore</h1><p className="pageLead">Search discoverable apps, provider capabilities, and your conversations from one mobile surface.</p></div></div>
          <div className="searchBar mobileExploreSearch"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps and conversations"/></div>
          <div className="directoryTabs exploreFilters mobileExploreTabs" role="tablist" aria-label="Explore filters">
            {[['all','All'],['apps','Apps'],['chats','Chats']].map(([id,label])=>
              <button key={id} role="tab" aria-selected={filter===id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>
            )}
          </div>

          {showApps&&<section className="exploreSection mobileExploreApps">
            <div className="sectionHeading"><div><h2>Apps</h2><small>Public listings are discovery only; provider hints are shown separately and never treated as installed.</small></div><button className="textLinkButton" onClick={onManagePlugins}>Manage</button></div>
            <div className="directoryGrid">
              {visibleApps.map(entry=><PublicDirectoryCard key={entry.id} entry={entry} onOpen={()=>setDetails({kind:'public',entry})}/>)}
              {!visibleApps.length&&!visibleHints.length&&<div className="pluginEmptyCard"><Search size={22}/><b>No app matches</b><span>Try another search term.</span></div>}
            </div>
            {!!visibleHints.length&&<>
              <div className="sectionHeading mobileExploreHintsHeading"><div><h2>Available from providers</h2><small>Unverified provider-managed labels.</small></div><span className="pluginMeta">{visibleHints.length}</span></div>
              <div className="hintGrid">
                {visibleHints.map(tool=><button className="hintCard" key={tool.key} onClick={()=>setDetails({kind:'hint',hint:tool})}><span className="directoryIcon"><Plug size={15}/></span><span><b>{tool.mcp}</b><small>{tool.ownerName}</small></span><ChevronRight size={14}/></button>)}
              </div>
            </>}
          </section>}

          {showChats&&<section className="exploreSection mobileExploreChats">
            <div className="sectionHeading"><div><h2>Conversations</h2><small>Search your local Free AI history.</small></div><span className="pluginMeta">{visibleChats.length}</span></div>
            <div className="toolList">
              {visibleChats.map(chat=><MenuRow key={chat.id} icon={Bot} label={chat.title} sub={chat.modelName||chat.providerId||'Conversation'} onClick={()=>onOpenChat?.(chat)}/>)}
              {!visibleChats.length&&<div className="pluginEmptyCard"><Bot size={22}/><b>No conversation matches</b><span>{query?'Try another search term.':'Your conversations will appear here.'}</span></div>}
            </div>
          </section>}
        </div>
        {details&&<PluginDetailsDialog item={details} onClose={()=>setDetails(null)} onOpenPublicDirectory={onOpenPublicDirectory}
          onRefreshMcp={onRefreshMcp} onRemoveMcp={onRemoveMcp} onToggleMcp={onToggleMcp} selectedMcpIds={selectedMcpIds}/>}
      </div>;
    }
    return <div className="contentPage">
      <PageTop onBack={onBack} title="Explore"/>
      <div className="contentInner exploreInner">
        <div className="searchBar"><Search size={17}/><input placeholder="Search Free AI"/></div>
        <><h3>Desktop tools</h3><MenuRow icon={Monitor} label="Computer" sub="Control your desktop in Work mode"/><MenuRow icon={Globe2} label="Browser" sub="Browse and research inside Free AI"/></>
        <h3>Provider connector hints</h3>{tools.slice(0,8).map(t=><MenuRow key={t.key} icon={Plug} label={t.mcp} sub={t.ownerName+' · unverified'}/>)}
        <h3>Conversations</h3>{chats.slice(0,8).map(chat=><MenuRow key={chat.id} icon={Bot} label={chat.title} sub={chat.modelName}/>)}
      </div>
    </div>;
  }
  const needle=query.trim().toLowerCase();
  const categories=['All',...new Set(publicPluginDirectory.map(item=>item.category))];
  const direct=directMcpConnections.filter(connection=>pluginSearchMatch([
    connection.name,connection.url,...(connection.tools||[]).flatMap(tool=>[tool.name,tool.title,tool.description])
  ],needle));
  const publicItems=publicPluginDirectory.filter(entry=>
    (category==='All'||entry.category===category)&&pluginSearchMatch([entry.name,entry.category,entry.description],needle)
  );
  const hints=tools.filter(tool=>pluginSearchMatch([tool.mcp,tool.ownerName],needle));
  const showDirect=filter==='all'||filter==='configured';
  const showPublic=filter==='all'||filter==='public';
  const showHints=filter==='all'||filter==='hints';

  return <div className="contentPage">
    <PageTop onBack={onBack} title="Explore" action={isWindowsDesktop?'Plugins':null} onAction={onManagePlugins}/>
    <div className="contentInner exploreDirectoryInner">
      <div className="exploreHero">
        <span className="exploreMark"><Blocks size={22}/></span>
        <div><h1>Explore</h1><p className="pageLead">Discover public plugin listings, inspect the apps already configured in Free AI, and keep unverified provider hints clearly separate.</p></div>
      </div>

      <div className="searchBar"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps, capabilities, or categories"/></div>
      <div className="directoryTabs exploreFilters" role="tablist" aria-label="Explore filters">
        {[['all','All'],['configured','Configured'],['public','Public directory'],['hints','Provider hints']].map(([id,label])=>
          <button key={id} role="tab" aria-selected={filter===id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>
        )}
      </div>

      {showDirect&&<section className="exploreSection">
        <div className="sectionHeading"><div><h2>Configured in Free AI</h2><small>Real direct MCP connections available to Work and Super AI.</small></div><button className="textLinkButton" onClick={onManagePlugins}>Manage</button></div>
        <div className="directoryGrid compactDirectoryGrid">
          {direct.map(connection=>{
            const cap=directMcpCapabilitySummary(connection);
            const selected=selectedMcpIds.includes(connection.id);
            return <div className="directoryCard managedExploreCard" key={connection.id}>
              <button className="directoryCardMain" onClick={()=>setDetails({kind:'direct',connection})}><span className="directoryIcon"><Plug size={16}/></span><span><b>{connection.name}</b><small>{cap.tools} tools · {cap.readOnly} read-only · {cap.writeLike} may write</small></span></button>
              <button className={'usePluginButton '+(selected?'active':'')} onClick={()=>onToggleMcp?.(connection.id)}>{selected?<Check size={13}/>:<Plus size={13}/>}{selected?'Selected':'Use'}</button>
            </div>;
          })}
          {!direct.length&&<button className="pluginEmptyCard clickableEmpty" onClick={onManagePlugins}><Plus size={22}/><b>No direct MCP apps configured</b><span>Open Plugins to connect a real MCP endpoint.</span></button>}
        </div>
      </section>}

      {showPublic&&<section className="exploreSection">
        <div className="sectionHeading"><div><h2>Public directory</h2><small>Discoverable ChatGPT plugin listings. Opening one does not install it into Free AI.</small></div><button className="textLinkButton" onClick={onOpenPublicDirectory}><ExternalLink size={13}/>Browse live directory</button></div>
        <div className="directoryChips">{categories.map(name=><button key={name} className={category===name?'active':''} onClick={()=>setCategory(name)}>{name}</button>)}</div>
        <div className="directoryGrid">
          {publicItems.map(entry=><PublicDirectoryCard key={entry.id} entry={entry} onOpen={()=>setDetails({kind:'public',entry})}/>)}
          {!publicItems.length&&<div className="pluginEmptyCard"><Search size={22}/><b>No public listing matches</b><span>Try another category or search term.</span></div>}
        </div>
      </section>}

      {showHints&&<section className="exploreSection">
        <div className="sectionHeading"><div><h2>Provider hints</h2><small>Observed labels only — never treated as installed apps.</small></div><span className="pluginMeta">{hints.length} hints</span></div>
        <div className="hintGrid">
          {hints.map(item=><button key={item.key} className="hintCard" onClick={()=>setDetails({kind:'hint',hint:item})}><span className="pluginIcon"><Chrome size={16}/></span><span><b>{item.mcp}</b><small>{item.ownerName||'Provider UI'} · unverified</small></span><ChevronRight size={14}/></button>)}
          {!hints.length&&<div className="pluginEmptyCard"><Plug size={22}/><b>No provider hints detected</b><span>Provider hints appear only when the browser extension observes labels in a supported AI provider UI.</span></div>}
        </div>
      </section>}
    </div>

    {details&&<PluginDetailsDialog item={details} onClose={()=>setDetails(null)} onOpenPublicDirectory={onOpenPublicDirectory}
      onRefreshMcp={onRefreshMcp} onRemoveMcp={onRemoveMcp} onToggleMcp={onToggleMcp} selectedMcpIds={selectedMcpIds}/>}
  </div>;
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
  const permissionLabel=request=>{
    const permission=request?.permission;
    if(permission==='media'){
      const mediaTypes=Array.isArray(request?.mediaTypes)?request.mediaTypes:[];
      const audio=mediaTypes.includes('audio'),video=mediaTypes.includes('video');
      if(audio&&video)return 'your camera and microphone';
      if(video)return 'your camera';
      if(audio)return 'your microphone';
      return 'camera or microphone access';
    }
    const labels={geolocation:'your location',notifications:'notifications','clipboard-read':'clipboard access','clipboard-sanitized-write':'clipboard write',fullscreen:'fullscreen',pointerLock:'pointer lock',midi:'MIDI devices',midiSysex:'MIDI system access',openExternal:'external application access'};
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
      <span><b>{permissionHost(permissionRequest)} wants {permissionLabel(permissionRequest)}</b><small>{permissionRequest.userGesture?'Requested after your action.':'Requested by this page.'} Allow for this Free AI session?</small></span>
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
  const {section,setSection,mobileList,setMobileList,onClose,session,prefs,setPrefs,status,settings,setSettings,saveSettings,connected,mcpConnections=[],apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError,onExportData,onClearHistory,onPlugins,onBrowser}=props;
  const [settingsQuery,setSettingsQuery]=useState('');
  const hiddenOnMobile=new Set(['Keyboard shortcuts','Computer use','Files','Configuration','Browser','Git','Environments']);
  const visibleSettings=settingsSections.filter(([,label])=>
    (!isNative||!hiddenOnMobile.has(label))&&
    (label!=='Files'||isWindowsDesktop)&&
    (label!=='App'||isWindowsDesktop)&&
    (!settingsQuery.trim()||label.toLowerCase().includes(settingsQuery.trim().toLowerCase()))
  );
  return <div className={'settingsScreen '+(mobileList?'mobileSettingsList':'mobileSettingsDetail')} data-section={section} role="dialog" aria-modal="true" aria-label="Settings">
    <aside className="settingsNav">
      <button className="backToApp" onClick={onClose}><ArrowLeft size={15}/>Back to app</button>
      <div className="settingsSearch"><Search size={15}/><input value={settingsQuery} onChange={e=>setSettingsQuery(e.target.value)} placeholder="Search settings"/></div>
      {['personal','integrations','coding'].map(group=><div key={group} className="settingsGroup">
        <div className="settingsGroupLabel">{group==='personal'?'Personal':group==='integrations'?'Integrations':'Coding'}</div>
        {visibleSettings.filter(x=>x[0]===group).map(([_,label,Icon])=><button key={label} className={section===label?'active':''} onClick={()=>{setSection(label);setMobileList(false)}}><Icon size={15}/>{isNative&&label==='Plugins'?'Apps':isNative&&label==='Connections'?'Remote Desktop':label}</button>)}
      </div>)}
    </aside>
    <main className="settingsContent">
      <div className="settingsContentTop">
        <button className="mobileSettingsBack" onClick={()=>setMobileList(true)} aria-label="Back to settings"><ArrowLeft size={18}/></button>
        <h1>{isNative&&section==='Connections'?'Remote Desktop':section}</h1>
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
      {section==='Computer use'&&!isNative&&<SimpleSettings title="Computer use" rows={[
        ['Availability',desktopPlatform==='linux'?'Desktop interaction is not enabled on Linux':'Available to Work and Super AI on this computer'],
        ['Screen handling',desktopPlatform==='linux'?'No interactive desktop control':'Screenshots are used internally by the active AI task; no screen-mirror panel is shown'],
        ['Approvals',normalizeApprovalMode(prefs.approvalMode)==='low'?'Allow low-risk':normalizeApprovalMode(prefs.approvalMode)==='read'?'Allow reads':'Always ask']
      ]}/>}
      {section==='Files'&&isWindowsDesktop&&<SimpleSettings title="Files" rows={[['Local folder access','Windows Work/Super AI · user-selected folder per conversation'],['Read actions','List, stat, bounded text read, and explicit file attach'],['Writes','Text file create/replace · confirmation-gated'],['Credential files','.git, .env, private keys, and common credential files blocked from automated access']]}/>}
      {section==='Plugins'&&<IntegrationSettings icon={Plug} title={isNative?'Apps':'Plugins'} text={isWindowsDesktop?"Manage direct MCP apps plus provider-managed connector hints.":isNative?"Discover app listings and review provider-managed capabilities. Account authorization and permissions remain with the provider or app connection.":"Use provider-managed connectors exposed by connected AI services."} status={isWindowsDesktop?(mcpConnections.length+' direct apps'):(connected.filter(p=>p.mcps?.length).length+' providers')} action={onPlugins}/>}
      {section==='Browser'&&!isNative&&<BrowserSettings prefs={prefs} setPrefs={setPrefs} onBrowser={onBrowser} status={status}/>}
      {section==='Connections'&&(isNative
        ? <RemoteDesktopSettings {...{status,settings,setSettings,saveSettings,connected}}/>
        : <ConnectionsSettings {...{status,settings,setSettings,saveSettings,connected,apiDraft,setApiDraft,addApiConnection,removeApiConnection,apiError}}/>)
      }
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
      <SettingRow title="Work approvals" desc={isWindowsDesktop?"Choose how much low-risk browser, computer, local-file and app activity Work can continue without repeated prompts. New website/app/folder scopes and sensitive actions still require explicit approval.":"Choose how much low-risk browser and computer activity Work can continue without repeated prompts. Website access and sensitive actions still require explicit approval."} control={<select value={normalizeApprovalMode(prefs.approvalMode)} onChange={e=>setPrefs({...prefs,approvalMode:e.target.value})}><option value="ask">Always ask</option><option value="read">Allow reads</option><option value="low">Allow low-risk</option></select>}/>
      <SettingRow title="Sensitive actions" desc={isWindowsDesktop?"Typing, state-changing clicks, keyboard shortcuts, drag operations, tab closes, local file writes and non-read-only MCP calls remain confirmation-gated.":"Typing, clicks that may change data, keyboard shortcuts, drag operations and closing tabs always pause for approval in the current Work loop."} control={<span className="valuePill">Always confirm</span>}/>
    </div>
    <h3>General</h3>
    <div className="settingBlock">
      <SettingRow title="Bottom panel" desc="Show project, plugin and browser actions below the Work composer." control={<Toggle value={prefs.showBottomPanel!==false} onChange={v=>setPrefs({...prefs,showBottomPanel:v})}/>}/>
    </div>
  </div>
}
function SettingRow({title,desc,control}){return <div className="settingRow"><div><b>{title}</b><small>{desc}</small></div>{control}</div>}
function WindowsAppSettings(){
  const [info,setInfo]=useState(null);
  const [update,setUpdate]=useState(null);
  const [checking,setChecking]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    window.desktopApi?.getAppInfo?.().then(value=>{if(!cancelled)setInfo(value)}).catch(()=>{});
    return()=>{cancelled=true};
  },[]);
  async function check(){
    setChecking(true);setError('');
    try{setUpdate(await window.desktopApi.checkForUpdates())}
    catch(e){setUpdate(null);setError(e?.message||'Could not check for updates.')}
    finally{setChecking(false)}
  }
  async function openRelease(){
    if(update?.url)await window.desktopApi?.openExternal?.(update.url);
  }
  return <div className="settingsPane">
    <h3>Windows app</h3>
    <div className="settingBlock">
      <SettingRow title="Version" desc="The installed Free AI desktop version." control={<span className="valuePill">{info?.version||'Loading…'}</span>}/>
      <SettingRow title="Authentication link handler" desc="Free AI uses the freeai:// protocol to return securely from desktop sign-in." control={<span className={'connectionStatus '+(info?.authProtocolRegistered?'good':'')}>{info?.authProtocolRegistered?'Registered':'Not registered'}</span>}/>
      <SettingRow title="Updates" desc="Check the official Free AI GitHub Releases feed. Free AI does not silently install an update." control={<button className="settingsInlineButton" disabled={checking} onClick={check}>{checking?'Checking…':'Check for updates'}</button>}/>
    </div>
    {update&&<div className="settingsStatus">
      {update.updateAvailable
        ? <span>Version {update.latestVersion} is available. <button className="textLinkButton" onClick={openRelease}><ExternalLink size={13}/>Open release</button></span>
        : <span>Free AI {update.currentVersion} is up to date with the latest published release ({update.latestVersion}).</span>}
    </div>}
    {error&&<div className="settingsStatus">{error}</div>}
    <h3>Install</h3>
    <div className="settingBlock">
      <SettingRow title="Installer" desc="Windows builds use the NSIS installer produced by the Free AI release workflow." control={<span className="valuePill">{info?.packaged?'Installed build':'Development build'}</span>}/>
    </div>
  </div>
}
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
      <label className="profileField"><span>Display name</span><input dir="auto" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label>
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
      {isNative&&<SettingRow title="Microphone permission" desc={permission==='denied'?'Microphone access is denied. Enable it in Android Settings, then retry.':'Required for native Android dictation.'} control={<button className="settingsInlineButton" onClick={request}>{permission==='granted'?'Granted':permission==='denied'?'Denied · retry':'Request access'}</button>}/>}
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
        <textarea dir="auto" value={prefs.customInstructions||''} onChange={e=>setPrefs({...prefs,customInstructions:e.target.value})} placeholder="What should connected models know about how you want them to respond?"/>
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
  return <div className="settingsPane">
    <h3>Work</h3><div className="settingBlock">
      <SettingRow title="Bottom panel" desc="Show project, plugin and browser actions below the Work composer." control={<Toggle value={prefs.showBottomPanel!==false} onChange={v=>setPrefs({...prefs,showBottomPanel:v})}/>}/>
    </div>
    {isWindowsDesktop&&<><h3>Independent research</h3><div className="settingBlock">
      <label className="formLabel">SearXNG Search API<input value={prefs.researchSearchUrl||''} onChange={e=>setPrefs({...prefs,researchSearchUrl:e.target.value})} placeholder="https://search.example.com"/><small>Used only when an API model runs Free AI-owned Deep Research. The instance must allow JSON search responses.</small></label>
    </div></>}
  </div>
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
function RemoteDesktopSettings({status,settings,setSettings,saveSettings,connected}){
  const paired=!!settings.relayUrl&&!!settings.pairKey;
  const relayConnected=status?.relay===true;
  const desktopOnline=status?.desktopOnline===true;
  const remoteBrowser=status?.remoteCapabilities?.browser?.available===true;
  const remoteComputer=status?.remoteCapabilities?.computer?.available===true;
  const canSave=/^wss?:\/\//i.test(settings.relayUrl.trim())&&settings.pairKey.trim().length>=32;
  const connectionLabel=!paired?'Not paired':!relayConnected?'Relay offline':desktopOnline?'Desktop online':'Desktop offline';
  return <div className="settingsPane remoteDesktopSettings">
    <h3>Remote Desktop</h3>
    <div className="settingBlock">
      <SettingRow title="Connection status" desc="Android connects through the relay; desktop capabilities continue to run on your paired computer." control={<span className={'connectionStatus '+(desktopOnline?'good':'')}>{connectionLabel}</span>}/>
      <label className="formLabel">Relay URL<input value={settings.relayUrl} onChange={e=>setSettings({...settings,relayUrl:e.target.value})} placeholder="wss://your-relay.example.com" inputMode="url" autoCapitalize="none" autoCorrect="off"/></label>
      <label className="formLabel">Pairing API key<input type="password" value={settings.pairKey} onChange={e=>setSettings({...settings,pairKey:e.target.value})} placeholder="Paste the key generated on Desktop" autoCapitalize="none" autoCorrect="off" autoComplete="off"/></label>
      <button className="primaryAction" onClick={saveSettings} disabled={!canSave}>Save pairing</button>
      <div className="settingsStatus">The pairing key identifies this desktop connection. AI provider API keys stay encrypted on Desktop and are never sent to Android.</div>
    </div>
    <h3>Remote capabilities</h3>
    <div className="settingBlock">
      <SettingRow title="Remote Browser" desc="Browser automation runs on the paired desktop through its Chromium extension." control={<span className={'connectionStatus '+(remoteBrowser?'good':'')}>{desktopOnline?(remoteBrowser?'Available':'Unavailable'):'Offline'}</span>}/>
      <SettingRow title="Remote Computer" desc="Computer control runs on the paired desktop; Android never presents it as a local device capability." control={<span className={'connectionStatus '+(remoteComputer?'good':'')}>{desktopOnline?(remoteComputer?'Available':'Unavailable'):'Offline'}</span>}/>
    </div>
    <h3>Remote models</h3>
    <div className="settingBlock">
      {connected.map(model=><div className="apiItem" key={(model.source||'browser')+'::'+model.id}><div><b>{modelLabel(model)}</b><small>{model.source==='api'?'Desktop API model':'Desktop browser model'}</small></div><span className={'connectionStatus '+(model.connected!==false?'good':'')}>{model.connected!==false?'Ready':'Offline'}</span></div>)}
      {!connected.length&&<div className="settingsStatus">{desktopOnline?'No remote AI models are currently available.':'Pair and open Free AI Desktop to receive sanitized model metadata.'}</div>}
    </div>
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
      google:{webClientId:GOOGLE_WEB_CLIENT_ID}
    });
    nativeGoogleReady.current=true;
  }

  useEffect(()=>{
    let desktopOff=null,nativeHandle=null,cancelled=false;
    async function finishOAuth(url){
      if(!isAuthCallbackUrl(url))return;
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

  async function readAuthSettings(){
    const response=await fetch(supabaseUrl+'/auth/v1/settings',{headers:{apikey:supabaseKey}});
    if(!response.ok)throw new Error('Could not reach Free AI authentication. Check your internet connection and try again.');
    return response.json();
  }
  async function assertAuthProvider(provider,{signup=false}={}){
    const settings=await readAuthSettings();
    if(settings?.external?.[provider]!==true)throw new Error((provider==='google'?'Google':'Email/password')+' sign-in is not enabled for Free AI yet.');
    if(signup&&settings?.disable_signup===true)throw new Error('New account creation is currently disabled.');
  }
  async function submit(e){
    e.preventDefault();setWorking(true);setMessage('');
    try{
      const cleanEmail=email.trim().toLowerCase();
      await assertAuthProvider('email',{signup:mode==='signup'});
      const result=mode==='signup'
        ? await supabase.auth.signUp({email:cleanEmail,password})
        : await supabase.auth.signInWithPassword({email:cleanEmail,password});
      if(result.error)throw result.error;
      if(mode==='signup'&&!result.data.session)setMessage('Account created. Check your email if confirmation is enabled.');
    }catch(e){setMessage(e?.message||String(e))}finally{setWorking(false)}
  }
  async function google(){
    setWorking(true);setMessage('');
    try{
      if(isNative){
        setAndroidGoogleQaState('provider_check','',false);
        await assertAuthProvider('google');
        setAndroidGoogleQaState('initializing');
        await initNativeGoogle();
        setAndroidGoogleQaState('credential_manager_requested','',true);
        const login=await SocialLogin.login({
          provider:'google',
          options:{
            style:'standard',
            filterByAuthorizedAccounts:false,
            scopes:['email','profile']
          }
        });
        setAndroidGoogleQaState('credential_received','',true);
        const idToken=login?.result?.idToken;
        if(!idToken)throw Object.assign(new Error('Google did not return an ID token.'),{code:'missing_google_id_token'});
        const {data,error}=await supabase.auth.signInWithIdToken({provider:'google',token:idToken});
        if(error)throw error;
        const identity=await googleQaIdentityFingerprint(data?.user||data?.session?.user);
        if(isAndroidAuthQaBuild&&!identity){
          throw Object.assign(new Error('Google QA could not derive a non-PII account fingerprint.'),{code:'google_identity_fingerprint_missing'});
        }
        setAndroidGoogleQaState('signed_in','',true,identity);
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
      if(isNative){
        const nativeError=classifyNativeGoogleError(e);
        if(nativeError.kind==='cancelled'){
          setAndroidGoogleQaState('cancelled',nativeError.code);
          setMessage('');
          setWorking(false);
          return;
        }

        setAndroidGoogleQaState('error',nativeError.code);
        const nativeMessage=nativeError.kind==='config'
          ? 'Google sign-in is not configured for this Android build. Verify the Android OAuth client for com.freeai.mobile, this APK signing SHA-1, and the Web client ID in the same Google Cloud project.'
          : nativeError.kind==='no_credential'
            ? 'No Google account is currently available for sign-in on this device.'
            : nativeError.kind==='reauth'
              ? 'Google could not reauthenticate this account. Choose another account or sign in to the Google account on this device again.'
              : raw;
        setMessage(nativeMessage);
        setWorking(false);
        return;
      }

      setMessage(raw);
      setWorking(false);
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

function sendRemote(url,key,payload,options={}){
  return new Promise((resolve,reject)=>{
    if(!url||!key)return reject(new Error('Set the relay URL and pairing key in Settings first.'));
    let ws,settled=false;
    const id=String(payload?.requestId||crypto.randomUUID());
    const closeSoon=()=>setTimeout(()=>{try{ws?.close()}catch{}},80);
    const finish=(fn,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      closeSoon();
      fn(value);
    };
    try{ws=new WebSocket(url)}catch{return reject(new Error('The relay URL is invalid.'))}
    const timer=setTimeout(()=>finish(reject,new Error('Desktop did not answer in time.')),180000);
    const cancel=()=>{
      if(settled)return false;
      try{
        if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'cancel',id,requestId:id}));
      }catch{}
      finish(reject,Object.assign(new Error('Generation stopped.'),{code:'generation_stopped'}));
      return true;
    };
    options.onControl?.({id,cancel});
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',role:'mobile',key}));
    ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==='ready'){
        if(!m.desktopOnline){finish(reject,new Error('Paired desktop is offline.'));return}
        ws.send(JSON.stringify({type:'prompt',id,...payload,requestId:id}));
      }
      if(m.type==='stream'&&m.id===id)options.onStream?.(String(m.text||''));
      if(m.type==='response'&&m.id===id){
        m.error?finish(reject,new Error(m.error)):finish(resolve,m);
      }
    };
    ws.onerror=()=>finish(reject,new Error('Cannot connect to relay.'));
  });
}

createRoot(document.getElementById('root')).render(<Root/>);
