const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('desktopApi',{
  getStatus:()=>ipcRenderer.invoke('bridge:getStatus'),
  scanProviders:()=>ipcRenderer.invoke('bridge:scanProviders'),
  sendPrompt:(m)=>ipcRenderer.invoke('bridge:sendPrompt',m),
  configureRelay:(c)=>ipcRenderer.invoke('bridge:configureRelay',c),
  listApiConnections:()=>ipcRenderer.invoke('api:listConnections'),
  addApiConnection:(c)=>ipcRenderer.invoke('api:addConnection',c),
  removeApiConnection:(id)=>ipcRenderer.invoke('api:removeConnection',id),
  captureScreens:()=>ipcRenderer.invoke('computer:captureScreens'),
  computerClick:(payload)=>ipcRenderer.invoke('computer:click',payload),
  computerClickAndType:(payload)=>ipcRenderer.invoke('computer:clickAndType',payload),
  browserOpen:(payload)=>ipcRenderer.invoke('browser:open',payload),
  browserNavigate:(url)=>ipcRenderer.invoke('browser:navigate',url),
  browserSetBounds:(bounds)=>ipcRenderer.invoke('browser:setBounds',bounds),
  browserBack:()=>ipcRenderer.invoke('browser:back'),
  browserForward:()=>ipcRenderer.invoke('browser:forward'),
  browserReload:()=>ipcRenderer.invoke('browser:reload'),
  browserClose:()=>ipcRenderer.invoke('browser:close'),
  openAuthUrl:(url)=>ipcRenderer.invoke('auth:openExternal',url),
  onBrowserState:(cb)=>{
    const h=(_e,state)=>cb(state);
    ipcRenderer.on('browser-state',h);
    return()=>ipcRenderer.removeListener('browser-state',h);
  },
  onAppCommand:(cb)=>{
    const h=(_e,command)=>cb(command);
    ipcRenderer.on('app-command',h);
    return()=>ipcRenderer.removeListener('app-command',h);
  },
  onAuthCallback:(cb)=>{
    const h=(_e,url)=>cb(url);
    ipcRenderer.on('auth-callback',h);
    return()=>ipcRenderer.removeListener('auth-callback',h);
  },
  onStatus:(cb)=>{
    const h=(_e,s)=>cb(s);
    ipcRenderer.on('bridge-status',h);
    return()=>ipcRenderer.removeListener('bridge-status',h);
  }
});
