import fs from 'node:fs';

const main=fs.readFileSync('electron/main.cjs','utf8');
const source=fs.readFileSync('src/main.jsx','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const installerSmoke=fs.readFileSync('scripts/windows7-installer-smoke.ps1','utf8');

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

has(main,"function encodeSecret(value,{requireEncryption=false}={})",'Secret persistence must support an encryption-required mode.');
has(main,"throw new Error('Secure credential storage is unavailable. Free AI will not save API keys in plaintext.')",'API-key persistence must refuse plaintext fallback.');
has(main,"const containsApiKey=apiConnections.some",'API connection persistence must detect stored API keys.');
has(main,"encodeSecret(apiConnections,{requireEncryption:containsApiKey})",'API-key storage is not requiring encryption.');
has(main,"if(connection.apiKey&&!safeStorage.isEncryptionAvailable())",'Adding an API key must preflight secure storage availability.');
has(main,"Free AI will not send or save this API key in plaintext.",'API-key secure-storage failure must be explicit.');
has(main,"apiConnections=apiConnections.filter(item=>item.id!==connection.id)",'Failed API connection saves must roll back the in-memory add.');
has(main,"apiConnections=previous;",'Failed API connection removals must roll back the in-memory removal.');
has(main,"raw?.mode==='plain'&&apiConnections.some(item=>item?.apiKey)&&safeStorage.isEncryptionAvailable()",'Legacy plaintext API credentials must migrate when secure storage is available.');

has(workflow,'Windows clean install and first-launch smoke','Windows CI is not running the packaged installer smoke.');
has(workflow,"matrix.artifact == 'windows'",'Installer smoke must remain Windows-only.');
has(installerSmoke,"@('/S', \"/D=$installDir\")",'Installer smoke must perform a silent NSIS clean install to an isolated directory.');
has(installerSmoke,"Join-Path $installDir 'Free AI.exe'",'Installer smoke must verify the installed Free AI executable.');
has(installerSmoke,"Join-Path $installDir 'resources\\app.asar'",'Installer smoke must verify the packaged ASAR.');
has(installerSmoke,"Start-Process -FilePath $appExe",'Installer smoke must launch the installed application.');
has(installerSmoke,"$app.HasExited",'Installer smoke must detect first-launch crashes.');
has(installerSmoke,"Get-ChildItem -Path $installDir -Filter 'Uninstall*.exe'",'Installer smoke must find the installed NSIS uninstaller.');
has(installerSmoke,'/S _?=$installDir','Installer smoke must silently uninstall the exact smoke-test installation.');

console.log('Windows 7 QA regression checks passed.');
