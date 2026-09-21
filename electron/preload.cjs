const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopApi',{
 getStatus:()=>ipcRenderer.invoke('bridge:getStatus'),
 sendPrompt:(m)=>ipcRenderer.invoke('bridge:sendPrompt',m),
 configureRelay:(c)=>ipcRenderer.invoke('bridge:configureRelay',c),
 onStatus:(cb)=>{const h=(_e,s)=>cb(s);ipcRenderer.on('bridge-status',h);return()=>ipcRenderer.removeListener('bridge-status',h)}
});