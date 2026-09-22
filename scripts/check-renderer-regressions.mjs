import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');

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

if(/const\s+BRAND_LOGO_SRC\s*=\s*['"]\//.test(source)){
  fail('Packaged Electron assets must not use an absolute /free-ai-logo.svg path.');
}

const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
for(const platform of ['win','mac','linux']){
  const icon=packageJson?.build?.[platform]?.icon;
  if(icon!=='build/free-ai-symbol.svg'){
    fail(platform+' icon must use the canonical build/free-ai-symbol.svg asset.');
  }
}

console.log('Renderer regression checks passed.');
