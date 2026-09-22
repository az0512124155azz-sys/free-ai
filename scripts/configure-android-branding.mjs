import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const res=path.resolve('android/app/src/main/res');
const source=path.resolve('public/free-ai-logo.png');
if(!fs.existsSync(res)){
  console.error('Android resources not found. Run "npx cap add android" first.');
  process.exit(1);
}
if(!fs.existsSync(source)){
  console.error('Missing public/free-ai-logo.png');
  process.exit(1);
}

const write=(rel,value)=>{
  const target=path.join(res,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,value.trimStart(),'utf8');
};

const colors=`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="free_ai_icon_background">#000000</color>
</resources>
`;

const foreground=`<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:gravity="center">
        <bitmap android:src="@drawable/free_ai_logo" android:gravity="center" />
    </item>
</layer-list>
`;

const adaptive=`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/free_ai_icon_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;

const splash=`<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/free_ai_icon_background" />
    <item android:gravity="center">
        <bitmap android:src="@drawable/free_ai_logo" android:gravity="center" />
    </item>
</layer-list>
`;

write('values/free_ai_colors.xml',colors);
write('drawable/ic_launcher_foreground.xml',foreground);
write('drawable/splash.xml',splash);
write('mipmap-anydpi-v26/ic_launcher.xml',adaptive);
write('mipmap-anydpi-v26/ic_launcher_round.xml',adaptive);

const logoTarget=path.join(res,'drawable-nodpi','free_ai_logo.png');
fs.mkdirSync(path.dirname(logoTarget),{recursive:true});
await sharp(source).resize(384,384,{fit:'contain'}).png().toFile(logoTarget);

const densitySizes={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
for(const [density,size] of Object.entries(densitySizes)){
  const dir=path.join(res,'mipmap-'+density);
  fs.mkdirSync(dir,{recursive:true});
  for(const name of ['ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png']){
    await sharp(source).resize(size,size,{fit:'contain'}).png().toFile(path.join(dir,name));
  }
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

console.log('Applied the supplied Free AI logo to Android launcher icons, splash and adaptive icon.');
