import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const renderer=read('src/main.jsx');
const main=read('electron/main.cjs');
const pkg=read('package.json');

function fail(message){
  console.error('Linux L1.2 local-folder regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["if(!isWorkDesktop||workBusy)return;",'shared desktop local-folder picker renderer guard'],
  ["{isWorkDesktop&&mode==='work'&&localFolderWorkspace&&<div className=\"repositoryContextChip localFolderContextChip\">",'shared desktop local-folder context chip'],
  ["{isWorkDesktop?<button onClick={onChooseLocalFolder}><Folder size={15}/>{localFolderWorkspace?.name||'Open local folder'}</button>",'shared desktop Work local-folder action'],
  ["{mode==='work'&&isWorkDesktop&&!showBottomPanel&&<MenuRow icon={Folder}",'shared desktop collapsed local-folder action'],
  ["{section==='Files'&&isWorkDesktop&&<SimpleSettings title=\"Files\"",'shared desktop Files settings'],
  ["['Local folder access','User-selected folder per conversation on Windows, macOS, and Linux']",'cross-platform local-folder settings copy'],
  ["localFolder:mode==='work'&&localFolderWorkspace?localFolderWorkspace:(existing?.localFolder||null)",'chat local-folder persistence'],
  ["setLocalFolderWorkspace((chat.mode==='work'||(product==='super'&&!chat.isAgentThread))?(chat.localFolder||null):null);",'chat local-folder restore']
]) requireText(renderer,text,label);

for(const [text,label] of [
  ["if(process.platform!=='win32'&&process.platform!=='darwin'&&process.platform!=='linux')throw new Error('Local folder access is currently available on Windows, macOS, and Linux.');",'desktop local-folder backend guard'],
  ["properties:['openDirectory']",'native directory picker'],
  ["const localFolderStateKey=value=>process.platform==='win32'?String(value||'').toLowerCase():String(value||'');",'case-sensitive POSIX local-folder read tracking'],
  ["const blockedRoots=new Set(['.git','.ssh','.aws','.azure','.kube','.gnupg']);",'sensitive local-folder root protection'],
  ["if(/^\\.env(?:\\.|$)/.test(base))return true;",'environment-file protection'],
  ["if(/\\.(pem|p12|pfx|key)$/i.test(base))return true;",'private-key protection']
]) requireText(main,text,label);

const backendGuards=(main.match(/Local folder access is currently available on Windows, macOS, and Linux\./g)||[]).length;
if(backendGuards!==2)fail('expected exactly two desktop local-folder backend guards, found '+backendGuards);

if(main.includes("Local folder access is currently available on Windows.'")){
  fail('old Windows-only local-folder backend guard remains');
}
if(renderer.includes("if(!isWindowsDesktop||workBusy)return;")){
  fail('old Windows-only local-folder renderer guard remains');
}
if(renderer.includes("{windowsDesktop&&mode==='work'&&localFolderWorkspace&&")){
  fail('old Windows-only local-folder context chip remains');
}
if(!pkg.includes('node scripts/check-linux12-local-folders.mjs')){
  fail('package validate does not run the Linux L1.2 local-folder guard');
}

console.log('Linux L1.2 local-folder regression checks passed.');
