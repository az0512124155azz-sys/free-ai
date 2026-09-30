import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5d');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

test('Windows W5D settings actions are functional',async()=>{
  test.setTimeout(210000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w5d-'));
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
        customizationEnabled:true,customInstructions:'',siteToolsEnabled:true,
        spellCheckEnabled:true,showBottomPanel:true,approvalMode:'ask'
      }));
      localStorage.setItem('freeai.chats.free',JSON.stringify([{id:'w5d-chat',title:'W5D history',messages:[]}]));
      localStorage.setItem('freeai.chats.super',JSON.stringify([{id:'w5d-super',title:'W5D super history',messages:[]}]));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea{caret-color:transparent!important}'});

    await app.evaluate(({ipcMain})=>{
      ipcMain.removeHandler('shell:checkForUpdates');
      ipcMain.handle('shell:checkForUpdates',()=>({
        currentVersion:'0.7.3',
        latestVersion:'0.7.3',
        updateAvailable:false,
        url:'https://github.com/az0512124155azz-sys/free-ai/releases/tag/v0.7.3'
      }));
    });

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };

    async function openSettings(section='General'){
      if(await page.locator('.settingsScreen').count()===0){
        if(await page.getByRole('button',{name:/Back to app/}).count()){
          await page.getByRole('button',{name:/Back to app/}).first().click();
        }
        await page.locator('.profileButton').click();
        await page.getByRole('menu',{name:'Account'}).getByRole('menuitem',{name:'Settings',exact:true}).click();
      }
      await page.locator('.settingsNav').getByRole('button',{name:section,exact:true}).click();
      await expect(page.locator('.settingsContentTop h1')).toHaveText(section);
    }

    const settingRow=title=>page.locator('.settingRow').filter({has:page.locator('b',{hasText:title})}).first();

    await record('General approval and bottom-panel controls change state',async()=>{
      await openSettings('General');
      const approval=settingRow('Work approvals').locator('select');
      await approval.selectOption('low');
      await expect(approval).toHaveValue('low');
      const bottom=settingRow('Bottom panel').getByRole('switch');
      await expect(bottom).toHaveAttribute('aria-checked','true');
      await bottom.click();
      await expect(bottom).toHaveAttribute('aria-checked','false');
      await bottom.click();
      await expect(bottom).toHaveAttribute('aria-checked','true');
      return 'approval=low; bottom panel toggled off/on';
    },'01-general.png');

    await record('App update button returns a clean deterministic status',async()=>{
      await openSettings('App');
      await page.getByRole('button',{name:'Check for updates'}).click();
      await expect(page.locator('.settingsStatus')).toContainText('up to date');
      await expect(page.locator('.settingsStatus')).toContainText('0.7.3');
      return 'update check completed without raw IPC errors';
    },'02-app-update.png');

    await record('Appearance controls change theme, accent, and text size',async()=>{
      await openSettings('Appearance');
      const appearance=settingRow('Appearance').locator('select');
      await appearance.selectOption('light');
      await expect(appearance).toHaveValue('light');
      const accent=settingRow('Accent color').locator('select');
      await accent.selectOption('purple');
      await expect(accent).toHaveValue('purple');
      const group=page.getByRole('group',{name:'Text size'});
      await group.getByRole('button',{name:'Increase text size'}).click();
      await expect(group).toContainText('110%');
      await group.getByRole('button',{name:'Reset'}).click();
      await expect(group).toContainText('100%');
      return 'light / purple / text size reset';
    },'03-appearance.png');

    await record('Personalization controls persist editable instructions',async()=>{
      await openSettings('Personalization');
      const toggle=settingRow('Enable customization').getByRole('switch');
      await expect(toggle).toHaveAttribute('aria-checked','true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked','false');
      await toggle.click();
      const area=page.getByPlaceholder('What should connected models know about how you want them to respond?');
      await area.fill('W5D personalization instruction');
      await expect(area).toHaveValue('W5D personalization instruction');
      return 'customization toggle + instruction editor';
    },'04-personalization.png');

    await record('Data controls cancel and confirm history clearing',async()=>{
      await openSettings('Data controls');
      const clearRow=settingRow('Clear local chat history');
      await clearRow.getByRole('button',{name:'Clear…'}).click();
      await clearRow.getByRole('button',{name:'Cancel'}).click();
      expect(await page.evaluate(()=>localStorage.getItem('freeai.chats.free'))).not.toBeNull();
      await clearRow.getByRole('button',{name:'Clear…'}).click();
      await clearRow.getByRole('button',{name:'Clear',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>({
        free:localStorage.getItem('freeai.chats.free'),
        super:localStorage.getItem('freeai.chats.super')
      }))).toEqual({free:null,super:null});
      return 'Cancel preserved data; confirm removed Free + Super chat history';
    },'05-data-controls.png');

    await record('Configuration controls update bottom panel and research URL',async()=>{
      await openSettings('Configuration');
      const bottom=settingRow('Bottom panel').getByRole('switch');
      const before=await bottom.getAttribute('aria-checked');
      await bottom.click();
      await expect(bottom).toHaveAttribute('aria-checked',before==='true'?'false':'true');
      const search=page.getByPlaceholder('https://search.example.com');
      await search.fill('https://search.example.test');
      await expect(search).toHaveValue('https://search.example.test');
      return 'configuration toggle + SearXNG URL editor';
    },'06-configuration.png');

    await record('Browser settings toggle site tools, clear profile data, and open pane',async()=>{
      await openSettings('Browser');
      const siteTools=settingRow('Enable site tools').getByRole('switch');
      const before=await siteTools.getAttribute('aria-checked');
      await siteTools.click();
      await expect(siteTools).toHaveAttribute('aria-checked',before==='true'?'false':'true');

      const clearRow=settingRow('Clear browsing data');
      await clearRow.getByRole('button',{name:'Clear…'}).click();
      await clearRow.getByRole('button',{name:'Cancel'}).click();
      await clearRow.getByRole('button',{name:'Clear…'}).click();
      await clearRow.getByRole('button',{name:'Clear',exact:true}).click();
      await expect(page.locator('.settingsStatus')).toContainText('Browsing data cleared');

      await settingRow('Open built-in browser').getByRole('button',{name:'Open'}).click();
      await expect(page.locator('.settingsScreen')).toHaveCount(0);
      await expect(page.locator('.browserPane')).toBeVisible({timeout:8000});
      await page.getByTitle('Close browser').click();
      await expect(page.locator('.browserPane')).toHaveCount(0);
      return 'site tools toggled; browser data cleared; pane opened/closed';
    },'07-browser.png');

    await record('Connections Generate, Save, Add API, and Remove API work',async()=>{
      await openSettings('Connections');
      const pairInput=page.locator('.keyLine input');
      await page.getByRole('button',{name:'Generate',exact:true}).click();
      await expect.poll(async()=>String(await pairInput.inputValue()).length).toBeGreaterThanOrEqual(32);

      const relay=page.getByPlaceholder('wss://your-relay.example.com');
      await relay.fill('ws://127.0.0.1:17998');
      await page.getByRole('button',{name:'Save connection'}).click();
      await expect.poll(()=>page.evaluate(()=>localStorage.getItem('relayUrl'))).toBe('ws://127.0.0.1:17998');

      await page.getByPlaceholder('Display name').fill('W5D API');
      await page.getByPlaceholder('Base URL').fill('http://127.0.0.1:17999/v1');
      await page.getByPlaceholder('Model ID').fill('w5d-model');
      await page.getByRole('button',{name:'Add API model'}).click();
      await expect.poll(async()=>page.evaluate(async()=>await window.desktopApi.listApiConnections())).toEqual(expect.arrayContaining([
        expect.objectContaining({name:'W5D API',model:'w5d-model'})
      ]));
      await expect(page.getByText('W5D API',{exact:true}).first()).toBeVisible({timeout:8000});
      const apiRow=page.locator('.apiItem').filter({hasText:'W5D API'}).first();
      await apiRow.getByRole('button',{name:'Remove'}).click();
      await expect.poll(async()=>{
        const items=await page.evaluate(async()=>await window.desktopApi.listApiConnections());
        return items.some(item=>item.name==='W5D API');
      }).toBe(false);
      return 'pairing key generated/saved; API connection added/removed';
    },'08-connections.png');

    await record('Plugins settings Open routes to the real Plugins surface',async()=>{
      await openSettings('Plugins');
      await page.locator('.integrationHero').getByRole('button',{name:'Open',exact:true}).click();
      await expect(page.locator('.settingsScreen')).toHaveCount(0);
      await expect(page.getByRole('heading',{name:'Plugins',exact:true}).first()).toBeVisible();
      await expect(page.getByRole('tablist',{name:'Plugin directory sections'})).toBeVisible();
      return 'Settings -> Plugins -> real plugin directory';
    },'09-plugins-open.png');

    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
