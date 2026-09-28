import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const main=read('electron/main.cjs');
const renderer=read('src/main.jsx');
const pkg=read('package.json');
const workflow=read('.github/workflows/build.yml');
const config=read('electron-builder.config.cjs');
const entitlements=read('build/entitlements.mac.plist');
const inherit=read('build/entitlements.mac.inherit.plist');

function fail(message){
  console.error('macOS M6 production distribution regression failed: '+message);
  process.exit(1);
}
function requireText(source,marker,label){
  if(!source.includes(marker))fail('missing '+label);
}

for(const [marker,label] of [
  ["function desktopAppInfo(){",'shared desktop app info'],
  ["authProtocolRegistered:(process.platform==='win32'||process.platform==='darwin')?app.isDefaultProtocolClient(AUTH_SCHEME):false",'macOS auth protocol status'],
  ["const DESKTOP_UPDATE_TIMEOUT_MS=15000;",'shared desktop update timeout'],
  ["async function checkForDesktopUpdates(){",'shared update-check runtime'],
  ["if(process.platform!=='win32'&&process.platform!=='darwin')throw new Error('Update checks are currently available on Windows and macOS.');",'macOS update platform gate'],
  ["https://api.github.com/repos/az0512124155azz-sys/free-ai/releases/latest",'official GitHub release source'],
  ["trustedFreeAiReleaseUrl",'trusted release URL validation'],
  ["ipcMain.handle('shell:getAppInfo',()=>desktopAppInfo());",'desktop app info IPC'],
  ["ipcMain.handle('shell:checkForUpdates',()=>checkForDesktopUpdates());",'desktop update IPC']
]) requireText(main,marker,label);

for(const [marker,label] of [
  ["(label!=='App'||isChatDesktop)",'App settings visible on Windows/macOS'],
  ["{section==='App'&&isChatDesktop&&<DesktopAppSettings/>}",'shared desktop App settings surface'],
  ["function DesktopAppSettings(){",'shared desktop App settings component'],
  ["desktopPlatform==='darwin'?'macOS app':'Windows app'",'macOS App heading'],
  ["Production macOS releases are Developer ID signed and notarized before publication.",'macOS update trust copy'],
  ["macOS releases use a DMG. Release publishing is blocked unless Developer ID signing and Apple notarization credentials are configured.",'macOS distribution settings copy']
]) requireText(renderer,marker,label);

for(const [marker,label] of [
  ['"hardenedRuntime": true','macOS hardened runtime'],
  ['"entitlements": "build/entitlements.mac.plist"','main macOS entitlements'],
  ['"entitlementsInherit": "build/entitlements.mac.inherit.plist"','helper macOS entitlements'],
  ["electron-builder --config electron-builder.config.cjs --publish never",'dynamic release-aware builder config'],
  ["node --check electron-builder.config.cjs",'builder config syntax validation']
]) requireText(pkg,marker,label);

for(const [marker,label] of [
  ["com.apple.security.cs.allow-jit",'Electron JIT entitlement'],
  ["com.apple.security.cs.allow-unsigned-executable-memory",'Electron executable-memory entitlement'],
  ["com.apple.security.device.audio-input",'Dictation audio-input entitlement']
]) requireText(entitlements,marker,label);

for(const [marker,label] of [
  ["com.apple.security.cs.allow-jit",'helper JIT entitlement'],
  ["com.apple.security.cs.allow-unsigned-executable-memory",'helper executable-memory entitlement']
]) requireText(inherit,marker,label);

for(const [marker,label] of [
  ["notarize:String(process.env.FREEAI_MAC_NOTARIZE||'').toLowerCase()==='true'",'release-aware notarization toggle']
]) requireText(config,marker,label);

for(const [marker,label] of [
  ["id: macos_distribution",'macOS distribution readiness step'],
  ["MAC_CSC_LINK: ${{ secrets.MAC_CSC_LINK }}",'Developer ID certificate secret'],
  ["MAC_CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}",'Developer ID certificate password secret'],
  ["APPLE_API_KEY_BASE64: ${{ secrets.APPLE_API_KEY_BASE64 }}",'App Store Connect key secret'],
  ["APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}",'App Store Connect key id'],
  ["APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}",'App Store Connect issuer'],
  ["APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}",'Apple ID app-specific password option'],
  ["REQUIRE_MAC_DISTRIBUTION: ${{ github.event_name == 'workflow_dispatch' && inputs.publish_release == true }}",'release-time macOS distribution requirement'],
  ["Release publishing requires both Developer ID signing and Apple notarization.",'release hard gate'],
  ["FREEAI_MAC_NOTARIZE=$notarized",'notarization environment toggle'],
  ["name: macOS packaged distribution and dictation smoke",'packaged macOS production verification'],
  ["codesign --verify --deep --strict --verbose=2",'Developer ID signature verification'],
  ["Authority=Developer ID Application",'Developer ID authority verification'],
  ["com.apple.security.device.audio-input",'packaged audio-input entitlement verification'],
  ["xcrun stapler validate",'stapled notarization verification'],
  ["spctl --assess --type execute",'Gatekeeper assessment']
]) requireText(workflow,marker,label);

for(const forbidden of [
  'BEGIN PRIVATE KEY',
  'BEGIN CERTIFICATE',
  'APPLE_APP_SPECIFIC_PASSWORD=',
  'MAC_CSC_KEY_PASSWORD='
]){
  if([main,renderer,pkg,workflow,config,entitlements,inherit].some(source=>source.includes(forbidden))){
    fail('credential-like material must not be committed: '+forbidden);
  }
}

if(!pkg.includes('node scripts/check-macos-m6-production-distribution.mjs')){
  fail('package validate does not run the macOS M6 guard');
}

console.log('macOS M6 production distribution regression checks passed.');
