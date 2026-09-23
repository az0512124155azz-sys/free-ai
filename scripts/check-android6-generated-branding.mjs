import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const res=path.resolve('android/app/src/main/res');
const manifestPath=path.resolve('android/app/src/main/AndroidManifest.xml');

function fail(message){
  console.error('Android 6A1 generated branding verification failed: '+message);
  process.exit(1);
}
function read(rel){
  const target=path.join(res,rel);
  if(!fs.existsSync(target))fail('Missing generated resource: '+rel);
  return fs.readFileSync(target,'utf8').replace(/\r\n?/g,'\n');
}
function has(text,marker,message){
  if(!text.includes(marker))fail(message||('Missing marker: '+marker));
}

const adaptive=read('mipmap-anydpi-v26/ic_launcher.xml');
const adaptiveRound=read('mipmap-anydpi-v26/ic_launcher_round.xml');
for(const xml of [adaptive,adaptiveRound]){
  has(xml,'<background android:drawable="@color/free_ai_icon_background" />','Adaptive icon background is not branded.');
  has(xml,'<foreground android:drawable="@mipmap/ic_launcher_foreground" />','Adaptive icon foreground is missing.');
  has(xml,'<monochrome android:drawable="@mipmap/ic_launcher_monochrome" />','Themed monochrome icon is missing.');
}

const notification=read('drawable/ic_stat_free_ai.xml');
has(notification,'android:width="24dp"','Notification icon must use a 24dp small-icon canvas.');
has(notification,'android:height="24dp"','Notification icon must use a 24dp small-icon canvas.');
has(notification,'android:strokeColor="#FFFFFFFF"','Notification icon must be monochrome for status-bar tinting.');

const colors=read('values/free_ai_colors.xml');
has(colors,'free_ai_icon_background','Launcher icon background color is missing.');
has(colors,'free_ai_splash_background','Splash background color is missing.');
has(colors,'free_ai_notification_color','Notification accent color is missing.');

const splash=read('drawable/splash.xml');
has(splash,'@color/free_ai_splash_background','Legacy splash must use the Free AI splash background.');
has(splash,'@drawable/free_ai_splash_logo','Legacy splash must use the Free AI splash logo.');

const styles=read('values/styles.xml');
has(styles,'name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"','Launch theme must use Theme.SplashScreen.');
has(styles,'name="windowSplashScreenBackground">@color/free_ai_splash_background</item>','Modern splash background is missing.');
has(styles,'name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>','Modern splash icon is missing.');
has(styles,'name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>','Post-splash theme is missing.');

if(!fs.existsSync(manifestPath))fail('AndroidManifest.xml is missing after Capacitor project generation.');
const manifest=fs.readFileSync(manifestPath,'utf8');
has(manifest,'android:icon="@mipmap/ic_launcher"','Manifest launcher icon is not Free AI.');
has(manifest,'android:roundIcon="@mipmap/ic_launcher_round"','Manifest round icon is not Free AI.');
has(manifest,'android:supportsRtl="true"','Manifest must keep native RTL support.');
has(manifest,'android:windowSoftInputMode="adjustResize"','MainActivity must keep keyboard resize behavior.');

const scales={mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4};
for(const [density,scale] of Object.entries(scales)){
  const checks=[
    ['mipmap-'+density+'/ic_launcher.png',Math.round(48*scale),Math.round(48*scale)],
    ['mipmap-'+density+'/ic_launcher_round.png',Math.round(48*scale),Math.round(48*scale)],
    ['mipmap-'+density+'/ic_launcher_foreground.png',Math.round(108*scale),Math.round(108*scale)],
    ['mipmap-'+density+'/ic_launcher_monochrome.png',Math.round(108*scale),Math.round(108*scale)],
    ['drawable-'+density+'/free_ai_splash_logo.png',Math.round(144*scale),Math.round(144*scale)]
  ];
  for(const [rel,width,height] of checks){
    const target=path.join(res,rel);
    if(!fs.existsSync(target))fail('Missing density asset: '+rel);
    const meta=await sharp(target).metadata();
    if(meta.width!==width||meta.height!==height){
      fail(rel+' has '+meta.width+'x'+meta.height+' but expected '+width+'x'+height);
    }
  }
}

console.log('Android 6A1 generated native branding verification passed.');
