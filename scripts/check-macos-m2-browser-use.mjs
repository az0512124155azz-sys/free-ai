import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const main=read('electron/main.cjs');
const renderer=read('src/main.jsx');
const preload=read('electron/preload.cjs');
const pkg=read('package.json');

function fail(message){
  console.error('macOS M2 Browser Use regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const isBrowserDesktopPlatform=()=>process.platform==='win32'||process.platform==='darwin'||process.platform==='linux';",'macOS Browser capability helper'],
  ["if(!isBrowserDesktopPlatform())throw new Error('Built-in Browser Use control is currently enabled on Windows, macOS, and Linux.');",'macOS built-in Browser Use action gate'],
  ["if(isBrowserDesktopPlatform()&&!browserPermissionsConfigured){",'macOS browser permission handlers'],
  ["ses.setPermissionCheckHandler((webContents,permission,requestingOrigin,details={})=>",'explicit permission check handler'],
  ["ses.setPermissionRequestHandler((webContents,permission,callback,details={})=>",'explicit permission request handler'],
  ["sandbox:true,\n      contextIsolation:true,\n      nodeIntegration:false,\n      partition:BROWSER_PARTITION",'sandboxed persistent Browser partition'],
  ["if(!isBrowserDesktopPlatform()){\n      createBrowserTab(details.url,true);",'advanced popup handling'],
  ["if(!isBrowserDesktopPlatform()||details?.isMainFrame===false)return;",'certificate handling'],
  ["if(isBrowserDesktopPlatform()){\n    clearBrowserPermissions();\n    const ses=persistentBrowserSession();",'clear-data permission reset'],
  ["Download file actions are currently available on Windows, macOS, and Linux.",'macOS download file actions'],
  ["External protocol handling is currently available on Windows, macOS, and Linux.",'macOS external protocol handling'],
  ["const browserWork=isBrowserDesktopPlatform();",'macOS Browser Work publication'],
  ["browserWork\n      ? 'browser_builtin: Free AI built-in browser.",'macOS built-in Browser Work tool'],
  ["browserWork\n      ? (extensionSocket&&extensionSocket.readyState===WebSocket.OPEN",'macOS extension Browser Work tool'],
  ["Built-in Browser Use must take a fresh snapshot of the target tab before coordinate or keyboard actions.",'fresh-snapshot safety gate'],
  ["Free AI will not control a Chromium tab that hosts a model participating in this Super AI task.",'provider-tab protection'],
  ["if(process.platform==='linux')return performLinuxComputerAction(payload);",'Linux Computer Use routing retained'],
  ["if(process.platform==='darwin')return performMacComputerAction(payload);",'Computer Use promoted to macOS after M2'],
  ["if(process.platform!=='win32')throw new Error('System voice typing is currently available on Windows.');",'Windows Voice Typing path retained after macOS local Dictation promotion']
]) requireText(main,text,label);

for(const [text,label] of [
  ["if((isWindowsDesktop||isMacDesktop)&&product==='free'&&mode!=='work')selectExperience('work');",'macOS Browser opens Free AI Work'],
  ["if(!(isWindowsDesktop||isMacDesktop)||!isDesktop)return;\n    const off=window.desktopApi.onAppCommand?.(command=>{\n      if(command!=='toggle-browser')return;",'macOS Browser keyboard toggle'],
  ["{isWorkDesktop&&downloads.length>0&&<button className={downloadsOpen?",'macOS downloads UI'],
  ["{isWorkDesktop&&permissionRequest&&<div className=\"siteToolsHeader browserPermissionBar\"",'macOS permission UI'],
  ["{isWorkDesktop&&state.error&&<div className=\"siteToolsHeader browserErrorBar\"",'macOS Browser error UI'],
  ["{isWorkDesktop&&downloadsOpen&&downloads.length>0&&<div className=\"siteToolsPanel\">",'macOS downloads panel'],
  ["desc={isWorkDesktop?\"Use Free AI's separate browser profile. Sign-ins persist across app restarts; open tabs stay only while Free AI is running.\"",'macOS persistent Browser settings copy']
]) requireText(renderer,text,label);

for(const [text,label] of [
  ["browserCancelDownload:(id)=>ipcRenderer.invoke('browser:cancelDownload',id)",'download cancel bridge'],
  ["browserOpenDownload:(id)=>ipcRenderer.invoke('browser:openDownload',id)",'download open bridge'],
  ["browserShowDownload:(id)=>ipcRenderer.invoke('browser:showDownload',id)",'download reveal bridge'],
  ["browserResolvePermission:(payload)=>ipcRenderer.invoke('browser:resolvePermission',payload)",'permission bridge'],
  ["browserNavigate:(url)=>ipcRenderer.invoke('browser:navigate',url)",'navigation bridge']
]) requireText(preload,text,label);

if(!pkg.includes('node scripts/check-macos-m2-browser-use.mjs')){
  fail('package validate does not run the macOS M2 Browser Use guard');
}

console.log('macOS M2 Browser Use regression checks passed.');
