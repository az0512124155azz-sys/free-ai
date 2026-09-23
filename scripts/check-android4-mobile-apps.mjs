import fs from 'node:fs';

function readNormalized(path){
  return fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
}
const source=readNormalized('src/main.jsx');
const runtime=readNormalized('scripts/android-runtime-qa.sh');
const styles=readNormalized('src/styles.css');

function fail(message){
  console.error('Android 4A2 mobile Apps/Explore regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){
  if(!text.includes(marker))fail(message||('Missing marker: '+marker));
}

has(source,'className="contentPage mobileAppsPage"','Android must expose a dedicated mobile Apps surface.');
has(source,"[['discover','Discover'],['available','Available'],['providers','Providers']]",'Mobile Apps must separate discovery, provider availability, and provider connectivity.');
has(source,'Public ChatGPT directory listings. A listing is not an installation or account connection in Free AI.','Public app listings must not be presented as installed or connected.');
has(source,'Account authorization, permissions, and supported actions remain controlled by the provider or its app connection.','Mobile Apps must preserve provider authorization and permission boundaries.');
has(source,"setDetails({kind:'public',entry})",'Mobile Apps must expose public app details.');
has(source,"setDetails({kind:'hint',hint:tool})",'Provider-managed app hints must expose clearly labeled details.');
has(source,'className="contentPage mobileExplorePage"','Android must expose a dedicated mobile Explore surface.');
has(source,'value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps and conversations"','Mobile Explore search must be a real controlled search field.');
has(source,"[['all','All'],['apps','Apps'],['chats','Chats']]",'Mobile Explore must filter Apps and conversations.');
has(source,'onClick={()=>onOpenChat?.(chat)}','Explore conversations must be actionable on Android.');
has(source,'onOpenPublicDirectory={openPublicPluginDirectory} onOpenChat={openChat}','App must wire mobile Explore details and conversation opening.');
has(source,"if(command==='openApps')",'Android runtime QA must be able to open Apps.');
has(source,"if(command==='openExplore')",'Android runtime QA must be able to open Explore.');
has(source,"'desktopAppControls='+!!document.querySelector('.mobileAppsPage .mcpAddCard,.mobileAppsPage .directMcpGrid,.mobileExplorePage .directMcpGrid')",'Runtime audit must detect accidental desktop MCP controls on mobile.');

has(styles,'.mobileAppsPage .pluginGrid{grid-template-columns:1fr','Mobile Apps provider cards must collapse to a phone-friendly single column.');
has(styles,'.mobileAppsPage .contentInner,.mobileExplorePage .contentInner','Apps and Explore must use mobile content spacing.');

has(runtime,'qa_line openApps >/dev/null','Runtime QA must navigate to Apps.');
has(runtime,'require_token "$apps_page" "appsDiscover=true"','Runtime QA must verify the Apps discovery surface.');
has(runtime,'require_token "$apps_page" "desktopAppControls=false"','Runtime QA must reject desktop MCP controls on Android Apps.');
has(runtime,'qa_line openExplore >/dev/null','Runtime QA must navigate to Explore.');
has(runtime,'require_token "$explore_page" "exploreSearch=true"','Runtime QA must verify real mobile Explore search.');
has(runtime,'require_token "$explore_page" "desktopAppControls=false"','Runtime QA must reject desktop MCP controls on Android Explore.');
has(runtime,'apps_closed','Runtime QA must verify Android Back leaves Apps.');
has(runtime,'explore_closed','Runtime QA must verify Android Back leaves Explore.');

console.log('Android 4A2 mobile Apps/Explore regression checks passed.');
