import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const generatedPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';

async function installBridge(page){
  const script=await fs.readFile(path.resolve('extension/content.js'),'utf8');
  await page.evaluate(()=>{
    delete globalThis.__FREE_AI_CONTENT_BRIDGE_LOADED__;
    globalThis.__freeAiMessageHandlers=[];
    globalThis.chrome={
      runtime:{
        onMessage:{addListener(fn){globalThis.__freeAiMessageHandlers.push(fn)}},
        sendMessage:async()=>({ok:true})
      }
    };
  });
  await page.addScriptTag({content:script});
  await expect.poll(()=>page.evaluate(()=>globalThis.__freeAiMessageHandlers.length)).toBeGreaterThan(0);
}

async function invokePrompt(page,payload){
  return page.evaluate(input=>new Promise((resolve,reject)=>{
    const handler=globalThis.__freeAiMessageHandlers?.at(-1);
    if(typeof handler!=='function'){reject(new Error('Free AI content bridge handler was not installed.'));return}
    const timer=setTimeout(()=>reject(new Error('Provider runtime QA timed out.')),12000);
    const sendResponse=value=>{clearTimeout(timer);resolve(value)};
    try{
      const keepAlive=handler({
        type:'freeai:prompt',
        id:'provider-runtime-'+Date.now(),
        toolRequest:null,
        effort:'default',
        attachments:[],
        nativeTool:null,
        ...input
      },{},sendResponse);
      if(keepAlive!==true){
        clearTimeout(timer);
        reject(new Error('Provider prompt handler did not keep the response channel open.'));
      }
    }catch(error){
      clearTimeout(timer);
      reject(error);
    }
  }),payload);
}

async function mountGemini(page,{mediaOnly=false}={}){
  await page.evaluate(({png,mediaOnly})=>{
    document.body.innerHTML=`
      <main style="padding:20px">
        <rich-textarea>
          <div class="ql-editor" contenteditable="true" role="textbox" aria-label="Enter a prompt here" style="min-height:60px;border:1px solid #888"></div>
        </rich-textarea>
        <button id="gemini-send" aria-label="Send message">Send</button>
        <model-response id="gemini-response" style="display:block;min-height:20px"></model-response>
      </main>`;
    const send=document.querySelector('#gemini-send');
    send.addEventListener('click',()=>{
      setTimeout(()=>{
        const response=document.querySelector('#gemini-response');
        response.replaceChildren();
        if(!mediaOnly){
          const p=document.createElement('p');
          p.textContent='Gemini runtime reply';
          response.append(p);
        }
        const img=document.createElement('img');
        const binary=atob(png.split(',')[1]);
        const bytes=new Uint8Array(binary.length);
        for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
        img.src=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        img.alt='Generated runtime image';
        img.style.width='220px';
        img.style.height='180px';
        response.append(img);
      },120);
    });
  },{png:generatedPng,mediaOnly});
}

async function mountChatGpt(page,{imageOnlyOutsideRole=false}={}){
  await page.evaluate(({png,imageOnlyOutsideRole})=>{
    document.body.innerHTML=`
      <main style="padding:20px">
        <div id="prompt-textarea" contenteditable="true" role="textbox" style="min-height:60px;border:1px solid #888"></div>
        <button id="chatgpt-add" aria-label="Add" aria-expanded="false">+</button>
        <div id="chatgpt-add-menu" role="menu" aria-label="Add" style="display:none">
          <button id="chatgpt-more" role="menuitem">More</button>
        </div>
        <div id="chatgpt-more-menu" role="menu" aria-label="More" style="display:none">
          <button id="chatgpt-apps" role="menuitem">Apps</button>
        </div>
        <div id="chatgpt-apps-menu" role="menu" aria-label="Apps" style="display:none">
          <button id="gmail-tool" role="menuitem" data-testid="connector-gmail">Gmail</button>
          <button id="canva-tool" role="menuitem" data-testid="connector-canva">Canva</button>
        </div>
        <button id="chatgpt-send" data-testid="send-button" aria-label="Send prompt">Send</button>
        <div data-message-author-role="assistant" id="chatgpt-response" style="display:block;min-height:20px"></div>
        <section data-testid="conversation-turn-image" id="chatgpt-image-turn" style="display:block"></section>
      </main>`;
    document.querySelector('#chatgpt-add').addEventListener('click',event=>{
      const menu=document.querySelector('#chatgpt-add-menu');
      menu.style.display='block';
      event.currentTarget.setAttribute('aria-expanded','true');
    });
    if(imageOnlyOutsideRole){
      const oldImage=document.createElement('img');
      oldImage.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      oldImage.alt='Generated image: old history image';
      oldImage.style.width='200px';
      oldImage.style.height='160px';
      document.querySelector('#chatgpt-image-turn').append(oldImage);
    }
    document.querySelector('#chatgpt-more').addEventListener('click',()=>{
      document.querySelector('#chatgpt-more-menu').style.display='block';
    });
    document.querySelector('#chatgpt-apps').addEventListener('click',()=>{
      document.querySelector('#chatgpt-apps-menu').style.display='block';
    });
    document.querySelector('#gmail-tool').addEventListener('click',event=>{
      event.currentTarget.dataset.activated='true';
    });
    document.querySelector('#canva-tool').addEventListener('click',event=>{
      event.currentTarget.dataset.activated='true';
    });
    document.querySelector('#chatgpt-send').addEventListener('click',()=>{
      setTimeout(()=>{
        const response=document.querySelector('#chatgpt-response');
        const imageTurn=document.querySelector('#chatgpt-image-turn');
        response.replaceChildren();
        imageTurn.replaceChildren();
        if(!imageOnlyOutsideRole){
          const p=document.createElement('p');
          p.textContent='ChatGPT runtime reply';
          response.append(p);
          const img=document.createElement('img');
          img.src=png;
          img.alt='Generated ChatGPT image';
          img.style.width='240px';
          img.style.height='180px';
          response.append(img);
          return;
        }
        const img=document.createElement('img');
        img.src=png;
        img.alt='Generated image: outside assistant role';
        img.style.width='240px';
        img.style.height='180px';
        imageTurn.append(img);
      },120);
    });
  },{png:generatedPng,imageOnlyOutsideRole});
}

test('Browser provider bridge sends prompts and returns text plus generated media',async()=>{
  test.skip(process.platform!=='win32','Windows provider runtime contract');
  test.setTimeout(60000);
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'freeai-provider-runtime-'));
  const app=await electron.launch({
    args:['.',`--user-data-dir=${userData}`],
    env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.setContent('<!doctype html><html><body></body></html>');
    await installBridge(page);

    await mountGemini(page);
    const gemini=await invokePrompt(page,{provider:'gemini',text:'create a runtime image'});
    expect(gemini?.error).toBeUndefined();
    expect(gemini?.text).toContain('Gemini runtime reply');
    expect(gemini?.media).toHaveLength(1);
    expect(gemini.media[0].kind).toBe('image');
    expect(gemini.media[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(await page.locator('.ql-editor').textContent()).toContain('create a runtime image');

    await mountGemini(page,{mediaOnly:true});
    const mediaOnly=await invokePrompt(page,{provider:'gemini',text:'image only'});
    expect(mediaOnly?.error).toBeUndefined();
    expect(mediaOnly?.text||'').toBe('');
    expect(mediaOnly?.media).toHaveLength(1);
    expect(mediaOnly.media[0].dataUrl).toMatch(/^data:image\/png;base64,/);

    await mountChatGpt(page);
    const capabilities=await page.evaluate(()=>new Promise(resolve=>{
      const handler=globalThis.__freeAiMessageHandlers.at(-1);
      handler({type:'freeai:scanCapabilities',provider:'chatgpt',probeModels:false,probeTools:true},{},resolve);
    }));
    expect(capabilities?.mcps).toContain('Gmail');
    expect(capabilities?.mcps).toContain('Canva');

    const chatgpt=await invokePrompt(page,{provider:'chatgpt',text:'summarize my mail',toolRequest:{mcp:'Gmail'}});
    expect(chatgpt?.error).toBeUndefined();
    expect(await page.locator('#gmail-tool').getAttribute('data-activated')).toBe('true');
    expect(chatgpt?.text).toContain('ChatGPT runtime reply');
    expect(chatgpt?.media).toHaveLength(1);
    expect(chatgpt.media[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(await page.locator('#prompt-textarea').textContent()).toContain('summarize my mail');

    await mountChatGpt(page,{imageOnlyOutsideRole:true});
    const imageOnlyChatGpt=await invokePrompt(page,{provider:'chatgpt',text:'generate an image only'});
    expect(imageOnlyChatGpt?.error).toBeUndefined();
    expect(imageOnlyChatGpt?.text||'').toBe('');
    expect(imageOnlyChatGpt?.media).toHaveLength(1);
    expect(imageOnlyChatGpt.media[0].name).toContain('outside assistant role');
    expect(imageOnlyChatGpt.media[0].name).not.toContain('old history');
    expect(imageOnlyChatGpt.media[0].dataUrl).toMatch(/^data:image\/png;base64,/);
  }finally{
    await app.close().catch(()=>{});
    await fs.rm(userData,{recursive:true,force:true}).catch(()=>{});
  }
});
