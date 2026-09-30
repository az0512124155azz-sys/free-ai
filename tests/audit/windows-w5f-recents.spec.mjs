import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5f');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

test('Windows W5F recent-chat menu pin export and delete actions are functional',async()=>{
  test.setTimeout(150000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w5f-'));
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
        id:'w5f-chat',
        title:'W5F context chat',
        mode:'chat',
        providerId:'chatgpt',
        source:'browser',
        modelName:'GPT Runtime',
        pinned:false,
        messages:[
          {role:'user',text:'hello from user'},
          {role:'assistant',text:'hello from assistant'}
        ]
      }]));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});

    await app.evaluate(({ipcMain})=>{
      globalThis.__FREEAI_W5F_EXPORT__=null;
      ipcMain.removeHandler('shell:saveTextFile');
      ipcMain.handle('shell:saveTextFile',(_event,payload={})=>{
        globalThis.__FREEAI_W5F_EXPORT__=payload;
        return {saved:true,filePath:'C:\\FreeAI-QA\\W5F context chat.md'};
      });
    });

    const row=page.locator('.recentRow').filter({hasText:'W5F context chat'}).first();
    await expect(row).toBeVisible();

    await row.getByRole('button',{name:/More options for W5F context chat/}).click();
    let menu=page.getByRole('menu',{name:'Chat options for W5F context chat'});
    await menu.getByRole('menuitem',{name:'Pin chat'}).click();
    await expect.poll(()=>page.evaluate(()=>{
      const chats=JSON.parse(localStorage.getItem('freeai.chats.free')||'[]');
      return chats.find(chat=>chat.id==='w5f-chat')?.pinned===true;
    })).toBe(true);

    await row.getByRole('button',{name:/More options for W5F context chat/}).click();
    menu=page.getByRole('menu',{name:'Chat options for W5F context chat'});
    await expect(menu.getByRole('menuitem',{name:'Unpin chat'})).toBeVisible();
    await menu.getByRole('menuitem',{name:'Export chat'}).click();
    const exported=await expect.poll(async()=>await app.evaluate(()=>globalThis.__FREEAI_W5F_EXPORT__),{timeout:8000}).not.toBeNull();
    const payload=await app.evaluate(()=>globalThis.__FREEAI_W5F_EXPORT__);
    expect(payload.defaultName).toBe('W5F context chat.md');
    expect(payload.content).toContain('# W5F context chat');
    expect(payload.content).toContain('## You');
    expect(payload.content).toContain('hello from user');
    expect(payload.content).toContain('## Assistant');
    expect(payload.content).toContain('hello from assistant');

    await row.getByRole('button',{name:/More options for W5F context chat/}).click();
    menu=page.getByRole('menu',{name:'Chat options for W5F context chat'});
    await menu.getByRole('menuitem',{name:'Delete chat'}).click();
    let dialog=page.getByRole('dialog',{name:'Delete chat?'});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Cancel'}).click();
    await expect(row).toBeVisible();

    await row.getByRole('button',{name:/More options for W5F context chat/}).click();
    menu=page.getByRole('menu',{name:'Chat options for W5F context chat'});
    await menu.getByRole('menuitem',{name:'Delete chat'}).click();
    dialog=page.getByRole('dialog',{name:'Delete chat?'});
    await dialog.getByRole('button',{name:'Delete',exact:true}).click();

    await expect(row).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.free')||'[]').length)).toBe(0);
    await shot(page,'01-recents-actions-complete.png');
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
