import fs from 'node:fs';

const main=fs.readFileSync('electron/main.cjs','utf8');
const research=fs.readFileSync('electron/research.cjs','utf8');
const preload=fs.readFileSync('electron/preload.cjs','utf8');
const source=fs.readFileSync('src/main.jsx','utf8');
const background=fs.readFileSync('extension/background.js','utf8');
const contentScript=fs.readFileSync('extension/content.js','utf8');
const extensionManifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const installerSmoke=fs.readFileSync('scripts/windows7-installer-smoke.ps1','utf8');
const installerNsis=fs.readFileSync('build/installer.nsh','utf8');
const windowsSigningGuide=fs.readFileSync('docs/windows-signing.md','utf8');
const windowsVisualConfig=fs.readFileSync('playwright.windows.config.mjs','utf8');
const windowsVisualSpec=fs.readFileSync('tests/visual/windows-shell.spec.mjs','utf8');
const windowsVisualGuide=fs.readFileSync('docs/windows-visual-regression.md','utf8');
const windowsVisualBaseline='tests/visual/baselines/windows-main-shell.png';

function fail(message){
  console.error('Windows 7 QA regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){
  if(!text.includes(marker))fail(message||('Missing marker: '+marker));
}
function ok(value,message){if(!value)fail(message);}

ok(pkg?.build?.appId==='com.freeai.desktop','Windows installer appId changed unexpectedly.');
ok(pkg?.build?.productName==='Free AI','Windows installer productName changed unexpectedly.');
ok(Array.isArray(pkg?.build?.win?.target)&&pkg.build.win.target.includes('nsis'),'Windows must keep the NSIS installer target.');
ok(pkg?.build?.win?.artifactName==='Free-AI-Windows-${version}.${ext}','Windows installer artifact name changed unexpectedly.');
ok(pkg?.build?.win?.icon==='build/free-ai-symbol.svg','Windows application icon must use the canonical Free AI symbol.');
ok(pkg?.build?.asar===true,'Packaged Windows application must keep ASAR enabled.');
ok(!pkg?.build?.win?.signtoolOptions?.certificateFile,'Windows signing certificate paths must not be committed to package.json.');
ok(!pkg?.build?.win?.signtoolOptions?.certificatePassword,'Windows signing certificate passwords must not be committed to package.json.');

const electronVersion=String(pkg?.devDependencies?.electron||'').replace(/^[^0-9]*/,'');
const electronMajor=Number.parseInt(electronVersion.split('.')[0],10);
ok(Number.isInteger(electronMajor)&&electronMajor>=44,'Windows release-readiness must use a currently supported Electron major (44+ for this checkpoint).');
ok(/async function pasteWindowsText\(text\)\{[\s\S]*?await clipboard\.writeText\(/.test(main),'Windows Computer Use paste must await Electron 44 async clipboard writes.');
ok(/async function pasteMacText\(text\)\{[\s\S]*?await clipboard\.writeText\(/.test(main),'macOS paste compatibility must await Electron 44 async clipboard writes.');


has(main,'function windowsInitialWindowBounds','DPI-aware first-launch window sizing is missing.');
has(main,"screen.getPrimaryDisplay()?.workArea",'First-launch window must use the primary display work area in DIP.');
has(main,'const usableWidth=Math.max(480','First-launch width floor is missing.');
has(main,'const usableHeight=Math.max(360','First-launch height floor is missing.');
has(main,'minWidth:Math.min(640,width)','Windows minimum width must never exceed its fitted initial width.');
has(main,'minHeight:Math.min(480,height)','Windows minimum height must never exceed its fitted initial height.');
has(main,'...initialWindowBounds','BrowserWindow is not using the fitted initial bounds.');
has(main,"win.once('ready-to-show'","First launch should still avoid renderer flash.");
has(main,"title:'Free AI'",'Windows title is missing.');
has(main,"icon:path.join(__dirname,'..','build','icon.png')",'Runtime BrowserWindow icon is missing.');

has(main,'screen.getAllDisplays()','Multi-monitor enumeration is missing.');
has(main,'source.display_id','Windows screenshot-to-display mapping is missing.');
has(main,'screen.dipToScreenRect(null,matched.bounds)','Windows Computer Use physical/DIP conversion is missing.');
has(main,"coordinateSpace:'physical'",'Computer Use does not identify physical coordinates.');
has(main,'scaleFactor:Number(display?.scaleFactor)||1','Computer Use display scale metadata is missing.');

has(source,'dir="auto"','RTL/LTR automatic paragraph direction protection is missing.');
has(source,'ResizeObserver','Responsive resize observer is missing.');
has(source,'option value="system">System','System appearance mode is missing.');
has(source,'function SettingsView','Settings UI is missing.');
has(source,'function ModelMenu','Model picker is missing.');
has(source,'function ResearchSetupDialog','Deep Research setup is missing.');
has(source,'function ChatContextMenu','Chat management menu is missing.');

// Windows 7.13 OAuth deep-link boundary coverage.
has(main,"const AUTH_CALLBACK_URL='freeai://auth/callback';",'Desktop auth callback must use the exact registered callback URL.');
has(main,'function isAuthCallbackUrl(value)','Desktop auth callback parser is missing.');
has(main,'parsed.hostname===expected.hostname','Desktop auth callback validation must compare the exact host.');
has(main,'parsed.pathname===expected.pathname','Desktop auth callback validation must compare the exact callback path.');
has(main,'find(arg=>isAuthCallbackUrl(arg))','Second-instance auth URL discovery must use strict callback validation.');
has(source,'function isAuthCallbackUrl(value)','Renderer auth callback parser is missing.');
has(source,'if(!isAuthCallbackUrl(url))return;','Renderer must reject non-matching auth deep links before session exchange.');
ok(!main.includes("startsWith('freeai://auth')"),'Desktop auth callback must not regress to prefix matching.');
ok(!source.includes("startsWith('freeai://auth')"),'Renderer auth callback must not regress to prefix matching.');

// Windows 7.12 update/offline coverage.
has(main,'async function checkForWindowsUpdates()','Windows update-check runtime is missing.');
has(main,'if(!net.isOnline())','Update check must fail fast when Electron reports the device offline.');
has(main,'const WINDOWS_UPDATE_TIMEOUT_MS=15000;','Update check timeout guard is missing.');
has(main,'const controller=new AbortController();','Update check cancellation controller is missing.');
has(main,'signal:controller.signal','GitHub Releases fetch is not cancellable.');
has(main,'Update check timed out. Check your internet connection and try again.','Update timeout must surface an actionable error.');
has(main,"parsed.protocol!=='https:'||parsed.hostname!=='github.com'",'Update release link must require HTTPS GitHub.');
has(main,"parsed.pathname.startsWith('/az0512124155azz-sys/free-ai/releases/')",'Update release link must stay inside the Free AI releases path.');
has(preload,"checkForUpdates:()=>ipcRenderer.invoke('shell:checkForUpdates')",'Preload update-check bridge is missing.');
has(source,'window.desktopApi.checkForUpdates()','Windows Settings update-check action is missing.');
has(source,"Open release",'Windows Settings must expose the verified release link when an update is available.');

// Windows 7.13 browser permission scope coverage.
has(main,'ses.setPermissionCheckHandler((webContents,permission,requestingOrigin,details={})=>','Built-in browser permission checks must remain explicit.');
has(main,'ses.setPermissionRequestHandler((webContents,permission,callback,details={})=>','Built-in browser permission requests must remain explicit.');
has(main,'function browserPermissionMediaTypes(details={})','Media permission subtype normalization is missing.');
has(main,"value==='audio'||value==='video'",'Media permission scope must distinguish microphone from camera.');
has(main,"if(permission!=='media')return [base];",'Non-media permission session scoping changed unexpectedly.');
has(main,"return mediaTypes.map(type=>base+':'+type);",'Media grants must use subtype-specific keys.');
has(main,'return keys.length>0&&keys.every(key=>browserPermissionGrants.has(key));','Media permission checks must require every requested subtype grant.');
has(main,'mediaTypes:browserPermissionMediaTypes(details)','Permission requests must preserve media subtype details for the renderer.');
has(main,'grantKeys,','Permission requests must preserve the exact grant keys being approved.');
has(main,'for(const key of grantKeys)browserPermissionGrants.add(key);','Approved media permissions must persist each requested subtype independently.');
has(main,'function clearBrowserPermissions()','Browser permission reset is missing.');
has(source,"if(audio&&video)return 'your camera and microphone';",'Permission UI must label combined media access precisely.');
has(source,"if(video)return 'your camera';",'Permission UI must distinguish camera access.');
has(source,"if(audio)return 'your microphone';",'Permission UI must distinguish microphone access.');
has(source,'permissionLabel(permissionRequest)','Permission UI must label the concrete request, not only the generic permission name.');

has(main,"function encodeSecret(value,{requireEncryption=false}={})",'Secret persistence must support an encryption-required mode.');
has(main,"throw new Error('Secure credential storage is unavailable. Free AI will not save API keys in plaintext.')",'API-key persistence must refuse plaintext fallback.');
has(main,"const containsApiKey=apiConnections.some",'API connection persistence must detect stored API keys.');
has(main,"encodeSecret(apiConnections,{requireEncryption:containsApiKey})",'API-key storage is not requiring encryption.');
has(main,"if(connection.apiKey&&!safeStorage.isEncryptionAvailable())",'Adding an API key must preflight secure storage availability.');
has(main,"Free AI will not send or save this API key in plaintext.",'API-key secure-storage failure must be explicit.');
has(main,"apiConnections=apiConnections.filter(item=>item.id!==connection.id)",'Failed API connection saves must roll back the in-memory add.');
has(main,"apiConnections=previous;",'Failed API connection removals must roll back the in-memory removal.');
has(main,"raw?.mode==='plain'&&apiConnections.some(item=>item?.apiKey)&&safeStorage.isEncryptionAvailable()",'Legacy plaintext API credentials must migrate when secure storage is available.');
has(main,"if(mcpConnections.some(item=>item.token)&&!safeStorage.isEncryptionAvailable())",'MCP bearer tokens must refuse plaintext persistence.');
has(main,"Free AI will not save an MCP bearer token in plaintext.",'MCP secure-storage failure must be explicit.');
has(main,"raw?.mode==='plain'&&mcpConnections.some(item=>item?.token)&&safeStorage.isEncryptionAvailable()",'Legacy plaintext MCP credentials must migrate when secure storage becomes available.');
has(main,"Failed to migrate legacy MCP credentials to secure storage",'Legacy MCP credential migration must fail safely without destroying the loaded connection list.');
has(main,'const previous=mcpConnections;','MCP removal must preserve previous in-memory state until persistence succeeds.');
ok(/ipcMain\.handle\('mcp:removeConnection'[\s\S]*?const previous=mcpConnections;[\s\S]*?try\{saveMcpConnections\(\)\}[\s\S]*?catch\(error\)\{[\s\S]*?mcpConnections=previous;[\s\S]*?throw error;[\s\S]*?\}[\s\S]*?mcpSessions\.delete\(key\);/.test(main),'Failed MCP removal persistence must roll back before deleting the live session.');

has(workflow,'Windows clean install and first-launch smoke','Windows CI is not running the packaged installer smoke.');
has(workflow,"matrix.artifact == 'windows'",'Installer smoke must remain Windows-only.');

// Windows 7.16 visual-regression CI coverage.
has(workflow,'windows_visual:','Windows CI must include a dedicated visual-regression job.');
has(workflow,'@playwright/test@1.63.0','Windows visual CI must pin the reviewed Playwright version.');
has(workflow,'Run Windows visual regression','Windows CI must compare the committed visual baseline.');
ok(!workflow.includes('--update-snapshots'),'Normal Windows visual CI must never auto-update committed baselines.');
ok(fs.existsSync(windowsVisualBaseline),'Committed Windows visual baseline is missing.');
ok(fs.statSync(windowsVisualBaseline).size>10000,'Committed Windows visual baseline is unexpectedly small.');
has(workflow,"VITE_VISUAL_TEST: '1'",'Windows visual build must use the explicit auth-independent test flag.');
has(source,"const isVisualTestBuild=import.meta.env.VITE_VISUAL_TEST==='1';",'Visual auth bypass must be an explicit build-time test flag.');
has(source,'const supabase=!isVisualTestBuild&&supabaseUrl&&supabaseKey','Visual auth bypass must not change normal production auth.');
has(workflow,'free-ai-windows-visual','Windows visual evidence must be uploaded for review.');
has(workflow,'needs: [desktop, windows_visual, android, extension]','Release publishing must depend on the Windows visual gate.');
has(windowsVisualConfig,"snapshotPathTemplate:'{testDir}/baselines/{arg}{ext}'",'Windows visual snapshots must use the committed baseline directory.');
has(windowsVisualSpec,"_electron as electron",'Visual regression must launch the real Electron app through Playwright.');
has(windowsVisualSpec,"--user-data-dir=",'Visual regression must isolate its Electron profile.');
has(windowsVisualSpec,"width:1440,height:900",'Windows visual regression must use deterministic window dimensions.');
has(windowsVisualSpec,"page.locator('.desktopShell').waitFor",'Visual regression must prove the real desktop shell rendered.');
has(windowsVisualSpec,"page.locator('.authScreen')).toHaveCount(0)",'Visual regression must reject an auth-screen baseline.');
has(windowsVisualSpec,"appearance:'dark'",'Windows visual regression must pin appearance.');
has(windowsVisualSpec,"await document.fonts.ready",'Windows visual regression must wait for fonts before capture.');
has(windowsVisualSpec,"maxDiffPixelRatio:0.003",'Windows visual regression must keep an explicit reviewed pixel-diff threshold.');
has(windowsVisualGuide,'must not auto-update snapshots','Normal CI must not silently rewrite visual baselines.');

// Windows 7.15 code-signing readiness coverage.
has(workflow,'- id: windows_signing','Windows CI must preflight signing configuration before packaging.');
has(workflow,'WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}','Windows certificate material must come from GitHub Actions secrets.');
has(workflow,'WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}','Windows certificate password must come from GitHub Actions secrets.');
has(workflow,'Windows signing is only partially configured. Set both WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD','Partial Windows signing configuration must fail closed.');
has(workflow,'Release publishing requires Windows Authenticode signing.','Release publishing must be blocked when Windows signing credentials are absent.');
has(workflow,'FREEAI_EXPECT_SIGNED: ${{ steps.windows_signing.outputs.enabled }}','Installer smoke must know whether signing was expected for this build.');
has(installerSmoke,'function Assert-ValidAuthenticodeSignature','Windows installer smoke must include Authenticode verification.');
has(installerSmoke,'Get-AuthenticodeSignature -LiteralPath $Path','Windows signing verification must use the platform Authenticode status.');
has(installerSmoke,"[string]$signature.Status -ne 'Valid'",'Windows signing verification must reject non-valid signatures.');
has(installerSmoke,"Assert-ValidAuthenticodeSignature $installer.FullName 'Windows installer'",'Signed CI must verify the NSIS installer signature.');
has(installerSmoke,"Assert-ValidAuthenticodeSignature $appExe 'Installed Free AI.exe'",'Signed CI must verify the installed executable signature.');
has(windowsSigningGuide,'WIN_CSC_LINK','Windows signing guide must document the certificate secret.');
has(windowsSigningGuide,'publish_release=true','Windows signing guide must document the signed-release gate.');
has(windowsSigningGuide,'Microsoft Artifact Signing','Windows signing guide must document the cloud-signing alternative without fake credentials.');
has(installerSmoke,"@('/S', \"/D=$installDir\")",'Installer smoke must perform a silent NSIS clean install to an isolated directory.');
has(installerSmoke,"Join-Path $installDir 'Free AI.exe'",'Installer smoke must verify the installed Free AI executable.');
has(installerSmoke,"Join-Path $installDir 'resources\\app.asar'",'Installer smoke must verify the packaged ASAR.');
has(installerSmoke,"Start-Process -FilePath $appExe",'Installer smoke must launch the installed application.');
has(installerSmoke,"$process.HasExited",'Installer smoke must detect launch crashes through the shared restart helper.');
has(installerSmoke,"Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe'",'Installer smoke must find the installed NSIS uninstaller.');
has(installerSmoke,'/S _?=$installDir','Installer smoke must silently uninstall the exact smoke-test installation.');
has(installerSmoke,"Start-FreeAISmokeLaunch 'First launch'",'Installer smoke must exercise packaged first launch through the shared launch helper.');
has(installerSmoke,"First launch did not initialize the isolated userData profile.",'Installer smoke must verify first launch initializes the profile before restart.');
has(installerSmoke,"Start-FreeAISmokeLaunch 'Second launch with existing profile'",'Installer smoke must validate a second launch using the same userData profile.');
has(installerSmoke,"Second launch / restart with same profile: PASS",'Installer smoke summary must report restart validation.');
has(installerSmoke,"Registry::HKEY_CURRENT_USER\\Software\\Classes\\freeai",'Installer smoke must inspect the installed freeai:// registry association.');
has(installerSmoke,"$protocolRoot.GetValue('URL Protocol')",'Installer smoke must verify the URL Protocol registry marker.');
has(installerSmoke,"$protocolCommand.IndexOf($appExe",'Installer smoke must verify freeai:// routes to the installed executable.');
has(installerSmoke,"Silent uninstall left a stale freeai:// protocol command",'Installer smoke must reject stale protocol registration after uninstall.');
has(installerNsis,'!macro customUnInstall','NSIS uninstall customization for protocol cleanup is missing.');
has(installerNsis,'ReadRegStr $0 HKCU "Software\\Classes\\freeai\\shell\\open\\command" ""','Uninstaller must inspect the current freeai:// HKCU command before cleanup.');
has(installerNsis,'StrCmp $0 \'"$INSTDIR\\Free AI.exe" "%1"\' 0 +2','Uninstaller must only remove the exact protocol command owned by the installation being removed.');
has(installerNsis,'DeleteRegKey HKCU "Software\\Classes\\freeai"','Uninstaller must remove its stale freeai:// registry key.');
has(main,"app.setAsDefaultProtocolClient(AUTH_SCHEME",'Runtime auth protocol registration is missing.');
has(main,"app.isDefaultProtocolClient(AUTH_SCHEME)",'Windows app info must expose auth protocol registration state.');
has(main,"app.on('second-instance'",'Packaged auth callback handling must support an already-running Windows instance.');
has(main,"const url=findAuthUrl(argv);",'Second-instance handling must extract a freeai:// auth callback.');


ok(!/extensionSocket=null;\s*browserProviders=\[\];/.test(main),'Transient Browser Bridge disconnects must retain the last provider snapshot until reconnection.');
has(main,"request.reject(new Error('Browser extension disconnected during generation.'))",'Active browser generations must fail immediately when the extension disconnects.');
has(main,"for(const [id,request] of pending)",'Extension disconnect must drain pending browser prompts.');
has(source,"if(product==='super'){",'Super AI must recover a controller automatically from the connected provider set.');
has(source,"const fresh=selected?connected.find",'Renderer must reconcile a selected provider against refreshed bridge state.');

// Browser Bridge / Super AI hotfix coverage.
ok(Array.isArray(extensionManifest.permissions)&&extensionManifest.permissions.includes('alarms'),'Browser Bridge manifest must allow wake alarms.');
ok(Number(extensionManifest.minimum_chrome_version)>=120,'Browser Bridge wake-alarm recovery requires Chrome 120+ timing support.');
has(background,"const BRIDGE_WAKE_ALARM='freeai-bridge-wake';",'Browser Bridge wake alarm is missing.');
has(background,'chrome.alarms.onAlarm.addListener','Browser Bridge must wake and reconnect after service-worker suspension.');
has(background,"safeSend({type:'keepalive',at:Date.now()});",'Browser Bridge heartbeat must keep the extension service worker alive.');
const heartbeatStart=background.indexOf('function startHeartbeat(){');
const heartbeatEnd=background.indexOf('async function ensureWakeAlarm()',heartbeatStart);
ok(heartbeatStart>=0&&heartbeatEnd>heartbeatStart,'Browser Bridge heartbeat implementation is missing.');
const heartbeatBlock=background.slice(heartbeatStart,heartbeatEnd);
has(heartbeatBlock,"safeSend({type:'keepalive',at:Date.now()});",'Browser Bridge heartbeat must send keepalive messages.');
ok(!heartbeatBlock.includes('scanProviders('),'20-second keepalive must not force a full provider rescan.');
has(background,"chrome.alarms.onAlarm.addListener(alarm=>{if(alarm?.name!==BRIDGE_WAKE_ALARM)return;ensureConnected()});",'Wake alarm must reconnect the bridge without forcing provider churn.');
ok(!background.includes("ensureConnected();scanProviders().catch(()=>{})"),'Wake alarm must not reintroduce provider churn.');
has(background,'if(previous){','Transient provider scans must retain the previous provider snapshot.');
has(background,'adapterReady:previous?previous.adapterReady!==false:false','Transient capability probe failures must preserve known adapter health.');
has(source,'<RefreshCw size={12}/>Detect models','Free AI must expose an explicit provider-model detection action.');
has(source,'choose={m=>{setSelected(m);setParallelCount?.(1)}}','Selecting a provider must keep the picker open so its native model can be chosen.');
has(background,'freeai:addCustomProvider','Browser Bridge must allow registering the current AI tab as a custom provider.');
has(background,'freeAiCustomProviders','Custom AI providers must persist across extension service-worker restarts.');
has(contentScript,'const genericConfig={','Unknown AI chats need a generic adapter fallback.');
has(contentScript,'return configs[provider]||genericConfig','Custom AI providers must use the generic adapter when no built-in adapter exists.');
has(source,"product!=='super'&&<div className=\"menuAnchor\">",'Super AI must not expose the regular model picker.');
has(source,'Every available AI participates automatically. No model selection is required in Super AI.','Super AI automatic-team UX is missing.');
has(source,"connected.filter(model=>model.connected!==false&&model.adapterReady!==false&&modelKey(model)!==modelKey(selected))",'Super AI must route to all healthy connected models automatically.');
has(source,'<ProviderBadge model={agent} small/>','Super AI task agents must show provider logos.');
has(main,"iconDataUrl:String(primary.iconDataUrl||'')",'Super AI controller must preserve its provider icon.');
has(main,"iconDataUrl:String(model.iconDataUrl||'')",'Super AI agents must preserve their provider icons.');

// Windows 7.6 provider-adapter contract coverage.
has(contentScript,'function providerAdapterHealth(provider)','Provider DOM health detection is missing.');
has(contentScript,"adapterReady:false",'Provider capability scan must expose an unavailable adapter state.');
has(contentScript,"adapterReady:true",'Provider capability scan must expose a healthy adapter state.');
has(background,"adapterReady:capabilities?.adapterReady===true",'Browser Bridge must preserve live adapter health.');
has(background,"adapterIssue:String(capabilities?.adapterIssue||'')",'Browser Bridge must preserve adapter failure details.');
has(main,"connected:extensionConnected&&p.adapterReady!==false",'Desktop provider status must disable unhealthy adapters.');
has(main,"if(provider.adapterReady===false)",'Browser routing must reject an unhealthy provider adapter.');
has(source,"const fresh=selected?connected.find",'Selected provider reconciliation must remain present.');
has(source,"function modelConnectionDetail(model)",'Model picker must distinguish adapter failure from reconnecting state.');
has(source,"return ' · adapter unavailable';",'Model picker must label provider adapter failures truthfully.');
has(source,"title={model.adapterIssue||undefined}",'Provider adapter failure reason must be available in the picker.');
has(source,"onClick={()=>model.connected!==false&&choose(model)}",'Compact model picker must not select an unavailable adapter.');

// Windows 7.8 renderer-loss lifecycle coverage.
has(main,"function stopRendererOwnedWork(reason='Renderer unavailable')",'Renderer-loss Work cleanup helper is missing.');
has(main,"win.webContents.once('did-finish-load',()=>{rendererDocumentReady=true})",'Renderer reload guard must ignore the initial document load.');
has(main,"win.webContents.on('did-start-navigation',(_event,details)=>",'Main renderer document navigation must be observed.');
has(main,"if(!rendererDocumentReady||details?.isMainFrame===false||details?.isSameDocument)return;",'Renderer navigation cleanup must target real main-frame document reloads only.');
has(main,"stopRendererOwnedWork('main renderer started a document reload/navigation')",'Reload/navigation must stop renderer-owned Work tasks.');
has(main,"win.webContents.on('render-process-gone',(_event,details)=>",'Main renderer crash lifecycle handler is missing.');
has(main,"stopRendererOwnedWork('main renderer process '+String(details?.reason||'stopped'))",'Renderer crash must stop renderer-owned Work tasks.');
has(main,"if(stopWorkTask(task.id))stopped++",'Renderer-loss cleanup must use the normal Work Stop path so prompts and approvals are cancelled.');

// Windows 7.9 secure API transport coverage.
has(main,"apiTransportUrl(connection.baseUrl,connection.apiKey)",'API connection save path must validate credential transport.');
has(main,"const base=apiTransportUrl(cfg.baseUrl,cfg.apiKey);",'API chat send path must revalidate credential transport.');
has(research,"function apiTransportUrl(value,apiKey='')",'Shared API transport validator is missing.');
has(research,"API keys require HTTPS for remote endpoints. HTTP is allowed only for local loopback models.",'Remote keyed HTTP rejection is missing.');
has(research,"const loopback=host==='localhost'||host==='[::1]'||host==='::1'||/^127", 'Loopback exception for local models is missing.');

console.log('Windows 7 QA regression checks passed.');
