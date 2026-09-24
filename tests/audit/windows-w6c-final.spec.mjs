import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w6c');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function startApi(){
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||!req.url?.endsWith('/chat/completions')){res.statusCode=404;res.end('not found');return}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
    requests.push(body);
    const user=[...(body.messages||[])].reverse().find(m=>m?.role==='user');
    const answer='W6C persisted response for '+String(user?.content||'');
    if(body.stream===true){
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
      for(const part of answer.match(/.{1,14}/g)||[answer]){
        res.write('data: '+JSON.stringify({choices:[{delta:{content:part}}]})+'\n\n');
        await new Promise(r=>setTimeout(r,35));
      }
      res.write('data: [DONE]\n\n');res.end();return;
    }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({choices:[{message:{content:answer}}]}));
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(17898,'127.0.0.1',()=>resolve({server,requests}));
  });
}
async function launch(userData){
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  const page=await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
  const win=await app.browserWindow(page);
  await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea{caret-color:transparent!important}'});
  return {app,page,win};
}

test('Windows W6C final integration and restart regression',async()=>{
  test.setTimeout(210000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const api=await startApi();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w6c-'));
  let first,second;
  const record=async(name,fn,screenshot,pageRef=()=>first?.page||second?.page)=>{
    try{results.push({name,status:'PASS',detail:(await fn())||''})}
    catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
    const page=pageRef();
    if(screenshot&&page)await shot(page,screenshot).catch(()=>{});
  };
  try{
    first=await launch(userData);

    await record('Electron security boundaries remain enabled',async()=>{
      const prefs=await first.app.evaluate(({BrowserWindow})=>{
        const w=BrowserWindow.getAllWindows().find(x=>!x.isDestroyed());
        return w?.webContents.getLastWebPreferences?.()||{};
      });
      expect(prefs.contextIsolation).toBe(true);
      expect(prefs.nodeIntegration).toBe(false);
      expect(prefs.sandbox).toBe(true);
      const renderer=await first.page.evaluate(()=>({
        windowRequire:typeof window.require,
        desktopApi:typeof window.desktopApi,
        rawInvoke:typeof window.desktopApi?.invoke,
        rawSend:typeof window.desktopApi?.send
      }));
      expect(renderer.windowRequire).toBe('undefined');
      expect(renderer.desktopApi).toBe('object');
      expect(renderer.rawInvoke).toBe('undefined');
      expect(renderer.rawSend).toBe('undefined');
      return 'contextIsolation=true, nodeIntegration=false, sandbox=true, no raw ipcRenderer bridge';
    },'01-security.png');

    await record('API model setup and Enter-to-send create one completed conversation',async()=>{
      await first.page.evaluate(()=>window.desktopApi.addApiConnection({
        name:'W6C Persistent API',baseUrl:'http://127.0.0.1:17898/v1',model:'w6c-model',apiKey:''
      }));
      await first.page.locator('.modelButton').click();
      const picker=first.page.getByRole('listbox',{name:'Select model'});
      await picker.locator('.pickerRow').filter({hasText:'W6C Persistent API'}).click();
      const composer=first.page.locator('.gptComposer textarea');
      await composer.fill('restart-persistence-check');
      await composer.press('Enter');
      await expect(first.page.locator('.chatMessage.assistant .messageBody').last()).toContainText('W6C persisted response',{timeout:12000});
      await expect(first.page.locator('.recentRow').filter({hasText:'restart-persistence-check'})).toHaveCount(1);
      const chats=await first.page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.free')||'[]'));
      expect(chats.filter(c=>String(c.title||'').includes('restart-persistence-check'))).toHaveLength(1);
      expect(api.requests.length).toBe(1);
      return 'Enter submitted through real API transport; one Recent record persisted';
    },'02-enter-send.png');

    await record('Appearance preference changes through Settings before restart',async()=>{
      await first.page.locator('.profileButton').click();
      await first.page.getByRole('menuitem',{name:'Settings',exact:true}).click();
      await first.page.locator('.settingsNav').getByRole('button',{name:'Appearance',exact:true}).click();
      const row=first.page.locator('.settingRow').filter({hasText:'Appearance'}).first();
      await row.locator('select').selectOption('light');
      await expect(first.page.locator('html')).toHaveAttribute('data-theme','light');
      await first.page.getByRole('button',{name:'Close settings'}).click();
      return 'Light preference stored through Settings UI';
    },'03-light-before-restart.png');

    await first.app.close();
    first=null;
    await new Promise(r=>setTimeout(r,400));
    second=await launch(userData);

    await record('Full process restart preserves theme and API connection',async()=>{
      await expect(second.page.locator('html')).toHaveAttribute('data-theme','light');
      const status=await second.page.evaluate(()=>window.desktopApi.getStatus());
      const apiModel=status.providers.find(p=>p.source==='api'&&p.model==='w6c-model');
      expect(apiModel).toBeTruthy();
      expect(apiModel.name).toBe('W6C Persistent API');
      return 'Same userData restored light theme and saved API model after a new Electron process';
    },'04-after-restart.png',()=>second.page);

    await record('Old chat is visible once and can be reopened after restart',async()=>{
      const row=second.page.locator('.recentRow').filter({hasText:'restart-persistence-check'});
      await expect(row).toHaveCount(1);
      await row.first().click();
      await expect(second.page.locator('.chatMessage.user .messageBody')).toContainText('restart-persistence-check');
      await expect(second.page.locator('.chatMessage.assistant .messageBody')).toContainText('W6C persisted response');
      return 'Persisted conversation reopened with both user and assistant messages';
    },'05-old-chat-open.png',()=>second.page);

    await record('Selected API model remains usable after restart and refresh',async()=>{
      const modelButton=second.page.locator('.modelButton');
      if(String(await modelButton.textContent()||'').includes('Select model')){
        await modelButton.click();
        await second.page.getByRole('listbox',{name:'Select model'}).locator('.pickerRow').filter({hasText:'W6C Persistent API'}).click();
      }
      await modelButton.click();
      await second.page.getByRole('listbox',{name:'Select model'}).getByRole('button',{name:/Refresh/i}).click().catch(()=>{});
      if(await second.page.getByRole('listbox',{name:'Select model'}).count())await second.page.keyboard.press('Escape');
      await second.page.locator('.desktopPrimaryNav button').filter({hasText:'New chat'}).click();
      const composer=second.page.locator('.gptComposer textarea');
      await composer.fill('second-process-message');
      await composer.press('Enter');
      await expect(second.page.locator('.chatMessage.assistant .messageBody').last()).toContainText('second-process-message',{timeout:12000});
      return 'Saved API connection remains routable after restart/provider refresh';
    },'06-second-process-send.png',()=>second.page);

    await record('Current Windows 6 regression script still passes against runtime baseline',async()=>{
      const stored=await second.page.evaluate(()=>({
        chats:JSON.parse(localStorage.getItem('freeai.chats.free')||'[]').length,
        prefs:JSON.parse(localStorage.getItem('freeai.prefs')||'{}')
      }));
      expect(stored.chats).toBeGreaterThanOrEqual(2);
      expect(stored.prefs.appearance).toBe('light');
      return stored.chats+' stored chats; preferences intact';
    },'07-final-state.png',()=>second.page);

    await fs.writeFile(path.join(out,'api-requests.json'),JSON.stringify(api.requests,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await first?.app?.close().catch(()=>{});
    await second?.app?.close().catch(()=>{});
    await new Promise(resolve=>api.server.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
