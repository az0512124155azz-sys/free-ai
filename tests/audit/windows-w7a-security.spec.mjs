import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w7a');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function startApi(){
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||!req.url?.endsWith('/chat/completions')){res.statusCode=404;res.end();return}
    const parts=[];for await(const c of req)parts.push(c);
    const body=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
    const row={body,aborted:false,finished:false};
    requests.push(row);
    res.on('close',()=>{if(!row.finished)row.aborted=true});
    const last=String([...(body.messages||[])].reverse().find(m=>m?.role==='user')?.content||'');
    if(last.includes('You are controlling a Free AI Work task.')){
      await new Promise(r=>setTimeout(r,10000));
      if(res.destroyed)return;
      row.finished=true;
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({kind:'complete',message:'Should not survive renderer loss'})}}]}));
      return;
    }
    row.finished=true;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({choices:[{message:{content:'QA'}}]}));
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(17899,'127.0.0.1',()=>resolve({server,requests}));
  });
}
async function bridgeClient(){
  const state={requests:[],promptSeen:false};
  let socket;
  for(let i=0;i<40;i++){
    try{
      socket=new WebSocket('ws://127.0.0.1:17341',{headers:{Origin:'chrome-extension://freeai-w7a'}});
      await new Promise((resolve,reject)=>{
        const t=setTimeout(()=>reject(new Error('bridge timeout')),1000);
        socket.once('open',()=>{clearTimeout(t);resolve()});
        socket.once('error',e=>{clearTimeout(t);reject(e)});
      });
      break;
    }catch(e){
      try{socket?.close()}catch{}
      socket=null;await new Promise(r=>setTimeout(r,200));if(i===39)throw e;
    }
  }
  const providers=[
    {id:'chatgpt:bad',providerId:'chatgpt',name:'ChatGPT',modelName:'Broken Adapter',tabId:401,connected:true,adapterReady:false,adapterIssue:'Provider UI contract changed',modelOptions:['Broken Adapter'],effortLevels:[]},
    {id:'chatgpt:good',providerId:'chatgpt',name:'ChatGPT',modelName:'Healthy Adapter',tabId:402,connected:true,adapterReady:true,modelOptions:['Healthy Adapter'],effortLevels:[]}
  ];
  socket.on('message',raw=>{
    let m;try{m=JSON.parse(String(raw))}catch{return}
    state.requests.push(m);
    if(m.type==='scanProviders'){socket.send(JSON.stringify({type:'providers',providers}));return}
    if(m.type==='scanBrowser'){socket.send(JSON.stringify({type:'browserState',state:{tabs:[],activeTabId:null,activeWindowId:null}}));return}
    if(m.type==='prompt'){state.promptSeen=true;return}
  });
  socket.send(JSON.stringify({type:'hello',role:'extension'}));
  return {socket,state};
}

test('Windows W7A security and failure recovery runtime',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const api=await startApi();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w7a-'));
  const app=await electron.launch({args:['.',`--user-data-dir=${userData}`],env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}});
  let bridge;
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };

    await record('Remote API keys require HTTPS transport',async()=>{
      const error=await page.evaluate(async()=>{
        try{
          await window.desktopApi.addApiConnection({name:'Unsafe Remote',baseUrl:'http://example.com/v1',model:'unsafe',apiKey:'secret'});
          return '';
        }catch(e){return String(e?.message||e)}
      });
      expect(error).toContain('API keys require HTTPS');
      return error;
    },'01-api-transport-blocked.png');

    bridge=await bridgeClient();
    await record('Unhealthy provider adapter is disabled before routing',async()=>{
      await expect.poll(async()=>(await page.evaluate(()=>window.desktopApi.getStatus())).extension,{timeout:8000}).toBe(true);
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      const bad=picker.locator('.pickerRow').filter({hasText:'Broken Adapter'});
      const good=picker.locator('.pickerRow').filter({hasText:'Healthy Adapter'});
      await expect(bad).toBeDisabled();
      await expect(bad).toHaveAttribute('title','Provider UI contract changed');
      await expect(bad).toContainText('adapter unavailable');
      await expect(good).toBeEnabled();
      return 'Broken adapter disabled; healthy adapter remains routable';
    },'02-adapter-health.png');

    await record('Browser Bridge disconnect fails in-flight generation immediately',async()=>{
      const picker=page.getByRole('listbox',{name:'Select model'});
      await picker.locator('.pickerRow').filter({hasText:'Healthy Adapter'}).click();
      const composer=page.locator('.gptComposer textarea');
      await composer.fill('disconnect-mid-generation');
      await composer.press('Enter');
      await expect.poll(()=>bridge.state.promptSeen,{timeout:8000}).toBe(true);
      bridge.socket.close();
      await expect(page.locator('.chatMessage.error .messageBody')).toContainText('Browser extension disconnected during generation',{timeout:8000});
      await expect(page.getByRole('button',{name:'Stop generating'})).toHaveCount(0);
      return 'In-flight browser request failed immediately after bridge disconnect';
    },'03-bridge-disconnect.png');

    await record('Renderer reload aborts renderer-owned Work task',async()=>{
      await page.locator('.desktopPrimaryNav button').filter({hasText:'New chat'}).click();
      await page.evaluate(()=>window.desktopApi.addApiConnection({name:'W7A Work API',baseUrl:'http://127.0.0.1:17899/v1',model:'w7a-work',apiKey:''}));
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await page.locator('.modelButton').click();
      await page.getByRole('listbox',{name:'Select model'}).locator('.pickerRow').filter({hasText:'W7A Work API'}).click();
      await page.locator('.gptComposer textarea').fill('renderer-loss-work');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.locator('.workTaskStatus')).toContainText('Running',{timeout:8000});
      await expect.poll(()=>api.requests.length,{timeout:8000}).toBeGreaterThan(0);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
      await expect.poll(()=>api.requests.some(r=>r.aborted),{timeout:8000}).toBe(true);
      return 'Reload destroyed renderer ownership and aborted active Work transport';
    },'04-renderer-loss.png');

    await fs.writeFile(path.join(out,'bridge-events.json'),JSON.stringify(bridge.state.requests,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    try{bridge?.socket?.close()}catch{}
    await app.close().catch(()=>{});
    await new Promise(resolve=>api.server.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
