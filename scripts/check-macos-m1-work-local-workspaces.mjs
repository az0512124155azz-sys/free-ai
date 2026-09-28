import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const renderer=read('src/main.jsx');
const main=read('electron/main.cjs');
const pkg=read('package.json');

function fail(message){
  console.error('macOS M1 Work/local-workspace regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const isMacDesktop=isDesktop&&desktopPlatform==='darwin';",'macOS desktop detection'],
  ["const isWorkDesktop=isWindowsDesktop||isMacDesktop||isLinuxDesktop;",'shared desktop Work capability'],
  ["if(!isWorkDesktop)return;",'macOS repository picker renderer gate'],
  ["if(!isWorkDesktop||workBusy)return;",'macOS local-folder picker renderer gate'],
  ["{product==='super'&&isWorkDesktop&&repositoryWorkspace&&<div className=\"repositoryContextChip\">",'macOS repository context chip'],
  ["{isWorkDesktop&&mode==='work'&&localFolderWorkspace&&<div className=\"repositoryContextChip localFolderContextChip\">",'macOS local-folder context chip'],
  ["{product==='super'&&isWorkDesktop&&<button onClick={onChooseRepository}><GitBranch size={15}/>{repositoryWorkspace?.name||'Choose repository'}</button>}",'macOS repository action'],
  ["{isWorkDesktop?<button onClick={onChooseLocalFolder}><Folder size={15}/>{localFolderWorkspace?.name||'Open local folder'}</button>",'macOS local-folder action'],
  ["{section==='Files'&&isWorkDesktop&&<SimpleSettings title=\"Files\"",'macOS Files settings'],
  ["['Local folder access','User-selected folder per conversation on Windows, macOS, and Linux']",'macOS Files settings copy']
]) requireText(renderer,text,label);

for(const [text,label] of [
  ["if(process.platform!=='win32'&&process.platform!=='darwin'&&process.platform!=='linux')throw new Error('Local repository workspace is currently available on Windows, macOS, and Linux.');",'macOS repository backend gate'],
  ["if(process.platform!=='win32'&&process.platform!=='darwin'&&process.platform!=='linux')throw new Error('Local folder access is currently available on Windows, macOS, and Linux.');",'macOS local-folder backend gate'],
  ["if(process.platform!=='win32'&&process.platform!=='darwin'&&process.platform!=='linux')throw new Error('The local Work task loop is currently available on Windows, macOS, and Linux.');",'macOS Work backend gate'],
  ["const normalize=value=>process.platform==='win32'?String(value||'').toLowerCase():String(value||'');",'POSIX case-sensitive repository containment'],
  ["const localFolderStateKey=value=>process.platform==='win32'?String(value||'').toLowerCase():String(value||'');",'POSIX case-sensitive local-file read tracking'],
  ["const isBrowserDesktopPlatform=()=>process.platform==='win32'||process.platform==='darwin'||process.platform==='linux';",'Browser Use promoted to shared desktop support after M1'],
  ["if(process.platform!=='win32')throw new Error('System voice typing is currently available on Windows.');",'Windows Voice Typing path retained after macOS local Dictation promotion'],
  ["if(process.platform==='linux')return performLinuxComputerAction(payload);",'Linux Computer Use routing retained'],
  ["if(process.platform==='darwin')return performMacComputerAction(payload);",'Computer Use promoted to macOS after M1']
]) requireText(main,text,label);

if(!pkg.includes('node scripts/check-macos-m1-work-local-workspaces.mjs')){
  fail('package validate does not run the macOS M1 regression guard');
}

console.log('macOS M1 Work/local-workspace regression checks passed.');
