import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const res=path.resolve('android/app/src/main/res');
const source=path.resolve('build/free-ai-symbol.svg');
if(!fs.existsSync(res)){
  console.error('Android resources not found. Run "npx cap add android" first.');
  process.exit(1);
}
if(!fs.existsSync(source)){
  console.error('Missing build/free-ai-symbol.svg');
  process.exit(1);
}

const write=(rel,value)=>{
  const target=path.join(res,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,value.trimStart(),'utf8');
};

const brandBlue='#1677FF';
const iconBackground='#050505';
const sourceSvg=fs.readFileSync(source,'utf8');
const whiteSvg=sourceSvg.replaceAll('#1677FF','#FFFFFF');

const colors=`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="free_ai_icon_background">${iconBackground}</color>
    <color name="free_ai_splash_background">${iconBackground}</color>
    <color name="free_ai_notification_color">${brandBlue}</color>
</resources>
`;

const adaptive=`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/free_ai_icon_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;

const splash=`<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/free_ai_splash_background" />
    <item android:gravity="center" android:drawable="@drawable/free_ai_splash_logo" />
</layer-list>
`;

const notificationVector=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <path
        android:pathData="M210,100 A156,156 0,0 1,412,302"
        android:fillColor="@android:color/transparent"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="72"
        android:strokeLineCap="round" />
    <path
        android:pathData="M302,412 A156,156 0,0 1,100,210"
        android:fillColor="@android:color/transparent"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="72"
        android:strokeLineCap="round" />
</vector>
`;

write('values/free_ai_colors.xml',colors);
write('drawable/splash.xml',splash);
write('drawable/ic_stat_free_ai.xml',notificationVector);
write('mipmap-anydpi-v26/ic_launcher.xml',adaptive);
write('mipmap-anydpi-v26/ic_launcher_round.xml',adaptive);

const scales={mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4};
const renderSvg=async(svg,size)=>sharp(Buffer.from(svg)).resize(size,size,{fit:'contain'}).png().toBuffer();
const transparentCanvas=async(size,mark)=>sharp({
  create:{width:size,height:size,channels:4,background:{r:0,g:0,b:0,alpha:0}}
}).composite([{input:mark,gravity:'center'}]).png().toBuffer();
const solidCanvas=async(size,mark)=>sharp({
  create:{width:size,height:size,channels:4,background:iconBackground}
}).composite([{input:mark,gravity:'center'}]).png().toBuffer();

for(const [density,scale] of Object.entries(scales)){
  const adaptiveSize=Math.round(108*scale);
  const adaptiveMarkSize=Math.round(66*scale);
  const legacySize=Math.round(48*scale);
  const legacyMarkSize=Math.round(30*scale);
  const splashSize=Math.round(144*scale);
  const splashMarkSize=Math.round(96*scale);

  const blueAdaptiveMark=await renderSvg(sourceSvg,adaptiveMarkSize);
  const whiteAdaptiveMark=await renderSvg(whiteSvg,adaptiveMarkSize);
  const legacyMark=await renderSvg(sourceSvg,legacyMarkSize);
  const splashMark=await renderSvg(sourceSvg,splashMarkSize);

  const mipmapDir=path.join(res,'mipmap-'+density);
  const drawableDir=path.join(res,'drawable-'+density);
  fs.mkdirSync(mipmapDir,{recursive:true});
  fs.mkdirSync(drawableDir,{recursive:true});

  await (await solidCanvas(legacySize,legacyMark)).toFile(path.join(mipmapDir,'ic_launcher.png'));
  await (await solidCanvas(legacySize,legacyMark)).toFile(path.join(mipmapDir,'ic_launcher_round.png'));
  await (await transparentCanvas(adaptiveSize,blueAdaptiveMark)).toFile(path.join(mipmapDir,'ic_launcher_foreground.png'));
  await (await transparentCanvas(adaptiveSize,whiteAdaptiveMark)).toFile(path.join(mipmapDir,'ic_launcher_monochrome.png'));
  await (await transparentCanvas(splashSize,splashMark)).toFile(path.join(drawableDir,'free_ai_splash_logo.png'));
}

for(const dirent of fs.readdirSync(res,{withFileTypes:true})){
  if(!dirent.isDirectory()||!dirent.name.startsWith('drawable'))continue;
  const dir=path.join(res,dirent.name);
  for(const name of fs.readdirSync(dir)){
    if(/^splash\.(png|webp|jpg|jpeg)$/i.test(name)){
      try{fs.rmSync(path.join(dir,name))}catch{}
    }
  }
}

const manifestPath=path.resolve('android/app/src/main/AndroidManifest.xml');
if(fs.existsSync(manifestPath)){
  let manifest=fs.readFileSync(manifestPath,'utf8');

  const applicationRe=/<application\b([^>]*)>/;
  const applicationMatch=manifest.match(applicationRe);
  if(!applicationMatch)throw new Error('Application declaration not found in AndroidManifest.xml');
  let applicationAttrs=applicationMatch[1];
  const ensureApplicationAttr=(name,value)=>{
    const attrRe=new RegExp('android:'+name+'=["\\\'][^"\\\']*["\\\']');
    if(attrRe.test(applicationAttrs))applicationAttrs=applicationAttrs.replace(attrRe,'android:'+name+'="'+value+'"');
    else applicationAttrs+=' android:'+name+'="'+value+'"';
  };
  ensureApplicationAttr('icon','@mipmap/ic_launcher');
  ensureApplicationAttr('roundIcon','@mipmap/ic_launcher_round');
  ensureApplicationAttr('supportsRtl','true');
  manifest=manifest.replace(applicationRe,'<application'+applicationAttrs+'>');

  const activityRe=/<activity\b([^>]*\bandroid:name=["']\.MainActivity["'][^>]*)>/;
  const match=manifest.match(activityRe);
  if(!match)throw new Error('MainActivity declaration not found in AndroidManifest.xml');
  let attrs=match[1];
  if(/android:windowSoftInputMode=/.test(attrs)){
    attrs=attrs.replace(/android:windowSoftInputMode=["'][^"']*["']/,'android:windowSoftInputMode="adjustResize"');
  }else{
    attrs+=' android:windowSoftInputMode="adjustResize"';
  }
  manifest=manifest.replace(activityRe,'<activity'+attrs+'>');
  fs.writeFileSync(manifestPath,manifest,'utf8');
}

const stylesPath=path.join(res,'values','styles.xml');
if(fs.existsSync(stylesPath)){
  let xml=fs.readFileSync(stylesPath,'utf8');

  const upsertItem=(body,key,value)=>{
    const itemRe=new RegExp('<item\\s+name="'+key.replaceAll(':','\\:')+'"[^>]*>[^<]*<\\/item>');
    const item='<item name="'+key+'">'+value+'</item>';
    return itemRe.test(body)?body.replace(itemRe,item):body+'\n        '+item;
  };

  const styleNames=['AppTheme','AppTheme.NoActionBar','AppTheme.NoActionBarLaunch'];
  for(const name of styleNames){
    const re=new RegExp('(<style\\s+name="'+name.replaceAll('.','\\.')+'"[^>]*>)([\\s\\S]*?)(<\\/style>)');
    xml=xml.replace(re,(full,open,body,close)=>{
      let next=body;
      next=upsertItem(next,'android:windowLightStatusBar','false');
      next=upsertItem(next,'android:windowLightNavigationBar','false');
      next=upsertItem(next,'android:windowLayoutInDisplayCutoutMode','always');

      if(name==='AppTheme.NoActionBarLaunch'){
        open=open.replace(/parent=["'][^"']*["']/,'parent="Theme.SplashScreen"');
        next=upsertItem(next,'android:windowBackground','@drawable/splash');
        next=upsertItem(next,'windowSplashScreenBackground','@color/free_ai_splash_background');
        next=upsertItem(next,'windowSplashScreenAnimatedIcon','@mipmap/ic_launcher');
        next=upsertItem(next,'postSplashScreenTheme','@style/AppTheme.NoActionBar');
      }
      return open+next+close;
    });
  }
  fs.writeFileSync(stylesPath,xml,'utf8');
}

console.log('Applied Free AI adaptive, monochrome, splash and notification branding to Android.');
