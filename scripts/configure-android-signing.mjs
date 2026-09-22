import fs from 'node:fs';
import path from 'node:path';

const appDir=path.resolve('android/app');
const gradlePath=path.join(appDir,'build.gradle');
const keyB64Path=path.resolve('build/free-ai-debug.keystore.b64');
const keyPath=path.join(appDir,'free-ai-debug.keystore');

if(!fs.existsSync(gradlePath)){
  console.error('Android app/build.gradle not found. Run "npx cap add android" first.');
  process.exit(1);
}
if(!fs.existsSync(keyB64Path)){
  console.error('Missing build/free-ai-debug.keystore.b64');
  process.exit(1);
}

fs.writeFileSync(keyPath,Buffer.from(fs.readFileSync(keyB64Path,'utf8').trim(),'base64'));

let gradle=fs.readFileSync(gradlePath,'utf8');
const marker='// FREE_AI_STABLE_DEBUG_SIGNING';
if(!gradle.includes(marker)){
  const androidOpen=/android\s*\{/;
  if(!androidOpen.test(gradle)){
    console.error('Could not locate android { block in app/build.gradle');
    process.exit(1);
  }
  gradle=gradle.replace(androidOpen,match=>match+`
    ${marker}
    signingConfigs {
        debug {
            storeFile file("free-ai-debug.keystore")
            storePassword "android"
            keyAlias "freeai-debug"
            keyPassword "android"
        }
    }
`);
  fs.writeFileSync(gradlePath,gradle,'utf8');
}

const info=[
  'Free AI Android OAuth registration',
  'Package name: com.freeai.mobile',
  'Debug signing SHA-1: 1F:F0:59:1B:C8:69:C4:89:01:01:2F:79:E1:2D:0B:2E:7D:FC:C9:4B',
  'Web client ID audience: 991329297292-fp0ciud251vjasflsjq4r7k2vgo4sij7.apps.googleusercontent.com',
  '',
  'Create an Android OAuth client in the same Google Cloud project using the package and SHA-1 above.'
].join('\n')+'\n';
fs.writeFileSync(path.resolve('android-oauth-info.txt'),info,'utf8');

console.log('Applied stable Free AI debug signing for Android OAuth.');
console.log(info);
