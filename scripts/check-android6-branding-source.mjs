import fs from 'node:fs';

const source=fs.readFileSync('scripts/configure-android-branding.mjs','utf8').replace(/\r\n?/g,'\n');

function fail(message){
  console.error('Android 6A1 branding source regression failed: '+message);
  process.exit(1);
}
function has(marker,message){
  if(!source.includes(marker))fail(message||('Missing marker: '+marker));
}

has('<monochrome android:drawable="@mipmap/ic_launcher_monochrome" />','Adaptive icon generator must define an explicit monochrome themed-icon layer.');
has("write('drawable/ic_stat_free_ai.xml',notificationVector)",'Branding generator must create a dedicated notification small icon.');
has("write('mipmap-anydpi-v26/ic_launcher.xml',adaptive)",'Branding generator must create the adaptive launcher icon.');
has("write('mipmap-anydpi-v26/ic_launcher_round.xml',adaptive)",'Branding generator must create the round adaptive launcher icon.');
has("windowSplashScreenBackground",'Branding generator must configure the Android SplashScreen background.');
has("windowSplashScreenAnimatedIcon",'Branding generator must configure the Android SplashScreen icon.');
has("postSplashScreenTheme",'Branding generator must restore the app theme after splash.');
has("parent=\"Theme.SplashScreen\"",'Launch theme must use AndroidX Theme.SplashScreen.');
has("ensureApplicationAttr('supportsRtl','true')",'Generated Android manifest must retain native RTL support.');
has("ensureApplicationAttr('icon','@mipmap/ic_launcher')",'Generated Android manifest must use the Free AI launcher icon.');
has("ensureApplicationAttr('roundIcon','@mipmap/ic_launcher_round')",'Generated Android manifest must use the Free AI round icon.');
has("const adaptiveSize=Math.round(108*scale)",'Adaptive icon layers must use the Android 108dp canvas.');
has("const adaptiveMarkSize=Math.round(66*scale)",'Adaptive icon mark must remain inside the Android 66dp safe zone.');
has("const splashSize=Math.round(144*scale)",'Legacy splash logo must be generated per density.');
has("const legacySize=Math.round(48*scale)",'Legacy launcher fallback must be generated per density.');

console.log('Android 6A1 branding source regression checks passed.');
