import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/build.yml','utf8')
  .replaceAll('\r\n','\n')
  .replaceAll('\r','\n');

function fail(message){
  console.error('Android 6A3 large-phone QA guard failed: '+message);
  process.exit(1);
}
function has(marker,message){
  if(!workflow.includes(marker))fail(message||('Missing marker: '+marker));
}

const runtimeStart=workflow.indexOf('  android_runtime:');
const authStart=workflow.indexOf('  android_auth_runtime:');
if(runtimeStart<0||authStart<0||authStart<=runtimeStart){
  fail('Could not isolate the Android runtime workflow job.');
}
const runtime=workflow.slice(runtimeStart,authStart);

for(const [marker,label] of [
  ['name: Android runtime (${{ matrix.form_factor }})','matrix job naming'],
  ['profile: ${{ matrix.profile }}','matrix hardware profile routing'],
  ['script: bash scripts/android-runtime-qa.sh ${{ matrix.form_factor }}','form-factor runtime routing'],
  ['name: free-ai-android-runtime-${{ matrix.form_factor }}','per-form-factor evidence artifact'],
  ['path: artifacts/android-runtime/${{ matrix.form_factor }}','per-form-factor evidence path']
]) has(runtime,marker,label);

const lines=runtime.split('\n').map(line=>line.trim()).filter(Boolean);
const entries=[];
for(let i=0;i<lines.length;i+=1){
  if(!lines[i].startsWith('- form_factor:'))continue;
  const formFactor=lines[i].slice('- form_factor:'.length).trim();
  const profileLine=lines[i+1]||'';
  if(!profileLine.startsWith('profile:')){
    fail('Missing profile directly after form factor '+formFactor+'.');
  }
  const profile=profileLine.slice('profile:'.length).trim();
  entries.push({formFactor,profile});
}

const expected=[
  {formFactor:'phone',profile:'pixel_5'},
  {formFactor:'large-phone',profile:'pixel_7_pro'},
  {formFactor:'tablet',profile:'pixel_tablet'}
];
if(JSON.stringify(entries)!==JSON.stringify(expected)){
  fail('Android runtime matrix must contain exactly phone/pixel_5, large-phone/pixel_7_pro, tablet/pixel_tablet in that order.');
}

console.log('Android 6A3 large-phone runtime matrix guard passed.');
