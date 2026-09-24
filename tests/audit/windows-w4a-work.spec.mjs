import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w4a');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function sse(res,text,{delay=90,chunk=24}={}){
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});
  res.flushHeaders?.();
  const pieces=text.match(new RegExp('.{1,'+chunk+'}','gs'))||[text];
  let i=0;
  const timer=setInterval(()=>{
    if(res.destroyed||res.writableEnded){clearInterval(timer);return}
    if(i>=pieces.length){
      clearInterval(timer);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.write('data: '+JSON.stringify({choices:[{delta:{content:pieces[i++]}}]})+'\n\n');
  },delay);
}
function startServer(){
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||!req.url?.endsWith('/chat/completions')){
      res.statusCode=404;res.end('not found');return;
    }
    const chunks=[];
    for await (const chunk of req)chunks.push(chunk);
    let body={};
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{}
    const last=[...(body.messages||[])].reverse().find(m=>m?.role==='user');
    const text=String(last?.content||'');
    const row={model:String(body.model||''),text,aborted:false,finished:false};
    requests.push(row);
    res.on('close',()=>{if(!row.finished)row.aborted=true});

    let answer='';
    let delay=80;
    if(text.includes('You are a specialist agent on a Super AI team.')){
      answer='Specialist brief from '+body.model;
    }else if(text.includes('You are reviewing the controller result for a Super AI task.')){
      answer='Review from '+body.model+': controller draft is sound.';
    }else if(text.includes('You are the primary controller finishing a Super AI task.')){
      answer='Final synthesis from '+body.model+' after specialist reviews.';
    }else if(text.includes('You are the primary controller for a Super AI task.')){
      answer=JSON.stringify({kind:'complete',message:'Controller draft for Super AI task.'});
    }else if(text.includes('You are controlling a Free AI Work task.')){
      if(text.includes('slow-work-stop')){
        answer=JSON.stringify({kind:'complete',message:'This should never finish before Stop.'});
        delay=650;
      }else if(text.includes('work-approval')&&!text.includes('"denied":true')){
        answer=JSON.stringify({kind:'tool',tool:'browser_builtin',summary:'Open example.com for QA',action:{type:'navigate',url:'https://example.com'}});
      }else if(text.includes('work-approval')){
        answer=JSON.stringify({kind:'complete',message:'Approval denial handled without executing the browser action.'});
      }else{
        answer=JSON.stringify({kind:'complete',message:'Free AI Work completed through the controller.'});
      }
    }else{
      answer='Unexpected QA prompt';
    }

    if(body.stream===true){
      sse(res,answer,{delay,chunk:delay>500?10:28});
      res.on('finish',()=>{row.finished=true});
    }else{
      res.setHeader('content-type','application/json');
      row.finished=true;
      res.end(JSON.stringify({choices:[{message:{content:answer}}]}));
    }
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(17894,'127.0.0.1',()=>resolve({server,requests}));
  });
}

test('Windows W4A Work and Super AI audit',async()=>{
  test.setTimeout(240000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const {server,requests}=await startServer();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w4a-'));
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
        customizationEnabled:true,customInstructions:'',
        siteToolsEnabled:true,spellCheckEnabled:true,showBottomPanel:true,approvalMode:'ask'
      }));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.windowsDesktopRoot').waitFor({state:'visible'});
    const win=await app.browserWindow(page);
    await win.evaluate(w=>{w.setBounds({x:0,y:0,width:1440,height:900});w.show();w.focus()});
    await page.evaluate(async()=>{await document.fonts.ready});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} textarea,input{caret-color:transparent!important}'});

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };
    const addModel=async(name,model)=>page.evaluate(async({name,model})=>{
      return window.desktopApi.addApiConnection({name,baseUrl:'http://127.0.0.1:17894/v1',model,apiKey:''});
    },{name,model});
    await addModel('QA Master','qa-master');
    await addModel('QA Agent A','qa-agent-a');
    await addModel('QA Agent B','qa-agent-b');

    const chooseMaster=async()=>{
      if(!String(await page.locator('.modelButton').textContent()||'').includes('qa-master')){
        await page.locator('.modelButton').click();
        const picker=page.getByRole('listbox',{name:'Select model'});
        await picker.getByRole('option',{name:/qa-master/i}).click();
      }
    };
    const send=async text=>{
      const composer=page.locator('.gptComposer textarea');
      await composer.fill(text);
      await page.getByRole('button',{name:'Send message'}).click();
    };
    const newChat=async()=>{
      await page.locator('.desktopPrimaryNav button').filter({hasText:'New chat'}).first().click();
    };

    await record('Free AI Work mode opens with approvals and model controls',async()=>{
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await expect(page.locator('.gptComposer textarea')).toHaveAttribute('placeholder','Work with Free AI');
      await expect(page.locator('.accessButton')).toContainText('Always ask');
      await chooseMaster();
      return 'Work composer ready with QA Master';
    },'01-work-mode.png');

    await record('Free AI Work completes a controller task',async()=>{
      await send('work-complete');
      const status=page.locator('.workTaskStatus');
      await expect(status).toBeVisible({timeout:8000});
      await expect(status).toContainText('Completed',{timeout:15000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Free AI Work completed through the controller.',{timeout:8000});
      expect(requests.some(r=>r.text.includes('You are controlling a Free AI Work task.')&&r.text.includes('work-complete'))).toBe(true);
      return 'Work task reached completed and wrote final assistant result';
    },'02-work-completed.png');

    await record('Work approval card appears before website access',async()=>{
      await newChat();
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await chooseMaster();
      await send('work-approval');
      const card=page.locator('.workApprovalCard');
      await expect(card).toBeVisible({timeout:12000});
      await expect(card).toContainText('Allow website access?');
      await expect(card).toContainText('https://example.com');
      return 'Website scope requires explicit approval';
    },'03-work-approval.png');

    await record('Deny approval replans without executing browser action',async()=>{
      const beforeBrowser=await page.locator('.browserPane').count();
      await page.locator('.workApprovalCard').getByRole('button',{name:'Deny'}).click();
      await expect(page.locator('.workTaskStatus')).toContainText('Completed',{timeout:15000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Approval denial handled',{timeout:8000});
      expect(await page.locator('.browserPane').count()).toBe(beforeBrowser);
      const denialFollowup=requests.some(r=>r.text.includes('work-approval')&&r.text.includes('"denied":true'));
      expect(denialFollowup).toBe(true);
      return 'Denied action was not executed; controller received denial observation';
    },'04-work-denied.png');

    await record('Stop halts an active Work task',async()=>{
      await newChat();
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await chooseMaster();
      await send('slow-work-stop');
      await expect(page.locator('.workTaskStatus')).toContainText('Running',{timeout:8000});
      await expect(page.getByRole('button',{name:'Stop generating'})).toBeVisible({timeout:8000});
      await shot(page,'05-work-stop-before.png');
      await page.getByRole('button',{name:'Stop generating'}).click();
      await expect(page.locator('.workTaskStatus')).toContainText('Stopped',{timeout:8000});
      await expect.poll(()=>requests.some(r=>r.text.includes('slow-work-stop')&&r.aborted===true)).toBe(true);
      return 'Active Work controller request aborted and task became Stopped';
    },'06-work-stopped.png');

    await record('Super AI removes manual model picker and shows automatic team count',async()=>{
      await newChat();
      const switcher=page.locator('.desktopProductSwitcher').first();
      await switcher.getByRole('button').first().click();
      const menu=page.getByRole('menu',{name:/product/i});
      if(await menu.count()){
        await menu.getByRole('menuitem',{name:/Super AI/}).click();
      }else{
        const superButton=page.getByText('Super AI',{exact:true}).last();
        await superButton.click();
      }
      await expect(page.locator('.teamButton')).toContainText('All AI · 3',{timeout:8000});
      await expect(page.locator('.modelButton')).toHaveCount(0);
      await page.locator('.teamButton').click();
      const team=page.getByRole('dialog',{name:'Super AI automatic team'});
      await expect(team).toBeVisible();
      await expect(team.locator('.teamControllerChoice')).toHaveCount(3);
      return 'Three connected AIs are included automatically; no manual model picker';
    },'07-super-team.png');

    await record('Super AI task uses specialists, controller, review, and synthesis',async()=>{
      const team=page.getByRole('dialog',{name:'Super AI automatic team'});
      await team.getByRole('button',{name:'Close team picker'}).click();
      const composer=page.locator('.gptComposer textarea');
      await composer.fill('super-coordination');
      await page.getByRole('button',{name:'Send message'}).click();
      const status=page.locator('.workTaskStatus');
      await expect(status).toBeVisible({timeout:8000});
      await expect(status.locator('.workAgent')).toHaveCount(3,{timeout:8000});
      await expect(status).toContainText('Super AI',{timeout:8000});
      await expect(status).toContainText('Completed',{timeout:30000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Final synthesis from qa-master after specialist reviews.',{timeout:12000});
      const specialistRequests=requests.filter(r=>r.text.includes('You are a specialist agent on a Super AI team.'));
      const reviewRequests=requests.filter(r=>r.text.includes('You are reviewing the controller result for a Super AI task.'));
      const controllerRequests=requests.filter(r=>r.text.includes('You are the primary controller for a Super AI task.'));
      const synthesisRequests=requests.filter(r=>r.text.includes('You are the primary controller finishing a Super AI task.'));
      expect(specialistRequests.length).toBe(2);
      expect(reviewRequests.length).toBe(2);
      expect(controllerRequests.length).toBe(1);
      expect(synthesisRequests.length).toBe(1);
      return '2 specialists + 1 controller + 2 reviewers + 1 final synthesis request observed';
    },'08-super-completed.png');

    await record('Super AI specialist threads are persisted as agent chats',async()=>{
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.super')||'[]'));
      const agents=stored.filter(chat=>chat.isAgentThread===true&&chat.taskId);
      expect(agents.length).toBeGreaterThanOrEqual(2);
      expect(agents.every(chat=>Array.isArray(chat.messages)&&chat.messages.length>=2)).toBe(true);
      return agents.map(chat=>chat.title).join(' | ');
    },'09-super-agent-chats.png');

    await fs.writeFile(path.join(out,'server-requests.json'),JSON.stringify(requests,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await new Promise(resolve=>server.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
