import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5g');
async function sendCommand(app,command){
  await app.evaluate(({BrowserWindow},value)=>{
    const win=BrowserWindow.getAllWindows()[0];
    win?.webContents.send('app-command',value);
  },command);
}
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

test('Windows W5G native app-menu commands execute their advertised actions',async()=>{
  test.setTimeout(150000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w5g-'));
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
      localStorage.setItem('freeai.chats.free',JSON.stringify([{
        id:'w5g-chat',title:'W5G command chat',mode:'chat',providerId:'chatgpt',source:'browser',modelName:'GPT Runtime',
        messages:[{role:'user',text:'seed user message'},{role:'assistant',text:'seed assistant message'}]
      }]));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});

    const recent=page.locator('.recentRow').filter({hasText:'W5G command chat'}).first();
    await expect(recent).toBeVisible();
    await recent.locator('.recentItem').click();
    await expect(page.locator('.chatMessage')).toHaveCount(2);

    await sendCommand(app,'settings');
    await expect(page.locator('.settingsScreen')).toBeVisible();
    await expect(page.locator('.settingsContentTop h1')).toHaveText('General');

    await sendCommand(app,'about');
    await expect(page.locator('.settingsContentTop h1')).toHaveText('App');
    await page.getByRole('button',{name:'Close settings'}).click();

    await expect(page.locator('.gptSidebar')).toBeVisible();
    await sendCommand(app,'toggle-sidebar');
    await expect(page.locator('.gptSidebar')).toHaveCount(0);
    await sendCommand(app,'toggle-sidebar');
    await expect(page.locator('.gptSidebar')).toBeVisible();

    await sendCommand(app,'new-chat');
    await expect(page.locator('.chatMessage')).toHaveCount(0);
    await expect(page.locator('.gptComposer')).toBeVisible();

    await sendCommand(app,'toggle-browser');
    await expect(page.locator('.browserPane')).toBeVisible({timeout:8000});
    await sendCommand(app,'toggle-browser');
    await expect(page.locator('.browserPane')).toHaveCount(0);

    await shot(page,'01-native-menu-commands.png');
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
