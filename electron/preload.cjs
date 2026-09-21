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
  onStatus:(cb)=>{
    const h=(_e,s)=>cb(s);
    ipcRenderer.on('bridge-status',h);
    return()=>ipcRenderer.removeListener('bridge-status',h);
  }
});
