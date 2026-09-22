import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8').replace(/\r\n/g,'\n');

function fail(message){
  console.error('Renderer regression check failed: '+message);
  process.exit(1);
}

const composerStart=source.indexOf('function Composer(props)');
const composerEnd=source.indexOf('function MobileConversationPicker',composerStart);
if(composerStart<0||composerEnd<0)fail('Could not locate the Composer component.');
const composer=source.slice(composerStart,composerEnd);

for(const appLocal of ['selectProviderModelOption','selectProviderEffortOption','refreshProviderModels']){
  if(composer.includes(appLocal)){
    fail('Composer references App-local function "'+appLocal+'" directly. Pass it through props instead.');
  }
}
for(const requiredProp of ['onSelectProviderModel','onSelectProviderEffort','onRefreshModels']){
  if(!composer.includes(requiredProp)){
    fail('Composer is missing required provider-control prop "'+requiredProp+'".');
  }
}

for(const requiredSearchProp of ['webSearchEnabled','onToggleWebSearch','deepResearchEnabled','onToggleDeepResearch']){
  if(!composer.includes(requiredSearchProp)){
    fail('Composer is missing required web/research prop "'+requiredSearchProp+'".');
  }
}
if(!source.includes("nativeTool:nativeDeepResearch&&model.source==='browser'?'deep-research':nativeSearch?'search':null")){
  fail('Chat Search / provider-native Deep Research routing is missing.');
}
if(!source.includes("researchConfig:ownedResearch?researchConfigOverride:undefined")){
  fail('API-model Deep Research is not routed through the owned research configuration.');
}
if(!source.includes("onPromptActivity")){
  fail('Deep Research activity is not wired into the renderer.');
}
if(!source.includes("m.deepResearch&&")){
  fail('Deep Research responses are missing research-status rendering.');
}
if(!source.includes('<MessageSources sources={m.sources}')){
  fail('Search responses are missing the Sources renderer.');
}
for(const marker of ['ResearchSetupDialog','DEFAULT_RESEARCH_PLAN','Only these sites','Prioritize sites','SearXNG Search API','researchExportReport']){
  if(!source.includes(marker))fail('Windows 6.8 research UI is missing "'+marker+'".');
}
const researchRuntime=fs.readFileSync('electron/research.cjs','utf8');
for(const marker of ['runOwnedResearch',"searchParams.set('format','json')",'allowedByScope','retrievedAt','printToPDF','reportDocx']){
  if(!researchRuntime.includes(marker))fail('Windows 6.8 research runtime is missing "'+marker+'".');
}
if(researchRuntime.includes('api.duckduckgo.com')){
  fail('Do not label DuckDuckGo Instant Answers as a full independent web-search backend.');
}

if(/const\s+BRAND_LOGO_SRC\s*=\s*['"]\//.test(source)){
  fail('Packaged Electron assets must not use an absolute /free-ai-logo.svg path.');
}

for(const marker of ['className="messageBody" dir="auto"','ref={textareaRef}\n      dir="auto"','input autoFocus dir="auto" value={draft.name}','textarea dir="auto" value={prefs.customInstructions']){
  if(!source.includes(marker))fail('Windows 7 RTL/LTR protection is missing "'+marker+'".');
}

const desktopMain=fs.readFileSync('electron/main.cjs','utf8').replace(/\r\n/g,'\n');
const styles=fs.readFileSync('src/styles.css','utf8').replace(/\r\n/g,'\n');
if(!desktopMain.includes("minWidth:process.platform==='win32'?500:980")){
  fail('Windows 7 Snap/responsive minimum width regressed above 500 epx.');
}
if(!desktopMain.includes("minHeight:process.platform==='win32'?420:650")){
  fail('Windows 7 compact-window minimum height regression detected.');
}
if(!styles.includes('@media(max-width:760px)')){
  fail('The compact responsive layout required by the Windows 7 window minimum is missing.');
}

const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
for(const platform of ['win','mac','linux']){
  const icon=packageJson?.build?.[platform]?.icon;
  if(icon!=='build/free-ai-symbol.svg'){
    fail(platform+' icon must use the canonical build/free-ai-symbol.svg asset.');
  }
}

console.log('Renderer regression checks passed.');
