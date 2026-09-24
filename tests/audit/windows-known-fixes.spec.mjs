import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-known-fixes');
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
    const last=[...(body.messages||[])].reverse().find(m=>m?.role==='user');
    const answer='Known-fix QA response for '+String(last?.content||'');
    if(body.stream===true){
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
      for(const piece of answer.match(/.{1,10}/g)||[answer]){
        res.write('data: '+JSON.stringify({choices:[{delta:{content:piece}}]})+'\n\n');
        await new Promise(r=>setTimeout(r,35));
      }
      res.write('data: [DONE]\n\n');res.end();return;
    }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({choices:[{message:{content:answer}}]}));
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(17895,'127.0.0.1',()=>resolve({server,requests}));
  });
}

test('Windows known W2/W3 regressions are fixed',async()=>{
  test.setTimeout(150000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const {server,requests}=await startApi();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-knownfix-'));
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
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

    await record('Settings App section renders real Windows content',async()=>{
      await openSettings('App');
      const pane=page.locator('.settingsPane');
      await expect(pane).toBeVisible();
      await expect(pane).toContainText('Windows app');
      await expect(pane).toContainText('Version');
      await expect(page.getByRole('button',{name:'Check for updates'})).toBeVisible();
      return 'App section is no longer blank';
    },'01-app-section.png');

    await record('Invalid API model shows clean validation, not raw IPC internals',async()=>{
      await openSettings('Connections');
      await page.getByRole('button',{name:'Add API model'}).click();
      const error=page.locator('.formError');
      await expect(error).toBeVisible();
      const text=String(await error.textContent()||'');
      expect(text).toContain('Base URL and model are required.');
      expect(text).not.toMatch(/Error invoking remote method|api:addConnection/i);
      return text.trim();
    },'02-clean-api-validation.png');

    await record('API display name is used in model UI',async()=>{
      await page.evaluate(()=>window.desktopApi.addApiConnection({
        name:'QA Display Name',baseUrl:'http://127.0.0.1:17895/v1',model:'qa-model-id',apiKey:''
      }));
      await page.getByRole('button',{name:'Close settings'}).click();
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      const row=picker.locator('.pickerRow').filter({hasText:'QA Display Name'}).first();
      await expect(row).toBeVisible();
      await expect(row.locator('.pickerText b')).toHaveText('QA Display Name');
      await expect(row.locator('.pickerText small')).toContainText('qa-model-id');
      await row.click();
      await expect(page.locator('.modelButton')).toContainText('QA Display Name');
      return 'Display name wins over raw API model ID';
    },'03-api-display-name.png');

    await record('One completed chat creates exactly one Recent record',async()=>{
      const composer=page.locator('.gptComposer textarea');
      await composer.fill('single-recent-regression');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.getByRole('button',{name:'Copy response'}).last()).toBeVisible({timeout:12000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Known-fix QA response');
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.free')||'[]'));
      const matches=stored.filter(chat=>String(chat.title||'').includes('single-recent-regression'));
      expect(matches).toHaveLength(1);
      await expect(page.locator('.recentRow').filter({hasText:'single-recent-regression'})).toHaveCount(1);
      expect(requests.length).toBe(1);
      return 'Initial and final saves share chat ID '+matches[0].id;
    },'04-single-recent.png');

    await record('Windows data export uses native Save As and writes valid JSON',async()=>{
      const savePath=path.join(out,'free-ai-export.json');
      await app.evaluate(({dialog},target)=>{
        dialog.showSaveDialog=()=>Promise.resolve({canceled:false,filePath:target});
      },savePath);
      expect(await page.evaluate(()=>typeof window.desktopApi?.saveDataFile)).toBe('function');
      const probe=await page.evaluate(()=>window.desktopApi.saveDataFile({defaultName:'probe.json',content:'{"probe":true}'}));
      expect(probe?.saved).toBe(true);
      expect(JSON.parse(await fs.readFile(savePath,'utf8')).probe).toBe(true);
      await openSettings('Data controls');
      await page.getByRole('button',{name:'Export',exact:true}).click();
      await expect.poll(async()=>{
        try{return JSON.parse(await fs.readFile(savePath,'utf8')).product}catch{return ''}
      },{timeout:8000}).toBe('Free AI');
      const exported=JSON.parse(await fs.readFile(savePath,'utf8'));
      expect(Array.isArray(exported.chats.free)).toBe(true);
      expect(exported.chats.free.filter(chat=>String(chat.title||'').includes('single-recent-regression'))).toHaveLength(1);
      return 'Native export wrote '+savePath;
    },'05-native-data-export.png');

    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await new Promise(resolve=>server.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
