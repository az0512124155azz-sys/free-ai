import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/build.yml','utf8').replace(/\\r\\n?/g,'\\n');

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
  ['- form_factor: phone\\n            profile: pixel_5','compact phone AVD'],
  ['- form_factor: large-phone\\n            profile: pixel_7_pro','large phone AVD'],
  ['- form_factor: tablet\\n            profile: pixel_tablet','tablet AVD'],
  ['name: Android runtime (${{ matrix.form_factor }})','matrix job naming'],
  ['profile: ${{ matrix.profile }}','matrix hardware profile routing'],
  ['script: bash scripts/android-runtime-qa.sh ${{ matrix.form_factor }}','form-factor runtime routing'],
  ['name: free-ai-android-runtime-${{ matrix.form_factor }}','per-form-factor evidence artifact'],
  ['path: artifacts/android-runtime/${{ matrix.form_factor }}','per-form-factor evidence path']
]) has(runtime,marker,label);

const formFactors=[...runtime.matchAll(/- form_factor:\\s*([^\\n]+)/g)].map(match=>match[1].trim());
if(JSON.stringify(formFactors)!==JSON.stringify(['phone','large-phone','tablet'])){
  fail('Android runtime matrix must contain exactly phone, large-phone, tablet in that order.');
}

const profiles=[...runtime.matchAll(/\\n\\s+profile:\\s*([^\\n]+)/g)].map(match=>match[1].trim());
for(const expected of ['pixel_5','pixel_7_pro','pixel_tablet']){
  if(!profiles.includes(expected))fail('Missing expected AVD profile: '+expected);
}

console.log('Android 6A3 large-phone runtime matrix guard passed.');
