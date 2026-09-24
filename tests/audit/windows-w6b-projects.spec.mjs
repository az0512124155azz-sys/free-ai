import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w6b');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function startServer(){
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||!req.url?.endsWith('/chat/completions')){res.statusCode=404;res.end('not found');return}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
    const last=[...(body.messages||[])].reverse().find(m=>m?.role==='user');
    const text=String(last?.content||'');
    requests.push({model:String(body.model||''),text,stream:body.stream===true});

    let answer='';
    if(text.includes('You are a specialist agent on a Super AI team.')){
      answer='Specialist evidence from '+body.model;
    }else if(text.includes('You are reviewing the controller result for a Super AI task.')){
      answer='Review from '+body.model+': approve.';
    }else if(text.includes('You are the primary controller finishing a Super AI task.')){
      answer='Final Master synthesis for project-hierarchy.';
    }else if(text.includes('You are the primary controller for a Super AI task.')){
      answer=JSON.stringify({kind:'complete',message:'Controller draft for project hierarchy.'});
    }else if(text.includes('agent-followup')){
      answer='Independent agent follow-up from '+body.model;
    }else{
      answer='QA response from '+body.model;
    }

    if(body.stream===true){
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
      for(const piece of answer.match(/.{1,18}/g)||[answer]){
        res.write('data: '+JSON.stringify({choices:[{delta:{content:piece}}]})+'\n\n');
        await new Promise(r=>setTimeout(r,35));
      }
      res.write('data: [DONE]\n\n');res.end();return;
    }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({choices:[{message:{content:answer}}]}));
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(17896,'127.0.0.1',()=>resolve({server,requests}));
  });
}

test('Windows W6B Master project and child agent chat audit',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const {server,requests}=await startServer();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w6b-'));
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
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} textarea,input{caret-color:transparent!important}'});

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };

    for(const [name,model] of [['Master QA','w6-master'],['Agent A','w6-agent-a'],['Agent B','w6-agent-b']]){
      await page.evaluate(async({name,model})=>window.desktopApi.addApiConnection({
        name,baseUrl:'http://127.0.0.1:17896/v1',model,apiKey:''
      }),{name,model});
    }

    await record('Super AI automatic team starts with all three models',async()=>{
      await page.getByRole('button',{name:/Switch product\. Current: Free AI/}).first().click();
      await page.getByRole('menu',{name:'Product'}).getByRole('menuitemradio',{name:/Super AI/}).click();
      await expect(page.locator('.teamButton')).toContainText('All AI · 3',{timeout:8000});
      await expect(page.locator('.modelButton')).toHaveCount(0);
      return '3-model automatic Super AI team';
    },'01-super-team.png');

    await record('Super AI automatically creates one orchestration project',async()=>{
      await page.locator('.gptComposer textarea').fill('project-hierarchy');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.locator('.workTaskStatus')).toContainText('Completed',{timeout:30000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Final Master synthesis');
      const state=await page.evaluate(()=>({
        projects:JSON.parse(localStorage.getItem('freeai.projects')||'[]'),
        chats:JSON.parse(localStorage.getItem('freeai.chats.super')||'[]')
      }));
      const projects=state.projects.filter(p=>p.product==='super'&&p.kind==='orchestration');
      expect(projects).toHaveLength(1);
      expect(projects[0].agentCount).toBe(3);
      return projects[0].name;
    },'02-master-completed.png');

    await record('Master and agent child chats persist with correct linkage',async()=>{
      const state=await page.evaluate(()=>({
        projects:JSON.parse(localStorage.getItem('freeai.projects')||'[]'),
        chats:JSON.parse(localStorage.getItem('freeai.chats.super')||'[]')
      }));
      const project=state.projects.find(p=>p.product==='super'&&p.kind==='orchestration');
      const master=state.chats.find(c=>c.projectId===project.id&&c.isMasterThread===true);
      const agents=state.chats.filter(c=>c.projectId===project.id&&c.isAgentThread===true);
      expect(master).toBeTruthy();
      expect(agents).toHaveLength(2);
      expect(agents.every(c=>c.parentChatId===master.id)).toBe(true);
      expect(agents.every(c=>c.taskId===master.taskId)).toBe(true);
      expect(agents.every(c=>Array.isArray(c.messages)&&c.messages.length>=2)).toBe(true);
      return 'Master '+master.id+' -> '+agents.map(a=>a.id).join(', ');
    },'03-storage-linkage.png');

    await record('Project page separates Master and Agents visibly',async()=>{
      await page.locator('.workTaskProjectButton').click();
      await expect(page.locator('.projectPage')).toBeVisible();
      await expect(page.locator('.projectSection').filter({hasText:'Master'}).first()).toContainText('1');
      await expect(page.locator('.projectSection').filter({hasText:'Agents'}).first()).toContainText('2');
      await expect(page.locator('.masterConversationList button')).toHaveCount(1);
      await expect(page.locator('.agentConversationList .agentConversationRow')).toHaveCount(2);
      return 'Project UI shows one Master thread and two child agent chats';
    },'04-project-page.png');

    await record('Agent child chat reopens as a real conversation',async()=>{
      const first=page.locator('.agentConversationList .agentConversationRow').first();
      const label=String(await first.textContent()||'');
      await first.click();
      await expect(page.locator('.conversationView')).toBeVisible();
      await expect(page.locator('.chatMessage')).toHaveCount(4,{timeout:8000});
      await expect(page.locator('.chatMessage.assistant .messageBody').first()).toContainText('Specialist evidence');
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Review from');
      return label.replace(/\s+/g,' ').trim();
    },'05-agent-chat.png');

    await record('Direct follow-up detaches agent thread from orchestration sync',async()=>{
      await page.locator('.gptComposer textarea').fill('agent-followup');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Independent agent follow-up',{timeout:12000});
      await expect.poll(()=>page.evaluate(()=>{
        const agents=JSON.parse(localStorage.getItem('freeai.chats.super')||'[]').filter(c=>c.isAgentThread);
        return agents.some(c=>c.detachedFromTask===true);
      }),{timeout:8000}).toBe(true);
      const agents=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.super')||'[]').filter(c=>c.isAgentThread));
      const detached=agents.find(c=>c.detachedFromTask===true);
      expect(detached.messages.some(m=>String(m.text||'').includes('agent-followup'))).toBe(true);
      expect(detached.messages.some(m=>String(m.text||'').includes('Independent agent follow-up'))).toBe(true);
      return detached.id+' detachedFromTask=true';
    },'06-agent-followup.png');

    await record('Returning to Master project preserves child-thread hierarchy',async()=>{
      const state=await page.evaluate(()=>({
        projects:JSON.parse(localStorage.getItem('freeai.projects')||'[]'),
        chats:JSON.parse(localStorage.getItem('freeai.chats.super')||'[]')
      }));
      const project=state.projects.find(p=>p.product==='super'&&p.kind==='orchestration');
      await page.locator('.projectItem').filter({hasText:project.name}).first().click();
      await expect(page.locator('.projectPage')).toBeVisible();
      await expect(page.locator('.masterConversationList button')).toHaveCount(1);
      await expect(page.locator('.agentConversationList .agentConversationRow')).toHaveCount(2);
      const agents=state.chats.filter(c=>c.projectId===project.id&&c.isAgentThread);
      expect(agents.some(c=>c.detachedFromTask===true)).toBe(true);
      return 'Hierarchy remains 1 Master + 2 Agents after direct agent follow-up';
    },'07-project-return.png');

    await fs.writeFile(path.join(out,'server-requests.json'),JSON.stringify(requests,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await new Promise(resolve=>server.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
