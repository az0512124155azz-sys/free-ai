import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');
const bridge=fs.readFileSync('scripts/configure-android-runtime-qa.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const liveAuth=fs.readFileSync('scripts/android-auth-runtime-qa.sh','utf8');
const googleRuntime=fs.readFileSync('scripts/android-google-runtime-qa.sh','utf8');
const googleRealAccount=fs.readFileSync('scripts/android-google-real-account-qa.ps1','utf8');
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
has(source,"command==='authCaptureAccessToken'",'Revoked-session QA must capture the current access token only inside the dedicated QA build.');
has(source,"command==='authReadAccessToken'",'Revoked-session QA must provide one-time access-token retrieval to the native QA bridge.');
has(source,"qa.accessToken='';",'QA access-token material must be cleared after use.');
has(source,"command==='authRefreshSession'",'Runtime auth QA must support explicit session refresh.');
has(source,'supabase.auth.refreshSession()','Runtime auth QA must exercise Supabase refreshSession.');
has(source,"code==='refresh_token_not_found'",'Runtime auth recovery must recognize a missing revoked refresh token.');
has(source,"code==='refresh_token_already_used'",'Runtime auth recovery must recognize a revoked refresh token outside the reuse interval.');
has(source,"supabase.auth.signOut({scope:'local'})",'Terminal refresh failures must clear the local Supabase session without globally signing out unrelated devices.');
has(source,'setSession(null);','Terminal refresh failures must immediately clear stale signed-in UI state.');
has(source,"command==='authSignOut'",'Runtime auth QA must support logout.');
has(source,'run(\'signOut\',()=>signOutAccount())','Runtime logout QA must use the same product logout path.');
has(source,"command==='authStartGoogle'",'Runtime auth QA must be able to start the real native Google flow.');
has(source,"setAndroidGoogleQaState('credential_manager_requested','',true)",'Google runtime QA must record that the native Credential Manager request was issued.');
has(source,'async function googleQaIdentityFingerprint(user)','Real-account Google QA must derive a non-PII account fingerprint.');
has(source,"new TextEncoder().encode('free-ai-google-qa:'+String(user.id))",'Real-account fingerprint must derive from the Supabase user UUID, not email/profile PII.');
has(source,"crypto.subtle.digest('SHA-256',encoded)",'Real-account fingerprint must use SHA-256.');
has(source,"'googleIdentity='+(window.__FREEAI_ANDROID_GOOGLE_QA_STATE__?.identity||'')",'Runtime auth audit must expose only the sanitized Google identity fingerprint.');
has(source,"'authProvider='+String(session?.user?.app_metadata?.provider||'')",'Runtime auth audit must expose the session provider without exposing profile PII.');
has(source,"command==='authResetGoogleQa'",'Real-account QA must be able to reset Google QA state between account selections.');
has(source,"'googleStatus='+(window.__FREEAI_ANDROID_GOOGLE_QA_STATE__?.status||'idle')",'Runtime auth audit must expose sanitized Google flow state.');
has(source,"'googleRequested='+!!window.__FREEAI_ANDROID_GOOGLE_QA_STATE__?.requested",'Runtime auth audit must retain proof that the native Google request was reached.');
has(source,"nativeError.kind==='cancelled'",'Native Google cancellation must be handled as a non-fatal outcome.');
has(source,"setMessage('');",'Native Google cancellation must not surface an unknown fatal error to the user.');
has(source,"kind:'no_credential',code:'no_credential'",'Native Google no-account behavior must be classified separately from configuration errors.');
has(source,"kind:'config',code:'google_config'",'Native Google configuration errors must remain distinguishable from user cancellation.');
has(source,"style:'standard'",'Google runtime must use the explicit-button GetSignInWithGoogleOption path.');
has(source,'filterByAuthorizedAccounts:false','Google runtime must allow account selection beyond previously authorized accounts.');
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
has(workflow,'android_auth_runtime:','CI must define a live Android email/session auth runtime job.');
has(workflow,'id-token: write','Android auth runtime job must request GitHub OIDC permission.');
has(workflow,'Verify GitHub OIDC trust with Supabase','CI must verify GitHub workflow identity with the Supabase OIDC verifier.');
has(workflow,'audience=free-ai-android-auth-qa','GitHub OIDC token must use the dedicated Android auth QA audience.');
has(workflow,'free-ai-ci-oidc-check','CI must call the dedicated Supabase GitHub OIDC verifier.');

has(workflow,'Inspect public Supabase auth configuration','Live auth CI must inspect Supabase public auth settings before credential-gated runtime testing.');
has(workflow,"fs.readFileSync('src/main.jsx', 'utf8')",'Live auth CI must derive fallback Supabase public config from the same app source.');
has(workflow,"key.startsWith('sb_publishable_')",'Live auth CI fallback must be a publishable key, never a secret key.');
has(workflow,'SUPABASE_URL_FOR_QA/auth/v1/settings','Live auth CI must use the public Supabase auth settings endpoint.');
has(workflow,'same public Supabase fallback configuration bundled by the app','Live auth CI must explicitly report when it uses the app public fallback config.');
has(workflow,'mailer_autoconfirm=','Live auth CI must capture whether email signup auto-confirm is enabled.');
has(workflow,'google_enabled=','Live auth CI must capture whether Google auth is enabled.');

ok(!workflow.includes('ANDROID_AUTH_TEST_EMAIL: ${{ secrets.ANDROID_AUTH_TEST_EMAIL }}'),'Live auth QA must not depend on a long-lived GitHub email secret.');
ok(!workflow.includes('ANDROID_AUTH_TEST_PASSWORD: ${{ secrets.ANDROID_AUTH_TEST_PASSWORD }}'),'Live auth QA must not depend on a long-lived GitHub password secret.');
has(workflow,'Provision ephemeral Android auth QA account','CI must provision a short-lived QA credential after OIDC trust verification.');
has(workflow,'free-ai-ci-auth-provision','CI must use the Supabase OIDC-gated QA account provisioner.');
has(workflow,'openssl rand -hex 32','CI must generate a fresh QA password for each workflow run.');
has(workflow,'>> "$GITHUB_ENV"','Ephemeral QA credentials must be passed only to subsequent steps in the same job.');
has(workflow,"if: steps.provision_qa_account.outputs.configured == 'true'",'Live auth emulator steps must be gated on successful ephemeral account provisioning.');

has(workflow,'bash scripts/android-auth-runtime-qa.sh','CI must execute the live Android auth runtime driver.');
has(workflow,'free-ai-android-auth-runtime-email-session','CI must upload live auth runtime evidence separately.');
has(workflow,'android_google_runtime:','CI must define a separate Android Google Credential Manager runtime job.');
has(workflow,'Run Android 16 Google Credential Manager QA','CI must execute native Google runtime QA on Android 16.');
has(workflow,'bash scripts/android-google-runtime-qa.sh','CI must execute the Google Credential Manager runtime driver.');
has(workflow,'free-ai-android-google-runtime','CI must upload Google Credential Manager runtime evidence separately.');
has(workflow,'Validate real-account Google QA PowerShell','Windows CI must parse the manual real-account QA harness before merge.');
has(workflow,'[System.Management.Automation.Language.Parser]::ParseFile','Windows CI must use the real PowerShell parser for the manual QA harness.');
has(workflow,"@('Apk', 'Serial', 'OutputDir')",'Windows CI must verify the documented real-account harness parameters.');

has(workflow,'VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}','Auth QA build must use configured Supabase project settings.');
has(workflow,'VITE_GOOGLE_WEB_CLIENT_ID: ${{ secrets.VITE_GOOGLE_WEB_CLIENT_ID }}','Auth QA build must use the configured Google web client ID.');
const releaseAndroidArtifact=workflow.match(/name: free-ai-android\\n\\s+path: \\|\\n([\\s\\S]*?)\\n\\s+if-no-files-found:/)?.[1]||'';
ok(!releaseAndroidArtifact.includes('free-ai-auth-runtime-qa.apk'),'Auth QA APK must never be bundled into the release Android artifact.');

has(liveAuth,'ANDROID_AUTH_TEST_EMAIL','Live auth QA must read the test email only from the runtime environment.');
has(liveAuth,'ANDROID_AUTH_TEST_PASSWORD','Live auth QA must read the test password only from the runtime environment.');
has(liveAuth,'qa_login_line "$PASSWORD"','Live auth QA must exercise a real existing-account password login.');
has(liveAuth,'authRefreshSession','Live auth QA must exercise explicit session refresh.');
has(liveAuth,'adb shell am force-stop "$PACKAGE"','Live auth QA must exercise cold-start session restoration.');
has(liveAuth,'adb shell input keyevent 3','Live auth QA must exercise Android background/foreground resume.');
has(liveAuth,'status=signOut:success','Live auth QA must verify logout.');
has(liveAuth,'status=signInPassword:error','Live auth QA must verify invalid-password behavior.');
has(liveAuth,'relogin=','Live auth QA must verify relogin.');
has(liveAuth,'capture_access_token','Revoked-session QA must capture the access token without writing it to evidence.');
has(liveAuth,'::add-mask::$QA_ACCESS_TOKEN','Revoked-session QA must mask the captured access token immediately.');
has(liveAuth,'free-ai-ci-auth-revoke','Revoked-session QA must use the OIDC-gated Supabase revoke endpoint.');
has(liveAuth,'status=refreshSession:error','Revoked-session QA must force refresh after server-side revocation.');
has(liveAuth,'code=refresh_token_not_found','Revoked-session QA must accept the documented missing-refresh-token terminal error.');
has(liveAuth,'05-revoked-session-recovered','Revoked-session QA must capture signed-out recovery evidence.');
has(liveAuth,'post_revoke_relogin=','Revoked-session QA must verify the user can sign in again after recovery.');
ok(!liveAuth.includes('echo "$QA_ACCESS_TOKEN"'),'Live auth QA must never print the captured access token.');
ok(!liveAuth.includes('echo "access_token='),'Live auth QA must never write access tokens to reports.');
ok(!liveAuth.includes('refresh_token='),'Live auth QA must never write refresh tokens to reports.');
ok(!source.includes('sb_secret_'),'Renderer source must never contain Supabase secret keys.');
ok(!liveAuth.includes('SUPABASE_SERVICE_ROLE_KEY'),'Android runtime QA must never receive the Supabase service-role key.');

has(googleRuntime,'authStartGoogle','Google runtime QA must launch the real product Google button flow.');
has(googleRuntime,'googleRequested=true','Google runtime QA must prove the native Google request path was reached.');
has(googleRuntime,'system_ui_seen=1','Google runtime QA must wait for Google/system account UI before attempting cancellation.');
has(googleRuntime,'dismiss_google_system_ui','Google runtime QA must unwind nested Google system UI before judging cancellation.');
has(googleRuntime,'for _ in $(seq 1 6)','Google runtime QA must tolerate multiple nested Credential Manager / Google activities.');
has(googleRuntime,'$PACKAGE/.MainActivity','Google runtime QA must confirm Free AI returns to the foreground after cancellation.');
has(googleRuntime,'post-cancel-activities.txt','Google runtime QA must preserve post-cancel activity evidence.');
has(googleRuntime,'adb shell input keyevent 4','Google runtime QA must exercise native Back/cancel behavior after system UI is observed.');
has(googleRuntime,'googleCode=user_cancelled','Google runtime QA must recognize benign user cancellation.');
has(googleRuntime,'googleCode=no_credential','Accountless CI must recognize the documented no-credential outcome.');
has(googleRuntime,'googleCode=google_config','Google runtime QA must fail on OAuth package/SHA/client-ID configuration errors.');
has(googleRuntime,'browserFallback=false','Google runtime evidence must explicitly record that no browser fallback occurred.');
has(googleRuntime,'com\\.android\\.chrome','Google runtime QA must detect unexpected Chrome/browser fallback.');
ok(!googleRuntime.includes('GOOGLE_PASSWORD'),'Google runtime QA must not embed Google account credentials.');
ok(!googleRuntime.includes('GOOGLE_TEST_PASSWORD'),'Google runtime QA must not embed Google account credentials.');

has(googleRealAccount,'AT LEAST TWO real Google accounts','Real-account QA must require two pre-provisioned Google accounts on the device.');
has(googleRealAccount,'googleStatus=signed_in','Real-account QA must require a successful native Google sign-in.');
has(googleRealAccount,'authProvider=google','Real-account QA must verify Supabase session provider is Google.');
has(googleRealAccount,'googleIdentity=([a-f0-9]{16,24})','Real-account QA must read only the anonymous identity fingerprint.');
has(googleRealAccount,'if ($accountA -eq $accountB)','Real-account QA must prove Account B differs from Account A.');
has(googleRealAccount,'authSignOut','Real-account QA must use the product logout path between Google accounts.');
has(googleRealAccount,'googleCode=user_cancelled','Real-account QA must verify user cancellation after the account-switch scenarios.');
has(googleRealAccount,'browserFallback=false','Real-account QA evidence must explicitly record no browser fallback.');
has(googleRealAccount,'com\\.android\\.chrome','Real-account QA must reject unexpected Chrome/browser fallback.');
ok(!googleRealAccount.includes('GOOGLE_PASSWORD'),'Real-account QA must never request or embed a Google password secret.');
ok(!googleRealAccount.includes('GOOGLE_TEST_PASSWORD'),'Real-account QA must never request or embed a Google password secret.');
ok(!googleRealAccount.includes('GOOGLE_EMAIL'),'Real-account QA must not store Google account email addresses.');

ok(String(pkg?.scripts?.validate||'').includes('check-android2-runtime-auth.mjs'),'Android 2A2 runtime auth regression guard is not part of validation.');

console.log('Android 2A2 runtime auth infrastructure checks passed.');
