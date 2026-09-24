import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w4b');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}
function dataUrlBuffer(value){
  const match=String(value||'').match(/^data:[^;]+;base64,(.*)$/);
  return match?Buffer.from(match[1],'base64'):null;
}
function startLocalServers(){
  const mcpRequests=[];
  const mcp=http.createServer(async(req,res)=>{
    if(req.method!=='POST'){res.statusCode=405;res.end();return}
    const parts=[];for await(const c of req)parts.push(c);
    let body={};try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{}
    mcpRequests.push({method:body.method||'',params:body.params||null});
    res.setHeader('mcp-session-id','qa-session');
    if(body.method==='notifications/initialized'){res.statusCode=202;res.end();return}
    res.setHeader('content-type','application/json');
    if(body.method==='initialize'){
      res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{
        protocolVersion:'2025-11-25',
        capabilities:{tools:{listChanged:false}},
        serverInfo:{name:'QA MCP Server',version:'1.0.0'}
      }}));return;
    }
    if(body.method==='tools/list'){
      res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{tools:[
        {name:'read_status',title:'Read status',description:'Returns QA status',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true,destructiveHint:false}},
        {name:'write_note',title:'Write note',description:'Writes a QA note',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']},annotations:{readOnlyHint:false,destructiveHint:false}}
      ]}}));return;
    }
    if(body.method==='tools/call'){
      res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{content:[{type:'text',text:'QA tool result'}]}}));return;
    }
    res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{}}));
  });

  const web=http.createServer((req,res)=>{
    res.setHeader('content-type','text/html; charset=utf-8');
    if(req.url==='/page2'){
      res.end('<!doctype html><html><head><title>QA Page Two</title></head><body><h1>QA Page Two</h1><p id="two">Second page content</p><a href="/page1">Back to one</a></body></html>');
      return;
    }
    res.end(`<!doctype html><html><head><title>QA Page One</title></head><body>
      <h1>QA Page One</h1><p id="content">Local browser test content</p>
      <a id="to-two" href="/page2">Go to page two</a>
      <button id="qa-button">QA button</button>
      <script>
        document.modelContext={
          async getTools(){return [{name:'qa_echo',title:'QA echo',description:'Echo a value',origin:location.origin,inputSchema:{type:'object',properties:{value:{type:'string'}}},annotations:{consequentialHint:false}}]},
          async executeTool(tool,input){return {tool:tool.name,echo:String(input?.value||'')}}
        };
      </script>
    </body></html>`);
  });

  return new Promise((resolve,reject)=>{
    let ready=0;
    const done=()=>{if(++ready===2)resolve({mcp,web,mcpRequests})};
    mcp.once('error',reject);web.once('error',reject);
    mcp.listen(17921,'127.0.0.1',done);
    web.listen(17920,'127.0.0.1',done);
  });
}

test('Windows W4B Plugins Explore Browser Computer audit',async()=>{
  test.setTimeout(210000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const {mcp,web,mcpRequests}=await startLocalServers();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w4b-'));
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
    await page.evaluate(async()=>{await document.fonts.ready});
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important} input,textarea{caret-color:transparent!important}'});

    const record=async(name,fn,screenshot)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
      if(screenshot)await shot(page,screenshot).catch(()=>{});
    };

    await page.evaluate(()=>window.desktopApi.addApiConnection({name:'W4B API',baseUrl:'http://127.0.0.1:17999/v1',model:'w4b-api',apiKey:''}));

    await record('Plugins opens with Windows directory tabs',async()=>{
      await page.locator('.desktopPrimaryNav button').filter({hasText:'Plugins'}).click();
      await expect(page.getByRole('tablist',{name:'Plugin directory sections'})).toBeVisible();
      for(const label of ['Configured','Discover','Provider hints','AI providers']){
        await expect(page.getByRole('tab',{name:label,exact:true})).toBeVisible();
      }
      return 'Configured, Discover, Provider hints, AI providers visible';
    },'01-plugins.png');

    await record('Direct MCP connection negotiates protocol and lists tools',async()=>{
      await page.getByPlaceholder('App name').fill('QA MCP');
      await page.getByPlaceholder('https://example.com/mcp').fill('http://127.0.0.1:17921/mcp');
      await page.getByRole('button',{name:'Connect and add'}).click();
      const card=page.locator('.directMcpCard').filter({hasText:'QA MCP'});
      await expect(card).toBeVisible({timeout:12000});
      await expect(card).toContainText('2 tools');
      await expect(card).toContainText('1 read-only');
      await expect(card).toContainText('1 may write');
      expect(mcpRequests.some(x=>x.method==='initialize')).toBe(true);
      expect(mcpRequests.some(x=>x.method==='tools/list')).toBe(true);
      return 'MCP 2025-11-25 initialized and 2 tools surfaced';
    },'02-mcp-connected.png');

    await record('MCP details preserve capability labels and selection',async()=>{
      const card=page.locator('.directMcpCard').filter({hasText:'QA MCP'});
      await card.getByRole('button',{name:'Details'}).click();
      const dialog=page.getByRole('dialog',{name:'Plugin details'});
      await expect(dialog).toContainText('MCP 2025-11-25');
      await expect(dialog).toContainText('Read-only');
      await expect(dialog).toContainText('May write');
      await dialog.getByRole('button',{name:'Use in next Work task'}).click();
      await expect(dialog.getByRole('button',{name:'Remove from next Work task'})).toBeVisible();
      return 'Direct MCP selected for next Work task';
    },'03-mcp-details.png');

    await record('Explore separates configured MCP from public directory',async()=>{
      const dialog=page.getByRole('dialog',{name:'Plugin details'});
      await dialog.getByRole('button',{name:'Close'}).click();
      await page.getByRole('button',{name:'Explore',exact:true}).first().click();
      await expect(page.getByRole('tablist',{name:'Explore filters'})).toBeVisible();
      await expect(page.getByText('QA MCP',{exact:true}).first()).toBeVisible();
      await expect(page.getByText('Gmail',{exact:true}).first()).toBeVisible();
      await expect(page.getByText('Public directory',{exact:true}).first()).toBeVisible();
      return 'Configured direct MCP and public discovery are visibly separate';
    },'04-explore.png');

    await record('Explore search filters public apps',async()=>{
      const input=page.getByPlaceholder('Search apps, capabilities, or categories');
      await input.fill('GitHub');
      await expect(page.getByText('GitHub',{exact:true}).first()).toBeVisible();
      await expect(page.getByText('Gmail',{exact:true})).toHaveCount(0);
      await input.fill('');
      return 'GitHub search filtered unrelated public listings';
    },'05-explore-search.png');

    await record('Built-in Browser pane opens on a real local page',async()=>{
      await page.getByRole('button',{name:/Back to app/}).click();
      await page.evaluate(()=>window.desktopApi.browserOpen({url:'http://127.0.0.1:17920/page1',forceNavigate:true,bounds:{x:700,y:100,width:700,height:700}}));
      await page.getByRole('tab',{name:'Work',exact:true}).click();
      await page.locator('.workActions button').filter({hasText:'Browser'}).click();
      await expect(page.locator('.browserPane')).toBeVisible();
      await expect(page.getByRole('textbox',{name:'Address and search'})).toHaveValue(/127\.0\.0\.1:17920\/page1/);
      await expect(page.locator('.browserTab.active')).toContainText('QA Page One',{timeout:12000});
      return 'Browser WebContentsView loaded QA Page One';
    },'06-browser-page1.png');

    await record('Browser agent snapshot reads page text and interactive elements',async()=>{
      const snapshot=await page.evaluate(()=>window.desktopApi.browserUseBuiltInSnapshot());
      expect(snapshot?.page?.title).toBe('QA Page One');
      expect(String(snapshot?.page?.text||'')).toContain('Local browser test content');
      expect((snapshot?.page?.elements||[]).some(el=>String(el.label||'').includes('Go to page two'))).toBe(true);
      const png=dataUrlBuffer(snapshot?.screenshot);
      if(png)await fs.writeFile(path.join(out,'07-browser-agent-snapshot.png'),png);
      return 'Agent snapshot returned title, text, elements, and screenshot';
    },'07-browser-agent-ui.png');

    await record('Browser Site Tools discovers and runs page WebMCP tool',async()=>{
      await expect(page.getByTitle('1 site tool')).toBeVisible({timeout:12000});
      await page.getByTitle('1 site tool').click();
      const panel=page.locator('.siteToolsPanel');
      await expect(panel).toContainText('QA echo');
      await panel.getByText('QA echo',{exact:true}).click();
      await panel.getByRole('textbox',{name:'Site tool JSON input'}).fill('{"value":"hello"}');
      await panel.getByRole('button',{name:'Run tool'}).click();
      await expect(panel.locator('.siteToolStatus')).toContainText('"echo": "hello"',{timeout:8000});
      return 'Page-provided qa_echo tool executed inside built-in browser';
    },'08-browser-site-tool.png');

    await record('Browser Use can navigate and snapshot a second tab state',async()=>{
      const result=await page.evaluate(()=>window.desktopApi.browserUseBuiltInAction({action:{type:'navigate',url:'http://127.0.0.1:17920/page2'}}));
      expect(result?.page?.title).toBe('QA Page Two');
      expect(String(result?.page?.text||'')).toContain('Second page content');
      await expect(page.getByRole('textbox',{name:'Address and search'})).toHaveValue(/page2/);
      return 'Agent Browser Use navigated to QA Page Two';
    },'09-browser-page2.png');

    await record('Browser tab controls create and close a tab',async()=>{
      const before=await page.locator('.browserTab').count();
      await page.getByTitle('New tab').click();
      await expect(page.locator('.browserTab')).toHaveCount(before+1,{timeout:8000});
      await page.locator('.browserTab.active .tabClose').click();
      await expect(page.locator('.browserTab')).toHaveCount(before,{timeout:8000});
      return 'New tab and Close tab work';
    },'10-browser-tabs.png');

    await record('Computer Use backend captures Windows screen and supports safe wait action',async()=>{
      const screens=await page.evaluate(()=>window.desktopApi.captureScreens());
      expect(Array.isArray(screens)).toBe(true);
      expect(screens.length).toBeGreaterThan(0);
      const usable=screens.find(s=>s.interactive!==false&&s.displayId!==null&&s.displayId!==undefined)||screens[0];
      expect(Number(usable.width)).toBeGreaterThan(0);
      expect(Number(usable.height)).toBeGreaterThan(0);
      const png=dataUrlBuffer(usable.thumbnail);
      if(png)await fs.writeFile(path.join(out,'11-computer-capture.png'),png);
      const waited=await page.evaluate(({displayId,width,height})=>window.desktopApi.computerPerformAction({
        displayId,viewport:{width,height},action:{type:'wait',ms:250}
      }),{displayId:usable.displayId,width:usable.width,height:usable.height});
      expect(waited?.ok).toBe(true);
      expect(waited?.action).toBe('wait');
      return 'Screen capture + non-destructive Computer Use wait action succeeded';
    },'11-computer-backend.png');

    await record('Current main still exposes manual Computer mirror UI',async()=>{
      const closeBrowser=page.locator('.browserPane .closePaneButton');
      if(await closeBrowser.count())await closeBrowser.click();
      await page.getByRole('button',{name:'Add',exact:true}).click();
      const menu=page.getByRole('menu',{name:'Add'});
      const computer=menu.getByRole('menuitem',{name:/Computer/});
      if(await computer.count()===0)return 'Manual mirror already removed';
      await computer.click();
      await expect(page.locator('.computerPane')).toBeVisible();
      throw new Error('Manual Computer screen-mirror panel is still exposed on main. PR #132 removes this redundant UI while keeping the backend Computer Use runtime.');
    },'12-computer-mirror.png');

    await fs.writeFile(path.join(out,'mcp-requests.json'),JSON.stringify(mcpRequests,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await Promise.all([
      new Promise(resolve=>mcp.close(()=>resolve())),
      new Promise(resolve=>web.close(()=>resolve()))
    ]);
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
