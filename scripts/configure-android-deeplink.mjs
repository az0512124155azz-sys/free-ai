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


// Capgo Social Login requires MainActivity to forward Google authorization results.
const javaRoot='android/app/src/main/java';
function findMainActivity(dir){
  if(!fs.existsSync(dir))return null;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=dir+'/'+entry.name;
    if(entry.isDirectory()){
      const found=findMainActivity(full);
      if(found)return found;
    }else if(entry.name==='MainActivity.java')return full;
  }
  return null;
}

const mainActivityPath=findMainActivity(javaRoot);
if(!mainActivityPath){
  console.error('MainActivity.java not found after Capacitor Android project generation.');
  process.exit(1);
}

let activity=fs.readFileSync(mainActivityPath,'utf8');
if(!activity.includes('ModifiedMainActivityForSocialLoginPlugin')){
  const packageLine=(activity.match(/^package\s+[^;]+;/m)||[])[0];
  if(!packageLine){
    console.error('Could not determine the Android MainActivity package.');
    process.exit(1);
  }
  activity=`${packageLine}

import android.content.Intent;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }

            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }

            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
`;
  fs.writeFileSync(mainActivityPath,activity,'utf8');
  console.log('Configured MainActivity for native Google Social Login.');
}else{
  console.log('MainActivity is already configured for native Google Social Login.');
}
