import fs from 'node:fs';

function fail(message){
  console.error('Release readiness regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

const pkgText=fs.readFileSync('package.json','utf8');
const pkg=JSON.parse(pkgText);
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const readme=fs.readFileSync('README.md','utf8');
const releaseSigning=fs.readFileSync('scripts/configure-android-release-signing.mjs','utf8');
const credentialHelper=fs.readFileSync('scripts/setup-release-credentials.ps1','utf8');
const releaseDocs=fs.readFileSync('docs/release.md','utf8');
const credentialDocs=fs.readFileSync('docs/release-credentials.md','utf8');
const extensionManifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));

if(!/^\d+\.\d+\.\d+$/.test(String(pkg.version||'')))fail('package version must be stable x.y.z');
if(pkg.version==='0.6.0')fail('package version still reuses the already-published v0.6.0 tag');
if(String(extensionManifest.version||'')!==String(pkg.version||'')){
  fail('Chrome extension manifest version must match package.json version');
}

for(const [text,label] of [
  ['"android:configure-release-signing": "node scripts/configure-android-release-signing.mjs"','Android production signing npm command'],
  ['node --check scripts/configure-android-release-signing.mjs','release-signing syntax validation'],
  ['node scripts/check-release-readiness.mjs','release readiness guard in npm validate']
]) requireText(pkgText,text,label);

for(const [text,label] of [
  ['ANDROID_RELEASE_KEYSTORE_BASE64','Android release keystore secret gate'],
  ['ANDROID_RELEASE_STORE_PASSWORD','Android release store-password gate'],
  ['ANDROID_RELEASE_KEY_ALIAS','Android release key-alias gate'],
  ['ANDROID_RELEASE_KEY_PASSWORD','Android release key-password gate'],
  ['ANDROID_RELEASE_EXPECTED_SHA1','Android release certificate fingerprint gate'],
  ['name: Validate Android release-signing pipeline','CI exercise of Android production-signing path'],
  ['name: Build signed Android release APK','signed Android release build'],
  ['name: free-ai-android-release','signed Android release artifact'],
  ['validate_release:','manual non-publishing release-validation input'],
  ['allow_unsigned_macos:','explicit unsigned macOS release input'],
  ["inputs.validate_release == true || inputs.publish_release == true",'shared production-signing gate for validation and publishing'],
  ['allow_unsigned_macos is only valid with validate_release or publish_release.','unsigned macOS mode cannot run outside release validation/publication'],
  ['Explicit unsigned macOS exception enabled.','unsigned macOS distribution warning'],
  ["--notes \"$EXTRA_NOTES\"",'release notes include explicit signing notice'],
  ['release_mode_guard:','manual release-mode conflict guard'],
  ['name: Reject conflicting release modes','explicit release-mode conflict rejection'],
  ['Choose either validate_release or publish_release, not both.','conflicting release-mode failure'],
  ['release_validation:','non-publishing release-validation job'],
  ["inputs.validate_release == true && inputs.publish_release != true",'dry-run cannot publish when publish_release is selected'],
  ['name: Validate release candidate without publishing','release candidate validation step'],
  ['name: Upload validated release candidate','release candidate artifact upload'],
  ['name: free-ai-release-candidate','validated release candidate artifact'],
  ['release_credentials_status:','non-blocking production credential readiness job'],
  ['name: Production credential readiness','credential readiness job name'],
  ['name: Report production credential presence','credential presence reporting step'],
  ['release_credentials_status windows=$windows_status macos=$mac_status android=$android_status auth=$auth_status','presence-only credential status log'],
  ['No secret values are printed by this job.','credential status does not print secret values'],
  ['needs: [release_mode_guard, desktop, windows_visual, android, android_runtime, android_auth_runtime, android_google_runtime, extension]','release modes wait for the conflict guard plus all Android runtime/auth gates'],
  ['name: Verify release assets and tag availability','release asset/tag preflight'],
  ['Free-AI-Android-$VERSION.apk','versioned Android production asset'],
  ['SHA256SUMS.txt','release checksums'],
  ['--generate-notes','generated release notes']
]) requireText(workflow,text,label);

if(workflow.includes('gh release upload "$TAG"')||workflow.includes('--clobber')){
  fail('release workflow can overwrite assets on an existing tag');
}

const validationStart=workflow.indexOf('  release_validation:');
const releaseStart=workflow.indexOf('  release:',validationStart+1);
if(validationStart<0||releaseStart<0||releaseStart<=validationStart){
  fail('release-validation job boundaries are missing');
}
const validationJob=workflow.slice(validationStart,releaseStart);
if(validationJob.includes('gh release create')||validationJob.includes('gh release upload')||validationJob.includes('git tag')){
  fail('release validation must never create or mutate a GitHub release/tag');
}
if(!validationJob.includes('SHA256SUMS.txt')){
  fail('release validation does not generate checksums');
}
if(workflow.includes('name: free-ai-android\n          path: release-assets')){
  fail('release job still downloads the debug Android artifact');
}

for(const [text,label] of [
  ["ValidateSet('Windows', 'MacOS', 'Android')",'credential helper platform allow-list'],
  ["Read-Host -Prompt $Prompt -AsSecureString",'secure local password prompts'],
  ['RedirectStandardInput = $true','GitHub CLI secret stdin transport'],
  ['StandardInput.Write($Value)','exact secret stdin write'],
  ["-storepass:env', 'FREEAI_ANDROID_STOREPASS'",'Android store password avoids process arguments'],
  ["-keypass:env', 'FREEAI_ANDROID_KEYPASS'",'Android key password avoids process arguments'],
  ["ANDROID_RELEASE_EXPECTED_SHA1",'Android fingerprint secret setup'],
  ["GenerateAndroidKeystore",'Android one-command keystore generation switch'],
  ["'-genkeypair'",'Android keytool generation command'],
  ["'-keysize', '4096'",'Android RSA-4096 generation'],
  ["'-validity', '10000'",'Android long-lived release certificate'],
  ["2033-10-22T00:00:00",'Android minimum signing-certificate validity guard'],
  ["Refusing to generate a production signing key inside the Git repository.",'Android private-key repository guard'],
  ["generatedKeystoreValidated",'validated generated-key preservation guard'],
  ["WIN_CSC_LINK",'Windows certificate secret setup'],
  ["MAC_CSC_LINK",'macOS certificate secret setup']
]) requireText(credentialHelper,text,label);

const helperParamBlock=credentialHelper.slice(0,credentialHelper.indexOf('Set-StrictMode'));
for(const unsafeParam of ['$Password', '$StorePassword', '$KeyPassword', '$AppPassword']){
  if(helperParamBlock.includes(unsafeParam)){
    fail('credential helper accepts a secret password as a command-line parameter: '+unsafeParam);
  }
}
if(credentialHelper.includes('gh secret set')&&credentialHelper.includes('--body')){
  fail('credential helper passes secret values through GitHub CLI command-line arguments');
}
for(const unsafeLog of ['Write-Host $password','Write-Host $storePassword','Write-Host $keyPassword','Write-Host $appPassword','Write-Host $base64']){
  if(credentialHelper.includes(unsafeLog)){
    fail('credential helper can print a secret value: '+unsafeLog);
  }
}

requireText(releaseDocs,'release-credentials.md','release process link to credential onboarding guide');
for(const [text,label] of [
  ['-Target Windows','Windows credential helper example'],
  ['-Target MacOS','macOS credential helper example'],
  ['-Target Android','Android credential helper example'],
  ['-GenerateAndroidKeystore','Android one-command production key generation example'],
  ['validate_release=true','production dry-run instruction'],
  ['publish_release=false','non-publishing dry-run instruction'],
  ['allow_unsigned_macos','explicit unsigned macOS release documentation'],
  ['com.freeai.mobile','Android OAuth package instruction']
]) requireText(credentialDocs,text,label);

for(const [text,label] of [
  ['System.getenv("ANDROID_RELEASE_STORE_PASSWORD")','Gradle store password from environment'],
  ['System.getenv("ANDROID_RELEASE_KEY_ALIAS")','Gradle key alias from environment'],
  ['System.getenv("ANDROID_RELEASE_KEY_PASSWORD")','Gradle key password from environment'],
  ['versionCode','Android production versionCode'],
  ['versionName','Android production versionName']
]) requireText(releaseSigning,text,label);

requireText(readme,'docs/release.md','release documentation link');
console.log('Release readiness regression checks passed.');
