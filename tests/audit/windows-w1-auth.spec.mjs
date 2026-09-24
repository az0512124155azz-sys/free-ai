import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w1');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

test('Windows W1 auth entry audit',async()=>{
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w1-auth-'));
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
    await page.locator('.authScreen').waitFor({state:'visible',timeout:20000});

    const record=async(name,fn,screenshot)=>{
      try{
        const detail=await fn();
        results.push({name,status:'PASS',detail:detail||''});
      }catch(error){
        results.push({name,status:'FAIL',detail:error?.message||String(error)});
      }
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };

    await record('Auth screen renders',async()=>{
      await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();
      await expect(page.getByPlaceholder('Email')).toBeVisible();
      await expect(page.getByPlaceholder('Password')).toBeVisible();
      await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
      return 'Sign-in entry controls visible';
    },'01-auth-signin.png');

    await record('Email/password fields accept input',async()=>{
      await page.getByPlaceholder('Email').fill('qa@example.com');
      await page.getByPlaceholder('Password').fill('12345678');
      await expect(page.getByPlaceholder('Email')).toHaveValue('qa@example.com');
      await expect(page.getByPlaceholder('Password')).toHaveValue('12345678');
      return 'Input accepted; no real credentials submitted';
    },'02-auth-fields-filled.png');

    await record('Create-account switch',async()=>{
      await page.getByRole('button',{name:/New to Free AI\? Create account/}).click();
      await expect(page.getByRole('heading',{name:'Create your account'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Create account',exact:true})).toBeVisible();
      return 'Sign-up state opened';
    },'03-auth-create-account.png');

    await record('Return to sign-in',async()=>{
      await page.getByRole('button',{name:/Already have an account\? Sign in/}).click();
      await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
      return 'Returned to sign-in state';
    },'04-auth-back-to-signin.png');

    results.push({
      name:'Real credential authentication',
      status:'BLOCKED',
      detail:'No user credentials are injected into the audit branch. W1 does not submit or expose real account credentials.'
    });

    await fs.writeFile(path.join(out,'auth-results.json'),JSON.stringify(results,null,2));
    const failures=results.filter(r=>r.status==='FAIL');
    expect(failures,JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
