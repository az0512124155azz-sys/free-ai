import fs from 'node:fs';

const main=fs.readFileSync('src/main.jsx','utf8');
const css=fs.readFileSync('src/styles.css','utf8');
const runtime=fs.readFileSync('scripts/android-runtime-qa.sh','utf8');
const socialLogin=fs.readFileSync('scripts/configure-android-social-login.mjs','utf8');
const runtimeConfig=fs.readFileSync('scripts/configure-android-runtime-qa.mjs','utf8');
const branding=fs.readFileSync('scripts/configure-android-branding.mjs','utf8');
const capacitor=fs.readFileSync('capacitor.config.json','utf8');

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
  ["updateAndroidSystemBarsQaState({requested,applied:requested,error:''})","native SystemBars success evidence"],
  ["registerPlugin('FreeAINativeWindow')","native window theme bridge registration"],
  ["FreeAINativeWindow.setThemeBackground({theme:requested})","native window background follows app appearance"]
]) requireText(main,text,label);

for(const [text,label] of [
  ['html[dir="rtl"] .nativeMobileShell .gptSidebar{','RTL native drawer rule'],
  ['transform:translateX(105%);','RTL closed drawer direction'],
  ['box-shadow:-20px 0 60px rgba(0,0,0,.34);','RTL drawer shadow direction'],
  ['inset-inline-start:0;','logical inline-start positioning'],
  ['.nativeMobileShell .workspaceHeader{height:52px;grid-template-columns:1fr auto 1fr;padding:0 8px;flex:none;position:relative;z-index:140;isolation:isolate}','native header stacking above the mobile model picker'],
  ['.nativeMobileShell .mobileModeAnchor{display:block;position:relative;justify-self:center;z-index:2;pointer-events:auto}','native mode anchor remains an explicit hit target'],
  ['touch-action:manipulation','native mode button touch handling']
]) requireText(css,text,label);

for(const [text,label] of [
  ['import androidx.core.view.WindowCompat;','AndroidX WindowCompat import'],
  ['protected void onCreate(Bundle savedInstanceState)','MainActivity onCreate edge-to-edge hook'],
  ['super.onCreate(savedInstanceState);','BridgeActivity lifecycle preserved'],
  ['WindowCompat.setDecorFitsSystemWindows(getWindow(), false);','post-BridgeActivity edge-to-edge window setup'],
  ['registerPlugin(FreeAINativeWindowPlugin.class);','native window plugin registration'],
  ['@CapacitorPlugin(name = "FreeAINativeWindow")','native window plugin annotation'],
  ['public void setThemeBackground(PluginCall call)','native window theme method'],
  ['getBridge().getWebView().getParent()).setBackgroundColor(color)','native inset parent background synchronization'],
  ['window.getDecorView().setBackgroundColor(color);','native decor background synchronization']
]) requireText(socialLogin,text,label);

for(const [text,label] of [
  ["const qaFieldsAndMethods=", "QA bridge fields/methods are separated from Activity lifecycle"],
  ["const onCreateSignature='protected void onCreate(Bundle savedInstanceState) {'", "QA bridge locates the existing MainActivity onCreate"],
  ["if((source.split(superOnCreate).length-1)!==1)", "QA bridge rejects ambiguous lifecycle hooks"],
  ["if((source.split(windowSetup).length-1)!==1)", "QA bridge requires one post-BridgeActivity window setup"],
  ["source=source.replace(windowSetup,windowSetup+qaOnCreateSetup);", "QA receiver setup is merged after the edge-to-edge window setup"]
]) requireText(runtimeConfig,text,label);

if(runtimeConfig.includes('const qaBlock=')||runtimeConfig.includes('protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        if (!isQaDebuggable()) return;')){
  console.error('Android 6A2 QA guard failed: runtime QA generator must not declare a second MainActivity onCreate.');
  process.exit(1);
}

for(const [text,label] of [
  ['<color name="free_ai_window_background">#181818</color>','dark native window fallback color'],
  ["next=upsertItem(next,'android:windowBackground','@color/free_ai_window_background');",'app theme native window background'],
  ["next=upsertItem(next,'android:statusBarColor','@android:color/transparent');",'transparent app status bar theme'],
  ["next=upsertItem(next,'android:navigationBarColor','@android:color/transparent');",'transparent app navigation bar theme']
]) requireText(branding,text,label);

requireText(capacitor,'"initialViewportFitValueHint": "cover"','initial viewport-fit cover hint');

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
