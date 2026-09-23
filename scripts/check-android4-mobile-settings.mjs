import fs from 'node:fs';

function readNormalized(path){
  return fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
}

const source=readNormalized('src/main.jsx');
const runtime=readNormalized('scripts/android-runtime-qa.sh');
const styles=readNormalized('src/styles.css');

function fail(message){
  console.error('Android 4A1 mobile settings regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){
  if(!text.includes(marker))fail(message||('Missing marker: '+marker));
}

has(source,"const [mobileSettingsList,setMobileSettingsList]=useState(true);",'Android Settings navigation state must be owned by App so native Back can control it.');
has(source,"if(settingsOpen){\n        if(!mobileSettingsList){setMobileSettingsList(true);return}\n        setSettingsOpen(false);return\n      }",'Android Back must return Settings detail to the list before closing Settings.');
has(source,"mobileList={mobileSettingsList} setMobileList={setMobileSettingsList}",'SettingsView must receive controlled mobile list/detail state.');
has(source,"data-section={section}",'Settings runtime QA must expose the active detail section.');
has(source,"if(command==='openSettings')",'Android runtime QA must be able to open the Settings list.');
has(source,"if(command==='openSettingsVoice')",'Android runtime QA must be able to enter a Settings detail screen.');
has(source,"'settingsList='+!!document.querySelector('.settingsScreen.mobileSettingsList')",'Android runtime audit must expose Settings list state.');
has(source,"'settingsDetail='+!!document.querySelector('.settingsScreen.mobileSettingsDetail')",'Android runtime audit must expose Settings detail state.');
has(source,"const hiddenOnMobile=new Set(['Keyboard shortcuts','Computer use','Files','Configuration','Browser','Git','Environments']);",'Mobile Settings must keep desktop-only Browser, Computer, Git, Environments, files and shortcuts out of the Android list.');
has(source,"label==='Plugins'?'Apps'",'Mobile Settings must label plugin integrations as Apps.');
has(styles,'.settingsScreen.mobileSettingsList .settingsNav{display:block','Mobile Settings list layout is missing.');
has(styles,'.settingsScreen.mobileSettingsDetail .settingsNav{display:none','Mobile Settings detail layout is missing.');
has(styles,'.mobileSettingsBack{display:grid!important}','Mobile Settings detail must expose a visible back control.');

has(runtime,'qa_line openSettings >/dev/null','Runtime QA must open Android Settings.');
has(runtime,'qa_line openSettingsVoice >/dev/null','Runtime QA must enter a Settings detail screen.');
has(runtime,'settingsOpen=true','Runtime QA must verify Settings is open.');
has(runtime,'settingsList=true','Runtime QA must verify list mode.');
has(runtime,'settingsDetail=true','Runtime QA must verify detail mode.');
has(runtime,'adb shell input keyevent 4','Runtime QA must exercise the real Android Back button.');
has(runtime,'settings_back_to_list','Runtime QA must verify first Back returns detail to list.');
has(runtime,'settings_closed','Runtime QA must verify second Back closes Settings.');

console.log('Android 4A1 mobile settings regression checks passed.');
