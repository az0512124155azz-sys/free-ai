import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

test('Windows main shell visual baseline',async()=>{
  test.skip(process.platform!=='win32','Windows visual baseline is Windows-only.');

  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-visual-'));
  const electronApp=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS:'true'
    }
  });

  try{
    const page=await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.addInitScript(()=>{
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({
        appearance:'dark',
        contrast:'medium',
        accent:'blue',
        textSize:100,
        suggestedPrompts:true,
        voiceLanguage:'auto',
        customizationEnabled:true,
        siteToolsEnabled:true,
        spellCheckEnabled:true,
        hapticsEnabled:true,
        showBottomPanel:true,
        approvalMode:'ask'
      }));
      localStorage.setItem('freeai.chats.free','[]');
      localStorage.setItem('freeai.projects','[]');
      localStorage.setItem('freeai.super.team','[]');
    });

    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    await page.locator('.desktopShell').waitFor({state:'visible'});
    await expect(page.locator('.authScreen')).toHaveCount(0);

    const browserWindow=await electronApp.browserWindow(page);
    await browserWindow.evaluate(win=>{
      win.setBounds({x:0,y:0,width:1440,height:900});
      win.setResizable(false);
      win.show();
      win.focus();
    });

    await page.evaluate(async()=>{await document.fonts.ready});
    await page.addStyleTag({content:`
      *,*::before,*::after{animation:none!important;transition:none!important}
      input,textarea,[contenteditable="true"]{caret-color:transparent!important}
    `});
    await page.mouse.move(1438,898);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('windows-main-shell.png',{
      animations:'disabled',
      caret:'hide',
      scale:'css',
      maxDiffPixelRatio:0.003
    });
  }finally{
    await electronApp.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
