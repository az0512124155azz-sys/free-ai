import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');
const styles=fs.readFileSync('src/styles.css','utf8');
const capacitor=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));
const branding=fs.readFileSync('scripts/configure-android-branding.mjs','utf8');

function fail(message){
  console.error('Android 1 shell regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){if(!text.includes(marker))fail(message||('Missing marker: '+marker));}
function ok(value,message){if(!value)fail(message);}

has(source,"const isAndroidNative=isNative&&Capacitor.getPlatform()==='android';",'Android-native platform gate is missing.');
has(source,'function MobileMenuGlyph','Android app bar must keep the two-line mobile navigation glyph.');
has(source,"CapacitorApp.addListener('backButton'",'Android native back handling is missing.');
has(source,"CapacitorApp.exitApp().catch(()=>{})",'Android root back action must exit only after in-app layers are handled.');
has(source,'SystemBars.setStyle','Android system bar style synchronization is missing.');
has(source,'SystemBars.show()','Android system bars must remain visible.');
has(source,"root.dataset.nativePlatform='android'",'Android native document marker is missing.');
has(source,"root.style.setProperty('--keyboard-offset'",'Android keyboard viewport offset tracking is missing.');
has(source,"isAndroidNative?'nativeMobileShell ':'",'Android native shell class is missing.');
has(source,"!isNative&&<button onClick={onBrowser}",'Native mobile must not expose the desktop browser action.');

has(styles,'--safe-top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));','Android safe-area fallback must prefer Capacitor SystemBars variables.');
has(styles,'.nativeMobileShell .gptSidebar{','Android drawer must remain off-canvas instead of becoming a fixed desktop sidebar.');
has(styles,'.nativeMobileShell .desktopPrimaryNav','Android native shell must hide desktop primary navigation.');
has(styles,'.nativeMobileShell .mobileNavTrigger{display:grid}','Android app bar navigation trigger is missing.');
has(styles,'.nativeMobileShell .mobileConversationPicker{display:flex}','Android conversation model picker must remain at the top of the conversation.');
has(styles,'bottom:max(8px,calc(var(--safe-bottom) + var(--keyboard-offset)))','Android composer must account for bottom safe area and keyboard offset.');
has(styles,'@media(min-width:761px){','Android tablet adaptation is missing.');
has(styles,'.nativeMobileShell .gptComposer','Android tablet composer sizing is missing.');
has(styles,'.nativeMobileShell .settingsScreen.mobileSettingsList .settingsNav','Android tablet settings must keep mobile list/detail navigation.');
has(styles,'.nativeMobileShell .mobileModeButton','Android tablet app bar must keep the mobile mode control.');

ok(capacitor?.plugins?.SystemBars?.insetsHandling==='css','Capacitor SystemBars must inject CSS safe-area variables.');
ok(capacitor?.plugins?.SystemBars?.hidden===false,'Android system bars must not start hidden.');
has(branding,"['android:windowLayoutInDisplayCutoutMode','always']", 'Android 15/16 display cutout mode must use edge-to-edge compatible always mode.');
has(branding,"android:windowSoftInputMode=\"adjustResize\"",'Android MainActivity must resize for the software keyboard, including large-screen tablets.');
ok(!branding.includes("['android:statusBarColor','@android:color/transparent']"),'Legacy Android status bar color mutation must not return.');
ok(!branding.includes("['android:navigationBarColor','@android:color/transparent']"),'Legacy Android navigation bar color mutation must not return.');

console.log('Android 1 native mobile shell regression checks passed.');
