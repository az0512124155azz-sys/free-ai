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
  'Debug signing SHA-1: 74:E6:72:2F:31:E0:7D:D4:F5:0C:A6:51:96:DC:54:78:B7:D0:A1:61',
  'Web client ID audience: 991329297292-fp0ciud251vjasflsjq4r7k2vgo4sij7.apps.googleusercontent.com',
  '',
  'Create an Android OAuth client in the same Google Cloud project using the package and SHA-1 above.'
].join('\n')+'\n';
fs.writeFileSync(path.resolve('android-oauth-info.txt'),info,'utf8');

console.log('Applied stable Free AI debug signing for Android OAuth.');
console.log(info);
