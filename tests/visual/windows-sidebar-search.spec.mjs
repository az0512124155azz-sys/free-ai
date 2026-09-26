import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

test('Windows Search Chats close clears the hidden Recents filter',async({},testInfo)=>{
  test.skip(process.platform!=='win32','This regression requires real Windows Electron.');
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-sidebar-search-'));
  let app,page;
  const screenshot=async name=>{
    const target=testInfo.outputPath(name+'.png');
    await page.screenshot({path:target,fullPage:false});
    await testInfo.attach(name,{path:target,contentType:'image/png'});
  };

  try{
    app=await electron.launch({
      args:['.',`--user-data-dir=${userData}`],
      env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
    });
    page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.addInitScript(()=>{
      // Seed only this temporary profile. No account, API key, or live model is required.
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({
        appearance:'dark',contrast:'medium',accent:'blue',textSize:100,
        customizationEnabled:true,siteToolsEnabled:true,spellCheckEnabled:true,
        showBottomPanel:true,approvalMode:'ask'
      }));
      localStorage.setItem('freeai.projects','[]');
      localStorage.setItem('freeai.super.team','[]');
      localStorage.setItem('freeai.chats.free',JSON.stringify([
        {id:'search-alpha',title:'Search regression Alpha',mode:'chat',updatedAt:2000,
          messages:[{role:'user',text:'Alpha conversation'}]},
        {id:'search-beta',title:'Search regression Beta',mode:'chat',updatedAt:1000,
          messages:[{role:'user',text:'Beta conversation'}]}
      ]));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('.windowsDesktopRoot')).toBeVisible();
    await expect(page.locator('.desktopShell')).toBeVisible();
    await expect(page.locator('.authScreen')).toHaveCount(0);
    expect(await page.evaluate(()=>window.desktopApi?.platform)).toBe('win32');

    const win=await app.browserWindow(page);
    await win.evaluate(window=>{
      window.setBounds({x:0,y:0,width:1440,height:900});
      window.show();
      window.focus();
    });
    const sidebar=page.locator('.gptSidebar');
    const toggle=sidebar.getByRole('button',{name:'Search chats',exact:true});
    const input=sidebar.getByPlaceholder('Search chats',{exact:true});
    const rows=sidebar.locator('.recentRow');
    const alpha=sidebar.locator('.recentItem').filter({hasText:'Search regression Alpha'});
    const beta=sidebar.locator('.recentItem').filter({hasText:'Search regression Beta'});
    const allRecents=async()=>{
      await expect(rows,'Closing Search must restore both Recent conversations').toHaveCount(2);
      await expect(alpha).toBeVisible();
      await expect(beta).toBeVisible();
    };

    await allRecents();
    await expect(input).toHaveCount(0);
    await screenshot('01-all-recents');

    // Exercise a matching query and an empty result set without reloading/resetting state.
    for(const [label,query,count] of [
      ['matching','Alpha',1],
      ['no-match','query-with-no-existing-conversation',0]
    ]){
      await test.step(label+' query is cleared by closing Search',async()=>{
        await toggle.click();
        await expect(input).toBeVisible();
        await expect(input).toHaveValue('');
        await input.fill(query);
        await expect(rows).toHaveCount(count);
        if(count){
          await expect(alpha).toBeVisible();
          await expect(beta).toHaveCount(0);
        }else{
          await expect(sidebar.getByText('No matching chats',{exact:true})).toBeVisible();
        }
        await screenshot(label+'-02-filtered');

        await toggle.click();
        await expect(input).toHaveCount(0);
        // This assertion fails on the pre-fix implementation: the hidden query still filters.
        await allRecents();
        await screenshot(label+'-03-closed-restored');

        await toggle.click();
        await expect(input).toBeVisible();
        await expect(input).toHaveValue('');
        await allRecents();
        await screenshot(label+'-04-reopened-empty');

        await toggle.click();
        await expect(input).toHaveCount(0);
        await allRecents();
      });
    }
  }catch(error){
    if(page&&!page.isClosed())await screenshot('failure').catch(()=>{});
    throw error;
  }finally{
    await app?.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true,maxRetries:10,retryDelay:250}).catch(()=>{});
  }
});
