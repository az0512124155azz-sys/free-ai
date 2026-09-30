import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5g');
async function invokeMenuItem(app,topLabel,itemLabel){
  return await app.evaluate(({Menu},{topLabel,itemLabel})=>{
    const menu=Menu.getApplicationMenu();
    const top=menu?.items?.find(item=>item.label===topLabel);
    const item=top?.submenu?.items?.find(entry=>entry.label===itemLabel);
    if(!item||typeof item.click!=='function')throw new Error('Missing app-menu item: '+topLabel+' > '+itemLabel);
    item.click();
    return {label:item.label,accelerator:item.accelerator||''};
  },{topLabel,itemLabel});
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

    const settingsMenu=await invokeMenuItem(app,'File','Settings');
    expect(settingsMenu.accelerator).toBeTruthy();
    await expect(page.locator('.settingsScreen')).toBeVisible();
    await expect(page.locator('.settingsContentTop h1')).toHaveText('General');

    await invokeMenuItem(app,'Help','About Free AI');
    await expect(page.locator('.settingsContentTop h1')).toHaveText('App');
    await page.getByRole('button',{name:'Close settings'}).click();

    await expect(page.locator('.gptSidebar')).toBeVisible();
    const sidebarMenu=await invokeMenuItem(app,'View','Toggle sidebar');
    expect(sidebarMenu.accelerator).toBeTruthy();
    await expect(page.locator('.gptSidebar')).toHaveCount(0);
    await invokeMenuItem(app,'View','Toggle sidebar');
    await expect(page.locator('.gptSidebar')).toBeVisible();

    const newChatMenu=await invokeMenuItem(app,'File','New chat');
    expect(newChatMenu.accelerator).toBeTruthy();
    await expect(page.locator('.chatMessage')).toHaveCount(0);
    await expect(page.locator('.gptComposer')).toBeVisible();

    const browserMenu=await invokeMenuItem(app,'View','Toggle browser');
    expect(browserMenu.accelerator).toBeTruthy();
    await expect(page.locator('.browserPane')).toBeVisible({timeout:8000});
    await invokeMenuItem(app,'View','Toggle browser');
    await expect(page.locator('.browserPane')).toHaveCount(0);

    await shot(page,'01-native-menu-commands.png');
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
