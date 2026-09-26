import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { test, expect, _electron as electron } from '@playwright/test';

// No live accounts/providers. Browser still uses the real native Electron pane.
async function startSite(){
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    if(req.method==='POST'&&req.url==='/v1/chat/completions'){
      try{
        const chunks=[];
        for await(const chunk of req)chunks.push(chunk);
        requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        const answer='Pane layout local response';
        if(requests.at(-1).stream){
          res.writeHead(200,{'content-type':'text/event-stream'});
          res.end('data: '+JSON.stringify({choices:[{delta:{content:answer}}]})+'\n\ndata: [DONE]\n\n');
        }else{
          res.writeHead(200,{'content-type':'application/json'});
          res.end(JSON.stringify({choices:[{message:{content:answer}}]}));
        }
      }catch{res.writeHead(400);res.end('Invalid test request');}
      return;
    }
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end('<!doctype html><title>Composer Pane QA</title><h1>Local browser target</h1>');
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return {server,requests,url:'http://127.0.0.1:'+server.address().port};
}

// Compare against the visible CHAT COLUMN, not just the outer window.
// Hit testing detects renderer overlays. Normal click() and observed UI/IPC
// results below supplement it for the real native Browser pane.
async function composerProblems(page){
  return page.evaluate(()=>{
    const pane=document.querySelector('.chatStage');
    const composer=document.querySelector('.gptComposer');
    if(!pane||!composer)return ['Missing chat column or composer'];
    const p=pane.getBoundingClientRect(),c=composer.getBoundingClientRect();
    const issues=[];
    const left=Math.max(0,p.left),right=Math.min(innerWidth,p.right);
    const top=Math.max(0,p.top),bottom=Math.min(innerHeight,p.bottom);
    const inside=(r,l,t,rr,b)=>r.left>=l-1&&r.top>=t-1&&r.right<=rr+1&&r.bottom<=b+1;
    if(!inside(c,left,top,right,bottom))issues.push('Composer exceeds chat column: '+JSON.stringify({composer:c.toJSON(),pane:p.toJSON()}));
    for(const el of composer.querySelectorAll('textarea,.composerBottom button,.workActions button')){
      if(el.closest('.floatingMenu'))continue;
      const style=getComputedStyle(el);
      if(style.display==='none'||style.visibility==='hidden')continue;
      const r=el.getBoundingClientRect();
      const label=el.getAttribute('aria-label')||el.title||el.textContent||el.tagName;
      if(r.width<1||r.height<1||!inside(r,left,top,right,bottom)||!inside(r,c.left,c.top,c.right,c.bottom)){
        issues.push('Clipped control: '+label);
        continue;
      }
      for(const [x,y] of [[r.left+r.width/2,r.top+r.height/2],[r.left+4,r.top+r.height/2],[r.right-4,r.top+r.height/2]]){
        const hit=document.elementFromPoint(x,y);
        if(!hit||!el.contains(hit))issues.push('Covered control: '+label);
      }
    }
    return issues;
  });
}

async function expectPopupInChat(page,popup){
  await expect(popup).toBeVisible();
  const box=await popup.boundingBox();
  const bounds=await page.locator('.chatStage').boundingBox();
  const height=await page.evaluate(()=>innerHeight);
  expect(box.x).toBeGreaterThanOrEqual(bounds.x-1);
  expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(height+1);
}

test('Windows Browser split keeps Composer controls visible and clickable',async({},testInfo)=>{
  test.skip(process.platform!=='win32','Requires real Windows Electron, not platform emulation.');
  test.setTimeout(180000);
  const {server,requests,url}=await startSite();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-pane-layout-'));
  const checks=[];
  let app,page;
  const shot=async name=>{
    const target=testInfo.outputPath(name+'.png');
    await page.screenshot({path:target});
    await testInfo.attach(name,{path:target,contentType:'image/png'});
  };
  try{
    app=await electron.launch({args:['.',`--user-data-dir=${userData}`]});
    page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.addInitScript(()=>{
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({appearance:'dark',textSize:100,showBottomPanel:true,approvalMode:'ask'}));
      localStorage.setItem('freeai.chats.free',JSON.stringify([
        {id:'pane-chat',title:'Pane history chat',mode:'chat',updatedAt:2000,messages:[{role:'user',text:'Existing chat'}]},
        {id:'pane-work',title:'Pane history work',mode:'work',updatedAt:1000,messages:[{role:'user',text:'Existing work'}]}
      ]));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.windowsDesktopRoot')).toBeVisible();
    expect(await page.evaluate(()=>window.desktopApi.platform)).toBe('win32');
    const win=await app.browserWindow(page);
    const resize=async(width,height)=>{
      await win.evaluate((w,size)=>{w.setBounds({x:0,y:0,...size});w.show();w.focus();},{width,height});
      await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(width);
    };
    await resize(1100,720);
    await page.evaluate(baseUrl=>window.desktopApi.addApiConnection({name:'Pane QA long display name for wrapping',baseUrl:baseUrl+'/v1',model:'pane-qa',apiKey:''}),url);
    const chooseModel=async()=>{
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expectPopupInChat(page,picker);
      await picker.getByRole('option',{name:/pane-qa/}).click();
      await expect(page.locator('.modelButton')).toContainText('Pane QA long display name for wrapping');
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
    };
    const openBrowser=async()=>{
      await page.evaluate(target=>window.desktopApi.browserOpen({url:target,forceNavigate:true,bounds:{x:700,y:100,width:350,height:580}}),url);
      const shortcut=page.locator('.workActions button').filter({hasText:'Browser'});
      if(await shortcut.count()){
        await shortcut.click();
      }else{
        // Open from Chat without switching experience and discarding its history.
        await page.getByRole('button',{name:'Add',exact:true}).click();
        await page.getByRole('menu',{name:'Add',exact:true}).getByRole('menuitem',{name:/^Browser/}).click();
      }
      await expect(page.locator('.browserPane')).toBeVisible();
      await expect(page.locator('.browserTab.active')).toContainText('Composer Pane QA');
    };
    const inspect=async name=>{
      await expect.poll(()=>composerProblems(page),{message:name,timeout:5000}).toEqual([]);
      await shot(name);
      checks.push({name,status:'PASS'});
    };
    const addMenu=async()=>{
      await page.getByRole('button',{name:'Add',exact:true}).click();
      await expectPopupInChat(page,page.getByRole('menu',{name:'Add',exact:true}));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu',{name:'Add',exact:true})).toHaveCount(0);
    };

    await page.getByRole('tab',{name:'Work',exact:true}).click();
    await openBrowser();
    await page.locator('.gptComposer textarea').fill('Pane layout draft');
    await chooseModel();
    for(const width of [1100,980,1280,1440]){
      await resize(width,720);
      await inspect('empty-work-'+width);
      await addMenu();
      await chooseModel();
    }
    await resize(1100,720);
    // Real Add-menu action opens a native file chooser; cancel without touching files.
    await page.getByRole('button',{name:'Add',exact:true}).click();
    const [chooser]=await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem',{name:/Attach files/}).click()
    ]);
    await chooser.setFiles([]);
    await page.keyboard.press('Escape');
    checks.push({name:'Native Attach files click',status:'PASS'});
    await page.getByTitle('Hide sidebar',{exact:true}).click();
    await expect(page.locator('.desktopShell')).toHaveClass(/sidebarHidden/);
    await inspect('sidebar-hidden');
    await addMenu();
    await chooseModel();
    await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
    await expect(page.locator('.desktopShell')).not.toHaveClass(/sidebarHidden/);
    await inspect('sidebar-restored');
    await win.evaluate(w=>w.maximize());
    await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(true);
    await inspect('maximized');
    await addMenu();
    await win.evaluate(w=>w.restore());
    await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(false);
    await inspect('restored');

    for(const mode of ['work','chat']){
      await page.locator('.recentItem').filter({hasText:'Pane history '+mode}).click();
      await expect(page.getByRole('tab',{name:mode==='work'?'Work':'Chat',exact:true})).toHaveAttribute('aria-selected','true');
      await openBrowser();
      await expect(page.locator('.gptComposer.compact')).toBeVisible();
      await page.locator('.gptComposer textarea').fill('Pane layout '+mode+' message');
      await chooseModel();
      await inspect('history-'+mode);
      await addMenu();
      if(mode==='chat'){
        await page.getByRole('button',{name:'Send message',exact:true}).click();
        await expect(page.locator('.chatMessage.assistant .messageBody').last()).toHaveText('Pane layout local response');
        expect(requests).toHaveLength(1);
        await expect(page.locator('.browserPane')).toBeVisible();
        await inspect('history-chat-after-send');
      }
    }
    await page.getByRole('button',{name:/Switch product\. Current: Free AI/}).first().click();
    await page.getByRole('menuitemradio',{name:/Super AI/}).click();
    await openBrowser();
    await inspect('super-ai');
    await page.locator('.teamButton').click();
    await expectPopupInChat(page,page.getByRole('dialog',{name:'Super AI automatic team'}));
    await page.getByRole('button',{name:'Close team picker'}).click();
    await page.getByTitle('Close browser',{exact:true}).click();
    await expect(page.locator('.browserPane')).toHaveCount(0);
    await expect(page.locator('.gptComposer')).toBeVisible();
    checks.push({name:'Team popup and Browser close click',status:'PASS'});
  }catch(error){
    checks.push({name:'Failure',status:'FAIL',detail:String(error?.message||error)});
    if(page&&!page.isClosed())await shot('failure').catch(()=>{});
    throw error;
  }finally{
    await fs.writeFile(testInfo.outputPath('pane-checks.json'),JSON.stringify(checks,null,2));
    await app?.close().catch(()=>{});
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    await fs.rm(userData,{recursive:true,force:true,maxRetries:10,retryDelay:250}).catch(()=>{});
  }
});
