import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n?/g,'\n');
const main=read('electron/main.cjs');
const renderer=read('src/main.jsx');
const pkg=read('package.json');
const smoke=read('scripts/check-macos-computer-jxa-smoke.mjs');

function fail(message){
  console.error('macOS M3 Computer Use regression failed: '+message);
  process.exit(1);
}
function requireText(source,text,label){
  if(!source.includes(text))fail('missing '+label);
}

for(const [text,label] of [
  ["function ensureMacScreenCaptureAccess(){",'macOS Screen Recording permission gate'],
  ["systemPreferences.getMediaAccessStatus('screen')",'screen capture permission status check'],
  ["Free AI needs Screen Recording permission in System Settings → Privacy & Security → Screen & System Audio Recording",'screen recording guidance'],
  ["function ensureMacAccessibility(){",'macOS Accessibility permission gate'],
  ["systemPreferences.isTrustedAccessibilityClient(true)",'Accessibility permission prompt'],
  ["async function moveMacPoint(x,y){",'macOS pointer move'],
  ["async function clickMacPoint(x,y,button='left',count=1){",'macOS click/double-click'],
  ["async function scrollMacPoint(x,y,scrollX,scrollY){",'macOS wheel scrolling'],
  ["async function keypressMac(keys){",'macOS keyboard shortcuts'],
  ["async function dragMacPath(points){",'macOS drag path'],
  ["async function pasteMacText(text){",'macOS clipboard typing'],
  ["$.CGEventCreateMouseEvent",'CoreGraphics mouse events'],
  ["$.CGEventCreateScrollWheelEvent",'CoreGraphics scroll events'],
  ["$.CGEventCreateKeyboardEvent",'CoreGraphics keyboard events'],
  ["$.CGEventPost($.kCGHIDEventTap",'CoreGraphics event posting'],
  ["async function performMacComputerAction(payload={}){",'macOS Computer action runtime'],
  ["if(process.platform==='darwin')return performMacComputerAction(payload);",'macOS Computer dispatch'],
  ["This Computer Use action runtime is currently available on Windows, macOS, and Linux.",'shared desktop Computer runtime gate'],
  ["const computerPlatform=windowsWork||macWork||linuxWork;",'macOS Work Computer publication'],
  ["macOS requires Screen Recording for screenshots and Accessibility for pointer/keyboard control.",'macOS Work Computer permission description'],
  ["if(process.platform==='darwin')ensureMacScreenCaptureAccess();",'screen permission before capture'],
  ["?(reliableNativeDisplay?'display_id':'legacy')",'macOS display mapping'],
  ["Computer Use must take a fresh desktop screenshot before mouse or keyboard actions.",'fresh screenshot safety gate'],
  ["Computer Use typing requires target x/y coordinates from the latest screenshot.",'typing target safety gate'],
  ["Computer Use needs a connected browser model with real image/file upload so it can see the desktop screenshot.",'image-capable controller gate'],
  ["if(process.platform!=='win32')throw new Error('System voice typing is currently available on Windows.');",'Windows Voice Typing path retained after macOS local Dictation promotion']
]) requireText(main,text,label);

for(const [text,label] of [
  ["desktopPlatform==='darwin'?'Available after macOS Screen Recording and Accessibility permissions'",'macOS Computer settings availability'],
  ["desktopPlatform==='darwin'?'Screen Recording allows screenshots; Accessibility allows pointer and keyboard control'",'macOS Computer settings permission copy'],
  ["Screenshots are used internally by the active AI task; no screen-mirror panel is shown",'no mirror panel behavior']
]) requireText(renderer,text,label);

for(const [text,label] of [
  ["ObjC.import('Cocoa');",'Cocoa import in macOS runtime smoke'],
  ["$.CGEventCreateMouseEvent",'mouse event creation smoke'],
  ["$.CGEventCreateScrollWheelEvent",'scroll event creation smoke'],
  ["$.CGEventCreateKeyboardEvent",'keyboard event creation smoke']
]) requireText(smoke,text,label);

if(!pkg.includes('node scripts/check-macos-m3-computer-use.mjs'))fail('package validate does not run macOS M3 guard');
if(!pkg.includes('node scripts/check-macos-computer-jxa-smoke.mjs'))fail('package validate does not run macOS CoreGraphics smoke');

console.log('macOS M3 Computer Use regression checks passed.');
