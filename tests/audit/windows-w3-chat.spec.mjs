import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w3');
async function shot(page,name){
  await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,name),fullPage:false});
}

function startQaServer(){
  const requests=[];
  const counts=new Map();
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||!req.url?.endsWith('/chat/completions')){
      res.statusCode=404;res.end('not found');return;
    }
    const chunks=[];
    for await (const chunk of req)chunks.push(chunk);
    let body={};
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{}
    const lastUser=[...(body.messages||[])].reverse().find(m=>m?.role==='user');
    const content=String(lastUser?.content||'');
    const key=content;
    const count=(counts.get(key)||0)+1;
    counts.set(key,count);
    const entry={body,content,count,aborted:false,finished:false};
    requests.push(entry);

    if(content.includes('retry-once')&&count===1){
      res.statusCode=500;
      res.setHeader('content-type','application/json');
      entry.finished=true;
      res.end(JSON.stringify({error:{message:'Temporary QA failure'}}));
      return;
    }

    const stream=body.stream===true;
    const responseText=content.includes('retry-once')
      ? 'Retry recovered'
      : content.includes('ATTACHMENT_QA_TOKEN')
        ? 'Attachment received'
        : content.includes('slow-stop')
          ? 'Partial response keeps going until stopped'
          : ('QA response '+count+' for '+content.replace(/\s+/g,' ').trim());

    if(!stream){
      res.setHeader('content-type','application/json');
      entry.finished=true;
      res.end(JSON.stringify({choices:[{message:{content:responseText}}]}));
      return;
    }

    res.writeHead(200,{
      'content-type':'text/event-stream',
      'cache-control':'no-cache',
      'connection':'keep-alive'
    });
    res.flushHeaders?.();
    const pieces=content.includes('slow-stop')
      ? ['Partial',' response',' keeps',' going',' until',' stopped']
      : responseText.match(/.{1,8}/g)||[responseText];
    let index=0;
    const delay=content.includes('slow-stop')?500:120;
    const timer=setInterval(()=>{
      if(res.destroyed||res.writableEnded){clearInterval(timer);return}
      if(index>=pieces.length){
        clearInterval(timer);
        res.write('data: [DONE]\n\n');
        entry.finished=true;
        res.end();
        return;
      }
      const delta=pieces[index++];
      res.write('data: '+JSON.stringify({choices:[{delta:{content:delta}}]})+'\n\n');
    },delay);
    res.on('close',()=>{
      if(!entry.finished)entry.aborted=true;
      clearInterval(timer);
    });
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(17893,'127.0.0.1',()=>resolve({server,requests,counts}));
  });
}

test('Windows W3 real chat audit',async()=>{
  test.setTimeout(210000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const {server,requests}=await startQaServer();
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-w3-'));
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
    const newChat=async()=>{
      await page.locator('.desktopPrimaryNav button').filter({hasText:'New chat'}).first().click();
      await expect(page.getByText('Ready when you are.')).toBeVisible();
    };
    const sendPrompt=async text=>{
      const composer=page.locator('.gptComposer textarea');
      await composer.fill(text);
      await page.getByRole('button',{name:'Send message'}).click();
    };
    const waitComplete=async()=>{
      await expect(page.getByRole('button',{name:'Copy response'}).last()).toBeVisible({timeout:15000});
    };

    // Add two real local API models through the app IPC.
    await page.evaluate(async()=>{
      await window.desktopApi.addApiConnection({name:'QA Stream Model',baseUrl:'http://127.0.0.1:17893/v1',model:'qa-stream',apiKey:''});
      await window.desktopApi.addApiConnection({name:'QA Alt Model',baseUrl:'http://127.0.0.1:17893/v1',model:'qa-alt',apiKey:''});
    });
    await expect.poll(async()=>page.locator('.modelButton').count()).toBe(1);

    await record('Model picker opens with two API models',async()=>{
      await page.locator('.modelButton').click();
      const picker=page.getByRole('listbox',{name:'Select model'});
      await expect(picker).toBeVisible();
      await expect(picker.getByRole('option',{name:/qa-stream/i})).toBeVisible();
      await expect(picker.getByRole('option',{name:/qa-alt/i})).toBeVisible();
      return 'Both local API models are listed';
    },'01-model-picker.png');

    await record('Model picker switches models',async()=>{
      const picker=page.getByRole('listbox',{name:'Select model'});
      await picker.getByRole('option',{name:/qa-alt/i}).click();
      await expect(page.locator('.modelButton')).toContainText('qa-alt');
      if(await page.getByRole('listbox',{name:'Select model'}).count()===0)await page.locator('.modelButton').click();
      await page.getByRole('listbox',{name:'Select model'}).getByRole('option',{name:/qa-stream/i}).click();
      await expect(page.locator('.modelButton')).toContainText('qa-stream');
      return 'qa-alt -> qa-stream';
    },'02-model-selected.png');

    await record('Model picker honors Display name',async()=>{
      const text=String(await page.locator('.modelButton').textContent()||'');
      if(!text.includes('QA Stream Model'))throw new Error('Display name "QA Stream Model" is not shown; picker renders Model ID "qa-stream".');
      return 'Display name shown';
    },'03-model-display-name.png');

    await record('Streaming starts and Stop appears',async()=>{
      await sendPrompt('hello-stream');
      await expect(page.getByRole('button',{name:'Stop generating'})).toBeVisible({timeout:8000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('QA',{timeout:8000});
      await expect.poll(()=>requests.some(r=>r.content.includes('hello-stream')&&r.body.stream===true)).toBe(true);
      return 'SSE stream=true and Stop generating visible';
    },'04-streaming.png');

    await record('Streaming completes',async()=>{
      await waitComplete();
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('QA response 1 for hello-stream');
      return 'Completed streamed response';
    },'05-stream-complete.png');

    await record('New chat creates exactly one Recent entry',async()=>{
      const count=await page.locator('.recentRow').filter({hasText:'hello-stream'}).count();
      if(count!==1)throw new Error('Expected one "hello-stream" Recent entry, found '+count+'. Initial and final saves are creating duplicate chat records.');
      return 'One Recent entry created';
    },'05b-recents-single.png');

    await record('Copy response copies real text',async()=>{
      const response=String(await page.locator('.chatMessage.assistant .messageBody').last().textContent()||'');
      await page.getByRole('button',{name:'Copy response'}).last().click();
      await expect(page.getByRole('button',{name:'Copied'}).last()).toBeVisible();
      const clipboard=await app.evaluate(({clipboard})=>clipboard.readText());
      expect(clipboard).toBe(response);
      return 'Clipboard matches assistant response';
    },'06-copy.png');

    await record('Regenerate response sends original user message again',async()=>{
      await page.getByRole('button',{name:'Response options'}).last().click();
      await page.getByRole('menuitem',{name:/Regenerate response/}).click();
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('QA response 2 for hello-stream',{timeout:15000});
      const hello=requests.filter(r=>r.content.includes('hello-stream'));
      expect(hello.length).toBeGreaterThanOrEqual(2);
      return 'Second request generated a fresh response';
    },'07-regenerate.png');

    await record('Stop cancels an in-flight API stream',async()=>{
      await newChat();
      await sendPrompt('slow-stop');
      await expect(page.getByRole('button',{name:'Stop generating'})).toBeVisible({timeout:8000});
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Partial',{timeout:8000});
      await shot(page,'08-stop-before.png');
      await page.getByRole('button',{name:'Stop generating'}).click();
      await expect(page.getByRole('button',{name:'Stop generating'})).toHaveCount(0);
      await expect(page.locator('.chatMessage.error')).toHaveCount(0);
      await expect.poll(()=>{
        const entry=requests.find(r=>r.content.includes('slow-stop'));
        return entry?.aborted===true;
      }).toBe(true);
      return 'Renderer stopped and HTTP stream was aborted';
    },'09-stop-after.png');

    await record('Retry response recovers after server error',async()=>{
      await newChat();
      await sendPrompt('retry-once');
      await expect(page.locator('.chatMessage.error .messageBody')).toContainText('Temporary QA failure',{timeout:10000});
      await expect(page.getByRole('button',{name:'Retry response'})).toBeVisible();
      await shot(page,'10-retry-error.png');
      await page.getByRole('button',{name:'Retry response'}).click();
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Retry recovered',{timeout:15000});
      return 'First call failed; Retry reused the user request and succeeded';
    },'11-retry-recovered.png');

    await record('Text attachment uses actual Files menu and is sent inline',async()=>{
      await newChat();
      await page.getByRole('button',{name:'Add',exact:true}).click();
      const menu=page.getByRole('menu',{name:'Add'});
      const [chooser]=await Promise.all([
        page.waitForEvent('filechooser'),
        menu.getByRole('menuitem',{name:'Files',exact:true}).click()
      ]);
      await chooser.setFiles({name:'qa-note.txt',mimeType:'text/plain',buffer:Buffer.from('ATTACHMENT_QA_TOKEN')});
      await expect(page.getByText('qa-note.txt',{exact:true}).first()).toBeVisible();
      await shot(page,'12-attachment-added.png');
      const closeSide=page.getByTitle('Close side panel');
      if(await closeSide.count())await closeSide.click();
      await sendPrompt('read attachment');
      await expect(page.locator('.chatMessage.assistant .messageBody').last()).toContainText('Attachment received',{timeout:15000});
      await expect.poll(()=>requests.some(r=>r.content.includes('ATTACHMENT_QA_TOKEN'))).toBe(true);
      await expect(page.locator('.messageAttachmentList')).toContainText('qa-note.txt');
      return 'Text file content reached the API request and metadata stayed on user message';
    },'13-attachment-sent.png');

    await record('Binary attachment is rejected clearly for API model',async()=>{
      await newChat();
      await page.getByRole('button',{name:'Add',exact:true}).click();
      const menu=page.getByRole('menu',{name:'Add'});
      const [chooser]=await Promise.all([
        page.waitForEvent('filechooser'),
        menu.getByRole('menuitem',{name:'Files',exact:true}).click()
      ]);
      await chooser.setFiles({name:'qa-image.png',mimeType:'image/png',buffer:Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])});
      const closeSide=page.getByTitle('Close side panel');
      if(await closeSide.count())await closeSide.click();
      const before=requests.length;
      const composer=page.locator('.gptComposer textarea');
      await composer.fill('send binary attachment');
      await page.getByRole('button',{name:'Send message'}).click();
      await expect(page.getByRole('alert')).toContainText('does not advertise binary file upload support');
      expect(requests.length).toBe(before);
      return 'No unsupported binary payload was sent to API model';
    },'14-binary-attachment-error.png');

    await record('Chat context menu pins chat',async()=>{
      await newChat();
      await sendPrompt('menu-chat');
      await waitComplete();
      const row=page.locator('.recentRow').filter({hasText:'menu-chat'}).first();
      await expect(row).toBeVisible();
      await row.getByRole('button',{name:'More options for menu-chat'}).click();
      await page.getByRole('menuitem',{name:/Pin chat/}).click();
      await expect(row.locator('.recentPin')).toBeVisible();
      return 'Chat pinned in Recents';
    },'15-chat-pinned.png');

    await record('Chat export writes Markdown through native save dialog',async()=>{
      const savePath=path.resolve(out,'menu-chat.md');
      await app.evaluate(({dialog},filePath)=>{
        dialog.showSaveDialog=()=>Promise.resolve({canceled:false,filePath});
      },savePath);
      const row=page.locator('.recentRow').filter({hasText:'menu-chat'}).first();
      await row.getByRole('button',{name:'More options for menu-chat'}).click();
      await page.getByRole('menuitem',{name:/Export chat/}).click();
      await expect.poll(async()=>{
        try{return (await fs.readFile(savePath,'utf8')).includes('# menu-chat')}catch{return false}
      }).toBe(true);
      const body=await fs.readFile(savePath,'utf8');
      expect(body).toContain('## You');
      expect(body).toContain('## Assistant');
      return 'menu-chat.md saved with both sides of conversation';
    },'16-chat-exported.png');

    await record('Delete chat removes the selected record',async()=>{
      const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.free')||'[]').filter(chat=>chat.title==='menu-chat').length);
      const row=page.locator('.recentRow').filter({hasText:'menu-chat'}).first();
      await row.getByRole('button',{name:'More options for menu-chat'}).click();
      await page.getByRole('menuitem',{name:/Delete chat/}).click();
      const dialog=page.getByRole('dialog',{name:'Delete chat?'});
      await expect(dialog).toBeVisible();
      await shot(page,'17-delete-confirm.png');
      await dialog.getByRole('button',{name:'Delete',exact:true}).click();
      const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('freeai.chats.free')||'[]').filter(chat=>chat.title==='menu-chat').length);
      expect(after).toBe(Math.max(0,before-1));
      return 'Selected chat record removed; any remaining duplicate is tracked by the separate Recent-duplication failure';
    },'18-chat-deleted.png');

    await fs.writeFile(path.join(out,'server-requests.json'),JSON.stringify(requests,null,2));
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    const failures=results.filter(r=>r.status==='FAIL');
    expect(failures,JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
    await new Promise(resolve=>server.close(()=>resolve()));
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
