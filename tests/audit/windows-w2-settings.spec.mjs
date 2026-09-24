import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w2');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

test('Windows W2 settings audit',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w2-'));
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},
    acceptDownloads:true
  });
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.addInitScript(()=>{
      const now=Date.now();
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({
        appearance:'dark',contrast:'medium',accent:'blue',textSize:100,
        suggestedPrompts:true,voiceLanguage:'auto',customizationEnabled:true,
        customInstructions:'',siteToolsEnabled:true,spellCheckEnabled:true,
        hapticsEnabled:true,showBottomPanel:true,researchSearchUrl:'',
        approvalMode:'ask'
      }));
      localStorage.setItem('freeai.chats.free',JSON.stringify([
        {id:'qa-chat',title:'Settings QA chat',providerId:'qa',source:'api',modelName:'QA Model',messages:[{role:'user',text:'Hello'}],mode:'chat',pinned:false,updatedAt:now}
      ]));
      localStorage.setItem('freeai.chats.super','[]');
      localStorage.setItem('freeai.projects','[]');
    });

    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
    await page.evaluate(async()=>{await document.fonts.ready});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea,[contenteditable="true"]{caret-color:transparent!important}'});

    const record=async(name,fn,screenshot,{statusOnError='FAIL'}={})=>{
      try{
        const detail=await fn();
        results.push({name,status:'PASS',detail:detail||''});
      }catch(error){
        results.push({name,status:statusOnError,detail:error?.message||String(error)});
      }
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };
    const failResult=(name,detail)=>results.push({name,status:'FAIL',detail});
    const blocked=(name,detail)=>results.push({name,status:'BLOCKED',detail});

    async function closeSidePanes(){
      const browserClose=page.locator('.browserPane .closePaneButton');
      if(await browserClose.count())await browserClose.click().catch(()=>{});
      const computerClose=page.locator('.computerPane .paneTabs > button');
      if(await computerClose.count())await computerClose.click().catch(()=>{});
    }
    async function openSettings(){
      await closeSidePanes();
      if(await page.locator('.settingsScreen').count())return;
      if(await page.locator('.profileMenu').count()===0)await page.locator('.profileButton').click();
      await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
      await expect(page.locator('.settingsScreen')).toBeVisible();
    }
    async function section(label){
      await openSettings();
      const button=page.locator('.settingsNav button').filter({hasText:label}).first();
      await expect(button).toBeVisible();
      await button.click();
      await expect(page.locator('.settingsContentTop h1')).toHaveText(label);
    }

    await record('Open Settings',async()=>{
      await openSettings();
      await expect(page.getByPlaceholder('Search settings')).toBeVisible();
      return 'Settings dialog opened';
    },'01-settings-general.png');

    await record('General: Work approvals',async()=>{
      await section('General');
      const row=page.locator('.settingRow').filter({hasText:'Work approvals'}).first();
      const select=row.locator('select');
      await select.selectOption('read');
      await expect(select).toHaveValue('read');
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.prefs')||'{}').approvalMode);
      expect(stored).toBe('read');
      return 'Changed to Allow reads and persisted';
    },'02-general-approvals.png');

    await record('General: Bottom panel toggle',async()=>{
      const row=page.locator('.settingRow').filter({hasText:'Bottom panel'}).first();
      const toggle=row.getByRole('switch');
      const before=await toggle.getAttribute('aria-checked');
      await toggle.click();
      const after=await toggle.getAttribute('aria-checked');
      expect(after).not.toBe(before);
      return `Bottom panel ${before} -> ${after}`;
    },'03-general-bottom-panel.png');

    await record('App section renders usable content',async()=>{
      await section('App');
      const panes=page.locator('.settingsContent .settingsPane');
      if(await panes.count()===0)throw new Error('App navigation opens a blank settings content area; WindowsAppSettings exists in source but is not rendered.');
      return 'App pane rendered';
    },'04-app.png');

    await record('Profile field is editable',async()=>{
      await section('Profile');
      const input=page.getByPlaceholder('Your name');
      await input.fill('Windows QA User');
      await expect(input).toHaveValue('Windows QA User');
      return 'Display name field accepts input';
    },'05-profile.png');
    blocked('Profile: Save profile','Requires a real Supabase-authenticated user. Audit does not mutate a personal account.');

    await record('Appearance: theme',async()=>{
      await section('Appearance');
      const row=page.locator('.settingRow').filter({hasText:'Appearance'}).first();
      await row.locator('select').selectOption('light');
      await expect(page.locator('html')).toHaveAttribute('data-theme','light');
      return 'Light theme applied';
    },'06-appearance-light.png');

    await record('Appearance: contrast and accent',async()=>{
      const contrast=page.locator('.settingRow').filter({hasText:'Contrast'}).first().locator('select');
      const accent=page.locator('.settingRow').filter({hasText:'Accent color'}).first().locator('select');
      await contrast.selectOption('increased');
      await accent.selectOption('purple');
      await expect(page.locator('html')).toHaveAttribute('data-contrast','increased');
      await expect(page.locator('html')).toHaveAttribute('data-accent','purple');
      return 'Increased contrast and purple accent applied';
    },'07-appearance-contrast-accent.png');

    await record('Appearance: text size controls',async()=>{
      const group=page.getByRole('group',{name:'Text size'});
      await group.getByRole('button',{name:'Increase text size'}).click();
      await expect(group.getByText('110%')).toBeVisible();
      await group.getByRole('button',{name:'Reset'}).click();
      await expect(group.getByText('100%')).toBeVisible();
      return '100% -> 110% -> 100%';
    },'08-appearance-text-size.png');

    await record('Voice settings',async()=>{
      await section('Voice');
      await expect(page.getByText('Windows + H',{exact:true})).toBeVisible();
      return 'Windows Voice Typing engine is surfaced';
    },'09-voice.png');

    await record('Personalization controls',async()=>{
      await section('Personalization');
      const toggle=page.getByRole('switch').first();
      await toggle.click();
      const input=page.getByPlaceholder('What should connected models know about how you want them to respond?');
      await input.fill('Use concise QA responses.');
      const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.prefs')||'{}'));
      expect(prefs.customizationEnabled).toBe(false);
      expect(prefs.customInstructions).toBe('Use concise QA responses.');
      return 'Customization toggle and custom instructions persisted';
    },'10-personalization.png');

    await record('Data controls: Export',async()=>{
      await section('Data controls');
      const [download]=await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button',{name:'Export',exact:true}).click()
      ]);
      expect(download.suggestedFilename()).toBe('free-ai-export.json');
      await download.saveAs(path.join(out,'free-ai-export.json'));
      return 'free-ai-export.json downloaded';
    },'11-data-export.png');

    await record('Data controls: Clear confirmation cancel',async()=>{
      await page.getByRole('button',{name:'Clear…'}).click();
      await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(page.getByRole('button',{name:'Clear…'})).toBeVisible();
      return 'Destructive clear requires explicit confirmation';
    },'12-data-clear-confirm.png');

    await record('Data controls: Clear history',async()=>{
      await page.getByRole('button',{name:'Clear…'}).click();
      await page.getByRole('button',{name:'Clear',exact:true}).click();
      const chats=await page.evaluate(()=>localStorage.getItem('freeai.chats.free'));
      expect(chats).toBeNull();
      return 'Temporary QA chat history cleared';
    },'13-data-cleared.png');

    await record('Configuration settings',async()=>{
      await section('Configuration');
      const toggle=page.getByRole('switch').first();
      await toggle.click();
      const search=page.getByPlaceholder('https://search.example.com');
      await search.fill('https://search.example.test');
      const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.prefs')||'{}'));
      expect(prefs.researchSearchUrl).toBe('https://search.example.test');
      return 'Bottom-panel setting and SearXNG field persisted';
    },'14-configuration.png');

    await record('Keyboard shortcuts section',async()=>{
      await section('Keyboard shortcuts');
      for(const text of ['Ctrl+N','Ctrl+Shift+B','Ctrl+,'])await expect(page.getByText(text,{exact:true})).toBeVisible();
      return 'All documented shortcuts visible';
    },'15-keyboard-shortcuts.png');

    await record('Computer use section',async()=>{
      await section('Computer use');
      await expect(page.getByRole('button',{name:'Open',exact:true})).toBeVisible();
      return 'Computer use integration card rendered';
    },'16-computer-use.png');

    await record('Computer use opens mirror on current main',async()=>{
      await page.getByRole('button',{name:'Open',exact:true}).click();
      await expect(page.locator('.computerPane')).toBeVisible();
      throw new Error('Current main still opens the user-facing Computer screen-mirror panel. PR #132 removes this UI while preserving agent computer actions.');
    },'17-computer-mirror.png');
    await closeSidePanes();

    await record('Files section',async()=>{
      await section('Files');
      for(const text of ['Local folder access','Read actions','Writes','Credential files'])await expect(page.getByText(text,{exact:true})).toBeVisible();
      return 'Windows file-access policy rows rendered';
    },'18-files.png');

    await record('Plugins settings Open',async()=>{
      await section('Plugins');
      await page.getByRole('button',{name:'Open',exact:true}).click();
      await expect(page.getByText('Plugins',{exact:true}).first()).toBeVisible();
      await expect(page.locator('.settingsScreen')).toHaveCount(0);
      return 'Plugins page opened';
    },'19-plugins-open.png');

    await record('Browser: site tools toggle',async()=>{
      await openSettings();
      await section('Browser');
      const row=page.locator('.settingRow').filter({hasText:'Enable site tools'}).first();
      const toggle=row.getByRole('switch');
      const before=await toggle.getAttribute('aria-checked');
      await toggle.click();
      const after=await toggle.getAttribute('aria-checked');
      expect(after).not.toBe(before);
      return `Site tools ${before} -> ${after}`;
    },'20-browser-settings.png');

    await record('Browser: clear data',async()=>{
      await page.getByRole('button',{name:'Clear…'}).click();
      await page.getByRole('button',{name:'Clear',exact:true}).click();
      await expect(page.getByText('Browsing data cleared',{exact:true})).toBeVisible({timeout:15000});
      return 'Browsing data cleared through Electron session';
    },'21-browser-cleared.png');

    await record('Browser: Open built-in browser',async()=>{
      await page.getByRole('button',{name:'Open',exact:true}).click();
      await expect(page.locator('.browserPane')).toBeVisible({timeout:15000});
      return 'Built-in browser pane opened';
    },'22-browser-open.png');
    await closeSidePanes();

    await record('Connections: generate pairing key and save',async()=>{
      await openSettings();
      await section('Connections');
      const relay=page.getByPlaceholder('wss://your-relay.example.com');
      await relay.fill('ws://127.0.0.1:9');
      await page.getByRole('button',{name:'Generate',exact:true}).click();
      const keyInput=page.locator('.keyLine input');
      const key=await keyInput.inputValue();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      await page.getByRole('button',{name:'Save connection'}).click();
      const stored=await page.evaluate(()=>({relayUrl:localStorage.getItem('relayUrl'),pairKey:localStorage.getItem('pairKey')}));
      expect(stored.relayUrl).toBe('ws://127.0.0.1:9');
      expect(stored.pairKey).toBe(key);
      return 'Generated 256-bit hex pairing key and persisted connection settings';
    },'23-connections-pairing.png');

    await record('Connections: API validation is user-friendly',async()=>{
      await page.getByRole('button',{name:'Add API model'}).click();
      const error=page.locator('.formError');
      await expect(error).toBeVisible();
      const text=(await error.textContent())||'';
      if(/Error invoking remote method|api:addConnection/i.test(text)){
        throw new Error('Raw Electron IPC error is exposed to the user: '+text);
      }
      if(!/Base URL and model are required/i.test(text))throw new Error('Expected validation message was not shown: '+text);
      return text;
    },'24-connections-api-validation.png');

    await record('Connections: add and remove API model',async()=>{
      await page.getByPlaceholder('Display name').fill('QA Local Model');
      await page.getByPlaceholder('Base URL').fill('http://127.0.0.1:17893/v1');
      await page.getByPlaceholder('Model ID').fill('qa-model');
      await page.getByRole('button',{name:'Add API model'}).click();
      await expect(page.getByText('QA Local Model',{exact:true})).toBeVisible();
      const row=page.locator('.apiItem').filter({hasText:'QA Local Model'});
      await row.getByRole('button',{name:'Remove'}).click();
      await expect(page.getByText('QA Local Model',{exact:true})).toHaveCount(0);
      return 'Local API model can be stored and removed';
    },'25-connections-api-model.png');

    await record('Git section',async()=>{
      await section('Git');
      await expect(page.getByText('Local repository workspace',{exact:true})).toBeVisible();
      await expect(page.getByText('Repository actions',{exact:true})).toBeVisible();
      return 'Git policy rows rendered';
    },'26-git.png');

    await record('Environments section',async()=>{
      await section('Environments');
      await expect(page.getByText('Desktop runtime',{exact:true})).toBeVisible();
      await expect(page.getByText('Browser bridge',{exact:true})).toBeVisible();
      return 'Environment status rows rendered';
    },'27-environments.png');

    await record('Settings search',async()=>{
      const input=page.getByPlaceholder('Search settings');
      await input.fill('Browser');
      await expect(page.locator('.settingsNav button').filter({hasText:'Browser'}).first()).toBeVisible();
      await expect(page.locator('.settingsNav button').filter({hasText:'General'})).toHaveCount(0);
      await input.fill('');
      await expect(page.locator('.settingsNav button').filter({hasText:'General'}).first()).toBeVisible();
      return 'Settings navigation filters and restores';
    },'28-settings-search.png');

    await record('Close Settings',async()=>{
      await page.getByRole('button',{name:'Close settings'}).click();
      await expect(page.locator('.settingsScreen')).toHaveCount(0);
      return 'Settings closed';
    },'29-settings-closed.png');

    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    const failures=results.filter(r=>r.status==='FAIL');
    expect(failures,JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
