import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5b');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

test('Windows W5B restart persistence',async()=>{
  test.setTimeout(150000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w5b-profile-'));
  const launch=()=>electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  const record=async(name,fn)=>{
    try{results.push({name,status:'PASS',detail:(await fn())||''})}
    catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
  };

  let app=null;
  try{
    app=await launch();
    let page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1280,height:820});w.show();w.focus()});

    await record('First launch creates persistent UI and desktop state',async()=>{
      await page.locator('.newProjectItem').first().click();
      await page.getByPlaceholder('Project name').fill('W5 Restart Project');
      await page.getByRole('button',{name:'Create project'}).click();
      await expect(page.getByText('W5 Restart Project',{exact:true}).first()).toBeVisible();

      await page.locator('.profileButton').click();
      await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
      await page.locator('.settingsNav').getByRole('button',{name:'Appearance',exact:true}).click();
      const dark=page.getByRole('button',{name:/Dark/}).first();
      if(await dark.count())await dark.click();
      await page.getByRole('button',{name:'Close settings'}).click();

      await page.evaluate(()=>window.desktopApi.addApiConnection({
        name:'W5 Persistent API',baseUrl:'http://127.0.0.1:17999/v1',model:'w5-persist',apiKey:''
      }));
      const apis=await page.evaluate(()=>window.desktopApi.listApiConnections());
      expect(apis.some(x=>x.name==='W5 Persistent API'&&x.model==='w5-persist')).toBe(true);

      await page.evaluate(()=>{
        localStorage.setItem('w5.restart.marker','persisted');
        localStorage.setItem('freeai.product','free');
      });
      await shot(page,'01-before-restart.png');
      return 'Project, preference marker, and API connection created';
    });

    await app.close();
    app=null;

    await record('Second launch reuses the exact same profile',async()=>{
      app=await launch();
      page=await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
      const win2=await app.browserWindow(page);
      await win2.evaluate(w=>{w.setBounds({x:0,y:0,width:1280,height:820});w.show();w.focus()});

      const marker=await page.evaluate(()=>localStorage.getItem('w5.restart.marker'));
      expect(marker).toBe('persisted');
      await expect(page.getByText('W5 Restart Project',{exact:true}).first()).toBeVisible();

      const projects=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.projects')||'[]'));
      expect(projects.some(x=>x.name==='W5 Restart Project')).toBe(true);

      const apis=await page.evaluate(()=>window.desktopApi.listApiConnections());
      expect(apis.some(x=>x.name==='W5 Persistent API'&&x.model==='w5-persist')).toBe(true);

      await shot(page,'02-after-restart.png');
      return 'localStorage project + desktop API store persisted across process restart';
    });

    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app?.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
