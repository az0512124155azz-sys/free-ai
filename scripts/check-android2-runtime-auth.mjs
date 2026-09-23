import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');
const bridge=fs.readFileSync('scripts/configure-android-runtime-qa.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

function fail(message){
  console.error('Android 2A2 runtime auth regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){if(!text.includes(marker))fail(message||('Missing marker: '+marker));}
function ok(value,message){if(!value)fail(message);}

has(source,"const isAndroidAuthQaBuild=import.meta.env.VITE_ANDROID_AUTH_QA==='1';",'Dedicated Android auth QA build flag is missing.');
has(source,'window.__FREEAI_ANDROID_AUTH_QA__=(payload={})=>','Android auth runtime QA hook is missing.');
has(source,"command==='authSignInPassword'",'Runtime auth QA must support password sign-in.');
has(source,'supabase.auth.signInWithPassword({email,password})','Password runtime QA must use the real Supabase client.');
has(source,"command==='authRefreshSession'",'Runtime auth QA must support explicit session refresh.');
has(source,'supabase.auth.refreshSession()','Runtime auth QA must exercise Supabase refreshSession.');
has(source,"command==='authSignOut'",'Runtime auth QA must support logout.');
has(source,'run(\'signOut\',()=>signOutAccount())','Runtime logout QA must use the same product logout path.');
has(source,"command==='authStartGoogle'",'Runtime auth QA must be able to start the real native Google flow.');
has(source,"'session='+!!session",'Runtime auth audit must expose session presence without exposing tokens.');
has(source,"'code='+(qa.code||'')",'Runtime auth audit must expose sanitized error codes.');
ok(!source.includes("password='+password"),'Runtime QA must never log password material.');

has(bridge,'window.__FREEAI_ANDROID_AUTH_QA__','Native QA bridge must route auth commands to the auth hook.');
has(bridge,'intent.getStringExtra("email")','Native QA bridge must accept runtime-only email input.');
has(bridge,'intent.getStringExtra("password")','Native QA bridge must accept runtime-only password input.');
has(bridge,'boolean authCommand = command.startsWith("auth")','Native QA bridge must isolate auth commands from shell QA commands.');
ok(!bridge.includes('Log.i(QA_TAG, command + ":password="'),'Native QA bridge must never log passwords.');

has(workflow,'VITE_ANDROID_AUTH_QA=1 npm run build:web','CI must build a dedicated real-auth QA renderer.');
has(workflow,'free-ai-auth-runtime-qa.apk','CI must produce a dedicated auth runtime QA APK.');
has(workflow,'name: free-ai-android-auth-runtime-qa','CI must upload the auth runtime APK separately.');
has(workflow,'name: free-ai-android-runtime-qa','Existing auth-independent shell runtime artifact must remain intact.');
has(workflow,'VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}','Auth QA build must use configured Supabase project settings.');
has(workflow,'VITE_GOOGLE_WEB_CLIENT_ID: ${{ secrets.VITE_GOOGLE_WEB_CLIENT_ID }}','Auth QA build must use the configured Google web client ID.');
ok(!/name: free-ai-android\n[\s\S]{0,450}free-ai-auth-runtime-qa\.apk/.test(workflow),'Auth QA APK must never be bundled into the release Android artifact.');

ok(String(pkg?.scripts?.validate||'').includes('check-android2-runtime-auth.mjs'),'Android 2A2 runtime auth regression guard is not part of validation.');

console.log('Android 2A2 runtime auth infrastructure checks passed.');
