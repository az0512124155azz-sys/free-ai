import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5c');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
async function visibleButtonInventory(page,view){
  return page.evaluate(viewName=>{
    const visible=el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;
    };
    return [...document.querySelectorAll('button')].filter(visible).map((el,index)=>{
      const r=el.getBoundingClientRect();
      return {
        view:viewName,index,
        label:String(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,180),
        disabled:!!el.disabled,
        x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)
      };
    });
  },view);
}

test('Windows W5C core button interaction sweep',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[],inventory=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w5c-'));
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
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea{caret-color:transparent!important}'});

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };
    const collect=async view=>inventory.push(...await visibleButtonInventory(page,view));

    await page.evaluate(()=>window.desktopApi.addApiConnection({name:'W5 Button API',baseUrl:'http://127.0.0.1:17999/v1',model:'w5-button-model',apiKey:''}));

    await record('Primary navigation buttons route to expected pages',async()=>{
      await collect('home');
      await page.locator('.desktopPrimaryNav button').filter({hasText:'Plugins'}).click();
      await expect(page.getByRole('heading',{name:'Plugins',exact:true}).first()).toBeVisible();
      await collect('plugins');

      const tabs=page.getByRole('tablist',{name:'Plugin directory sections'});
      for(const label of ['Configured','Discover','Provider hints','AI providers']){
        await tabs.getByRole('tab',{name:label,exact:true}).click();
        await expect(tabs.getByRole('tab',{name:label,exact:true})).toHaveAttribute('aria-selected','true');
      }
      await page.getByRole('button',{name:'Explore',exact:true}).first().click();
      await expect(page.getByRole('heading',{name:'Explore',exact:true}).first()).toBeVisible();
      await collect('explore');
      const filters=page.getByRole('tablist',{name:'Explore filters'});
      for(const label of ['All','Configured','Public directory','Provider hints']){
        await filters.getByRole('tab',{name:label,exact:true}).click();
        await expect(filters.getByRole('tab',{name:label,exact:true})).toHaveAttribute('aria-selected','true');
      }
      await page.getByRole('button',{name:/Back to app/}).click();
      await expect(page.locator('.gptComposer')).toBeVisible();
      return 'Plugins tabs, Explore filters, and Back to app all responded';
    },'01-navigation.png');

    await record('Free AI Chat and Work controls switch cleanly',async()=>{
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await expect(page.locator('.gptComposer textarea')).toHaveAttribute('placeholder','Work with Free AI');
      await collect('free-work');
      await page.getByRole('tab',{name:'Chat',exact:true}).click();
      await expect(page.locator('.gptComposer textarea')).toHaveAttribute('placeholder','Message Free AI');
      await collect('free-chat');
      return 'Chat ↔ Work';
    },'02-chat-work.png');

    await record('Model picker opens, selects API model, and closes',async()=>{
      const button=page.locator('.modelButton');
      await button.click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expect(picker).toBeVisible();
      await collect('model-picker');
      await picker.getByRole('option',{name:/w5-button-model/i}).click();
      await expect(picker).toHaveCount(0);
      await expect(button).toContainText(/W5 Button API|w5-button-model/i);
      return 'API model selected';
    },'03-model-picker.png');

    await record('Add menu opens without retired Computer mirror action',async()=>{
      await page.getByRole('button',{name:'Add',exact:true}).click();
      const menu=page.getByRole('menu',{name:'Add'});
      await expect(menu).toBeVisible();
      await collect('add-menu-chat');
      await expect(menu.getByRole('menuitem',{name:/Computer/})).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      return 'Add opened/closed; Computer action absent';
    },'04-add-menu.png');

    await record('New project dialog buttons and creation work',async()=>{
      await page.locator('.newProjectItem').first().click();
      const dialog=page.locator('.projectDialog');
      await expect(dialog).toBeVisible();
      await collect('new-project-dialog');
      await page.getByRole('button',{name:'purple color'}).click();
      await page.getByRole('button',{name:'Planning'}).click();
      await page.getByPlaceholder('Project name').fill('W5 Buttons Project');
      await page.getByRole('button',{name:'Create project'}).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('heading',{name:'W5 Buttons Project'})).toBeVisible();
      await page.getByRole('button',{name:/Back to app/}).click();
      return 'Icon, color, input and Create project all responded';
    },'05-project.png');

    await record('Recents filter buttons open and select values',async()=>{
      const filter=page.getByRole('button',{name:'Filter Recents'});
      await filter.click();
      const menu=page.getByRole('menu',{name:'Filter Recents'});
      await expect(menu).toBeVisible();
      for(const label of ['Chat','Work','All']){
        if(await menu.count()===0)await filter.click();
        await page.getByRole('menu',{name:'Filter Recents'}).getByRole('menuitemradio',{name:label,exact:true}).click();
      }
      return 'Chat, Work, All filter choices responded';
    },'06-recents-filter.png');

    await record('Profile Settings entry opens every desktop settings section',async()=>{
      await page.locator('.profileButton').click();
      const account=page.getByRole('menu',{name:'Account'});
      await expect(account).toBeVisible();
      await collect('profile-menu');
      await account.getByRole('menuitem',{name:'Settings',exact:true}).click();
      const settings=page.locator('.settingsScreen');
      await expect(settings).toBeVisible();
      const sections=['General','App','Profile','Appearance','Voice','Personalization','Data controls','Configuration','Keyboard shortcuts','Computer use','Files','Plugins','Browser','Connections','Git','Environments'];
      for(const label of sections){
        const button=page.locator('.settingsNav').getByRole('button',{name:label,exact:true});
        if(await button.count()===0)throw new Error('Missing Settings section button: '+label);
        await button.click();
        await expect(page.locator('.settingsContentTop h1')).toHaveText(label);
      }
      await collect('settings-environments');
      await page.getByRole('button',{name:'Close settings'}).click();
      return sections.join(', ');
    },'07-settings-sections.png');

    await record('Super AI switcher and automatic-team control respond',async()=>{
      await page.getByRole('button',{name:/Switch product\. Current: Free AI/}).first().click();
      const menu=page.getByRole('menu',{name:'Product'});
      await menu.getByRole('menuitemradio',{name:/Super AI/}).click();
      await expect(page.getByRole('button',{name:/Switch product\. Current: Super AI/}).first()).toBeVisible();
      await expect(page.getByRole('tab',{name:'Work',exact:true})).toHaveAttribute('aria-selected','true');
      await collect('super-ai');
      const team=page.locator('.teamButton');
      await team.click();
      await expect(page.getByRole('dialog',{name:'Super AI automatic team'})).toBeVisible();
      await collect('super-team');
      await page.getByRole('button',{name:'Close team picker'}).click();
      return 'Product menu -> Super AI -> team dialog';
    },'08-super-ai.png');

    await record('Work Browser button opens and closes native browser pane',async()=>{
      const browserButton=page.locator('.workActions button').filter({hasText:'Browser'});
      await browserButton.click();
      await expect(page.locator('.browserPane')).toBeVisible({timeout:8000});
      await collect('browser-pane');
      await page.getByTitle('Close browser').click();
      await expect(page.locator('.browserPane')).toHaveCount(0);
      return 'Browser pane open/close';
    },'09-browser-pane.png');

    await record('New chat primary action resets back to usable shell',async()=>{
      await page.locator('.desktopPrimaryNav button').filter({hasText:'New chat'}).click();
      await expect(page.locator('.gptComposer')).toBeVisible();
      await expect(page.locator('.chatMessage')).toHaveCount(0);
      return 'New chat returned to empty composer';
    },'10-new-chat.png');

    const zeroSize=inventory.filter(x=>!x.disabled&&(x.width<8||x.height<8));
    await record('Visible enabled button inventory has no zero-size controls',async()=>{
      expect(zeroSize,JSON.stringify(zeroSize,null,2)).toEqual([]);
      expect(inventory.length).toBeGreaterThan(40);
      return inventory.length+' visible button states inventoried across core views';
    });

    await fs.writeFile(path.join(out,'button-inventory.json'),JSON.stringify(inventory,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
