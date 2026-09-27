import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const renderer=read('src/main.jsx');
const main=read('electron/main.cjs');

function fail(message){
  console.error('Linux L1.1 UI regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const isLinuxDesktop=isDesktop&&desktopPlatform==='linux';",'Linux desktop capability flag'],
  ["function toggleSidebarSearch(){\n    const next=!sidebarSearchOpen;\n    if(!next)setSidebarSearch('');\n    setSidebarSearchOpen(next);\n  }",'Search close resets the active query'],
  ['onClick={toggleSidebarSearch}><Search size={16}/>','Search button uses reset-aware toggle'],
  ["if(!isWorkDesktop)return;",'repository picker remains enabled on Linux through the shared desktop Work gate'],
  ["(product!=='super'||isWorkDesktop)&&<>",'Super repository control is only shown on supported desktop Work platforms'],
  ["{mode==='work'&&!isAndroidNative&&!isLinuxDesktop&&<MenuRow icon={Paperclip} label=\"Attach files\"",'Linux Work suppresses the duplicate Attach files row']
]) requireText(renderer,text,label);

if(renderer.includes("if(!isWindowsDesktop)return;\n    stopActiveWorkTask();\n    setMode('work')")){
  fail('Windows-only repository renderer guard returned');
}
if(renderer.includes("if(isWindowsDesktop)setSidebarSearch('');setSidebarSearchOpen(v=>!v)")){
  fail('platform-specific Search reset returned');
}
if(renderer.includes("{mode==='work'&&!isAndroidNative&&<MenuRow icon={Paperclip} label=\"Attach files\"")){
  fail('Linux Work duplicate Attach files action returned');
}
if(!renderer.includes("label={isWindowsDesktop?'Files':'Files and folders'}")){
  fail('Linux Files and folders action is missing');
}

for(const [text,label] of [
  ["if(process.platform!=='win32'&&process.platform!=='darwin'&&process.platform!=='linux')throw new Error('Local repository workspace is currently available on Windows, macOS, and Linux.');",'Linux repository main-process support retained through shared desktop gate'],
  ["const normalize=value=>process.platform==='win32'?String(value||'').toLowerCase():String(value||'');",'case-sensitive POSIX repository containment'],
  ["properties:['openDirectory']",'native directory picker']
]) requireText(main,text,label);

const oldWindowsOnly=(main.match(/Local repository workspace is currently available on Windows\.'/g)||[]).length;
if(oldWindowsOnly)fail('Windows-only repository backend guard remains');

console.log('Linux L1.1 UI regression checks passed.');
