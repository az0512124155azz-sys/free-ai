import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');

function fail(message){
  console.error('Android A1 Work Add regression failed: '+message);
  process.exit(1);
}
function normalize(value){
  return String(value||'').replace(/\s+/g,' ').trim();
}
function xmlLabels(xml){
  return [...String(xml).matchAll(/\b(?:text|content-desc)="([^"]*)"/g)]
    .map(match=>normalize(match[1]))
    .filter(Boolean);
}
function hasMenuAction(xml,title){
  const prefix=title+' ';
  return xmlLabels(xml).some(label=>label===title||label.startsWith(prefix));
}
function hasDuplicateAttachmentActions(xml){
  return hasMenuAction(xml,'Files')&&hasMenuAction(xml,'Attach files');
}

// Exact Android A1 pre-fix accessibility labels and bounds observed on-device.
// The second MenuItem combines title + subtitle, which the old exact-string test missed.
const PRE_FIX_XML=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hierarchy rotation="0">
  <node class="android.view.MenuItem" text="Files" enabled="true" clickable="true" bounds="[41,1489][1039,1618]" />
  <node class="android.view.MenuItem" text="Attach files Attach specific files to this message" enabled="true" clickable="true" bounds="[41,1615][1039,1747]" />
</hierarchy>`;

if(!hasDuplicateAttachmentActions(PRE_FIX_XML)){
  fail('duplicate detector must reject the captured pre-fix XML even when title and subtitle share one accessibility label');
}

const POST_FIX_ANDROID_XML=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hierarchy rotation="0">
  <node class="android.view.MenuItem" text="Camera" enabled="true" clickable="true" />
  <node class="android.view.MenuItem" text="Photos" enabled="true" clickable="true" />
  <node class="android.view.MenuItem" text="Files" enabled="true" clickable="true" />
</hierarchy>`;

if(hasDuplicateAttachmentActions(POST_FIX_ANDROID_XML)){
  fail('single Android Files action must not be classified as a duplicate');
}

const start=source.indexOf('function PlusMenu(');
const end=source.indexOf('\nfunction MenuRow(',start);
if(start<0||end<0)fail('PlusMenu source block not found');
const plus=source.slice(start,end);

for(const marker of [
  '<MenuRow icon={Camera} label="Camera" onClick={()=>cameraRef.current?.click()}/>',
  '<MenuRow icon={Image} label="Photos" onClick={()=>photoRef.current?.click()}/>',
  '<MenuRow icon={Paperclip} label="Files" onClick={()=>fileRef.current?.click()}/>'
]){
  if(!plus.includes(marker))fail('Android native picker action missing: '+marker);
}

const scoped=`{mode==='work'&&!isAndroidNative&&<MenuRow icon={Paperclip} label="Attach files" sub="Attach specific files to this message" onClick={()=>fileRef.current?.click()}/>}`;
if(!plus.includes(scoped)){
  fail('Work Attach files row must be excluded on Android while remaining available to non-Android Work surfaces');
}
if(plus.includes(`{mode==='work'&&<MenuRow icon={Paperclip} label="Attach files"`)){
  fail('unscoped Work Attach files row would recreate the Android duplicate');
}
if((plus.match(/label="Attach files"/g)||[]).length!==1){
  fail('expected exactly one Attach files declaration in PlusMenu');
}

console.log('Android A1 Work Add regression checks passed.');
