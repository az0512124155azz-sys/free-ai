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
        android:fillColor="#F7F7F7"
        android:pathData="M28,18 C22.5,18 18,22.5 18,28 L18,80 C18,85.5 22.5,90 28,90 L80,90 C85.5,90 90,85.5 90,80 L90,28 C90,22.5 85.5,18 80,18 Z" />
    <path
        android:fillColor="#181818"
        android:pathData="M37,33 L72,33 L72,42 L48,42 L48,52 L68,52 L68,61 L48,61 L48,76 L37,76 Z" />
    <path
        android:fillColor="#3A83F7"
        android:pathData="M76,27 L78.5,33 L84.5,35.5 L78.5,38 L76,44 L73.5,38 L67.5,35.5 L73.5,33 Z" />
</vector>
`;

const monochrome=`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M31,22 C26,22 22,26 22,31 L22,77 C22,82 26,86 31,86 L77,86 C82,86 86,82 86,77 L86,31 C86,26 82,22 77,22 Z M37,33 L72,33 L72,42 L48,42 L48,52 L68,52 L68,61 L48,61 L48,76 L37,76 Z" />
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
    <path android:fillColor="#F7F7F7" android:pathData="M28,18 C22.5,18 18,22.5 18,28 L18,80 C18,85.5 22.5,90 28,90 L80,90 C85.5,90 90,85.5 90,80 L90,28 C90,22.5 85.5,18 80,18 Z" />
    <path android:fillColor="#181818" android:pathData="M37,33 L72,33 L72,42 L48,42 L48,52 L68,52 L68,61 L48,61 L48,76 L37,76 Z" />
    <path android:fillColor="#3A83F7" android:pathData="M76,27 L78.5,33 L84.5,35.5 L78.5,38 L76,44 L73.5,38 L67.5,35.5 L73.5,33 Z" />
</vector>
`;

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
