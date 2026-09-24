import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const source=read('src/main.jsx');
const main=read('electron/main.cjs');
const preload=read('electron/preload.cjs');
const research=read('electron/research.cjs');
const background=read('extension/background.js');
const contentScript=read('extension/content.js');
const popup=read('extension/popup.js');
const workflow=read('.github/workflows/build.yml');
const readme=read('README.md');
const manifest=JSON.parse(read('extension/manifest.json'));
const pkg=JSON.parse(read('package.json'));

let passed=0;
function fail(message){
  console.error('Windows 6 integration QA failed: '+message);
  process.exit(1);
}
function ok(condition,message){
  if(!condition)fail(message);
  passed++;
}
function has(text,marker,message){
  ok(text.includes(marker),message||('Missing marker: '+marker));
}

ok(fs.existsSync('build/free-ai-symbol.svg'),'Canonical build/free-ai-symbol.svg is missing.');
ok(fs.existsSync('public/free-ai-logo.svg'),'Canonical public/free-ai-logo.svg is missing.');
has(source,"const BRAND_LOGO_SRC=new URL('free-ai-logo.svg',document.baseURI).href",'Renderer is not using the canonical Free AI logo asset.');
for(const platform of ['win','mac','linux'])ok(pkg?.build?.[platform]?.icon==='build/free-ai-symbol.svg',platform+' package icon is not canonical.');

has(source,'function SettingsView','Settings integration is missing.');
has(source,'function WindowsAppSettings','Windows app settings are missing.');
has(source,"{section==='App'&&isWindowsDesktop&&<WindowsAppSettings/>}",'Windows App settings navigation must render WindowsAppSettings.');
has(source,'Check for updates','Update-check UI is missing.');
has(main,"https://api.github.com/repos/az0512124155azz-sys/free-ai/releases/latest",'Update check is not using the official GitHub Releases feed.');
has(source,'function AppearanceSettings','Appearance settings are missing.');
has(source,'option value="system">System','System appearance mode is missing.');
has(source,"window.matchMedia?.('(prefers-color-scheme: light)')",'System theme observation is missing.');
has(source,'ResizeObserver','Resize integration is missing.');
has(source,'browserSetBounds','Browser bounds synchronization is missing.');

ok(manifest.manifest_version===3,'Browser Bridge must remain Manifest V3.');
ok(Number(manifest.minimum_chrome_version)>=116,'Browser Bridge must require Chrome 116+ for reliable WebSocket service-worker lifetime behavior.');
const heartbeat=Number((background.match(/const HEARTBEAT_MS=(\d+)/)||[])[1]||0);
ok(heartbeat>0&&heartbeat<30000,'Extension heartbeat must stay inside Chrome service-worker 30s idle window.');
has(background,"safeSend({type:'keepalive'",'Extension WebSocket heartbeat is missing.');
has(background,'chrome.runtime.onStartup.addListener(connect)','Extension startup reconnect is missing.');
has(background,'chrome.runtime.onInstalled.addListener(connect)','Extension install reconnect is missing.');
has(background,"providerId+':'+tab.id",'Provider instances must remain tab-specific.');
has(background,'connected.sort','Provider instance ordering is missing.');
has(background,'freeAiProvidersUpdatedAt','Provider metadata persistence is missing.');
has(background,'function tabMatchesProvider','Stale provider-tab validation is missing.');
ok((background.match(/tabMatchesProvider\(/g)||[]).length>=3,'Stale provider-tab fallback is not applied to prompt and cancel paths.');
has(popup,'freeai:getStatus','Extension popup status integration is missing.');

has(source,'function ProviderBadge','Provider icon rendering is missing.');
has(source,'iconDataUrl','Provider icon data URLs are missing.');
has(source,'function ModelMenu','Model picker is missing.');
has(source,'role="listbox"','Model picker accessibility role is missing.');
has(source,'role="option"','Model picker options are not keyboard-focusable semantic options.');
has(source,'class MenuErrorBoundary','Model picker error boundary is missing.');
has(source,'function modelGroupKey','Duplicate-model grouping is missing.');
has(source,'Parallel instances','Parallel matching-tab controls are missing.');
has(source,'async function selectProviderModelOption','Native provider model switching is missing.');
has(contentScript,'freeai:setProviderModel','Extension model-switch handler is missing.');
has(source,'async function selectProviderEffortOption','Reasoning effort switching is missing.');
has(contentScript,'freeai:setProviderEffort','Extension effort handler is missing.');

has(source,'mcpConnections','Direct MCP state is missing.');
has(source,'selectedMcpIds','Direct MCP task selection is missing.');
has(source,'Provider hints','Provider-managed connector labeling is missing.');
has(source,'Automatic AI team','Super AI automatic-team UI is missing.');
has(source,'Every available AI participates automatically. No model selection is required in Super AI.','Super AI must use the connected AI team without manual lead selection.');
has(source,'isMasterThread','Master-thread persistence is missing.');
has(source,'isAgentThread','Child-agent chat persistence is missing.');
has(source,'parentChatId','Agent parent linkage is missing.');

has(source,'function ChatContextMenu','Chat context menu is missing.');
has(source,"if(model?.source==='api')return model?.name||model?.modelName||model?.model",'API model display names must take precedence over raw model IDs.');
has(source,'function desktopIpcErrorMessage','Desktop IPC validation errors must be normalized for user-facing forms.');
has(source,'const generationChatId=saveCurrentChat(withUser,model','Normal chat generation must reuse the initial chat ID for final/error saves.');
has(source,'const parallelChatId=saveCurrentChat(withUser,selected)','Parallel generation must reuse the initial chat ID for final saves.');
has(source,'Export chat','Chat export action is missing.');
has(source,'function DeleteChatDialog','Delete confirmation is missing.');
has(preload,'saveTextFile','Desktop Save As bridge for chat export is missing.');
has(main,"ipcMain.handle('shell:saveTextFile'",'Desktop Save As handler for chat export is missing.');
has(preload,'saveDataFile','Desktop Save As bridge for local data export is missing.');
has(main,"ipcMain.handle('shell:saveDataFile'",'Desktop Save As handler for local data export is missing.');
has(source,"window.desktopApi?.saveDataFile",'Windows data export must use the native desktop Save As bridge.');

has(source,'webSearchEnabled','Web Search state is missing.');
has(source,'function MessageSources','Source cards are missing.');
has(source,'deepResearchEnabled','Deep Research state is missing.');
has(source,'function ResearchSetupDialog','Research-plan review dialog is missing.');
has(source,'Only these sites','Research Only-sites control is missing.');
has(source,'Prioritize sites','Research Prioritize-sites control is missing.');
has(source,'Exclude sites','Research Exclude-sites control is missing.');
has(research,'runOwnedResearch','Independent research runtime is missing.');
has(research,"searchParams.set('format','json')",'SearXNG JSON Search API integration is missing.');
has(research,'allowedByScope','Post-search source-scope enforcement is missing.');
has(research,'retrievedAt','Research source retrieval timestamps are missing.');
has(source,'stopGeneration','Stop control is missing.');
has(preload,'cancelPrompt','Prompt cancellation bridge is missing.');
has(research,'activePrompts.set(requestId,active)','Owned-research cancellation tracking is missing.');
has(source,'researchReportActions','Research report export actions are missing.');
has(preload,'researchExportReport','Research report export bridge is missing.');
has(research,'printToPDF','PDF report export is missing.');
has(research,'reportDocx','DOCX report export is missing.');

has(source,"readJSON('freeai.chats.free'",'Free AI chat restart persistence is missing.');
has(source,"readJSON('freeai.prefs'",'Preferences restart persistence is missing.');
has(source,'function openChat','Old chat loading path is missing.');
has(source,'const fresh=selected?connected.find','Selected-provider refresh reconciliation is missing.');
has(source,'if(selected){setSelected(null);setSelectedTool(null);setParallelCount(1)}','Truly stale selected providers must still be cleared when no refreshed provider entry exists.');
has(source,"onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey)",'Composer keyboard submit behavior is missing.');

has(main,'contextIsolation:true','Electron context isolation must stay enabled.');
has(main,'nodeIntegration:false','Electron Node integration must stay disabled for renderer windows.');
has(main,'sandbox:true','Electron renderer sandbox must stay enabled.');
has(preload,"contextBridge.exposeInMainWorld('desktopApi'",'Preload contextBridge is missing.');
ok(!preload.includes('send:ipcRenderer.send')&&!preload.includes('invoke:ipcRenderer.invoke'),'Preload must not expose raw ipcRenderer methods.');

has(workflow,"if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.publish_release == true",'Release job must remain explicitly gated.');
has(workflow,'name: free-ai-chrome-extension','Extension artifact name changed unexpectedly.');
has(readme,'releases/latest/download/free-ai-extension.zip','Stable extension release download link is missing.');
has(readme,'actions/workflows/build.yml?query=branch%3Amain','Current-main extension build link is missing.');
has(readme,'free-ai-chrome-extension','README must name the current-main extension artifact.');

console.log('Windows 6 integration regression checks passed ('+passed+' checks).');
