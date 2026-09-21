import {WebSocketServer} from 'ws';
const port=Number(process.env.PORT||8787);
const wss=new WebSocketServer({port});
const rooms=new Map();
function room(key){if(!rooms.has(key))rooms.set(key,{desktop:null,mobiles:new Set()});return rooms.get(key)}
function send(ws,msg){if(ws&&ws.readyState===1)ws.send(JSON.stringify(msg))}
wss.on('connection',ws=>{let ctx=null;ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='hello'){if(!m.key||!['desktop','mobile'].includes(m.role))return ws.close();ctx={key:m.key,role:m.role};const r=room(m.key);if(m.role==='desktop'){if(r.desktop&&r.desktop!==ws)try{r.desktop.close()}catch{};r.desktop=ws}else r.mobiles.add(ws);send(ws,{type:'ready',desktopOnline:!!r.desktop});return}if(!ctx)return;const r=room(ctx.key);if(ctx.role==='mobile'&&m.type==='prompt'){if(!r.desktop)return send(ws,{type:'response',id:m.id,error:'Paired desktop is offline.'});r.desktop.send(JSON.stringify(m));return}if(ctx.role==='desktop'&&m.type==='response'){for(const mobile of r.mobiles)send(mobile,m);}});ws.on('close',()=>{if(!ctx)return;const r=rooms.get(ctx.key);if(!r)return;if(ctx.role==='desktop'&&r.desktop===ws)r.desktop=null;else r.mobiles.delete(ws);if(!r.desktop&&r.mobiles.size===0)rooms.delete(ctx.key)});});
console.log(`Free AI relay listening on ${port}`);