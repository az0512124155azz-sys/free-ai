import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const renderer=read('src/main.jsx');
const main=read('electron/main.cjs');
const l13=read('scripts/check-linux13-work-loop.mjs');
const pkg=read('package.json');

function fail(message){
  console.error('Linux Browser Use regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const isBrowserDesktopPlatform=()=>process.platform==='win32'||process.platform==='linux';",'Windows/Linux browser capability helper'],
  ["if(!isBrowserDesktopPlatform())throw new Error('Built-in Browser Use control is currently enabled on Windows and Linux.');",'Linux built-in Browser Use action gate'],
  ["if(isBrowserDesktopPlatform()&&!browserPermissionsConfigured){",'Linux browser permission handlers'],
  ["ses.setPermissionCheckHandler((webContents,permission,requestingOrigin,details={})=>",'explicit permission check handler'],
  ["ses.setPermissionRequestHandler((webContents,permission,callback,details={})=>",'explicit permission request handler'],
  ["if(!isBrowserDesktopPlatform()||!tabId)return [];",'Linux permission request snapshot'],
  ["if(isBrowserDesktopPlatform())persistentBrowserSession();",'Linux persistent browser session'],
  ["if(!isBrowserDesktopPlatform()){\n      createBrowserTab(details.url,true);",'advanced popup handling on Linux'],
  ["if(!isBrowserDesktopPlatform()||isMainFrame===false)return;",'Linux certificate handling'],
  ["if(isBrowserDesktopPlatform()){\n    clearBrowserPermissions();\n    const ses=persistentBrowserSession();",'Linux clear-data permission reset'],
  ["if(!isBrowserDesktopPlatform())return browserSnapshot();",'Linux download cancellation capability'],
  ["Download file actions are currently available on Windows and Linux.",'Linux download file actions'],
  ["External protocol handling is currently available on Windows and Linux.",'Linux external protocol handling'],
  ["const browserWork=isBrowserDesktopPlatform();",'Linux Work Browser capability'],
  ["browserWork\n      ? 'browser_builtin: Free AI built-in browser.",'Linux built-in Browser tool publication'],
  ["browserWork\n      ? (extensionSocket&&extensionSocket.readyState===WebSocket.OPEN",'Linux extension Browser tool publication'],
  ["function requestExtensionBrowser(command,payload={},timeoutMs=15000){",'cross-platform extension Browser bridge'],
]) requireText(main,text,label);

for(const [text,label] of [
  ["{isWorkDesktop&&downloads.length>0&&<button className={downloadsOpen?",'Linux downloads button'],
  ["{isWorkDesktop&&permissionRequest&&<div className=\"siteToolsHeader browserPermissionBar\"",'Linux browser permission UI'],
  ["{isWorkDesktop&&state.error&&<div className=\"siteToolsHeader browserErrorBar\"",'Linux browser error UI'],
  ["{isWorkDesktop&&downloadsOpen&&downloads.length>0&&<div className=\"siteToolsPanel\">",'Linux downloads panel'],
  ["desc={isWorkDesktop?\"Use Free AI's separate browser profile. Sign-ins persist across app restarts; open tabs stay only while Free AI is running.\"",'Linux persistent browser settings copy'],
  ["{!isNative&&!(mode==='work'&&isWorkDesktop&&showBottomPanel)&&<MenuRow icon={Chrome} label=\"Browser\"",'Linux Work Browser menu dedupe']
]) requireText(renderer,text,label);

if(main.includes('browser_builtin: unavailable on Linux until Linux Browser Use is enabled.')){
  fail('old Linux built-in Browser unavailable description remains');
}
if(main.includes('browser_extension: unavailable on Linux until Linux Browser Use is enabled.')){
  fail('old Linux extension Browser unavailable description remains');
}
if(main.includes("['browser_builtin','browser_extension','computer'].includes(decision?.tool)")){
  fail('old Linux Browser/Computer combined rejection remains');
}
if(main.includes("Built-in Browser Use control is currently enabled on Windows.');")){
  fail('old Windows-only built-in Browser Use gate remains');
}
if(main.includes('wc.canGoBack()')||main.includes('wc.canGoForward()')||main.includes('wc.goBack()')||main.includes('wc.goForward()')){
  fail('deprecated legacy navigation methods remain');
}
if(l13.includes('Linux built-in Browser Use unavailable description')||l13.includes('Linux extension Browser Use unavailable description')){
  fail('L1.3 still asserts Browser Use must be unavailable on Linux');
}
if(!pkg.includes('node scripts/check-linux-browser-use.mjs')){
  fail('package validate does not run the Linux Browser Use guard');
}

console.log('Linux Browser Use regression checks passed.');
