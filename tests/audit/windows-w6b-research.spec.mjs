import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w6b');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function startApiAndSearch(){
  const apiRequests=[],searchRequests=[];
  const api=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||!req.url?.endsWith('/chat/completions')){res.statusCode=404;res.end('not found');return}
    const parts=[];for await(const c of req)parts.push(c);
    const body=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
    apiRequests.push(body);
    const all=JSON.stringify(body.messages||[]);
    let answer='';
    if(all.includes('You create search queries only')){
      answer=JSON.stringify(['reserved example domains']);
    }else if(all.includes('rigorous research synthesizer')){
      answer=[
        '# QA Research Report',
        '## Executive summary',
        'Example Domain is reserved for documentation and examples [S1].',
        '## Findings',
        'The retrieved source describes Example Domain as usable in illustrative examples [S1].',
        '## Methodology',
        'Free AI searched the reviewed scope and read the cited source.',
        '## Sources',
        '[S1]'
      ].join('\n');
    }else{
      answer='Normal QA API response';
    }
    if(body.stream===true){
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
      for(const chunk of answer.match(/.{1,24}/gs)||[answer]){
        res.write('data: '+JSON.stringify({choices:[{delta:{content:chunk}}]})+'\n\n');
        await new Promise(r=>setTimeout(r,25));
      }
      res.write('data: [DONE]\n\n');res.end();return;
    }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({choices:[{message:{content:answer}}]}));
  });

  const search=http.createServer((req,res)=>{
    const url=new URL(req.url||'/','http://127.0.0.1:17897');
    if(url.pathname!=='/search'){res.statusCode=404;res.end('not found');return}
    searchRequests.push({q:url.searchParams.get('q')||'',format:url.searchParams.get('format')||'',safesearch:url.searchParams.get('safesearch')||''});
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({results:[
      {url:'https://example.com/',title:'Example Domain',content:'Example Domain is reserved for use in documentation and illustrative examples.'},
      {url:'https://www.iana.org/help/example-domains',title:'IANA Example Domains',content:'IANA maintains example domains for documentation.'}
    ]}));
  });

  return new Promise((resolve,reject)=>{
    let n=0;const done=()=>{if(++n===2)resolve({api,search,apiRequests,searchRequests})};
    api.once('error',reject);search.once('error',reject);
    api.listen(17896,'127.0.0.1',done);
    search.listen(17897,'127.0.0.1',done);
  });
}
async function connectSearchBridge(){
  const state={requests:[],prompts:[]};
  let socket=null;
  for(let i=0;i<40;i++){
    try{
      socket=new WebSocket('ws://127.0.0.1:17341',{headers:{Origin:'chrome-extension://freeai-w6b'}});
      await new Promise((resolve,reject)=>{
        const t=setTimeout(()=>reject(new Error('bridge timeout')),1000);
        socket.once('open',()=>{clearTimeout(t);resolve()});
        socket.once('error',e=>{clearTimeout(t);reject(e)});
      });
      break;
    }catch(e){
      try{socket?.close()}catch{}
      socket=null;await new Promise(r=>setTimeout(r,200));
      if(i===39)throw e;
    }
  }
  const provider={
    id:'chatgpt:301',providerId:'chatgpt',name:'ChatGPT',modelName:'GPT Search QA',
    title:'ChatGPT Search QA',tabId:301,windowId:1,url:'https://chatgpt.com/c/search-qa',
    connected:true,adapterReady:true,effortLevels:['instant','high'],activeEffort:'instant',
    effortControl:'native',modelOptions:['GPT Search QA'],fileUpload:true,mcps:[]
  };
  socket.on('message',raw=>{
    let m;try{m=JSON.parse(String(raw))}catch{return}
    state.requests.push(m);
    if(m.type==='scanProviders'){
      socket.send(JSON.stringify({type:'providers',providers:[provider]}));return;
    }
    if(m.type==='scanBrowser'){
      socket.send(JSON.stringify({type:'browserState',state:{tabs:[{id:301,windowId:1,active:true,title:provider.title,url:provider.url,controlled:true}],activeTabId:301,activeWindowId:1}}));return;
    }
    if(m.type==='prompt'){
      state.prompts.push(m);
      const result={
        type:'response',id:m.id,
        text:'Live Search QA answer with a real source card.',
        sources:[{title:'Example Domain',url:'https://example.com/',domain:'example.com',excerpt:'Example source excerpt'}]
      };
      socket.send(JSON.stringify({type:'stream',id:m.id,text:'Live Search QA answer'}));
      setTimeout(()=>socket.send(JSON.stringify(result)),80);
    }
  });
  socket.send(JSON.stringify({type:'hello',role:'extension',browserUseVersion:2}));
  return {socket,state};
}

test('Windows W6B Search Deep Research and export audit',async()=>{
  test.setTimeout(240000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const servers=await startApiAndSearch();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w6b-'));
  const app=await electron.launch({args:['.',`--user-data-dir=${userData}`],env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}});
  let bridge;
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.addInitScript(()=>{
      localStorage.clear();
      localStorage.setItem('freeai.product','free');
      localStorage.setItem('freeai.prefs',JSON.stringify({
        appearance:'dark',contrast:'medium',accent:'blue',textSize:100,
        customizationEnabled:true,siteToolsEnabled:true,spellCheckEnabled:true,showBottomPanel:true,
        approvalMode:'ask',researchSearchUrl:''
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

    bridge=await connectSearchBridge();

    await record('Web Search mode uses browser provider and returns source card',async()=>{
      await expect.poll(async()=>(await page.evaluate(()=>window.desktopApi.getStatus())).extension,{timeout:8000}).toBe(true);
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await picker.locator('.pickerRow').filter({hasText:'GPT Search QA'}).click();
      await page.getByRole('button',{name:'Add',exact:true}).click();
      const add=page.getByRole('menu',{name:'Add'});
      await add.getByRole('menuitem',{name:/Search the web/}).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('.searchModeChip')).toBeVisible();
      await page.locator('.gptComposer textarea').fill('Search for the example domain');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Live Search QA answer',{timeout:12000});
      await expect(page.getByText('Example Domain',{exact:true}).last()).toBeVisible();
      expect(bridge.state.prompts.some(p=>p.nativeTool==='search')).toBe(true);
      return 'Search nativeTool reached Browser Bridge and source card rendered';
    },'01-web-search.png');

    await record('API Deep Research requires reviewed plan and exposes source controls',async()=>{
      await page.locator('.desktopPrimaryNav button').filter({hasText:'New chat'}).click();
      await page.evaluate(()=>window.desktopApi.addApiConnection({name:'W6 Research API',baseUrl:'http://127.0.0.1:17896/v1',model:'w6-research',apiKey:''}));
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await picker.locator('.pickerRow').filter({hasText:'W6 Research API'}).click();
      await page.getByRole('button',{name:'Add',exact:true}).click();
      await page.getByRole('menu',{name:'Add'}).getByRole('menuitem',{name:/Deep research/}).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('.deepResearchModeChip')).toBeVisible();
      await page.locator('.gptComposer textarea').fill('Research reserved example domains');
      await page.getByRole('button',{name:'Send message'}).click();
      const dialog=page.getByRole('dialog',{name:/Research plan/});
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Only these sites',{exact:true})).toBeVisible();
      await expect(dialog.getByText('Prioritize sites',{exact:true})).toBeVisible();
      await expect(dialog.getByText('Exclude sites',{exact:true})).toBeVisible();
      await expect(dialog.getByText('SearXNG Search API',{exact:true})).toBeVisible();
      return 'Reviewed plan dialog and enforceable source controls visible for API research';
    },'02-research-plan.png');

    await record('Only-sites and exclude controls are enforced through SearXNG query and result filtering',async()=>{
      const dialog=page.getByRole('dialog',{name:/Research plan/});
      await dialog.getByText('Only these sites',{exact:true}).click();
      await dialog.getByText('Allowed sites',{exact:true}).locator('..').getByRole('textbox').fill('example.com');
      await dialog.getByText('Exclude sites',{exact:true}).locator('..').getByRole('textbox').fill('reddit.com');
      await dialog.getByText('SearXNG Search API',{exact:true}).locator('..').getByRole('textbox').fill('http://127.0.0.1:17897');
      await dialog.getByLabel('Research step 1').fill('Identify what Example Domain is for');
      await dialog.getByRole('button',{name:'Start research'}).click();
      await expect(page.locator('.deepResearchStatus')).toContainText('Deep research report',{timeout:30000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('[S1]');
      await expect(page.getByText('Example Domain',{exact:true}).last()).toBeVisible();
      await expect(page.getByText('IANA Example Domains',{exact:true})).toHaveCount(0);
      expect(servers.searchRequests.length).toBeGreaterThan(0);
      expect(servers.searchRequests.every(r=>r.format==='json')).toBe(true);
      expect(servers.searchRequests.some(r=>r.q.includes('site:example.com')&&r.q.includes('-site:reddit.com'))).toBe(true);
      return 'Query operators and post-search source scope both enforced';
    },'03-research-complete.png');

    await record('Research metadata and retrieved source persist in chat storage',async()=>{
      const chats=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.free')||'[]'));
      const chat=chats.find(c=>String(c.title||'').includes('Research reserved example domains'));
      expect(chat).toBeTruthy();
      const answer=[...(chat.messages||[])].reverse().find(m=>m.role==='assistant'&&m.deepResearch);
      expect(answer?.research?.mode).toBe('free-ai-owned');
      expect(answer?.research?.sourceScope?.mode).toBe('only');
      expect(answer?.research?.sourceScope?.sites).toEqual(['example.com']);
      expect(answer?.research?.sourceScope?.exclude).toEqual(['reddit.com']);
      expect(answer?.sources).toHaveLength(1);
      expect(answer.sources[0].domain).toBe('example.com');
      expect(answer.sources[0].retrievedAt).toMatch(/^20/);
      return 'Owned research metadata, scope and retrieval timestamp persisted';
    },'04-research-persisted.png');

    await record('Research report exports to Markdown, PDF, and Word',async()=>{
      const status=page.locator('.deepResearchStatus').last();
      const paths={
        md:path.join(out,'research-report.md'),
        pdf:path.join(out,'research-report.pdf'),
        docx:path.join(out,'research-report.docx')
      };
      for(const [format,label] of [['md','Markdown'],['pdf','PDF'],['docx','Word']]){
        await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=()=>Promise.resolve({canceled:false,filePath:target})},paths[format]);
        await status.getByRole('button',{name:label,exact:true}).click();
        await expect.poll(async()=>{try{return (await fs.stat(paths[format])).size}catch{return 0}},{timeout:15000}).toBeGreaterThan(100);
      }
      const md=await fs.readFile(paths.md,'utf8');
      expect(md).toContain('[S1]');
      expect(md).toContain('https://example.com/');
      const pdf=await fs.readFile(paths.pdf);
      expect(pdf.subarray(0,4).toString()).toBe('%PDF');
      const docx=await fs.readFile(paths.docx);
      expect(docx.subarray(0,2).toString()).toBe('PK');
      return 'Markdown, PDF and DOCX files were created and validated';
    },'05-report-export.png');

    await record('Owned Deep Research planner and synthesizer both used API model',async()=>{
      const bodies=servers.apiRequests.map(r=>JSON.stringify(r.messages||[]));
      expect(bodies.some(v=>v.includes('You create search queries only'))).toBe(true);
      expect(bodies.some(v=>v.includes('rigorous research synthesizer'))).toBe(true);
      return servers.apiRequests.length+' API calls recorded';
    },'06-api-research-path.png');

    await fs.writeFile(path.join(out,'api-requests.json'),JSON.stringify(servers.apiRequests,null,2));
    await fs.writeFile(path.join(out,'search-requests.json'),JSON.stringify(servers.searchRequests,null,2));
    await fs.writeFile(path.join(out,'bridge-prompts.json'),JSON.stringify(bridge.state.prompts,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    try{bridge?.socket?.close()}catch{}
    await app.close().catch(()=>{});
    await Promise.all([
      new Promise(resolve=>servers.api.close(()=>resolve())),
      new Promise(resolve=>servers.search.close(()=>resolve()))
    ]);
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
