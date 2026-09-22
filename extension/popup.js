const bridge=document.getElementById('bridge');
const summary=document.getElementById('summary');
const dot=document.getElementById('dot');
const providers=document.getElementById('providers');

function render(status){
  const connected=!!status?.bridgeConnected;
  dot.classList.toggle('good',connected);
  bridge.textContent=connected?'Connected to Free AI':'Free AI desktop is not connected';
  summary.textContent=connected?'Local bridge is ready.':'Open Free AI on this computer, then reconnect.';
  const items=Array.isArray(status?.providers)?status.providers:[];
  providers.innerHTML='';
  if(!items.length){
    const empty=document.createElement('div');
    empty.className='empty';
    empty.textContent='No supported AI tabs detected yet.';
    providers.appendChild(empty);
  }else{
    for(const item of items){
      const row=document.createElement('div');
      row.className='provider';
      const name=document.createElement('span');
      const title=document.createElement('span');
      name.textContent=item.name||item.id||'AI tab';
      title.textContent=item.title||'Connected';
      row.append(name,title);
      providers.appendChild(row);
    }
  }
}

function refresh(){
  chrome.runtime.sendMessage({type:'freeai:getStatus'},status=>{
    if(chrome.runtime.lastError){render(null);return}
    render(status);
  });
}

document.getElementById('rescan').addEventListener('click',()=>{
  chrome.runtime.sendMessage({type:'freeai:rescan'},()=>setTimeout(refresh,120));
});
document.getElementById('reconnect').addEventListener('click',()=>{
  chrome.runtime.sendMessage({type:'freeai:reconnect'},()=>setTimeout(refresh,250));
});

refresh();
setInterval(refresh,1500);
