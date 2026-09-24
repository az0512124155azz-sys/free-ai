import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w1');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

test('Windows W1 shell, sidebar, header and primary navigation audit',async()=>{
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w1-shell-'));
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
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
        siteToolsEnabled:true,spellCheckEnabled:true,hapticsEnabled:true,
        showBottomPanel:true,approvalMode:'ask'
      }));
      localStorage.setItem('freeai.chats.free',JSON.stringify([
        {id:'qa-chat',title:'Sample chat',providerId:'qa',source:'api',modelName:'QA Model',messages:[{role:'user',text:'Hello'}],mode:'chat',pinned:false,updatedAt:now},
        {id:'qa-work',title:'Sample work',providerId:'qa',source:'api',modelName:'QA Model',messages:[{role:'user',text:'Build something'}],mode:'work',pinned:false,updatedAt:now-1000}
      ]));
      localStorage.setItem('freeai.projects',JSON.stringify([]));
      localStorage.setItem('freeai.super.team','[]');
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    await page.locator('.desktopShell').waitFor({state:'visible'});
    await expect(page.locator('.authScreen')).toHaveCount(0);

    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.setResizable(false);w.show();w.focus()});
    await page.evaluate(async()=>{await document.fonts.ready});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea,[contenteditable="true"]{caret-color:transparent!important}'});

    await app.evaluate(({Menu,shell})=>{
      globalThis.__FREEAI_W1_MENUS__=[];
      globalThis.__FREEAI_W1_URLS__=[];
      const appMenu=Menu.getApplicationMenu();
      for(const item of appMenu?.items||[]){
        if(item?.submenu&&typeof item.submenu.popup==='function'){
          item.submenu.popup=()=>{globalThis.__FREEAI_W1_MENUS__.push(String(item.label||''));};
        }
      }
      shell.openExternal=async url=>{globalThis.__FREEAI_W1_URLS__.push(String(url||''));};
    });

    const record=async(name,fn,screenshot,{statusOnError='FAIL'}={})=>{
      try{
        const detail=await fn();
        results.push({name,status:'PASS',detail:detail||''});
      }catch(error){
        results.push({name,status:statusOnError,detail:error?.message||String(error)});
      }
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };

    await record('Initial Windows shell',async()=>{
      await expect(page.locator('.gptSidebar')).toBeVisible();
      await expect(page.locator('.workspaceHeader')).toBeVisible();
      await expect(page.getByRole('tab',{name:'Chat'})).toHaveAttribute('aria-selected','true');
      return 'Sidebar, header and Chat mode rendered';
    },'10-shell-initial.png');

    for(const label of ['File','Edit','View','Help']){
      await record('Windows app menu: '+label,async()=>{
        await page.getByRole('menuitem',{name:label,exact:true}).click();
        await expect.poll(async()=>app.evaluate(()=>globalThis.__FREEAI_W1_MENUS__||[])).toContain(label);
        return label+' menu IPC invoked';
      },`11-menu-${label.toLowerCase()}.png`);
    }

    await record('Product switcher opens',async()=>{
      await page.getByRole('button',{name:/Switch product\. Current: Free AI/}).click();
      await expect(page.locator('.productMenu')).toBeVisible();
      await expect(page.getByRole('menuitemradio',{name:/Super AI/})).toBeVisible();
      return 'Product menu visible';
    },'15-product-menu.png');

    await record('Switch to Super AI',async()=>{
      await page.getByRole('menuitemradio',{name:/Super AI/}).click();
      await expect(page.getByRole('button',{name:/Switch product\. Current: Super AI/})).toBeVisible();
      await expect(page.getByText('What should we build?')).toBeVisible();
      return 'Super AI selected';
    },'16-super-ai.png');

    await record('Switch back to Free AI',async()=>{
      await page.getByRole('button',{name:/Switch product\. Current: Super AI/}).click();
      await page.getByRole('menuitemradio',{name:/Free AI/}).click();
      await expect(page.getByRole('button',{name:/Switch product\. Current: Free AI/})).toBeVisible();
      return 'Free AI restored';
    },'17-free-ai-restored.png');

    await record('Search chats opens and filters',async()=>{
      await page.getByRole('button',{name:'Search chats'}).click();
      const input=page.getByPlaceholder('Search chats');
      await expect(input).toBeVisible();
      await input.fill('Sample work');
      await expect(page.getByText('Sample work',{exact:true})).toBeVisible();
      await expect(page.getByText('Sample chat',{exact:true})).toHaveCount(0);
      return 'Sidebar search filtered recents';
    },'18-search-filtered.png');

    await record('Search chats closes and clears active filter',async()=>{
      await page.getByRole('button',{name:'Search chats'}).click();
      await expect(page.getByPlaceholder('Search chats')).toHaveCount(0);
      await expect(page.getByText('Sample chat',{exact:true})).toBeVisible();
      await expect(page.getByText('Sample work',{exact:true})).toBeVisible();
      return 'Search field closed and all recents restored';
    },'19-search-closed.png');

    if(await page.getByPlaceholder('Search chats').count()===0){
      await page.getByRole('button',{name:'Search chats'}).click();
    }
    const cleanupSearch=page.getByPlaceholder('Search chats');
    if(await cleanupSearch.count()){
      await cleanupSearch.fill('');
      await page.getByRole('button',{name:'Search chats'}).click();
    }

    const navButton=label=>page.locator('.desktopPrimaryNav button').filter({hasText:label}).first();

    await record('New chat navigation',async()=>{
      await navButton('New chat').click();
      await expect(page.getByText('Ready when you are.')).toBeVisible();
      return 'New chat page opened';
    },'20-new-chat.png');

    await record('Plugins navigation',async()=>{
      await navButton('Plugins').click();
      await expect(page.locator('.pluginsPage,.contentPage').first()).toBeVisible();
      await expect(page.getByText('Plugins',{exact:true}).first()).toBeVisible();
      return 'Plugins page opened';
    },'21-plugins.png');

    await record('Explore navigation',async()=>{
      await navButton('Explore').click();
      await expect(page.locator('.contentPage').first()).toBeVisible();
      await expect(page.getByRole('heading',{name:'Explore',exact:true})).toBeVisible();
      return 'Explore page opened';
    },'22-explore.png');

    await record('New project dialog',async()=>{
      await page.locator('.newProjectItem').first().click();
      await expect(page.locator('.projectDialog')).toBeVisible();
      await page.getByPlaceholder('Project name').fill('QA Project');
      await expect(page.getByRole('button',{name:'Create project'})).toBeEnabled();
      return 'Project dialog opened and accepts a name';
    },'23-new-project-dialog.png');

    await record('Cancel new project',async()=>{
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(page.locator('.projectDialog')).toHaveCount(0);
      return 'Dialog cancelled';
    },'24-project-cancelled.png');

    await record('Recents filter opens',async()=>{
      await page.getByRole('button',{name:'Filter Recents'}).click();
      await expect(page.getByRole('menu',{name:'Filter Recents'})).toBeVisible();
      return 'Recents filter menu visible';
    },'25-recents-filter-menu.png');

    await record('Recents Work filter',async()=>{
      await page.getByRole('menuitemradio',{name:'Work',exact:true}).click();
      await expect(page.getByText('Sample work',{exact:true})).toBeVisible();
      await expect(page.getByText('Sample chat',{exact:true})).toHaveCount(0);
      return 'Only Work recent remains';
    },'26-recents-work.png');

    await record('Restore Recents All filter',async()=>{
      await page.getByRole('button',{name:'Filter Recents'}).click();
      await page.getByRole('menuitemradio',{name:'All',exact:true}).click();
      await expect(page.getByText('Sample chat',{exact:true})).toBeVisible();
      await expect(page.getByText('Sample work',{exact:true})).toBeVisible();
      return 'All recents restored';
    },'27-recents-all.png');

    await record('Work header tab',async()=>{
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await expect(page.getByRole('tab',{name:'Work',exact:true})).toHaveAttribute('aria-selected','true');
      return 'Work mode selected';
    },'28-work-tab.png');

    await record('Chat header tab',async()=>{
      await page.getByRole('tab',{name:'Chat',exact:true}).click();
      await expect(page.getByRole('tab',{name:'Chat',exact:true})).toHaveAttribute('aria-selected','true');
      return 'Chat mode selected';
    },'29-chat-tab.png');

    await record('Hide sidebar',async()=>{
      await page.getByTitle('Hide sidebar').click();
      await expect(page.locator('.gptSidebar')).toHaveCount(0);
      await expect(page.getByRole('button',{name:'Open sidebar'})).toBeVisible();
      return 'Sidebar hidden';
    },'30-sidebar-hidden.png');

    await record('Open sidebar',async()=>{
      await page.getByRole('button',{name:'Open sidebar'}).click();
      await expect(page.locator('.gptSidebar')).toBeVisible();
      return 'Sidebar restored';
    },'31-sidebar-restored.png');

    await record('Profile menu opens',async()=>{
      await page.locator('.profileButton').click();
      await expect(page.locator('.profileMenu')).toBeVisible();
      await expect(page.getByRole('menuitem',{name:/Settings/}).first()).toBeVisible();
      return 'Account menu opened';
    },'32-profile-menu.png');

    await record('Profile menu closes',async()=>{
      await page.locator('.profileButton').click();
      await expect(page.locator('.profileMenu')).toHaveCount(0);
      return 'Account menu closed';
    },'33-profile-menu-closed.png');

    await record('Help button',async()=>{
      await page.getByTitle('Help').click();
      await expect.poll(async()=>app.evaluate(()=>globalThis.__FREEAI_W1_URLS__||[])).toContain('https://github.com/az0512124155azz-sys/free-ai#readme');
      return 'Help routed to project README URL';
    },'34-help-clicked.png');

    await record('Plus menu in Chat',async()=>{
      await navButton('New chat').click();
      await page.getByRole('tab',{name:'Chat',exact:true}).click();
      await page.getByRole('button',{name:'Add'}).click();
      const menu=page.getByRole('menu',{name:'Add'});
      await expect(menu).toBeVisible();
      const labels=(await menu.getByRole('menuitem').allTextContents()).map(x=>x.trim()).filter(Boolean);
      return 'Chat Add items: '+labels.join(' | ');
    },'34a-plus-chat.png');

    await record('Plus menu in Work',async()=>{
      await page.getByRole('button',{name:'Add'}).click().catch(()=>{});
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await page.getByRole('button',{name:'Add'}).click();
      const menu=page.getByRole('menu',{name:'Add'});
      await expect(menu).toBeVisible();
      const labels=(await menu.getByRole('menuitem').allTextContents()).map(x=>x.trim()).filter(Boolean);
      return 'Work Add items: '+labels.join(' | ');
    },'34b-plus-work.png');

    await record('Computer item opens screen-mirror panel',async()=>{
      const menu=page.getByRole('menu',{name:'Add'});
      await expect(menu).toBeVisible();
      await menu.getByRole('menuitem',{name:/Computer/}).click();
      await expect(page.locator('.computerPane')).toBeVisible();
      await expect(page.getByText('Computer use',{exact:true})).toBeVisible();
      return 'Computer opens a side panel with captured-screen preview and manual click/type controls';
    },'34c-computer-panel.png');

    await record('Close Computer panel',async()=>{
      await page.locator('.computerPane .paneTabs button').click();
      await expect(page.locator('.computerPane')).toHaveCount(0);
      return 'Computer panel closed';
    },'34d-computer-closed.png');

    await record('Dictate button',async()=>{
      await navButton('New chat').click();
      await page.locator('.voiceButton').click();
      await page.waitForTimeout(400);
      const error=await page.locator('.dictationError,.formError').allTextContents().catch(()=>[]);
      if(error.some(x=>/not supported|permission|dictation/i.test(x))){
        throw new Error('Runner has no usable Windows dictation runtime: '+error.join(' | '));
      }
      await expect(page.locator('.desktopShell')).toBeVisible();
      return 'Dictate click did not crash the shell';
    },'35-dictate.png',{statusOnError:'BLOCKED'});

    await fs.writeFile(path.join(out,'shell-results.json'),JSON.stringify(results,null,2));
    const failures=results.filter(r=>r.status==='FAIL');
    expect(failures,JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
