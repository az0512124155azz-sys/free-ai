import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const renderer=read('src/main.jsx');
const main=read('electron/main.cjs');
const portal=read('electron/linux-remote-desktop.cjs');
const l13=read('scripts/check-linux13-work-loop.mjs');
const browser=read('scripts/check-linux-browser-use.mjs');
const pkg=read('package.json');

function fail(message){
  console.error('Linux Computer Use regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["const dbus=require('dbus-next');",'D-Bus client dependency'],
  ["org.freedesktop.portal.RemoteDesktop",'XDG RemoteDesktop portal'],
  ["org.freedesktop.portal.ScreenCast",'XDG ScreenCast portal'],
  ["types:new Variant('u',DEVICE_KEYBOARD|DEVICE_POINTER)",'pointer and keyboard request'],
  ["persist_mode:new Variant('u',1)",'session-lifetime persistence'],
  ["types:new Variant('u',SOURCE_MONITOR)",'monitor source selection'],
  ["multiple:new Variant('b',false)",'single monitor safety selection'],
  ["await request(remote,'Start',[sessionHandle,'',",'RemoteDesktop start permission request'],
  ["NotifyPointerMotionAbsolute",'absolute pointer motion'],
  ["NotifyPointerButton",'pointer button injection'],
  ["NotifyPointerAxisDiscrete",'scroll injection'],
  ["NotifyKeyboardKeysym",'keyboard injection'],
  ["The Computer Use screenshot is stale. Take a fresh screenshot before interacting with the desktop.",'stale screenshot protection'],
  ["Linux Computer Use requires exactly one portal-selected monitor for this task.",'single-monitor mapping guard'],
  ["coordinateSpace:'portal-logical'",'portal logical coordinate metadata']
]) requireText(portal,text,label);

for(const [text,label] of [
  ["function linuxRemoteDesktopController(){",'lazy Linux Remote Desktop controller'],
  ["function linuxComputerCaptureMapping(sources,displays){",'Linux screen/portal mapping'],
  ["mapping:process.platform==='win32'",'cross-platform screenshot mapping'],
  ["?(linuxInteractive?'xdg-remote-desktop':'unavailable')",'Linux portal mapping label'],
  ["async function performLinuxComputerAction(payload={}){",'Linux Computer action runtime'],
  ["if(process.platform==='linux')return performLinuxComputerAction(payload);",'Linux action dispatch'],
  ["await controller.keypress(['CTRL','V']);",'Linux text paste via portal keyboard'],
  ["const linuxWork=process.platform==='linux';",'Linux Work Computer capability'],
  ["const computerPlatform=windowsWork||linuxWork;",'Windows/Linux Computer platform capability'],
  ["Linux uses the system XDG Remote Desktop permission dialog before interactive control.",'Linux Computer tool description'],
  ["Free AI will share screenshots of your desktop with the selected AI model",'cross-platform Computer approval text'],
  ["if(linuxRemoteDesktopInstance)linuxRemoteDesktopInstance.shutdown().catch(()=>{});",'portal shutdown cleanup'],
  ["return linuxRemoteDesktopController().clickNormalized(nx,ny,'left',1);",'Linux direct click bridge']
]) requireText(main,text,label);

for(const [text,label] of [
  ["Available after the system Remote Desktop permission",'Linux Computer settings availability'],
  ["Screenshots are used internally by the active AI task; no screen-mirror panel is shown",'no mirror panel behavior'],
  ["XDG Remote Desktop controls pointer/keyboard access for the active desktop session",'Linux portal settings explanation']
]) requireText(renderer,text,label);

if(main.includes("return 'Computer Use is not enabled for Linux in this checkpoint.';")){
  fail('old Linux Work Computer rejection remains');
}
if(main.includes("computer: unavailable on Linux until Linux Computer Use is enabled.")){
  fail('old Linux Computer unavailable description remains');
}
if(l13.includes('Linux Computer Use unavailable description')||l13.includes('Linux Computer Use validation')||l13.includes('Computer Use remains Windows-only')){
  fail('L1.3 still asserts Linux Computer Use must remain blocked');
}
if(browser.includes('Computer-only Linux Work rejection')||browser.includes('Computer Use remains out of scope')){
  fail('Browser checkpoint still asserts Linux Computer Use must remain blocked');
}
if(!pkg.includes('"dbus-next": "^0.10.2"')){
  fail('dbus-next production dependency is missing');
}
if(!pkg.includes('node --check electron/linux-remote-desktop.cjs')){
  fail('Linux portal module syntax is not validated');
}
if(!pkg.includes('node scripts/check-linux-computer-use.mjs')){
  fail('package validate does not run the Linux Computer Use guard');
}

console.log('Linux Computer Use regression checks passed.');
