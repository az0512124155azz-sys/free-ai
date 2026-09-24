import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5a');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function startSite(){
  const server=http.createServer((_req,res)=>{
    res.setHeader('content-type','text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><title>W5 Browser QA</title></head><body>
      <h1>W5 Browser QA</h1><p>Navigation replacement target loaded.</p>
      <script>
        document.modelContext={
          async getTools(){return [{name:'w5_echo',title:'W5 echo',description:'QA site tool',origin:location.origin,inputSchema:{type:'object',properties:{}},annotations:{consequentialHint:false}}]},
          async executeTool(){return {ok:true}}
        };
      </script>
    </body></html>`);
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(17950,'127.0.0.1',()=>resolve(server));
  });
}

test('Windows W5A native shell responsive dialogs shortcuts',async()=>{
  test.setTimeout(210000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const site=await startSite();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w5a-'));
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
    await page.evaluate(async()=>{await document.fonts.ready});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea{caret-color:transparent!important}'});

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };
    const layout=()=>page.evaluate(()=>{
      const composer=document.querySelector('.gptComposer');
      const r=composer?.getBoundingClientRect();
      return {
        width:innerWidth,height:innerHeight,
        bodyWidth:document.body.scrollWidth,rootWidth:document.documentElement.scrollWidth,
        overflow:document.body.scrollWidth>innerWidth+2||document.documentElement.scrollWidth>innerWidth+2,
        composer:r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null,
        desktopNav:getComputedStyle(document.querySelector('.desktopPrimaryNav')).display,
        mobileNav:getComputedStyle(document.querySelector('.mobileNavTrigger')).display,
        sidebar:getComputedStyle(document.querySelector('.gptSidebar')).display
      };
    });
    const assertComposerInside=async()=>{
      const v=await layout();
      expect(v.overflow).toBe(false);
      expect(v.composer).not.toBeNull();
      expect(v.composer.left).toBeGreaterThanOrEqual(-1);
      expect(v.composer.right).toBeLessThanOrEqual(v.width+1);
      expect(v.composer.bottom).toBeLessThanOrEqual(v.height+1);
      return v;
    };
    const nativeKeys=async sequence=>{
      await win.evaluate(w=>{if(w.isMinimized())w.restore();w.show();w.focus()});
      execFileSync('powershell.exe',[
        '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',
        "Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 180; [System.Windows.Forms.SendKeys]::SendWait('"+sequence+"')"
      ],{stdio:'ignore'});
    };

    await record('Windows window exposes usable native minimum sizing',async()=>{
      const info=await win.evaluate(w=>({bounds:w.getBounds(),minimum:w.getMinimumSize(),visible:w.isVisible()}));
      expect(info.visible).toBe(true);
      expect(info.minimum[0]).toBeLessThanOrEqual(500);
      expect(info.minimum[1]).toBeLessThanOrEqual(420);
      expect(info.bounds.width).toBeGreaterThanOrEqual(info.minimum[0]);
      expect(info.bounds.height).toBeGreaterThanOrEqual(info.minimum[1]);
      return JSON.stringify(info);
    },'01-native-window.png');

    for(const [name,width,height] of [
      ['wide',1440,900],
      ['medium',1000,700],
      ['compact',640,520],
      ['snap',500,480],
      ['minimum',500,420]
    ]){
      await record('Responsive layout '+name+' '+width+'x'+height,async()=>{
        await win.evaluate((w,size)=>{w.setSize(size.width,size.height);w.setPosition(0,0);w.show();w.focus()},{width,height});
        await page.waitForTimeout(220);
        const v=await assertComposerInside();
        if(width<=760){
          expect(v.desktopNav).toBe('none');
          expect(v.mobileNav).not.toBe('none');
        }else{
          expect(v.desktopNav).not.toBe('none');
        }
        return JSON.stringify(v);
      },'02-resize-'+name+'.png');
    }

    await record('Compact navigation drawer opens and closes without overflow',async()=>{
      await page.getByRole('button',{name:'Open navigation'}).click();
      await expect(page.locator('.gptSidebar.mobileOpen')).toBeVisible();
      let v=await layout();expect(v.overflow).toBe(false);
      await page.locator('.mobileCloseNav').click();
      await expect(page.locator('.gptSidebar.mobileOpen')).toHaveCount(0);
      v=await layout();expect(v.overflow).toBe(false);
      return 'Compact drawer opened and closed cleanly';
    },'03-compact-drawer.png');

    await record('New Project dialog fits compact Windows viewport',async()=>{
      await page.getByRole('button',{name:'Open navigation'}).click();
      await page.getByRole('button',{name:'New project',exact:true}).click();
      const dialog=page.locator('.projectDialog');
      await expect(dialog).toBeVisible();
      const box=await dialog.boundingBox();
      const size=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.x+box.width).toBeLessThanOrEqual(size.width+1);
      expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);
      await page.getByPlaceholder('Project name').fill('W5 compact project');
      await expect(page.getByRole('button',{name:'Create project'})).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      return JSON.stringify({box,size});
    },'04-project-dialog.png');

    await record('Native Ctrl+, opens Settings and Escape closes it',async()=>{
      await nativeKeys('^,');
      const settings=page.locator('.settingsScreen');
      await expect(settings).toBeVisible({timeout:8000});
      await expect(page.locator('.settingsContentTop h1')).toHaveText('General');
      await shot(page,'05-settings-shortcut-open.png');
      await page.getByRole('button',{name:'Close settings'}).click();
      await expect(settings).toHaveCount(0,{timeout:8000});
      return 'Ctrl+, opened Settings General; native Close settings returned to app';
    },'06-settings-shortcut-closed.png');

    await record('Native Ctrl+Shift+S toggles sidebar at desktop width',async()=>{
      await win.evaluate(w=>{w.setSize(1100,720);w.show();w.focus()});
      await page.waitForTimeout(180);
      await expect(page.locator('.gptSidebar')).toBeVisible();
      await nativeKeys('^+s');
      await expect(page.locator('.desktopShell.sidebarHidden')).toBeVisible({timeout:8000});
      await nativeKeys('^+s');
      await expect(page.locator('.desktopShell.sidebarHidden')).toHaveCount(0,{timeout:8000});
      return 'Sidebar hidden and restored';
    },'07-sidebar-shortcut.png');

    await record('Computer mirror is absent while Work Computer Use backend remains available',async()=>{
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await page.getByRole('button',{name:'Add',exact:true}).click();
      const menu=page.getByRole('menu',{name:'Add'});
      await expect(menu.getByRole('menuitem',{name:/Computer/})).toHaveCount(0);
      await page.keyboard.press('Escape');
      const status=await page.evaluate(()=>window.desktopApi.getStatus());
      expect(status.computerUse?.available).toBe(true);
      expect(status.computerUse?.actions||[]).toContain('screenshot');
      expect(await page.locator('.computerPane').count()).toBe(0);
      return 'Mirror removed; background Computer Use available';
    },'08-computer-background-only.png');

    await record('Browser replacement navigation does not leave stale ERR_ABORTED',async()=>{
      const target='http://127.0.0.1:17950/';
      await page.evaluate(url=>window.desktopApi.browserOpen({url,forceNavigate:true,bounds:{x:570,y:70,width:510,height:620}}),target);
      await page.locator('.workActions button').filter({hasText:'Browser'}).click();
      await expect(page.locator('.browserPane')).toBeVisible();
      await expect(page.locator('.browserTab.active')).toContainText('W5 Browser QA',{timeout:12000});
      await expect(page.locator('.browserErrorBar')).toHaveCount(0,{timeout:4000});
      await page.evaluate(()=>window.desktopApi.browserRefreshSiteTools());
      await expect(page.getByTitle('1 site tool')).toBeVisible({timeout:8000});
      return 'Target loaded, no stale error, automatic site-tool path remains usable';
    },'09-browser-no-stale-abort.png');

    await record('Maximize and restore preserve usable shell',async()=>{
      await win.evaluate(w=>w.maximize());
      await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(true);
      await assertComposerInside();
      await shot(page,'10-maximized.png');
      await win.evaluate(w=>w.restore());
      await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(false);
      await assertComposerInside();
      return 'Maximize and restore both kept the shell usable';
    },'11-restored.png');

    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await new Promise(resolve=>site.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
