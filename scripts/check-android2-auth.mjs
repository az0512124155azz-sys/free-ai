import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const capacitor=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));
const social=fs.readFileSync('scripts/configure-android-social-login.mjs','utf8');

function fail(message){
  console.error('Android 2 auth regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){if(!text.includes(marker))fail(message||('Missing marker: '+marker));}
function ok(value,message){if(!value)fail(message);}

has(source,"persistSession:true,autoRefreshToken:true,detectSessionInUrl:false",'Supabase mobile session persistence config is missing.');
has(source,"CapacitorApp.addListener('appStateChange'",'Android auth lifecycle must follow native foreground/background state.');
has(source,'supabase.auth.startAutoRefresh()','Android foreground auth refresh is missing.');
has(source,'supabase.auth.stopAutoRefresh()','Android background auth refresh stop is missing.');
has(source,'const {data,error}=await supabase.auth.getSession();','Cold/warm session restore must read the stored Supabase session.');
has(source,"SocialLogin.login({\n          provider:'google'","Native Google sign-in must use the maintained social-login plugin.");
has(source,"style:'bottom'",'Android Google sign-in must use Credential Manager bottom-sheet UX.');
has(source,'filterByAuthorizedAccounts:false','Google sign-in must allow account selection beyond previously authorized accounts.');
has(source,"scopes:['email','profile']",'Google sign-in must request only profile/email scopes.');
has(source,"supabase.auth.signInWithIdToken({provider:'google',token:idToken})",'Google ID token must be handed directly to Supabase Auth.');
has(source,"SocialLogin.logout({provider:'google'})",'Native logout must clear the Google provider session as well as Supabase.');
has(source,'function ProfileMenu({session,onSettings,onLogout})','Profile menu logout must route through the unified account logout path.');

ok(pkg?.devDependencies?.['@capgo/capacitor-social-login']==='^8.5.10','Android social login dependency must remain on the reviewed Capacitor 8 Credential Manager plugin.');
ok(capacitor?.plugins?.SocialLogin?.providers?.google===true,'Android build must bundle Google social login.');
ok(capacitor?.plugins?.SocialLogin?.providers?.facebook===false,'Android auth checkpoint must not add unused Facebook SDK/auth surface.');
has(social,'GoogleProvider','Generated MainActivity must remain integrated with the maintained Google provider.');
ok(!social.includes('GoogleSignInClient'),'Legacy GoogleSignInClient must not return.');

console.log('Android 2 auth lifecycle regression checks passed.');
