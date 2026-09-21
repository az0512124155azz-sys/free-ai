import fs from 'node:fs';

const manifestPath='android/app/src/main/AndroidManifest.xml';
if(!fs.existsSync(manifestPath)){
  console.error('AndroidManifest.xml not found. Run "npx cap add android" first.');
  process.exit(1);
}

let xml=fs.readFileSync(manifestPath,'utf8');
const marker='android:scheme="freeai"';

if(!xml.includes(marker)){
  const filter=`
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="freeai" android:host="auth" />
            </intent-filter>`;

  const activityClose='</activity>';
  const index=xml.indexOf(activityClose);
  if(index<0){
    console.error('Could not find the main activity in AndroidManifest.xml.');
    process.exit(1);
  }

  xml=xml.slice(0,index)+filter+'\n        '+xml.slice(index);
  fs.writeFileSync(manifestPath,xml,'utf8');
  console.log('Added freeai://auth deep-link intent filter.');
}else{
  console.log('Google OAuth deep-link intent filter already configured.');
}
