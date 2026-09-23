import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n')}
const source=read('src/main.jsx');
const desktop=read('electron/main.cjs');
const relay=read('relay/server.mjs');
const runtime=read('scripts/android-runtime-qa.sh');

function fail(message){
  console.error('Android 5A1 remote desktop regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){
  if(!text.includes(marker))fail(message||('Missing marker: '+marker));
}

has(source,"label==='Connections'?'Remote Desktop'",'Android must label desktop connectivity as Remote Desktop.');
has(source,"function RemoteDesktopSettings",'Android needs a dedicated Remote Desktop settings surface.');
has(source,"title=\"Remote Browser\"",'Browser capability must be labelled Remote on Android.');
has(source,"title=\"Remote Computer\"",'Computer capability must be labelled Remote on Android.');
has(source,"Pairing API key",'Android Remote Desktop must expose pairing-key setup.');
has(source,"type=\"password\" value={settings.pairKey}",'Pairing key must not be displayed as plain text.');
has(source,"AI provider API keys stay encrypted on Desktop and are never sent to Android.",'Mobile UI must state the API-key security boundary.');
has(source,"desktopOnline:m.desktopOnline===true",'Mobile relay state must preserve actual desktop online/offline state.');
has(source,"remoteCapabilities:{browser:{available:false},computer:{available:false}}",'Mobile must default remote capabilities to unavailable when disconnected.');
has(source,"if(command==='openRemoteDesktop')",'Android runtime QA must open the Remote Desktop surface.');
has(source,"remoteDesktopApiForm=",'Android runtime audit must detect accidental desktop API credential controls.');

has(desktop,'function publicRelayProvider(provider)','Desktop must sanitize model metadata before sending it through the relay.');
const sanitizer=desktop.slice(desktop.indexOf('function publicRelayProvider(provider)'),desktop.indexOf('function status()',desktop.indexOf('function publicRelayProvider(provider)')));
for(const forbidden of ['apiKey','baseUrl','hasKey','token','url','tabId']){
  if(new RegExp('\\b'+forbidden+'\\b').test(sanitizer))fail('Relay provider sanitizer must not expose '+forbidden+'.');
}
has(desktop,"providers:s.providers.map(publicRelayProvider).filter(Boolean)",'Relay status must use sanitized provider metadata only.');
has(desktop,"remoteCapabilities:",'Relay status must explicitly describe remote capabilities.');
has(desktop,"desktopOnline:true",'Desktop status sent through relay must identify the desktop as online.');

has(relay,"desktopOnline:false",'Relay must notify Android when the paired desktop is offline.');
has(relay,"remoteCapabilities:{browser:{available:false},computer:{available:false}}",'Relay disconnect state must disable remote Browser and Computer.');

has(runtime,'qa_line openRemoteDesktop >/dev/null','Runtime QA must open Remote Desktop settings.');
has(runtime,'remoteBrowserLabel=true','Runtime QA must verify Remote Browser labeling.');
has(runtime,'remoteComputerLabel=true','Runtime QA must verify Remote Computer labeling.');
has(runtime,'remoteDesktopApiForm=false','Runtime QA must reject desktop API credential forms on Android.');
has(runtime,'remotePairingKey=true','Runtime QA must verify the pairing field exists.');

console.log('Android 5A1 remote desktop regression checks passed.');
