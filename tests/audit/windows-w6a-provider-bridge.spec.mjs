import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w6a');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function clone(value){return JSON.parse(JSON.stringify(value))}
function providers(){
  return [
    {
      id:'chatgpt:101',providerId:'chatgpt',name:'ChatGPT',modelName:'GPT-5.6',
      title:'ChatGPT QA A',tabId:101,windowId:1,url:'https://chatgpt.com/c/qa-a',
      source:'browser',connected:true,adapterReady:true,adapterIssue:'',
      modelOptions:['GPT-5.6','GPT-5.6 Pro'],effortLevels:['instant','high','extra-high'],
      activeEffort:'instant',effortControl:'native',fileUpload:true,mcps:['Gmail','Calendar']
    },
    {
      id:'chatgpt:102',providerId:'chatgpt',name:'ChatGPT',modelName:'GPT-5.6',
      title:'ChatGPT QA B',tabId:102,windowId:1,url:'https://chatgpt.com/c/qa-b',
      source:'browser',connected:true,adapterReady:true,adapterIssue:'',
      modelOptions:['GPT-5.6','GPT-5.6 Pro'],effortLevels:['instant','high','extra-high'],
      activeEffort:'instant',effortControl:'native',fileUpload:true,mcps:['Gmail','Calendar']
    },
    {
      id:'claude:201',providerId:'claude',name:'Claude',modelName:'Claude Sonnet 4.5',
      title:'Claude QA',tabId:201,windowId:1,url:'https://claude.ai/chat/qa',
      source:'browser',connected:true,adapterReady:true,adapterIssue:'',
      modelOptions:['Claude Sonnet 4.5','Claude Opus 4.1'],effortLevels:['medium','high'],
      activeEffort:'medium',effortControl:'native',fileUpload:true,mcps:['Google Drive']
    }
  ];
}
async function startBridge(){
  const state={providers:providers(),requests:[],prompts:[]};
  let socket;
  for(let i=0;i<40;i++){
    try{
      socket=new WebSocket('ws://127.0.0.1:17341',{headers:{Origin:'chrome-extension://freeai-qa'}});
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('bridge connect timeout')),1200);
        socket.once('open',()=>{clearTimeout(timer);resolve()});
        socket.once('error',error=>{clearTimeout(timer);reject(error)});
      });
      break;
    }catch(error){
      try{socket?.close()}catch{}
      socket=null;
      await new Promise(r=>setTimeout(r,200));
      if(i===39)throw error;
    }
  }
  socket.on('message',raw=>{
    let m;try{m=JSON.parse(String(raw))}catch{return}
    state.requests.push(m);
    if(m.type==='scanProviders'){
      socket.send(JSON.stringify({type:'providers',providers:clone(state.providers)}));
      return;
    }
    if(m.type==='scanBrowser'){
      socket.send(JSON.stringify({type:'browserState',state:{
        tabs:state.providers.map(p=>({id:p.tabId,windowId:p.windowId,active:p.tabId===101,title:p.title,url:p.url,favIconUrl:'',controlled:true})),
        activeTabId:101,activeWindowId:1
      }}));
      return;
    }
    if(m.type==='browserRequest'){
      const cmd=String(m.command||'');
      const payload=m.payload||{};
      if(cmd==='setProviderModel'){
        const row=state.providers.find(p=>Number(p.tabId)===Number(payload.tabId));
        if(row)row.modelName=String(payload.modelName||row.modelName);
      }
      if(cmd==='setProviderEffort'){
        const row=state.providers.find(p=>Number(p.tabId)===Number(payload.tabId));
        if(row)row.activeEffort=String(payload.effort||row.activeEffort);
      }
      socket.send(JSON.stringify({type:'browserResponse',id:m.id,result:{ok:true,command:cmd}}));
      if(cmd==='setProviderModel'||cmd==='setProviderEffort'){
        setTimeout(()=>socket.send(JSON.stringify({type:'providers',providers:clone(state.providers)})),60);
      }
      return;
    }
    if(m.type==='prompt'){
      state.prompts.push(m);
      const text='Bridge QA response from '+String(m.provider||'unknown')+' using '+String(m.effort||'default');
      socket.send(JSON.stringify({type:'stream',id:m.id,text:'Bridge QA'}));
      setTimeout(()=>socket.send(JSON.stringify({type:'stream',id:m.id,text:text})),60);
      setTimeout(()=>socket.send(JSON.stringify({type:'response',id:m.id,text})),120);
      return;
    }
    if(m.type==='cancel')return;
  });
  socket.send(JSON.stringify({type:'hello',role:'extension',browserUseVersion:2}));
  return {socket,state};
}

test('Windows W6A provider bridge runtime',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w6a-'));
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  let bridge;
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.addInitScript(()=>{
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({
        appearance:'dark',contrast:'medium',accent:'blue',textSize:100,
        customizationEnabled:true,siteToolsEnabled:true,spellCheckEnabled:true,
        showBottomPanel:true,approvalMode:'ask'
      }));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea{caret-color:transparent!important}'});

    bridge=await startBridge();

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };

    await record('Desktop recognizes Browser Bridge and three provider tabs',async()=>{
      await expect.poll(async()=>{
        const s=await page.evaluate(()=>window.desktopApi.getStatus());
        return {extension:s.extension,count:s.providers.filter(p=>p.source==='browser').length};
      },{timeout:10000}).toEqual({extension:true,count:3});
      await expect(page.locator('.modelButton')).toContainText('Select model');
      return 'Bridge connected with 2 ChatGPT tabs + 1 Claude tab; no model is auto-selected';
    },'01-bridge-connected.png');

    await record('Model picker exposes tab-aware duplicate provider instances',async()=>{
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expect(picker).toBeVisible();
      const chatgptRows=picker.locator('.pickerRow').filter({hasText:'GPT-5.6'});
      await expect(chatgptRows).toHaveCount(2);
      await expect(picker).toContainText('2 matching tabs');
      await expect(picker.locator('.pickerRow').filter({hasText:'Claude Sonnet 4.5'})).toHaveCount(1);
      await chatgptRows.first().click();
      await expect(page.locator('.modelButton')).toContainText('GPT-5.6');
      return 'Duplicate model tabs remain separate routable instances; first ChatGPT tab selected';
    },'02-model-picker-tabs.png');

    await record('Parallel instances control reaches All 2',async()=>{
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expect(picker.getByLabel('Parallel model instances')).toBeVisible();
      await picker.getByLabel('Parallel model instances').selectOption('2');
      await expect(picker.getByLabel('Parallel model instances')).toHaveValue('2');
      return 'Parallel count set to both ChatGPT tabs';
    },'03-parallel-two.png');

    await record('Native provider model switch travels through Browser Bridge',async()=>{
      const picker=page.getByRole('listbox',{name:'Select model'});
      const select=picker.getByLabel('Provider model');
      await expect(select).toBeVisible();
      await select.selectOption('GPT-5.6 Pro');
      await expect.poll(()=>bridge.state.requests.some(r=>r.type==='browserRequest'&&r.command==='setProviderModel'&&r.payload?.modelName==='GPT-5.6 Pro'),{timeout:8000}).toBe(true);
      await expect.poll(async()=>{
        const s=await page.evaluate(()=>window.desktopApi.getStatus());
        return s.providers.find(p=>p.id==='chatgpt:101')?.modelName;
      }).toBe('GPT-5.6 Pro');
      await page.keyboard.press('Escape');
      return 'setProviderModel sent for the selected ChatGPT tab and status refreshed';
    },'04-provider-model-switched.png');

    await record('Native reasoning effort switch travels through Browser Bridge',async()=>{
      const button=page.locator('.effortButton');
      await expect(button).toBeVisible({timeout:8000});
      await button.click();
      const slider=page.getByLabel('Reasoning effort');
      await expect(slider).toBeVisible();
      await slider.fill('2');
      await expect.poll(()=>bridge.state.requests.some(r=>r.type==='browserRequest'&&r.command==='setProviderEffort'&&r.payload?.effort==='extra-high'),{timeout:8000}).toBe(true);
      await expect.poll(async()=>{
        const s=await page.evaluate(()=>window.desktopApi.getStatus());
        return s.providers.find(p=>p.id==='chatgpt:101')?.activeEffort;
      }).toBe('extra-high');
      return 'setProviderEffort(extra-high) completed through bridge';
    },'05-provider-effort.png');

    await record('Browser provider prompt streams and completes in Chat',async()=>{
      const composer=page.locator('.gptComposer textarea');
      await composer.fill('bridge-runtime-chat');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Bridge QA response from chatgpt:101',{timeout:12000});
      await expect.poll(()=>bridge.state.prompts.filter(p=>p.provider==='chatgpt:101').length).toBeGreaterThanOrEqual(1);
      return 'Renderer -> Electron -> Browser Bridge -> provider response path completed';
    },'06-browser-provider-chat.png');

    await record('Provider hints from Bridge appear separately in Plugins',async()=>{
      await page.locator('.desktopPrimaryNav button').filter({hasText:'Plugins'}).click();
      await page.getByRole('tab',{name:'Provider hints',exact:true}).click();
      await expect(page.getByText('Gmail',{exact:true}).first()).toBeVisible();
      await expect(page.getByText('Calendar',{exact:true}).first()).toBeVisible();
      await expect(page.getByText('Google Drive',{exact:true}).first()).toBeVisible();
      await expect(page.getByText(/unverified/i).first()).toBeVisible();
      return 'Provider-managed hints are visible and labeled unverified';
    },'07-provider-hints.png');

    await record('Super AI automatically includes all healthy browser providers',async()=>{
      await page.getByRole('button',{name:/Back to app/}).click();
      await page.getByRole('button',{name:/Switch product\. Current: Free AI/}).first().click();
      await page.getByRole('menu',{name:'Product'}).getByRole('menuitemradio',{name:/Super AI/}).click();
      await expect(page.locator('.modelButton')).toHaveCount(0);
      await expect(page.locator('.teamButton')).toContainText('All AI · 3');
      await page.locator('.teamButton').click();
      const dialog=page.getByRole('dialog',{name:'Super AI automatic team'});
      await expect(dialog.locator('.teamControllerChoice')).toHaveCount(3);
      await expect(dialog).toContainText('Every available AI participates automatically');
      return 'All 3 healthy provider tabs are included automatically';
    },'08-super-team.png');

    await record('Bridge disconnect marks browser models unavailable without crashing UI',async()=>{
      bridge.socket.close();
      await expect.poll(async()=>{
        const s=await page.evaluate(()=>window.desktopApi.getStatus());
        return s.extension;
      },{timeout:8000}).toBe(false);
      await page.getByRole('button',{name:'Close team picker'}).click();
      await page.getByRole('button',{name:/Switch product\. Current: Super AI/}).first().click();
      await page.getByRole('menu',{name:'Product'}).getByRole('menuitemradio',{name:/Free AI/}).click();
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expect(picker.locator('.pickerRow').filter({hasText:'GPT-5.6'}).first()).toBeDisabled();
      return 'Disconnected bridge disables stale browser model choices';
    },'09-bridge-disconnected.png');

    await fs.writeFile(path.join(out,'bridge-requests.json'),JSON.stringify(bridge.state.requests,null,2));
    await fs.writeFile(path.join(out,'bridge-prompts.json'),JSON.stringify(bridge.state.prompts,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    try{bridge?.socket?.close()}catch{}
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
