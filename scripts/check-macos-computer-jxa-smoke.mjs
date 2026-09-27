import {execFileSync} from 'node:child_process';

if(process.platform!=='darwin'){
  console.log('macOS CoreGraphics JXA smoke skipped on '+process.platform+'.');
  process.exit(0);
}

const script=`
ObjC.import('Cocoa');
const point=$.CGPointMake(12,18);
const mouse=$.CGEventCreateMouseEvent($(),$.kCGEventMouseMoved,point,$.kCGMouseButtonLeft);
const scroll=$.CGEventCreateScrollWheelEvent($(),$.kCGScrollEventUnitPixel,2,1,0);
const key=$.CGEventCreateKeyboardEvent($(),0,true);
if(!mouse||!scroll||!key)throw new Error('CoreGraphics Computer Use event creation failed.');
'CoreGraphics Computer Use primitives available';
`;

execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',script],{stdio:'inherit'});
console.log('macOS CoreGraphics JXA smoke passed.');
