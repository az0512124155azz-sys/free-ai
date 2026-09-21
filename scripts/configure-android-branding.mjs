import fs from 'node:fs';
import path from 'node:path';

const androidRoot=path.resolve('android');
const res=path.join(androidRoot,'app','src','main','res');
if(!fs.existsSync(res)){
  console.error('Android resources not found. Run "npx cap add android" first.');
  process.exit(1);
}

const write=(rel,value)=>{
  const target=path.join(res,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,value.trimStart(),'utf8');
};

const colors=`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="free_ai_icon_background">#171717</color>
</resources>
`;

const foreground=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#2F7CF6"
        android:pathData="M54,20 A19,19 0,1 1,54,58 A19,19 0,1 1,54,20" />
    <path android:fillColor="#8A63F6"
        android:pathData="M25,47 A19,19 0,1 1,25,85 A19,19 0,1 1,25,47" />
    <path android:fillColor="#2CCF9C"
        android:pathData="M83,47 A19,19 0,1 1,83,85 A19,19 0,1 1,83,47" />
    <path android:fillColor="#F7F7F7"
        android:pathData="M54,44 L64,54 L54,64 L44,54 Z" />
</vector>
`;

const monochrome=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#FFFFFFFF"
        android:pathData="M54,20 A19,19 0,1 1,54,58 A19,19 0,1 1,54,20
                          M25,47 A19,19 0,1 1,25,85 A19,19 0,1 1,25,47
                          M83,47 A19,19 0,1 1,83,85 A19,19 0,1 1,83,47" />
    <path android:fillColor="#00000000"
        android:pathData="M54,44 L64,54 L54,64 L44,54 Z" />
</vector>
`;

const adaptive=`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/free_ai_icon_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`;

const legacy=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#171717" android:pathData="M0,0 H108 V108 H0 Z" />
    <path android:fillColor="#2F7CF6" android:pathData="M54,20 A19,19 0,1 1,54,58 A19,19 0,1 1,54,20" />
    <path android:fillColor="#8A63F6" android:pathData="M25,47 A19,19 0,1 1,25,85 A19,19 0,1 1,25,47" />
    <path android:fillColor="#2CCF9C" android:pathData="M83,47 A19,19 0,1 1,83,85 A19,19 0,1 1,83,47" />
    <path android:fillColor="#F7F7F7" android:pathData="M54,44 L64,54 L54,64 L44,54 Z" />
</vector>
`;

const splash=`<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/free_ai_icon_background" />
    <item android:gravity="center" android:drawable="@drawable/ic_launcher_foreground" />
</layer-list>
`;

write('values/free_ai_colors.xml',colors);
write('drawable/ic_launcher_foreground.xml',foreground);
write('drawable/ic_launcher_monochrome.xml',monochrome);
write('drawable/splash.xml',splash);
write('mipmap-anydpi-v26/ic_launcher.xml',adaptive);
write('mipmap-anydpi-v26/ic_launcher_round.xml',adaptive);
write('mipmap-anydpi/ic_launcher.xml',legacy);
write('mipmap-anydpi/ic_launcher_round.xml',legacy);

for(const dirent of fs.readdirSync(res,{withFileTypes:true})){
  if(!dirent.isDirectory()||!dirent.name.startsWith('drawable'))continue;
  const dir=path.join(res,dirent.name);
  for(const name of fs.readdirSync(dir)){
    if(/^splash\.(png|webp|jpg|jpeg)$/i.test(name)){
      try{fs.rmSync(path.join(dir,name))}catch{}
    }
  }
}

const variablesPath=path.join(androidRoot,'variables.gradle');
if(fs.existsSync(variablesPath)){
  let gradle=fs.readFileSync(variablesPath,'utf8');
  if(/minSdkVersion\s*=\s*\d+/.test(gradle)){
    gradle=gradle.replace(/minSdkVersion\s*=\s*\d+/,'minSdkVersion = 26');
  }
  fs.writeFileSync(variablesPath,gradle,'utf8');
}

const stylesPath=path.join(res,'values','styles.xml');
if(fs.existsSync(stylesPath)){
  let xml=fs.readFileSync(stylesPath,'utf8');
  const styleNames=['AppTheme','AppTheme.NoActionBar','AppTheme.NoActionBarLaunch'];
  for(const name of styleNames){
    const re=new RegExp('(<style\\s+name="'+name.replaceAll('.','\\.')+'"[^>]*>)([\\s\\S]*?)(</style>)');
    xml=xml.replace(re,(full,open,body,close)=>{
      const items=[
        ['android:statusBarColor','@android:color/transparent'],
        ['android:navigationBarColor','@android:color/transparent'],
        ['android:windowLightStatusBar','false'],
        ['android:windowLightNavigationBar','false'],
        ['android:windowLayoutInDisplayCutoutMode','shortEdges']
      ];
      let next=body;
      for(const [key,value] of items){
        const itemRe=new RegExp('<item\\s+name="'+key.replaceAll(':','\\:')+'"[^>]*>[^<]*</item>');
        const item='\n        <item name="'+key+'">'+value+'</item>';
        next=itemRe.test(next)?next.replace(itemRe,item.trim()):next+item;
      }
      if(name==='AppTheme.NoActionBarLaunch'){
        const bg=/<item\s+name="android:background"[^>]*>[^<]*<\/item>/;
        const win=/<item\s+name="android:windowBackground"[^>]*>[^<]*<\/item>/;
        if(bg.test(next))next=next.replace(bg,'<item name="android:background">@drawable/splash</item>');
        else if(win.test(next))next=next.replace(win,'<item name="android:windowBackground">@drawable/splash</item>');
        else next+='\n        <item name="android:windowBackground">@drawable/splash</item>';
      }
      return open+next+close;
    });
  }
  fs.writeFileSync(stylesPath,xml,'utf8');
}

console.log('Applied Free AI symbol, adaptive icon, splash, edge-to-edge branding and minSdk 26.');
