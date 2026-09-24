import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w4c');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
async function createGitRepo(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w4c-repo-'));
  execFileSync('git',['init','-b','qa-main',root],{stdio:'ignore'});
  execFileSync('git',['-C',root,'config','user.email','qa@example.test']);
  execFileSync('git',['-C',root,'config','user.name','Free AI QA']);
  await fs.writeFile(path.join(root,'README.md'),'# W4C QA repo\n');
  execFileSync('git',['-C',root,'add','README.md']);
  execFileSync('git',['-C',root,'commit','-m','Initial QA commit'],{stdio:'ignore'});
  return root;
}
function startRelay(){
  const messages=[];
  const wss=new WebSocketServer({host:'127.0.0.1',port:17930});
  wss.on('connection',ws=>{
    ws.on('message',raw=>{
      let value;try{value=JSON.parse(String(raw))}catch{return}
      messages.push(value);
    });
  });
  return new Promise((resolve,reject)=>{
    wss.once('listening',()=>resolve({wss,messages}));
    wss.once('error',reject);
  });
}

test('Windows W4C Connections Git Environments shortcuts audit',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const gitRoot=await createGitRepo();
  const {wss,messages:relayMessages}=await startRelay();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w4c-user-'));
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
    async function openSettings(section='General'){
      if(await page.locator('.settingsScreen').count()===0){
        await page.locator('.profileButton').click();
        await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
      }
      if(section){
        await page.locator('.settingsNav').getByRole('button',{name:section,exact:true}).click();
        await expect(page.locator('.settingsContentTop h1')).toHaveText(section);
      }
    }
    async function closeSettings(){
      if(await page.locator('.settingsScreen').count())await page.getByRole('button',{name:'Close settings'}).click();
    }

    await record('Connections establishes a real relay WebSocket',async()=>{
      await openSettings('Connections');
      await page.getByLabel('Relay URL').fill('ws://127.0.0.1:17930');
      const key='0123456789abcdef'.repeat(4);
      await page.getByLabel('Android pairing API key').fill(key);
      await page.getByRole('button',{name:'Save connection'}).click();
      await expect.poll(()=>relayMessages.some(m=>m.type==='hello'&&m.role==='desktop'&&m.key===key),{timeout:8000}).toBe(true);
      await expect.poll(async()=>(await page.evaluate(()=>window.desktopApi.getStatus())).relay,{timeout:8000}).toBe(true);
      return 'Desktop sent authenticated hello to local relay and status.relay became true';
    },'01-connections-relay.png');

    await record('Connections survives Settings close and reopen',async()=>{
      await closeSettings();
      await openSettings('Connections');
      await expect(page.getByLabel('Relay URL')).toHaveValue('ws://127.0.0.1:17930');
      const stored=await page.evaluate(()=>({relayUrl:localStorage.getItem('relayUrl'),pairKey:localStorage.getItem('pairKey')}));
      expect(stored.relayUrl).toBe('ws://127.0.0.1:17930');
      expect(stored.pairKey).toHaveLength(64);
      return 'Relay URL and pairing key persisted locally';
    },'02-connections-persisted.png');

    await record('Git Settings documents repository capability',async()=>{
      await openSettings('Git');
      await expect(page.getByText('Local repository workspace',{exact:true})).toBeVisible();
      await expect(page.getByText('Repository actions',{exact:true})).toBeVisible();
      return 'Git settings rows visible';
    },'03-git-settings.png');

    await record('Super AI Choose repository opens real Git workspace',async()=>{
      await closeSettings();
      await app.evaluate(({dialog},repoPath)=>{
        dialog.showOpenDialog=()=>Promise.resolve({canceled:false,filePaths:[repoPath]});
      },gitRoot);
      await page.getByRole('button',{name:/Switch product\. Current: Free AI/}).first().click();
      await page.getByRole('menu',{name:'Product'}).getByRole('menuitemradio',{name:/Super AI/}).click();
      const choose=page.locator('.workActions button').filter({hasText:'Choose repository'});
      await expect(choose).toBeVisible();
      await choose.click();
      const chip=page.locator('.repositoryContextChip').first();
      await expect(chip).toBeVisible({timeout:8000});
      await expect(chip).toContainText(path.basename(gitRoot));
      await expect(chip).toContainText('qa-main');
      const summary=await page.evaluate(root=>window.desktopApi.repositorySummary(root),gitRoot);
      expect(summary.branch).toBe('qa-main');
      expect(summary.dirty).toBe(0);
      expect(summary.head).not.toBe('');
      return 'Real committed qa-main repository selected and summarized';
    },'04-repository-selected.png');

    await record('Environments reports desktop runtime and browser bridge state',async()=>{
      await openSettings('Environments');
      await expect(page.getByText('Desktop runtime',{exact:true})).toBeVisible();
      await expect(page.getByText('Electron desktop',{exact:true})).toBeVisible();
      await expect(page.getByText('Browser bridge',{exact:true})).toBeVisible();
      await expect(page.getByText('Disconnected',{exact:true}).first()).toBeVisible();
      return 'Electron runtime and current extension bridge state surfaced';
    },'05-environments.png');
    await closeSettings();

    await record('Ctrl+N invokes native New chat accelerator',async()=>{
      await page.locator('.gptComposer textarea').fill('draft that should be cleared');
      await page.keyboard.press('Control+N');
      await expect(page.locator('.gptComposer textarea')).toHaveValue('');
      await expect(page.getByText('What should we build?')).toBeVisible();
      return 'Ctrl+N cleared current draft via app New chat command';
    },'06-shortcut-new-chat.png');

    await record('Ctrl+Shift+S toggles sidebar',async()=>{
      const before=await page.locator('.gptSidebar').count();
      await page.keyboard.press('Control+Shift+S');
      await expect.poll(()=>page.locator('.gptSidebar').count()).toBe(before?0:1);
      await page.keyboard.press('Control+Shift+S');
      await expect.poll(()=>page.locator('.gptSidebar').count()).toBe(before);
      return 'Sidebar hidden and restored';
    },'07-shortcut-sidebar.png');

    await record('Ctrl+Shift+B toggles built-in Browser',async()=>{
      await page.keyboard.press('Control+Shift+B');
      await expect(page.locator('.browserPane')).toBeVisible({timeout:8000});
      await page.keyboard.press('Control+Shift+B');
      await expect(page.locator('.browserPane')).toHaveCount(0,{timeout:8000});
      return 'Browser pane opened and closed through native accelerator';
    },'08-shortcut-browser.png');

    await record('Ctrl+, opens Settings as documented',async()=>{
      await page.keyboard.press('Control+,');
      if(await page.locator('.settingsScreen').count()===0){
        const menuInfo=await app.evaluate(({Menu})=>{
          const appMenu=Menu.getApplicationMenu();
          const all=[];
          for(const top of appMenu?.items||[]){
            for(const item of top.submenu?.items||[])if(item.accelerator)all.push({label:item.label,accelerator:item.accelerator});
          }
          return all;
        });
        throw new Error('Settings documents Ctrl+, but pressing it did not open Settings. Native menu accelerators are: '+JSON.stringify(menuInfo));
      }
      return 'Settings opened via Ctrl+,';
    },'09-shortcut-settings.png');

    await record('Keyboard Shortcuts page matches registered native accelerators',async()=>{
      if(await page.locator('.settingsScreen').count()===0)await openSettings('Keyboard shortcuts');
      else{
        await page.locator('.settingsNav').getByRole('button',{name:'Keyboard shortcuts',exact:true}).click();
      }
      const menuInfo=await app.evaluate(({Menu})=>{
        const appMenu=Menu.getApplicationMenu();
        const all=[];
        for(const top of appMenu?.items||[]){
          for(const item of top.submenu?.items||[])if(item.accelerator)all.push({label:item.label,accelerator:item.accelerator});
        }
        return all;
      });
      const normalized=menuInfo.map(x=>String(x.accelerator).toLowerCase());
      expect(normalized.some(x=>x.includes('ctrl+n')||x.includes('commandorcontrol+n'))).toBe(true);
      expect(normalized.some(x=>x.includes('ctrl+shift+b')||x.includes('commandorcontrol+shift+b'))).toBe(true);
      if(!normalized.some(x=>x.includes('ctrl+,')||x.includes('commandorcontrol+,'))){
        throw new Error('UI lists Settings = Ctrl+, but Electron application menu has no matching accelerator.');
      }
      return 'Displayed shortcuts all have native accelerators';
    },'10-keyboard-shortcuts.png');

    await fs.writeFile(path.join(out,'relay-messages.json'),JSON.stringify(relayMessages,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await new Promise(resolve=>wss.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
    await fs.rm(gitRoot,{recursive:true,force:true}).catch(()=>{});
  }
});
