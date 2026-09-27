'use strict';

const crypto=require('crypto');
const dbus=require('dbus-next');
const {Variant}=dbus;

const PORTAL_NAME='org.freedesktop.portal.Desktop';
const PORTAL_PATH='/org/freedesktop/portal/desktop';
const REMOTE_IFACE='org.freedesktop.portal.RemoteDesktop';
const SCREENCAST_IFACE='org.freedesktop.portal.ScreenCast';
const REQUEST_IFACE='org.freedesktop.portal.Request';
const SESSION_IFACE='org.freedesktop.portal.Session';

const DEVICE_KEYBOARD=1;
const DEVICE_POINTER=2;
const SOURCE_MONITOR=1;

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function token(prefix){
  return (prefix+'_'+crypto.randomBytes(8).toString('hex')).replace(/[^A-Za-z0-9_]/g,'_');
}

function unwrap(value){
  if(value instanceof Variant)return unwrap(value.value);
  if(typeof value==='bigint')return value.toString();
  if(Array.isArray(value))return value.map(unwrap);
  if(value&&typeof value==='object'){
    const out={};
    for(const [key,item] of Object.entries(value))out[key]=unwrap(item);
    return out;
  }
  return value;
}

function portalResponseError(label,response){
  if(Number(response)===1)return new Error(label+' was cancelled.');
  return new Error(label+' was denied by the desktop portal.');
}

function actionablePortalError(error){
  const detail=String(error?.message||error||'').trim();
  if(/ServiceUnknown|NameHasNoOwner|org\.freedesktop\.portal\.Desktop/i.test(detail)){
    return new Error('Linux Computer Use requires xdg-desktop-portal with RemoteDesktop and ScreenCast support. Start or install the portal backend for your desktop session, then try again.');
  }
  if(/NoReply|timeout/i.test(detail)){
    return new Error('The Linux Remote Desktop permission dialog did not respond. Check that xdg-desktop-portal is running in your desktop session, then try again.');
  }
  return error instanceof Error?error:new Error(detail||'Linux Remote Desktop portal failed.');
}

function streamRecord(tuple){
  const [nodeIdRaw,propsRaw]=Array.isArray(tuple)?tuple:[null,{}];
  const nodeId=Number(nodeIdRaw);
  const props=unwrap(propsRaw||{});
  const size=Array.isArray(props.size)?props.size.map(Number):[];
  const position=Array.isArray(props.position)?props.position.map(Number):[];
  const width=Number(size[0]);
  const height=Number(size[1]);
  return {
    nodeId:Number.isFinite(nodeId)?nodeId:null,
    displayId:Number.isFinite(nodeId)?'portal:'+nodeId:'',
    width:Number.isFinite(width)&&width>1?width:0,
    height:Number.isFinite(height)&&height>1?height:0,
    position:{
      x:Number.isFinite(position[0])?position[0]:0,
      y:Number.isFinite(position[1])?position[1]:0
    },
    sourceType:Number(props.source_type)||0,
    mappingId:String(props.mapping_id||''),
    streamId:String(props.id||''),
    pipewireSerial:String(props['pipewire-serial']||'')
  };
}

function linuxKeysym(key){
  const raw=String(key||'').trim();
  const name=raw.toUpperCase();
  if(/^[A-Z]$/.test(name))return name.toLowerCase().charCodeAt(0);
  if(/^[0-9]$/.test(name))return name.charCodeAt(0);
  if(raw.length===1&&raw.charCodeAt(0)<128)return raw.charCodeAt(0);
  const values={
    CTRL:0xFFE3,CONTROL:0xFFE3,
    SHIFT:0xFFE1,
    ALT:0xFFE9,
    META:0xFFEB,SUPER:0xFFEB,CMD:0xFFEB,COMMAND:0xFFEB,WIN:0xFFEB,WINDOWS:0xFFEB,
    ENTER:0xFF0D,RETURN:0xFF0D,TAB:0xFF09,ESC:0xFF1B,ESCAPE:0xFF1B,SPACE:0x20,
    BACKSPACE:0xFF08,DELETE:0xFFFF,INSERT:0xFF63,HOME:0xFF50,END:0xFF57,
    PAGEUP:0xFF55,PAGEDOWN:0xFF56,
    ARROWLEFT:0xFF51,LEFT:0xFF51,ARROWUP:0xFF52,UP:0xFF52,
    ARROWRIGHT:0xFF53,RIGHT:0xFF53,ARROWDOWN:0xFF54,DOWN:0xFF54
  };
  if(/^F(?:[1-9]|1[0-2])$/.test(name))return 0xFFBE+Number(name.slice(1))-1;
  return values[name]??null;
}

function pointerButton(button){
  switch(String(button||'left').toLowerCase()){
    case 'left':return 0x110;
    case 'right':return 0x111;
    case 'wheel':
    case 'middle':return 0x112;
    case 'back':return 0x113;
    case 'forward':return 0x114;
    default:throw new Error('Computer Use requested an unsupported mouse button.');
  }
}

function createLinuxRemoteDesktopController(){
  let bus=null;
  let remote=null;
  let screenCast=null;
  let sessionHandle='';
  let sessionIface=null;
  let devices=0;
  let streams=[];
  let restoreToken='';
  let starting=null;

  function clearSessionState(){
    sessionHandle='';
    sessionIface=null;
    devices=0;
    streams=[];
  }

  async function portalInterfaces(){
    if(bus&&remote&&screenCast)return {bus,remote,screenCast};
    try{
      bus=dbus.sessionBus();
      const object=await bus.getProxyObject(PORTAL_NAME,PORTAL_PATH);
      remote=object.getInterface(REMOTE_IFACE);
      screenCast=object.getInterface(SCREENCAST_IFACE);
      return {bus,remote,screenCast};
    }catch(error){
      try{bus?.disconnect?.()}catch{}
      bus=null;remote=null;screenCast=null;
      throw actionablePortalError(error);
    }
  }

  async function waitRequest(handle,label,timeoutMs=120000){
    let request;
    try{
      const object=await bus.getProxyObject(PORTAL_NAME,String(handle||''));
      request=object.getInterface(REQUEST_IFACE);
    }catch(error){
      throw actionablePortalError(error);
    }
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(fn,value)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        request.removeListener?.('Response',onResponse);
        fn(value);
      };
      const onResponse=(response,results)=>{
        if(Number(response)!==0)return finish(reject,portalResponseError(label,response));
        finish(resolve,unwrap(results||{}));
      };
      const timer=setTimeout(()=>finish(reject,new Error(label+' timed out while waiting for the desktop portal.')),timeoutMs);
      request.once('Response',onResponse);
    });
  }

  async function request(iface,method,args,label){
    let handle;
    try{handle=await iface[method](...args)}
    catch(error){throw actionablePortalError(error)}
    return waitRequest(handle,label);
  }

  async function closeSession(){
    const closing=sessionIface;
    clearSessionState();
    if(closing){
      try{await closing.Close()}catch{}
    }
  }

  async function startSession(){
    const {remote,screenCast}=await portalInterfaces();
    let created;
    try{
      created=await request(remote,'CreateSession',[{
        handle_token:new Variant('s',token('freeai_create')),
        session_handle_token:new Variant('s',token('freeai_session'))
      }],'Linux Computer Use session');
      sessionHandle=String(created.session_handle||'');
      if(!sessionHandle)throw new Error('The Linux Remote Desktop portal did not return a session handle.');

      const sessionObject=await bus.getProxyObject(PORTAL_NAME,sessionHandle);
      sessionIface=sessionObject.getInterface(SESSION_IFACE);
      sessionIface.once('Closed',()=>clearSessionState());

      const deviceOptions={
        handle_token:new Variant('s',token('freeai_devices')),
        types:new Variant('u',DEVICE_KEYBOARD|DEVICE_POINTER),
        persist_mode:new Variant('u',1)
      };
      if(restoreToken)deviceOptions.restore_token=new Variant('s',restoreToken);
      try{
        await request(remote,'SelectDevices',[sessionHandle,deviceOptions],'Linux Computer Use device selection');
      }catch(error){
        if(!restoreToken)throw error;
        restoreToken='';
        await request(remote,'SelectDevices',[sessionHandle,{
          handle_token:new Variant('s',token('freeai_devices')),
          types:new Variant('u',DEVICE_KEYBOARD|DEVICE_POINTER),
          persist_mode:new Variant('u',1)
        }],'Linux Computer Use device selection');
      }

      await request(screenCast,'SelectSources',[sessionHandle,{
        handle_token:new Variant('s',token('freeai_sources')),
        types:new Variant('u',SOURCE_MONITOR),
        multiple:new Variant('b',false)
      }],'Linux Computer Use screen selection');

      const started=await request(remote,'Start',[sessionHandle,'',{
        handle_token:new Variant('s',token('freeai_start'))
      }],'Linux Computer Use permission');
      devices=Number(started.devices)||0;
      restoreToken=String(started.restore_token||restoreToken||'');
      streams=(Array.isArray(started.streams)?started.streams:[]).map(streamRecord).filter(stream=>stream.nodeId!==null);

      if((devices&DEVICE_POINTER)!==DEVICE_POINTER||(devices&DEVICE_KEYBOARD)!==DEVICE_KEYBOARD){
        throw new Error('Linux Computer Use needs both pointer and keyboard permission from the system Remote Desktop dialog.');
      }
      if(streams.length!==1){
        throw new Error('Linux Computer Use requires exactly one portal-selected monitor for this task. Select one monitor in the system Remote Desktop dialog and try again.');
      }
      if(!streams[0].width||!streams[0].height){
        throw new Error('The Linux Remote Desktop portal did not provide logical monitor dimensions required for safe pointer mapping.');
      }
      return status();
    }catch(error){
      await closeSession();
      throw actionablePortalError(error);
    }
  }

  async function ensureSession(){
    if(sessionHandle&&streams.length===1)return status();
    if(starting)return starting;
    starting=startSession().finally(()=>{starting=null});
    return starting;
  }

  function status(){
    return {
      active:!!sessionHandle&&streams.length===1,
      devices,
      streams:streams.map(stream=>({...stream}))
    };
  }

  function activeStream(displayId=''){
    if(!sessionHandle||streams.length!==1)throw new Error('Linux Computer Use does not have an active Remote Desktop session.');
    const stream=streams[0];
    if(displayId&&String(displayId)!==stream.displayId){
      throw new Error('The Computer Use screenshot is stale. Take a fresh screenshot before interacting with the desktop.');
    }
    return stream;
  }

  function viewportPoint(displayId,x,y,width,height){
    const stream=activeStream(displayId);
    const w=Number(width),h=Number(height),px=Number(x),py=Number(y);
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=1||h<=1)throw new Error('Computer Use action is missing a valid screenshot viewport.');
    if(!Number.isFinite(px)||!Number.isFinite(py))throw new Error('Computer Use action is missing valid screen coordinates.');
    const nx=Math.min(1,Math.max(0,px/(w-1)));
    const ny=Math.min(1,Math.max(0,py/(h-1)));
    return {
      stream,
      x:Math.min(stream.width-1,Math.max(0,nx*(stream.width-1))),
      y:Math.min(stream.height-1,Math.max(0,ny*(stream.height-1)))
    };
  }

  async function moveViewport(displayId,x,y,width,height){
    await ensureSession();
    const point=viewportPoint(displayId,x,y,width,height);
    await remote.NotifyPointerMotionAbsolute(sessionHandle,{},point.stream.nodeId,point.x,point.y);
    return {x:point.x,y:point.y,displayId:point.stream.displayId,coordinateSpace:'portal-logical'};
  }

  async function clickViewport(displayId,x,y,width,height,button='left',count=1){
    const point=await moveViewport(displayId,x,y,width,height);
    const code=pointerButton(button);
    const clicks=Math.max(1,Math.min(2,Math.round(Number(count)||1)));
    for(let i=0;i<clicks;i++){
      await remote.NotifyPointerButton(sessionHandle,{},code,1);
      await remote.NotifyPointerButton(sessionHandle,{},code,0);
      if(i+1<clicks)await delay(90);
    }
    return point;
  }

  async function scrollViewport(displayId,x,y,width,height,scrollX,scrollY){
    const point=await moveViewport(displayId,x,y,width,height);
    const sx=Math.max(-4000,Math.min(4000,Math.round(Number(scrollX)||0)));
    const sy=Math.max(-4000,Math.min(4000,Math.round(Number(scrollY)||0)));
    const steps=value=>value?Math.sign(value)*Math.max(1,Math.min(24,Math.round(Math.abs(value)/120)||1)):0;
    const horizontal=steps(sx),vertical=steps(sy);
    if(vertical)await remote.NotifyPointerAxisDiscrete(sessionHandle,{},0,vertical);
    if(horizontal)await remote.NotifyPointerAxisDiscrete(sessionHandle,{},1,horizontal);
    return point;
  }

  async function keypress(keys){
    await ensureSession();
    const list=(Array.isArray(keys)?keys:[keys]).filter(Boolean);
    const syms=list.map(linuxKeysym);
    if(!syms.length||syms.some(value=>value===null))throw new Error('Computer Use requested an unsupported keyboard key.');
    for(const sym of syms)await remote.NotifyKeyboardKeysym(sessionHandle,{},sym,1);
    await delay(45);
    for(const sym of [...syms].reverse())await remote.NotifyKeyboardKeysym(sessionHandle,{},sym,0);
    return true;
  }

  async function dragViewport(displayId,path,width,height){
    await ensureSession();
    if(!Array.isArray(path)||path.length<2)throw new Error('Drag requires at least two valid points.');
    const first=viewportPoint(displayId,path[0]?.x,path[0]?.y,width,height);
    await remote.NotifyPointerMotionAbsolute(sessionHandle,{},first.stream.nodeId,first.x,first.y);
    await remote.NotifyPointerButton(sessionHandle,{},pointerButton('left'),1);
    try{
      for(const item of path.slice(1)){
        const point=viewportPoint(displayId,item?.x,item?.y,width,height);
        await delay(45);
        await remote.NotifyPointerMotionAbsolute(sessionHandle,{},point.stream.nodeId,point.x,point.y);
      }
    }finally{
      await remote.NotifyPointerButton(sessionHandle,{},pointerButton('left'),0).catch(()=>{});
    }
    return true;
  }

  async function clickNormalized(nx,ny,button='left',count=1){
    await ensureSession();
    const stream=activeStream();
    const clamp=value=>Math.min(1,Math.max(0,Number(value)||0));
    return clickViewport(stream.displayId,clamp(nx)*(stream.width-1),clamp(ny)*(stream.height-1),stream.width,stream.height,button,count);
  }

  async function shutdown(){
    await closeSession();
    try{bus?.disconnect?.()}catch{}
    bus=null;remote=null;screenCast=null;
  }

  return {
    ensureSession,
    status,
    moveViewport,
    clickViewport,
    scrollViewport,
    keypress,
    dragViewport,
    clickNormalized,
    closeSession,
    shutdown
  };
}

module.exports={createLinuxRemoteDesktopController};
