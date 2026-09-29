import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';
import { WebSocket } from 'ws';

const out=path.resolve('artifacts/windows-visual/bridge-e2e');
const generatedPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';

async function connectFakeExtension(tabId=4242){
  const provider={
    id:'chatgpt:'+tabId,
    providerId:'chatgpt',
    name:'ChatGPT',
    model:'GPT Runtime',
    modelName:'GPT Runtime',
    source:'browser',
    tabId,
    windowId:7,
    title:'ChatGPT Runtime QA',
    url:'https://chatgpt.com/',
    adapterReady:true,
    adapterIssue:'',
    fileUpload:true,
    mcps:['Gmail'],
    effortLevels:['instant','high'],
    effortControl:'native',
    activeEffort:'instant',
    modelOptions:['GPT Runtime']
  };
  let ws;
  let lastPrompt=null;
  for(let attempt=0;attempt<40;attempt++){
    try{
      ws=await new Promise((resolve,reject)=>{
        const socket=new WebSocket('ws://127.0.0.1:17341',{headers:{Origin:'chrome-extension://freeai-runtime-qa'}});
        const timer=setTimeout(()=>{try{socket.terminate()}catch{};reject(new Error('bridge connect timeout'))},700);
        socket.once('open',()=>{clearTimeout(timer);resolve(socket)});
        socket.once('error',error=>{clearTimeout(timer);reject(error)});
      });
      break;
    }catch{
      await new Promise(resolve=>setTimeout(resolve,150));
    }
  }
  if(!ws)throw new Error('Could not connect the fake Browser Bridge extension to Free AI.');
  const send=value=>ws.readyState===WebSocket.OPEN&&ws.send(JSON.stringify(value));
  ws.on('message',raw=>{
    let message;try{message=JSON.parse(String(raw))}catch{return}
    if(message.type==='scanProviders'){
      send({type:'providers',providers:[provider]});
      return;
    }
    if(message.type==='scanBrowser'){
      send({type:'browserState',state:{tabs:[],activeTabId:null,activeWindowId:null}});
      return;
    }
    if(message.type==='prompt'){
      lastPrompt=message;
      setTimeout(()=>send({
        type:'response',
        id:message.id,
        text:'Bridge end-to-end response',
        media:[{
          kind:'image',
          name:'Generated bridge image',
          mime:'image/png',
          width:256,
          height:256,
          dataUrl:generatedPng
        }],
        sources:[]
      }),120);
    }
  });
  send({type:'hello',role:'extension',browserUseVersion:2});
  send({type:'providers',providers:[provider]});
  return {
    provider,
    socket:ws,
    getLastPrompt:()=>lastPrompt,
    close:()=>new Promise(resolve=>{
      if(ws.readyState===WebSocket.CLOSED){resolve();return}
      const timer=setTimeout(()=>{try{ws.terminate()}catch{};resolve()},1000);
      ws.once('close',()=>{clearTimeout(timer);resolve()});
      ws.close();
    })
  };
}

test('Windows app routes a provider app through the Browser Bridge and restores generated media after restart',async()=>{
  test.skip(process.platform!=='win32','Windows Browser Bridge end-to-end runtime');
  test.setTimeout(120000);
  await fs.mkdir(out,{recursive:true});
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-bridge-e2e-'));
  let app=null;
  let bridge=null;
  try{
    app=await electron.launch({
      args:['.',`--user-data-dir=${userData}`],
      env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
    });
    let page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    bridge=await connectFakeExtension();

    await expect.poll(async()=>{
      await page.locator('.modelButton').click();
      const count=await page.getByRole('listbox',{name:'Select model'}).getByRole('option',{name:/GPT Runtime/}).count();
      if(!count)await page.keyboard.press('Escape');
      return count;
    },{timeout:12000}).toBeGreaterThan(0);

    const picker=page.getByRole('listbox',{name:'Select model'});
    await picker.getByRole('option',{name:/GPT Runtime/}).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modelButton')).toContainText('GPT Runtime');

    await page.locator('.desktopPrimaryNav button').filter({hasText:'Plugins'}).click();
    await expect(page.getByRole('tablist',{name:'Plugin directory sections'}).getByRole('tab',{name:'Directory'})).toHaveAttribute('aria-selected','true');
    const gmailCard=page.locator('.installedPluginButton[title="Gmail"]').first();
    await expect(gmailCard).toBeVisible();
    await gmailCard.click();
    const dialog=page.getByRole('dialog',{name:'Plugin details'});
    await expect(dialog).toContainText('Gmail');
    await dialog.getByRole('button',{name:'Use in Chat'}).click();

    await expect(page.locator('.attachedTool')).toContainText('Gmail');
    const composer=page.locator('.gptComposer textarea');
    await composer.fill('summarize my mail and keep the generated image');
    await page.getByRole('button',{name:'Send message'}).click();

    await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Bridge end-to-end response',{timeout:15000});
    await expect(page.locator('.assistantMediaItem img[alt="Generated bridge image"]')).toBeVisible({timeout:10000});
    await expect.poll(()=>bridge.getLastPrompt()?.toolRequest?.mcp||'').toBe('Gmail');
    await page.screenshot({path:path.join(out,'01-provider-app-response.png')});

    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.free')||'[]'));
    const record=stored.find(chat=>String(chat.title||'').includes('summarize my mail'));
    expect(record).toBeTruthy();
    expect(record.messages.some(message=>Array.isArray(message.media)&&message.media.some(item=>item.storageId&&item.persisted===true))).toBe(true);

    await bridge.close();
    bridge=null;
    await app.close();
    app=null;

    app=await electron.launch({
      args:['.',`--user-data-dir=${userData}`],
      env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
    });
    page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    bridge=await connectFakeExtension(4343);
    await expect.poll(async()=>{
      await page.locator('.modelButton').click();
      const count=await page.getByRole('listbox',{name:'Select model'}).getByRole('option',{name:/GPT Runtime/}).count();
      await page.keyboard.press('Escape').catch(()=>{});
      return count;
    },{timeout:12000}).toBeGreaterThan(0);

    const recent=page.locator('.recentRow').filter({hasText:'summarize my mail'}).first();
    await expect(recent).toBeVisible();
    await recent.locator('.recentItem').click();

    await expect(page.locator('.modelButton')).toContainText('GPT Runtime');
    await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Bridge end-to-end response');
    const restored=page.locator('.assistantMediaItem img[alt="Generated bridge image"]');
    await expect(restored).toBeVisible({timeout:10000});
    await expect(restored).toHaveAttribute('src',/^data:image\/png;base64,/);
    await page.screenshot({path:path.join(out,'02-restored-after-restart.png')});
  }finally{
    if(bridge)await bridge.close().catch(()=>{});
    if(app)await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
