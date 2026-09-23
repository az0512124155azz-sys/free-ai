import {WebSocketServer} from 'ws';

const port=Number(process.env.PORT||8787);
const wss=new WebSocketServer({port});
const rooms=new Map();

function validKey(key){
  return typeof key==='string'&&key.length>=32&&key.length<=256;
}

function room(key){
  if(!rooms.has(key)) rooms.set(key,{
    desktop:null,
    mobiles:new Set(),
    providerStatus:null,
    pending:new Map()
  });
  return rooms.get(key);
}

function send(ws,msg){
  if(ws&&ws.readyState===1){
    try{ws.send(JSON.stringify(msg))}catch{}
  }
}

wss.on('connection',ws=>{
  let ctx=null;
  ws.isAlive=true;

  ws.on('pong',()=>{ws.isAlive=true});

  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}

    if(m.type==='hello'){
      if(!validKey(m.key)||!['desktop','mobile'].includes(m.role)){
        ws.close(1008,'Invalid pairing');
        return;
      }
      ctx={key:m.key,role:m.role};
      const r=room(m.key);

      if(m.role==='desktop'){
        if(r.desktop&&r.desktop!==ws){
          try{r.desktop.close(1000,'Replaced by a new desktop connection')}catch{}
        }
        r.desktop=ws;
      }else{
        r.mobiles.add(ws);
      }

      send(ws,{
        type:'ready',
        desktopOnline:!!r.desktop,
        providerStatus:r.providerStatus
      });

      if(m.role==='mobile'&&r.desktop){
        send(r.desktop,{type:'getProviderStatus'});
      }
      return;
    }

    if(!ctx)return;
    const r=room(ctx.key);

    if(ctx.role==='mobile'&&m.type==='getProviderStatus'){
      if(r.desktop)send(r.desktop,{type:'getProviderStatus'});
      else send(ws,{type:'providerStatus',extension:false,relay:true,providers:[]});
      return;
    }

    if(ctx.role==='mobile'&&m.type==='prompt'){
      if(!m.id||typeof m.id!=='string')return;
      if(!r.desktop){
        send(ws,{type:'response',id:m.id,error:'Paired desktop is offline.'});
        return;
      }
      r.pending.set(m.id,ws);
      send(r.desktop,{...m,requestId:m.requestId||m.id});
      return;
    }

    if(ctx.role==='mobile'&&m.type==='cancel'){
      const id=String(m.id||m.requestId||'');
      if(!id||r.pending.get(id)!==ws)return;
      if(r.desktop)send(r.desktop,{type:'cancel',id,requestId:id});
      r.pending.delete(id);
      return;
    }

    if(ctx.role==='desktop'&&m.type==='providerStatus'){
      r.providerStatus=m;
      for(const mobile of r.mobiles)send(mobile,m);
      return;
    }

    if(ctx.role==='desktop'&&m.type==='stream'){
      const target=r.pending.get(m.id);
      if(target)send(target,{type:'stream',id:m.id,text:String(m.text||'')});
      return;
    }

    if(ctx.role==='desktop'&&m.type==='response'){
      const target=r.pending.get(m.id);
      if(target){
        send(target,m);
        r.pending.delete(m.id);
      }
    }
  });

  ws.on('close',()=>{
    if(!ctx)return;
    const r=rooms.get(ctx.key);
    if(!r)return;

    if(ctx.role==='desktop'&&r.desktop===ws){
      r.desktop=null;
      r.providerStatus=null;
      for(const [id,mobile] of r.pending){
        send(mobile,{type:'response',id,error:'Paired desktop disconnected.'});
      }
      r.pending.clear();
      for(const mobile of r.mobiles){
        send(mobile,{type:'providerStatus',extension:false,relay:true,providers:[]});
      }
    }else{
      r.mobiles.delete(ws);
      for(const [id,target] of r.pending){
        if(target===ws)r.pending.delete(id);
      }
    }

    if(!r.desktop&&r.mobiles.size===0)rooms.delete(ctx.key);
  });
});

const heartbeat=setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.isAlive===false){
      ws.terminate();
      continue;
    }
    ws.isAlive=false;
    try{ws.ping()}catch{}
  }
},30000);

wss.on('close',()=>clearInterval(heartbeat));
console.log(`Free AI relay listening on ${port}`);
