import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

const out=path.resolve('artifacts/windows-w5e');

async function fixtureFrame(page,source,html,name){
  const id='w5e-'+name.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  await page.evaluate(({id,html})=>{
    document.getElementById(id)?.remove();
    const frame=document.createElement('iframe');
    frame.id=id;
    frame.style.cssText='position:fixed;left:10px;top:40px;width:820px;height:620px;z-index:2147483000;background:white;border:0';
    frame.srcdoc=html;
    document.body.appendChild(frame);
  },{id,html});
  const handle=await page.locator('#'+id).elementHandle();
  const frame=await handle.contentFrame();
  await frame.waitForLoadState('domcontentloaded');
  await frame.evaluate(()=>{
    const listeners=[];
    const runtime={
      onMessage:{addListener(fn){listeners.push(fn);globalThis.__freeAiRuntimeListener=fn}},
      sendMessage(message){
        (globalThis.__freeAiRuntimeMessages||(globalThis.__freeAiRuntimeMessages=[])).push(message);
        return Promise.resolve({ok:true});
      }
    };
    try{Object.defineProperty(globalThis,'chrome',{value:{runtime},configurable:true,writable:true})}
    catch{globalThis.chrome={runtime}}
  });
  await frame.addScriptTag({content:source});
  await expect.poll(()=>frame.evaluate(()=>typeof globalThis.__freeAiRuntimeListener)).toBe('function');
  return frame;
}

async function bridgeCall(frame,message){
  return await frame.evaluate(async message=>await new Promise((resolve,reject)=>{
    const listener=globalThis.__freeAiRuntimeListener;
    if(typeof listener!=='function'){reject(new Error('Free AI content bridge listener was not registered.'));return}
    const timer=setTimeout(()=>reject(new Error('Free AI fixture bridge response timed out.')),20000);
    try{
      listener(message,{},response=>{clearTimeout(timer);resolve(response)});
    }catch(error){clearTimeout(timer);reject(error)}
  }),message);
}

test('Windows W5E provider adapter fixtures cover Gemini send and ChatGPT image replies',async()=>{
  test.setTimeout(180000);
  test.skip(process.platform!=='win32','Windows-only audit');
  await fs.mkdir(out,{recursive:true});
  const results=[];
  const source=await fs.readFile('extension/content.js','utf8');
  const app=await electron.launch({args:['.'],env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}});

  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const record=async(name,fn)=>{
      try{results.push({name,status:'PASS',detail:(await fn())||''})}
      catch(error){results.push({name,status:'FAIL',detail:error?.message||String(error)})}
    };

    await record('Gemini fallback finds an initially-disabled icon send control after input',async()=>{
      const frame=await fixtureFrame(page,source,`<!doctype html><html><head><style>
        body{font-family:sans-serif}.composer-shell{display:flex;width:720px;min-height:90px}
        rich-textarea{display:block;flex:1}.ql-editor{display:block;min-height:60px;border:1px solid #ccc}
        button{display:block;width:48px;height:48px}
        model-response{display:block;margin-top:20px;min-height:40px}
      </style></head><body>
        <div class="composer-shell">
          <rich-textarea><div class="ql-editor" contenteditable="true" role="textbox" aria-label="Enter a prompt here"></div></rich-textarea>
          <button id="fixture-send" role="button" disabled><span data-icon="send"></span></button>
        </div>
        <script>
          const input=document.querySelector('.ql-editor');
          const send=document.getElementById('fixture-send');
          input.addEventListener('input',()=>{send.disabled=!String(input.innerText||input.textContent||'').trim()});
          send.addEventListener('click',()=>{
            send.remove();
            const response=document.createElement('model-response');
            response.textContent='Gemini fixture reply';
            document.body.appendChild(response);
          });
        <\/script>
      </body></html>`,'gemini-fallback');
      const health=await bridgeCall(frame,{type:'freeai:scanCapabilities',provider:'gemini'});
      expect(health.adapterReady).toBe(true);
      const reply=await bridgeCall(frame,{type:'freeai:prompt',provider:'gemini',text:'hello gemini fixture',id:'w5e-gemini'});
      expect(reply.error).toBeUndefined();
      expect(reply.text).toContain('Gemini fixture reply');
      expect(await frame.locator('.ql-editor').textContent()).toContain('hello gemini fixture');
      return 'Gemini composer enabled and clicked icon-only fallback send control';
    });

    await record('ChatGPT image-only assistant reply is returned as generated media',async()=>{
      const frame=await fixtureFrame(page,source,`<!doctype html><html><head><style>
        textarea,button{display:block;width:420px;height:44px}
        main{display:block;width:640px;min-height:400px}
        section{display:block;width:320px;min-height:300px}
        img{display:block;width:256px;height:256px}
      </style></head><body>
        <textarea id="prompt-textarea" placeholder="Message ChatGPT"></textarea>
        <button data-testid="send-button" aria-label="Send message">Send</button>
        <main></main>
        <script>
          const send=document.querySelector('[data-testid="send-button"]');
          send.addEventListener('click',()=>{
            send.remove();
            const section=document.createElement('section');
            section.dataset.turn='assistant';
            const role=document.createElement('div');
            role.dataset.messageAuthorRole='assistant';
            const image=document.createElement('img');
            image.alt='Generated image of a cat';
            image.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0sAAAAASUVORK5CYII=';
            role.appendChild(image);
            section.appendChild(role);
            document.querySelector('main').appendChild(section);
          });
        <\/script>
      </body></html>`,'chatgpt-image');
      const reply=await bridgeCall(frame,{type:'freeai:prompt',provider:'chatgpt',text:'make a cat',id:'w5e-chatgpt'});
      expect(reply.error).toBeUndefined();
      expect(reply.text||'').toBe('');
      expect(Array.isArray(reply.media)).toBe(true);
      expect(reply.media.length).toBeGreaterThan(0);
      expect(reply.media[0]).toEqual(expect.objectContaining({kind:'image'}));
      expect(String(reply.media[0].dataUrl||'')).toMatch(/^data:image\/png;base64,/);
      return 'Image-only response returned '+reply.media.length+' generated media item(s)';
    });

    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    expect(results.filter(r=>r.status==='FAIL'),JSON.stringify(results,null,2)).toEqual([]);
  }finally{
    await app.close().catch(()=>{});
  }
});
