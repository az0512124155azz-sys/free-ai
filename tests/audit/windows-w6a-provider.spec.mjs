import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w6a');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function clone(value){return JSON.parse(JSON.stringify(value))}
async function connectFakeExtension(state,events){
  let lastError=null;
  for(let attempt=0;attempt<30;attempt++){
    try{
      const ws=await new Promise((resolve,reject)=>{
        const socket=new WebSocket('ws://127.0.0.1:17341',{headers:{Origin:'chrome-extension://freeai-qa'}});
        const timer=setTimeout(()=>{try{socket.close()}catch{};reject(new Error('extension connect timeout'))},1000);
        socket.once('open',()=>{clearTimeout(timer);resolve(socket)});
        socket.once('error',error=>{clearTimeout(timer);reject(error)});
      });
      ws.on('message',raw=>{
        let msg;try{msg=JSON.parse(String(raw))}catch{return}
        events.push(msg);
        if(msg.type==='scanProviders'){
          ws.send(JSON.stringify({type:'providers',providers:clone(state.providers)}));
          return;
        }
        if(msg.type==='scanBrowser'){
          ws.send(JSON.stringify({type:'browserState',state:{
            tabs:state.providers.map(p=>({id:p.tabId,title:p.title,url:p.url||'https://chatgpt.com/'})),
            activeTabId:state.providers[0]?.tabId||null,
            activeWindowId:1
          }}));
          return;
        }
        if(msg.type==='browserRequest'){
          const provider=state.providers.find(p=>Number(p.tabId)===Number(msg.payload?.tabId));
          if(msg.command==='setProviderModel'&&provider){
            provider.modelName=String(msg.payload?.modelName||provider.modelName);
            ws.send(JSON.stringify({type:'browserResponse',id:msg.id,result:{ok:true,modelName:provider.modelName}}));
            return;
          }
          if(msg.command==='setProviderEffort'&&provider){
            provider.activeEffort=String(msg.payload?.effort||provider.activeEffort);
            ws.send(JSON.stringify({type:'browserResponse',id:msg.id,result:{ok:true,effort:provider.activeEffort}}));
            return;
          }
          ws.send(JSON.stringify({type:'browserResponse',id:msg.id,error:'Unsupported QA browserRequest '+msg.command}));
          return;
        }
        if(msg.type==='prompt'){
          const provider=state.providers.find(p=>p.id===msg.provider);
          setTimeout(()=>ws.readyState===WebSocket.OPEN&&ws.send(JSON.stringify({
            type:'response',id:msg.id,text:'QA browser response from '+(provider?.id||msg.provider)
          })),120);
          return;
        }
      });
      ws.send(JSON.stringify({type:'hello',role:'extension'}));
      return ws;
    }catch(error){lastError=error;await new Promise(r=>setTimeout(r,250))}
  }
  throw lastError||new Error('Could not connect fake extension');
}

test('Windows W6A App settings and provider bridge audit',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[],events=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w6a-'));
  const state={providers:[
    {
      id:'chatgpt:101',providerId:'chatgpt',name:'ChatGPT',modelName:'GPT QA',
      tabId:101,title:'QA ChatGPT One',url:'https://chatgpt.com/c/qa-one',
      adapterReady:true,modelOptions:['GPT QA','GPT QA Pro'],
      effortControl:'native',effortLevels:['instant','high'],activeEffort:'instant',
      mcps:['GitHub']
    },
    {
      id:'chatgpt:102',providerId:'chatgpt',name:'ChatGPT',modelName:'GPT QA',
      tabId:102,title:'QA ChatGPT Two',url:'https://chatgpt.com/c/qa-two',
      adapterReady:true,modelOptions:['GPT QA','GPT QA Pro'],
      effortControl:'native',effortLevels:['instant','high'],activeEffort:'instant',
      mcps:['GitHub']
    }
  ]};
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  let extension;
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.addInitScript(()=>{
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({
        appearance:'dark',contrast:'medium',accent:'blue',textSize:100,
        customizationEnabled:true,siteToolsEnabled:true,spellCheckEnabled:true,showBottomPanel:true,approvalMode:'ask'
      }));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea{caret-color:transparent!important}'});

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };
    async function openSettings(section){
      if(await page.locator('.settingsScreen').count()===0){
        await page.locator('.profileButton').click();
        await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
      }
      await page.locator('.settingsNav').getByRole('button',{name:section,exact:true}).click();
      await expect(page.locator('.settingsContentTop h1')).toHaveText(section);
    }
    async function closeSettings(){
      if(await page.locator('.settingsScreen').count())await page.getByRole('button',{name:'Close settings'}).click();
    }

    await record('App Settings renders real Windows metadata',async()=>{
      await openSettings('App');
      const pane=page.locator('.settingsPane');
      await expect(pane).toContainText('Windows app');
      await expect(pane).toContainText('0.6.0');
      await expect(pane).toContainText('Development build');
      await expect(page.getByRole('button',{name:'Check for updates'})).toBeVisible();
      return 'Version 0.6.0, build type, protocol status, and update control rendered';
    },'01-app-settings.png');

    await record('Real update check reaches official GitHub Releases',async()=>{
      await page.getByRole('button',{name:'Check for updates'}).click();
      const status=page.locator('.settingsStatus').first();
      await expect(status).toBeVisible({timeout:20000});
      const text=String(await status.textContent()||'');
      expect(text).toMatch(/latest published release|Version .* is available/i);
      if(/Could not|offline|timed out/i.test(text))throw new Error('Update check failed: '+text);
      return text.trim();
    },'02-update-check.png');
    await closeSettings();

    extension=await connectFakeExtension(state,events);

    await record('Browser Bridge connects and preserves per-tab providers',async()=>{
      await expect.poll(async()=>{
        const s=await page.evaluate(()=>window.desktopApi.getStatus());
        return {connected:s.browserExtension?.connected===true,count:s.providers?.filter(p=>p.source==='browser').length||0,tabs:s.browserExtension?.tabCount||0};
      },{timeout:10000}).toEqual({connected:true,count:2,tabs:2});
      const status=await page.evaluate(()=>window.desktopApi.getStatus());
      const ids=status.providers.filter(p=>p.source==='browser').map(p=>p.id).sort();
      expect(ids).toEqual(['chatgpt:101','chatgpt:102']);
      return 'Two browser tabs remain separate provider instances';
    },'03-bridge-connected.png');

    await record('Model picker groups duplicate model tabs without collapsing them',async()=>{
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expect(picker).toBeVisible();
      await expect(picker.locator('.pickerRow')).toHaveCount(2);
      await expect(picker).toContainText('2 matching tabs');
      await picker.locator('.pickerRow').first().click();
      const parallel=picker.getByLabel('Parallel model instances');
      await expect(parallel).toBeVisible();
      await expect(parallel.locator('option')).toHaveCount(2);
      await expect(parallel.locator('option').last()).toHaveText('All 2');
      return 'Both ChatGPT tabs visible and parallel selector offers All 2';
    },'04-model-picker-duplicates.png');

    await record('Refresh requests deep provider model discovery',async()=>{
      const before=events.length;
      await page.getByTitle('Refresh connected models').click();
      await expect.poll(()=>events.slice(before).some(e=>e.type==='scanProviders'&&e.probeModels===true),{timeout:5000}).toBe(true);
      return 'scanProviders(probeModels=true) sent to extension';
    },'05-model-refresh.png');

    await record('Provider model selection targets the exact browser tab',async()=>{
      const picker=page.getByRole('listbox',{name:'Select model'});
      const first=picker.getByRole('option',{name:/GPT QA/}).first();
      await first.click();
      if(await picker.count()===0)await page.locator('.modelButton').click();
      const providerSelect=page.getByLabel('Provider model');
      await expect(providerSelect).toBeVisible();
      const before=events.length;
      await providerSelect.selectOption('GPT QA Pro');
      await expect.poll(()=>events.slice(before).some(e=>
        e.type==='browserRequest'&&e.command==='setProviderModel'&&Number(e.payload?.tabId)===101&&e.payload?.modelName==='GPT QA Pro'
      ),{timeout:5000}).toBe(true);
      await expect(page.locator('.modelButton')).toContainText('GPT QA Pro',{timeout:5000});
      return 'setProviderModel targeted Tab 101 and UI updated';
    },'06-provider-model-switch.png');

    await record('Native effort selection targets selected browser tab',async()=>{
      const effortButton=page.locator('.effortButton');
      await expect(effortButton).toBeVisible();
      await effortButton.click();
      const slider=page.getByLabel('Reasoning effort');
      await expect(slider).toBeVisible();
      const before=events.length;
      await slider.fill('1');
      await expect.poll(()=>events.slice(before).some(e=>
        e.type==='browserRequest'&&e.command==='setProviderEffort'&&Number(e.payload?.tabId)===101&&e.payload?.effort==='high'
      ),{timeout:5000}).toBe(true);
      await expect(effortButton).toContainText('High',{timeout:5000});
      return 'setProviderEffort(high) targeted Tab 101';
    },'07-provider-effort.png');

    await record('Parallel chat routes to both exact provider instances',async()=>{
      // Return first tab to the same model group, then choose All 2.
      let picker=page.getByRole('listbox',{name:'Select model'});
      if(await picker.count()===0)await page.locator('.modelButton').click();
      picker=page.getByRole('listbox',{name:'Select model'});
      await picker.getByLabel('Provider model').selectOption('GPT QA');
      await expect(page.locator('.modelButton')).toContainText('GPT QA',{timeout:5000});
      if(await picker.count()===0)await page.locator('.modelButton').click();
      const parallel=page.getByLabel('Parallel model instances');
      await parallel.selectOption('2');
      await page.keyboard.press('Escape');
      const before=events.length;
      await page.locator('.gptComposer textarea').fill('parallel-provider-routing');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.locator('.chatMessage.assistant')).toHaveCount(2,{timeout:12000});
      await expect(page.locator('.chatMessage.assistant').nth(0)).toContainText(/chatgpt:10[12]/);
      await expect(page.locator('.chatMessage.assistant').nth(1)).toContainText(/chatgpt:10[12]/);
      const prompts=events.slice(before).filter(e=>e.type==='prompt'&&e.text==='parallel-provider-routing');
      expect(prompts.map(p=>p.provider).sort()).toEqual(['chatgpt:101','chatgpt:102']);
      return 'One prompt routed independently to chatgpt:101 and chatgpt:102';
    },'08-parallel-provider-responses.png');

    await record('Bridge disconnect keeps inventory as reconnecting instead of deleting it',async()=>{
      extension.close();
      extension=null;
      await expect.poll(async()=>{
        const s=await page.evaluate(()=>window.desktopApi.getStatus());
        const rows=s.providers.filter(p=>p.source==='browser');
        return {extension:s.extension,count:rows.length,connected:rows.map(p=>p.connected)};
      },{timeout:8000}).toEqual({extension:false,count:2,connected:[false,false]});
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expect(picker.locator('.pickerRow')).toHaveCount(2);
      await expect(picker).toContainText('reconnecting');
      return 'Two remembered provider rows stayed visible as reconnecting';
    },'09-bridge-reconnecting.png');

    await record('Bridge reconnect restores remembered providers',async()=>{
      await page.keyboard.press('Escape');
      extension=await connectFakeExtension(state,events);
      await expect.poll(async()=>{
        const s=await page.evaluate(()=>window.desktopApi.getStatus());
        return s.providers.filter(p=>p.source==='browser').every(p=>p.connected===true)&&s.extension===true;
      },{timeout:8000}).toBe(true);
      return 'Provider inventory returned to connected state after extension reconnect';
    },'10-bridge-reconnected.png');

    await fs.writeFile(path.join(out,'bridge-events.json'),JSON.stringify(events,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    try{extension?.close()}catch{}
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
