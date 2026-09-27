import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const renderer=read('src/main.jsx');
const main=read('electron/main.cjs');
const pkg=read('package.json');

function fail(message){
  console.error('Linux L1.3 Work-loop regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const isWorkDesktop=isWindowsDesktop||isLinuxDesktop;",'shared Windows/Linux Work capability'],
  ["if(isWorkDesktop&&taskId){",'Linux Work stop cleanup'],
  ["const workBusy=isWorkDesktop&&mode==='work'&&!!workTask&&['running','waiting_approval'].includes(workTask.status);",'Linux Work busy lifecycle'],
  ["if(isWorkDesktop&&mode==='work')return runWorkGeneration(prompt);",'Linux Work send routing'],
  ["if(isWorkDesktop&&mode==='work'&&workTask&&['running','waiting_approval'].includes(workTask.status)){",'Linux Work Stop routing'],
  ["busy={isWorkDesktop&&mode==='work'?workBusy:busy}",'Linux Work composer busy state'],
  ["workTask={isWorkDesktop&&mode==='work'?workTask:null}",'Linux Work task state delivery'],
  ["{mode==='work'&&(windowsDesktop||isLinuxDesktop)&&workTask&&<WorkTaskStatus",'Linux Work progress/approval UI']
]) requireText(renderer,text,label);

const busyProps=(renderer.match(/busy=\{isWorkDesktop&&mode==='work'\?workBusy:busy\}/g)||[]).length;
if(busyProps!==2)fail('expected two Linux-capable Work busy props, found '+busyProps);
const taskProps=(renderer.match(/workTask=\{isWorkDesktop&&mode==='work'\?workTask:null\}/g)||[]).length;
if(taskProps!==2)fail('expected two Linux-capable Work task props, found '+taskProps);

for(const [text,label] of [
  ["if(process.platform!=='win32'&&process.platform!=='linux')throw new Error('The local Work task loop is currently available on Windows and Linux.');",'Windows/Linux Work backend gate'],
  ["browser_builtin: unavailable on Linux until Linux Browser Use is enabled.",'Linux built-in Browser Use unavailable description'],
  ["browser_extension: unavailable on Linux until Linux Browser Use is enabled.",'Linux extension Browser Use unavailable description'],
  ["computer: unavailable on Linux until Linux Computer Use is enabled.",'Linux Computer Use unavailable description'],
  ["if(process.platform==='linux'&&['browser_builtin','browser_extension','computer'].includes(decision?.tool)){",'Linux unsupported Work-tool validation'],
  ["? 'Computer Use is not enabled for Linux in this checkpoint.'",'Linux Computer Use rejection'],
  [": 'Browser Use is not enabled for Linux in this checkpoint.';",'Linux Browser Use rejection'],
  ["if(process.platform!=='win32')throw new Error('Built-in Browser Use control is currently enabled on Windows.');",'built-in Browser Use remains Windows-only'],
  ["if(process.platform!=='win32')throw new Error('This Computer Use action runtime is currently available on Windows.');",'Computer Use remains Windows-only'],
  ["if(process.platform!=='win32'&&process.platform!=='linux')throw new Error('Local folder access is currently available on Windows and Linux.');",'Linux local-folder support retained']
]) requireText(main,text,label);

if(main.includes("The local Work task loop is currently available on Windows.');")){
  fail('old Windows-only Work backend gate remains');
}
if(renderer.includes("if(isWindowsDesktop&&mode==='work')return runWorkGeneration(prompt);")){
  fail('old Windows-only Work send routing remains');
}
if(renderer.includes("const workBusy=isWindowsDesktop&&mode==='work'")){
  fail('old Windows-only Work busy state remains');
}
if(!pkg.includes('node scripts/check-linux13-work-loop.mjs')){
  fail('package validate does not run the Linux L1.3 Work-loop guard');
}

console.log('Linux L1.3 Work-loop regression checks passed.');
