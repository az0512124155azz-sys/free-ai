import fs from 'node:fs';

const source=fs.readFileSync('src/main.jsx','utf8');
const relay=fs.readFileSync('relay/server.mjs','utf8');
const desktop=fs.readFileSync('electron/main.cjs','utf8');

function fail(message){
  console.error('Android 3A1 chat/composer regression failed: '+message);
  process.exit(1);
}
function has(text,marker,message){
  if(!text.includes(marker))fail(message||('Missing marker: '+marker));
}

has(source,"const chatAttachmentPlatform=isWindowsDesktop||isAndroidNative;",'Android chat must participate in real attachment routing.');
has(source,"if(isWindowsDesktop||isAndroidNative){await addChatAttachments(files)",'Android file/photo/camera selection must retain real File objects.');
has(source,"const requestId=((isWindowsDesktop&&isDesktop)||isAndroidNative)?crypto.randomUUID():null;",'Android chat requests must have stable request IDs for streaming and cancellation.');
has(source,"history:chatAttachmentPlatform?history:undefined",'Android relay requests must preserve multi-turn chat history.');
has(source,"const outboundAttachments=chatAttachmentPlatform&&canUploadFiles&&!retryContext",'Android browser-model attachments must be serialized for the desktop/provider upload path.');
has(source,"onStream:text=>",'Android remote generation must consume incremental stream updates.');
has(source,"activeRemoteRequestRef.current?.cancel?.()",'Android Stop must cancel the active relay request.');
has(source,"windowsDesktop||isAndroidNative?stopGeneration:undefined",'Android busy composer action must expose Stop.');
has(source,"(windowsDesktop||isAndroidNative)&&attachments.length>0",'Android composer must show selected attachment chips.');
has(source,'<input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={attachFiles}/>','Android composer must keep a photo picker input.');
has(source,'<input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={attachFiles}/>','Android composer must keep a camera capture input.');
has(source,'function MobileConversationPicker','Android chat must keep the mobile model picker.');

has(relay,"ctx.role==='mobile'&&m.type==='cancel'",'Relay must accept cancellation from Android/mobile clients.');
has(relay,"ctx.role==='desktop'&&m.type==='stream'",'Relay must forward streamed text from desktop to Android/mobile clients.');
has(relay,"send(r.desktop,{...m,requestId:m.requestId||m.id})",'Relay must preserve a cancellable request ID when forwarding mobile prompts.');

has(desktop,"async function routePrompt(msg,emitToRenderer=false,externalStream=null)",'Desktop routing must accept an external stream sink for mobile relay requests.');
has(desktop,"if(m.type==='cancel')",'Desktop relay client must receive mobile cancellation.');
has(desktop,"cancelPrompt(m.requestId||m.id)",'Desktop relay cancellation must terminate the exact active provider request.');
has(desktop,"type:'stream',id:m.id,text:String(text||'')",'Desktop relay client must emit incremental provider text back to mobile.');

console.log('Android 3A1 chat/composer regression checks passed.');
