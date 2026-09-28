import fs from 'node:fs';
import path from 'node:path';

const required=[
  'ANDROID_RELEASE_KEYSTORE_BASE64',
  'ANDROID_RELEASE_STORE_PASSWORD',
  'ANDROID_RELEASE_KEY_ALIAS',
  'ANDROID_RELEASE_KEY_PASSWORD',
  'ANDROID_RELEASE_EXPECTED_SHA1'
];

const missing=required.filter(name=>!String(process.env[name]||'').trim());
if(missing.length){
  console.error('Missing Android release signing environment: '+missing.join(', '));
  process.exit(1);
}

const normalizedSha1=String(process.env.ANDROID_RELEASE_EXPECTED_SHA1||'')
  .replace(/[^0-9a-f]/gi,'')
  .toUpperCase();
if(!/^[0-9A-F]{40}$/.test(normalizedSha1)){
  console.error('ANDROID_RELEASE_EXPECTED_SHA1 must contain exactly 40 hexadecimal characters.');
  process.exit(1);
}

const pkg=JSON.parse(fs.readFileSync(path.resolve('package.json'),'utf8'));
const match=String(pkg.version||'').match(/^(\d+)\.(\d+)\.(\d+)$/);
if(!match){
  console.error('Android production releases require a stable x.y.z package version.');
  process.exit(1);
}
const [,majorText,minorText,patchText]=match;
const major=Number(majorText);
const minor=Number(minorText);
const patch=Number(patchText);
if(minor>999||patch>999){
  console.error('Android versionCode derivation supports minor/patch values from 0 to 999.');
  process.exit(1);
}
const versionCode=major*1000000+minor*1000+patch;
if(!Number.isSafeInteger(versionCode)||versionCode<1||versionCode>2100000000){
  console.error('Derived Android versionCode is outside the supported range: '+versionCode);
  process.exit(1);
}

const appDir=path.resolve('android/app');
const gradlePath=path.join(appDir,'build.gradle');
if(!fs.existsSync(gradlePath)){
  console.error('Android app/build.gradle not found. Run "npx cap add android" first.');
  process.exit(1);
}

const keyPath=path.join(appDir,'free-ai-release.keystore');
const encoded=String(process.env.ANDROID_RELEASE_KEYSTORE_BASE64||'').replace(/\s+/g,'');
let keystore;
try{
  keystore=Buffer.from(encoded,'base64');
}catch(error){
  console.error('ANDROID_RELEASE_KEYSTORE_BASE64 is not valid base64.');
  process.exit(1);
}
if(keystore.length<128){
  console.error('Decoded Android release keystore is unexpectedly small.');
  process.exit(1);
}
fs.writeFileSync(keyPath,keystore,{mode:0o600});

let gradle=fs.readFileSync(gradlePath,'utf8');
const marker='// FREE_AI_PRODUCTION_RELEASE_SIGNING';
if(!gradle.includes(marker)){
  const androidOpen=/android\s*\{/;
  if(!androidOpen.test(gradle)){
    console.error('Could not locate android { block in app/build.gradle.');
    process.exit(1);
  }

  gradle=gradle.replace(androidOpen,matchText=>matchText+`
    ${marker}
    signingConfigs {
        freeAiRelease {
            storeFile file("free-ai-release.keystore")
            storePassword System.getenv("ANDROID_RELEASE_STORE_PASSWORD")
            keyAlias System.getenv("ANDROID_RELEASE_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_RELEASE_KEY_PASSWORD")
        }
    }
`);

  const releaseOpen=/buildTypes\s*\{\s*release\s*\{/m;
  if(!releaseOpen.test(gradle)){
    console.error('Could not locate buildTypes { release { block in app/build.gradle.');
    process.exit(1);
  }
  gradle=gradle.replace(releaseOpen,matchText=>matchText+`
            signingConfig signingConfigs.freeAiRelease
`);
}

if(!/versionCode\s+\d+/.test(gradle)||!/versionName\s+["'][^"']+["']/.test(gradle)){
  console.error('Could not locate Android versionCode/versionName in app/build.gradle.');
  process.exit(1);
}
gradle=gradle.replace(/versionCode\s+\d+/,'versionCode '+versionCode);
gradle=gradle.replace(/versionName\s+["'][^"']+["']/,'versionName "'+pkg.version+'"');

fs.writeFileSync(gradlePath,gradle,'utf8');

console.log('Configured production Android release signing.');
console.log('Android package: com.freeai.mobile');
console.log('Android versionName: '+pkg.version);
console.log('Android versionCode: '+versionCode);
console.log('Expected release certificate SHA-1: '+normalizedSha1.match(/.{2}/g).join(':'));
