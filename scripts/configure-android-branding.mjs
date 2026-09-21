import fs from 'node:fs';
import path from 'node:path';

const res=path.resolve('android/app/src/main/res');
if(!fs.existsSync(res)){
  console.error('Android resources not found. Run "npx cap add android" first.');
  process.exit(1);
}

const ensureDir=p=>fs.mkdirSync(path.join(res,p),{recursive:true});
const write=(rel,value)=>{
  const target=path.join(res,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,value.trimStart(),'utf8');
};

const colors=`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="free_ai_icon_background">#181818</color>
</resources>
`;

const foreground=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#3183F7"
        android:strokeWidth="13"
        android:strokeLineCap="round"
        android:pathData="M34,18 C61,9 91,29 91,58 C91,75 82,90 68,97" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#3183F7"
        android:strokeWidth="13"
        android:strokeLineCap="round"
        android:pathData="M74,90 C47,99 17,79 17,50 C17,33 26,18 40,11" />
</vector>
`;

const monochrome=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="13"
        android:strokeLineCap="round"
        android:pathData="M34,18 C61,9 91,29 91,58 C91,75 82,90 68,97" />
    <path
        android:fillColor="@android:color/transparent"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="13"
        android:strokeLineCap="round"
        android:pathData="M74,90 C47,99 17,79 17,50 C17,33 26,18 40,11" />
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
    <path android:fillColor="#181818" android:pathData="M0,0 H108 V108 H0 Z" />
    <path android:fillColor="@android:color/transparent" android:strokeColor="#3183F7" android:strokeWidth="13" android:strokeLineCap="round" android:pathData="M34,18 C61,9 91,29 91,58 C91,75 82,90 68,97" />
    <path android:fillColor="@android:color/transparent" android:strokeColor="#3183F7" android:strokeWidth="13" android:strokeLineCap="round" android:pathData="M74,90 C47,99 17,79 17,50 C17,33 26,18 40,11" />
</vector>
`

const splash=`<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/free_ai_icon_background" />
    <item android:gravity="center" android:drawable="@drawable/ic_launcher_foreground" />
</layer-list>
`;

ensureDir('values');
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
        const item='\\n        <item name="'+key+'">'+value+'</item>';
        next=itemRe.test(next)?next.replace(itemRe,item.trim()):next+item;
      }
      if(name==='AppTheme.NoActionBarLaunch'){
        const bg=/<item\s+name="android:background"[^>]*>[^<]*<\/item>/;
        const win=/<item\s+name="android:windowBackground"[^>]*>[^<]*<\/item>/;
        if(bg.test(next))next=next.replace(bg,'<item name="android:background">@drawable/splash</item>');
        else if(win.test(next))next=next.replace(win,'<item name="android:windowBackground">@drawable/splash</item>');
        else next+='\\n        <item name="android:windowBackground">@drawable/splash</item>';
      }
      return open+next+close;
    });
  }
  fs.writeFileSync(stylesPath,xml,'utf8');
}

console.log('Applied Free AI adaptive icon, splash and edge-to-edge Android branding.');
