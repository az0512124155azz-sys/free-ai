import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test,expect,_electron as electron} from '@playwright/test';

const OUT=path.resolve('artifacts/linux-l1-pr143');
await fs.mkdir(OUT,{recursive:true});
const results=[];
const add=(name,status,detail='')=>{results.push({name,status,detail});console.log(status,name,detail)};
const save=()=>fs.writeFile(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
const shot=(page,name)=>page.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});

async function check(name,fn){
  try{const detail=await fn();add(name,'PASS',detail||'')}
  catch(error){add(name,'FAIL',String(error?.message||error));throw error}
}

test('PR143 Linux L1.1 packaged backend and QA shell',async()=>{
  const packagedExe=process.env.FREEAI_LINUX_EXECUTABLE;
  const qaExe=process.env.FREEAI_LINUX_QA_EXECUTABLE;
  const packagedData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-linux-pkg-'));
  const qaData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-linux-qa-'));
  const repoDir=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-linux-repo-'));
  let packagedApp,qaApp;
  try{
    execFileSync('git',['init','-b','main'],{cwd:repoDir,stdio:'ignore'});
    execFileSync('git',['config','user.email','linux.qa@freeai.local'],{cwd:repoDir});
    execFileSync('git',['config','user.name','Linux QA'],{cwd:repoDir});
    await fs.writeFile(path.join(repoDir,'README.md'),'# Linux PR143 QA\n');
    execFileSync('git',['add','README.md'],{cwd:repoDir});
    execFileSync('git',['commit','-m','qa'],{cwd:repoDir,stdio:'ignore'});

    packagedApp=await electron.launch({executablePath:packagedExe,args:[`--user-data-dir=${packagedData}`,'--no-sandbox']});
    const packaged=await packagedApp.firstWindow();
    await packaged.waitForLoadState('domcontentloaded');
    await packaged.waitForTimeout(700);

    await check('Packaged artifact reports Linux',async()=>{
      const value=await packaged.evaluate(()=>window.desktopApi?.platform);
      expect(value).toBe('linux');
      return value;
    });
    await check('Packaged artifact is packaged',async()=>{
      const info=await packaged.evaluate(()=>window.desktopApi?.getAppInfo?.());
      expect(info?.packaged).toBe(true);
      return JSON.stringify(info);
    });
    await check('Packaged repository summary works on Linux',async()=>{
      const summary=await packaged.evaluate(root=>window.desktopApi.repositorySummary(root),repoDir);
      expect(summary?.name).toBe(path.basename(repoDir));
      expect(summary?.branch).toBe('main');
      expect(summary?.head).toBeTruthy();
      return JSON.stringify({name:summary.name,branch:summary.branch,head:summary.head,dirty:summary.dirty});
    });
    await shot(packaged,'01-packaged-auth-shell');
    await packagedApp.close();
    packagedApp=null;

    qaApp=await electron.launch({executablePath:qaExe,args:[`--user-data-dir=${qaData}`,'--no-sandbox'],env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}});
    const page=await qaApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.addInitScript(()=>{
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({appearance:'dark',showBottomPanel:true,approvalMode:'ask'}));
      localStorage.setItem('freeai.chats.free',JSON.stringify([
        {id:'a',title:'Linux Alpha',mode:'chat',updatedAt:2,messages:[]},
        {id:'b',title:'Linux Beta',mode:'chat',updatedAt:1,messages:[]}
      ]));
    });
    await page.reload();
    await expect(page.locator('.desktopShell')).toBeVisible();
    const bw=await qaApp.browserWindow(page);
    await bw.evaluate(win=>{win.setBounds({x:0,y:0,width:1440,height:900});win.show();win.focus()});
    await shot(page,'02-free-shell');

    await check('Search close restores full Recents',async()=>{
      const sidebar=page.locator('.gptSidebar');
      const rows=sidebar.locator('.recentRow');
      await expect(rows).toHaveCount(2);
      const toggle=sidebar.getByRole('button',{name:'Search chats'});
      await toggle.click();
      await sidebar.getByPlaceholder('Search chats').fill('Alpha');
      await expect(rows).toHaveCount(1);
      await toggle.click();
      await expect(rows).toHaveCount(2);
      return '2 -> 1 -> 2 rows';
    });

    await check('Linux Work has one attachment path',async()=>{
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      const addButton=page.getByRole('button',{name:'Add',exact:true});
      await addButton.click();
      const menu=page.locator('.floatingMenu').last();
      await expect(menu).toBeVisible();
      await expect(menu.getByText('Files and folders',{exact:true})).toBeVisible();
      expect(await menu.getByText('Attach files',{exact:true}).count()).toBe(0);
      await shot(page,'03-linux-work-add');
      await page.keyboard.press('Escape');
      return 'Files and folders present; Attach files absent';
    });

    await check('Super AI repository control is visible on Linux',async()=>{
      await page.getByTitle('Switch product').click();
      await page.locator('.productMenu button').filter({hasText:'Super AI'}).click();
      const button=page.getByRole('button',{name:'Choose repository'});
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await shot(page,'04-super-repository');
      return 'Choose repository visible + enabled';
    });

    await check('QA shell repository backend works on Linux',async()=>{
      const summary=await page.evaluate(root=>window.desktopApi.repositorySummary(root),repoDir);
      expect(summary?.branch).toBe('main');
      return JSON.stringify({name:summary.name,branch:summary.branch,dirty:summary.dirty});
    });

    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
    add('No renderer page errors','PASS','0');
    await shot(page,'05-final');
  }finally{
    await save();
    await packagedApp?.close().catch(()=>{});
    await qaApp?.close().catch(()=>{});
    await fs.rm(packagedData,{recursive:true,force:true}).catch(()=>{});
    await fs.rm(qaData,{recursive:true,force:true}).catch(()=>{});
    await fs.rm(repoDir,{recursive:true,force:true}).catch(()=>{});
  }
  expect(results.filter(row=>row.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
});
