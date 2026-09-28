import fs from 'node:fs';

function fail(message){
  console.error('Release readiness regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const readme=fs.readFileSync('README.md','utf8');
const releaseSigning=fs.readFileSync('scripts/configure-android-release-signing.mjs','utf8');

if(!/^\d+\.\d+\.\d+$/.test(String(pkg.version||'')))fail('package version must be stable x.y.z');
if(pkg.version==='0.6.0')fail('package version still reuses the already-published v0.6.0 tag');

for(const [text,label] of [
  ['"android:configure-release-signing": "node scripts/configure-android-release-signing.mjs"','Android production signing npm command'],
  ['node --check scripts/configure-android-release-signing.mjs','release-signing syntax validation'],
  ['node scripts/check-release-readiness.mjs','release readiness guard in npm validate']
]) requireText(JSON.stringify(pkg),text,label);

for(const [text,label] of [
  ['ANDROID_RELEASE_KEYSTORE_BASE64','Android release keystore secret gate'],
  ['ANDROID_RELEASE_STORE_PASSWORD','Android release store-password gate'],
  ['ANDROID_RELEASE_KEY_ALIAS','Android release key-alias gate'],
  ['ANDROID_RELEASE_KEY_PASSWORD','Android release key-password gate'],
  ['ANDROID_RELEASE_EXPECTED_SHA1','Android release certificate fingerprint gate'],
  ['name: Build signed Android release APK','signed Android release build'],
  ['name: free-ai-android-release','signed Android release artifact'],
  ['needs: [desktop, windows_visual, android, android_runtime, android_auth_runtime, android_google_runtime, extension]','release waits for all Android runtime/auth gates'],
  ['name: Verify release assets and tag availability','release asset/tag preflight'],
  ['Free-AI-Android-$VERSION.apk','versioned Android production asset'],
  ['SHA256SUMS.txt','release checksums'],
  ['--generate-notes','generated release notes']
]) requireText(workflow,text,label);

if(workflow.includes('gh release upload "$TAG"')||workflow.includes('--clobber')){
  fail('release workflow can overwrite assets on an existing tag');
}
if(workflow.includes('name: free-ai-android\n          path: release-assets')){
  fail('release job still downloads the debug Android artifact');
}

for(const [text,label] of [
  ['System.getenv("ANDROID_RELEASE_STORE_PASSWORD")','Gradle store password from environment'],
  ['System.getenv("ANDROID_RELEASE_KEY_ALIAS")','Gradle key alias from environment'],
  ['System.getenv("ANDROID_RELEASE_KEY_PASSWORD")','Gradle key password from environment'],
  ['versionCode','Android production versionCode'],
  ['versionName','Android production versionName']
]) requireText(releaseSigning,text,label);

requireText(readme,'docs/release.md','release documentation link');
console.log('Release readiness regression checks passed.');
