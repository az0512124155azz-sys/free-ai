import fs from 'node:fs';

const main=fs.readFileSync('src/main.jsx','utf8');
const css=fs.readFileSync('src/styles.css','utf8');
const runtime=fs.readFileSync('scripts/android-runtime-qa.sh','utf8');

function requireText(source,text,label){
  if(!source.includes(text)){
    console.error('Android 6A2 QA guard failed: '+label);
    process.exit(1);
  }
}

for(const [text,label] of [
  ["command==='setThemeLight'","light-theme QA command"],
  ["command==='setThemeDark'","dark-theme QA command"],
  ["command==='setRtl'","RTL QA command"],
  ["command==='setLtr'","LTR restore QA command"],
  ["'theme='+String(root.dataset.theme||'')","theme audit token"],
  ["'dir='+String(direction)","direction audit token"],
  ["'systemBars='+String(systemBarsQa.applied||systemBarsQa.requested||'unknown')","system-bar audit token"],
  ["'horizontalOverflow='+horizontalOverflow","horizontal overflow audit token"],
  ["'drawerInlineStart='+drawerInlineStart","drawer inline-start audit token"],
  ["updateAndroidSystemBarsQaState({requested,applied:requested,error:''})","native SystemBars success evidence"]
]) requireText(main,text,label);

for(const [text,label] of [
  ['html[dir="rtl"] .nativeMobileShell .gptSidebar{','RTL native drawer rule'],
  ['transform:translateX(105%);','RTL closed drawer direction'],
  ['box-shadow:-20px 0 60px rgba(0,0,0,.34);','RTL drawer shadow direction'],
  ['inset-inline-start:0;','logical inline-start positioning']
]) requireText(css,text,label);

for(const [text,label] of [
  ['qa_line setThemeLight','light-theme runtime exercise'],
  ['require_token "$light_theme" "systemBars=light"','light system-bar assertion'],
  ['qa_line setThemeDark','dark-theme runtime exercise'],
  ['require_token "$dark_theme" "systemBars=dark"','dark system-bar assertion'],
  ['qa_line setRtl','RTL runtime exercise'],
  ['require_token "$rtl_shell" "horizontalOverflow=false"','RTL overflow assertion'],
  ['rtl_drawer_inline_start="$(metric "$rtl_drawer" drawerInlineStart)"','RTL drawer edge metric'],
  ['capture "15-rtl-drawer"','RTL screenshot evidence'],
  ['qa_line setLtr','LTR cleanup']
]) requireText(runtime,text,label);

console.log('Android 6A2 theme/RTL QA source guard passed.');
