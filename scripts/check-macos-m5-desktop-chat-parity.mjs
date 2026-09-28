import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const source=read('src/main.jsx');
const main=read('electron/main.cjs');
const preload=read('electron/preload.cjs');
const pkg=read('package.json');

function fail(message){
  console.error('macOS M5 desktop Chat parity regression failed: '+message);
  process.exit(1);
}
function requireText(text,marker,label){
  if(!text.includes(marker))fail('missing '+label);
}

for(const [marker,label] of [
  ["const isChatDesktop=isWindowsDesktop||isMacDesktop;",'Windows/macOS Chat capability'],
  ["if(!isChatDesktop||!window.desktopApi?.onPromptStream)return;",'macOS prompt streaming subscription'],
  ["if(!isChatDesktop||!window.desktopApi?.onPromptActivity)return;",'macOS prompt activity subscription'],
  ["if(!isChatDesktop||!isDesktop||busy||!selected||!userText)return runGeneration(text,messages,selected);",'macOS parallel-generation route'],
  ["const chatAttachmentPlatform=isChatDesktop||isAndroidNative;",'macOS real chat attachment routing'],
  ["const nativeSearch=isChatDesktop&&mode==='chat'&&webSearchEnabled;",'macOS Chat Search'],
  ["const nativeDeepResearch=isChatDesktop&&mode==='chat'&&deepResearchEnabled;",'macOS Deep Research'],
  ["const requestId=((isChatDesktop&&isDesktop)||isAndroidNative)?crypto.randomUUID():null;",'macOS cancellable/streamable request IDs'],
  ["const routedEffort=isChatDesktop",'macOS native provider effort routing'],
  ["if(isChatDesktop&&mode==='chat'&&deepResearchEnabled)return openResearchSetup();",'macOS reviewed Deep Research flow'],
  ["if(isChatDesktop&&selected?.source==='browser'&&parallelCount>1)return runParallelGeneration(prompt);",'macOS parallel model send'],
  ["if(parallelIds.length&&isChatDesktop&&isDesktop){",'macOS parallel cancellation'],
  ["if(!isChatDesktop||!isDesktop)return;\n      try{await window.desktopApi.cancelPrompt(requestId)}catch{}",'macOS Stop Generation IPC'],
  ["if(!isChatDesktop||!message?.deepResearch||message?.streaming)return;",'macOS research export'],
  ["if(!isChatDesktop)return;\n    setMcpError('');\n    try{\n      const added=await window.desktopApi.addMcpConnection(mcpDraft);",'macOS direct MCP add'],
  ["if(isChatDesktop&&window.desktopApi?.saveDataFile)",'macOS native data export save dialog'],
  ["if(!isChatDesktop||mode!=='chat')return;",'shared Search/Research toggle guard'],
  ["if(isChatDesktop||isAndroidNative){await addChatAttachments(files)",'macOS file picker retains real File objects'],
  ["onDragEnter={isChatDesktop?",'macOS file drag/drop'],
  ["{isChatDesktop&&product==='free'?<>",'macOS Free AI Projects sidebar'],
  ["{isChatDesktop&&product==='super'&&<>",'macOS Super AI Projects sidebar'],
  ["{page==='project'&&isChatDesktop&&activeProject&&<ProjectPage",'macOS Project page'],
  ["{projectDialogOpen&&isChatDesktop&&<NewProjectDialog",'macOS New Project dialog'],
  ["{isChatDesktop&&m.role==='assistant'&&m.deepResearch&&<div",'macOS research report rendering'],
  ["{isChatDesktop&&m.role==='assistant'&&!m.streaming&&<MessageSources",'macOS Search sources'],
  ["{isChatDesktop&&mode==='work'&&selectedMcpConnections.length>0&&<div className=\"mcpSelectionTray\"",'macOS selected MCP tray'],
  ["{(isChatDesktop||isAndroidNative)&&attachments.length>0&&<div className=\"attachmentTray\"",'macOS attachment tray'],
  ["{product==='super'&&isChatDesktop&&mode==='work'&&<div className=\"menuAnchor\">",'macOS Super AI team control'],
  ["onClick={busy?(isChatDesktop||isAndroidNative?stopGeneration:undefined):send}",'macOS Stop button'],
  ["!isNative&&mode==='chat'&&isChatDesktop&&<MenuRow icon={Globe2}",'macOS Search Add-menu action'],
  ["!isNative&&mode==='chat'&&isChatDesktop&&<MenuRow icon={Sparkles}",'macOS Deep Research Add-menu action'],
  ["{mode==='work'&&isChatDesktop&&<>",'macOS Direct MCP Work menu'],
  ["if(!isChatDesktop){",'macOS full Plugins/Explore desktop surfaces'],
  ["Only these direct MCP apps are callable by the desktop Work runtime.",'cross-platform direct MCP copy'],
  ["{isChatDesktop&&<><h3>Independent research</h3>",'macOS SearXNG research configuration']
]) requireText(source,marker,label);

for(const [marker,label] of [
  ["function emitPromptStream(id,text){",'platform-neutral prompt streaming emitter'],
  ["win.webContents.send('prompt-stream'",'main-to-renderer streaming IPC'],
  ["win.webContents.send('prompt-activity'",'main-to-renderer activity IPC'],
  ["function cancelPrompt(id){",'platform-neutral prompt cancellation'],
  ["ipcMain.handle('bridge:scanProviders'",'provider scan IPC'],
  ["ipcMain.handle('bridge:setProviderModel'",'provider model switch IPC'],
  ["ipcMain.handle('bridge:setProviderEffort'",'provider effort switch IPC'],
  ["ipcMain.handle('bridge:sendPrompt'",'prompt send IPC'],
  ["ipcMain.handle('bridge:cancelPrompt'",'prompt cancel IPC'],
  ["ipcMain.handle('mcp:addConnection'",'direct MCP add IPC'],
  ["ipcMain.handle('mcp:refreshAll'",'direct MCP refresh IPC']
]) requireText(main,marker,label);

for(const [marker,label] of [
  ["onPromptStream:(cb)=>{",'preload streaming bridge'],
  ["ipcRenderer.on('prompt-stream',h);",'preload streaming event listener'],
  ["onPromptActivity:(cb)=>{",'preload activity bridge'],
  ["ipcRenderer.on('prompt-activity',h);",'preload activity event listener'],
  ["scanProviders:(options)=>ipcRenderer.invoke('bridge:scanProviders'",'preload provider scan bridge'],
  ["setProviderModel:(id,modelName)=>ipcRenderer.invoke('bridge:setProviderModel'",'preload provider model bridge'],
  ["sendPrompt:(m)=>ipcRenderer.invoke('bridge:sendPrompt',m)",'preload prompt bridge'],
  ["cancelPrompt:(id)=>ipcRenderer.invoke('bridge:cancelPrompt',id)",'preload cancel bridge'],
  ["addMcpConnection:(c)=>ipcRenderer.invoke('mcp:addConnection',c)",'preload MCP add bridge']
]) requireText(preload,marker,label);

// M6 remains separate: do not silently mix macOS distribution/update changes into M5.
requireText(main,"if(process.platform!=='win32')throw new Error('Update checks are currently available on Windows.');",'M6 update boundary');
requireText(source,"{section==='App'&&isWindowsDesktop&&<WindowsAppSettings/>}",'M6 App/update settings boundary');

if(!pkg.includes('node scripts/check-macos-m5-desktop-chat-parity.mjs')){
  fail('package validate does not run macOS M5 parity guard');
}

for(const stale of [
  "if(!isWindowsDesktop||!window.desktopApi?.onPromptStream)return;",
  "const chatAttachmentPlatform=isWindowsDesktop||isAndroidNative;",
  "const requestId=((isWindowsDesktop&&isDesktop)||isAndroidNative)?crypto.randomUUID():null;",
  "if(!isWindowsDesktop||mode!=='chat')return;"
]){
  if(source.includes(stale))fail('stale Windows-only Chat gate remains: '+stale);
}

console.log('macOS M5 desktop Chat parity regression checks passed.');
