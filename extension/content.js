(()=>{
  if(globalThis.__FREE_AI_CONTENT_BRIDGE_LOADED__) return;
  globalThis.__FREE_AI_CONTENT_BRIDGE_LOADED__=true;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=el=>!!(el&&el.getClientRects().length);
  let browserElementMap=new Map();

  function first(selectors){
    for(const s of selectors){
      for(const el of document.querySelectorAll(s)){
        if(visible(el)) return el;
      }
    }
    return null;
  }

  function lastText(selectors){
    for(const s of selectors){
      const els=[...document.querySelectorAll(s)].filter(visible);
      if(els.length){
        const t=(els.at(-1).innerText||els.at(-1).textContent||'').trim();
        if(t) return t;
      }
    }
    return '';
  }

  const configs={
    chatgpt:{
      inputs:['#prompt-textarea','textarea[placeholder*="Message"]','div[contenteditable="true"][data-virtualkeyboard]','div[contenteditable="true"][role="textbox"]'],
      send:['button[data-testid="send-button"]','button[aria-label*="Send"]','button[aria-label*="send"]','button[type="submit"]'],
      stop:['button[data-testid="stop-button"]','button[aria-label*="Stop"]'],
      answers:['[data-message-author-role="assistant"]']
    },
    claude:{
      inputs:['div[contenteditable="true"][role="textbox"]','div.ProseMirror[contenteditable="true"]','textarea'],
      send:['button[aria-label*="Send"]','button[aria-label*="send"]','button[type="submit"]','button[data-testid*="send"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['[data-testid*="assistant"]','.font-claude-message']
    },
    gemini:{
      inputs:['rich-textarea div[contenteditable="true"]','div[contenteditable="true"][role="textbox"]','textarea'],
      send:['button.send-button','button[aria-label*="Send"]','button[aria-label*="send"]','button[mattooltip*="Send"]','button[mattooltip*="send"]','button[data-test-id*="send"]','button[data-testid*="send"]','button[type="submit"]','.send-button-container button'],
      stop:['button[aria-label*="Stop"]','button[aria-label*="stop"]','button[mattooltip*="Stop"]'],
      answers:['model-response','.model-response-text','[data-test-id*="response"]']
    },
    deepseek:{
      inputs:['textarea','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
      send:['button[aria-label*="Send"]','button[aria-label*="send"]','button[type="submit"]','button[data-testid*="send"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['.ds-markdown','[class*="markdown"]']
    },
    grok:{
      inputs:['textarea','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
      send:['button[aria-label*="Send"]','button[aria-label*="send"]','button[type="submit"]','button[data-testid*="send"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['[data-testid*="message"]','article']
    },
    manus:{
      inputs:['textarea','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
      send:['button[aria-label*="Send"]','button[aria-label*="send"]','button[type="submit"]','button[data-testid*="send"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['[data-role="assistant"]','[data-testid*="assistant"]','article']
    }
  };

  function cleanLabel(s){
    return String(s||'').replace(/\s+/g,' ').trim().replace(/^[-•]\s*/,'').slice(0,160);
  }

  function controlLabel(el){
    return cleanLabel([
      el?.innerText,
      el?.textContent,
      el?.getAttribute?.('aria-label'),
      el?.getAttribute?.('title'),
      el?.getAttribute?.('data-tooltip'),
      el?.getAttribute?.('mattooltip')
    ].filter(Boolean).join(' '));
  }

  function providerModelPatterns(provider){
    if(provider==='chatgpt')return [
      /GPT[-\s]?\d(?:\.\d+)?(?:\s+(?:Sol|Terra|Luna|Astra|Pro|Thinking|Instant))?/i,
      /GPT[-\s]?(?:Pro|Thinking|Instant)/i
    ];
    if(provider==='claude')return [
      /Claude(?:\s+\d(?:\.\d+)?)?(?:\s+(?:Opus|Sonnet|Haiku))?(?:\s+\d(?:\.\d+)?)?/i,
      /(?:Opus|Sonnet|Haiku)(?:\s+\d(?:\.\d+)?)?/i
    ];
    if(provider==='gemini')return [
      /Gemini(?:\s+\d(?:\.\d+)?)?(?:\s+(?:Pro|Flash|Deep Think|Thinking))?/i,
      /\d(?:\.\d+)?\s+(?:Pro|Flash)(?:\s+Thinking)?/i,
      /(?:Pro|Flash|Deep Think)(?:\s+Thinking)?/i
    ];
    if(provider==='deepseek')return [/DeepSeek(?:[-\s][A-Za-z0-9.]+)?/i,/(?:V3|R1)(?:[-\s][A-Za-z0-9.]+)?/i];
    if(provider==='grok')return [/Grok(?:\s+\d(?:\.\d+)?)?(?:\s+(?:Fast|Heavy))?/i];
    if(provider==='manus')return [/Manus(?:\s+[A-Za-z0-9.]+)?/i];
    return [];
  }

  function modelFromLabel(provider,text){
    const value=cleanLabel(text);
    if(!value)return '';
    for(const re of providerModelPatterns(provider)){
      const match=value.match(re);
      if(match)return cleanLabel(match[0]);
    }
    return '';
  }

  function modelCandidates(provider){
    const selectors=[
      'header button','nav button','[role="banner"] button',
      'button[aria-haspopup]','[role="button"][aria-haspopup]',
      '[role="menuitemradio"]','[role="option"]','[aria-checked="true"]','[aria-selected="true"]',
      '[data-testid*="model"]','[data-test-id*="model"]','[class*="model"] button'
    ];
    const out=[];
    const seen=new Set();
    for(const el of document.querySelectorAll(selectors.join(','))){
      if(!visible(el)||seen.has(el))continue;
      seen.add(el);
      const label=controlLabel(el);
      const model=modelFromLabel(provider,label);
      if(!model)continue;
      const rect=el.getBoundingClientRect();
      let score=0;
      if(el.getAttribute('aria-checked')==='true'||el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-current'))score+=8;
      if(el.hasAttribute('aria-haspopup'))score+=4;
      if(/model/i.test(String(el.getAttribute('data-testid')||el.getAttribute('data-test-id')||el.className||'')))score+=4;
      if(rect.top>=0&&rect.top<240)score+=3;
      if(label.length<50)score+=2;
      out.push({el,label,model,score});
    }
    return out.sort((a,b)=>b.score-a.score);
  }

  function detectActiveModel(provider){
    const candidates=modelCandidates(provider);
    if(candidates.length)return candidates[0].model;
    const titleModel=modelFromLabel(provider,document.title);
    return titleModel||'';
  }

  function detectModelOptions(provider){
    const values=[];
    const seen=new Set();
    for(const item of modelCandidates(provider)){
      const value=item.model;
      const key=value.toLowerCase();
      if(!seen.has(key)){seen.add(key);values.push(value)}
    }
    return values.slice(0,20);
  }

  function scanMcps(){
    const found=new Set();
    const generic=/^(tools?|apps?|plugins?|connectors?|connected apps?|add|more|manage|settings)$/i;
    const add=value=>{
      const text=cleanLabel(value);
      if(!text||generic.test(text)||text.length>100)return;
      found.add(text);
    };
    const structural=[
      '[data-testid*="connector"]','[data-test-id*="connector"]','[data-testid*="plugin"]','[data-test-id*="plugin"]',
      '[data-testid*="tool"] [role="menuitem"]','[data-test-id*="tool"] [role="menuitem"]',
      '[aria-label*="connector" i]','[title*="connector" i]','a[href*="connector" i]','a[href*="plugin" i]'
    ];
    for(const el of document.querySelectorAll(structural.join(','))){
      add(controlLabel(el));
    }
    const containers=[...document.querySelectorAll('[role="menu"],[role="listbox"],[role="dialog"],[class*="menu"],[class*="popover"]')];
    for(const container of containers){
      const context=cleanLabel(container.getAttribute('aria-label')||container.getAttribute('data-testid')||container.textContent||'');
      if(!/tool|plugin|connector|connected app/i.test(context))continue;
      for(const el of container.querySelectorAll('[role="menuitem"],[role="option"],button,a'))add(controlLabel(el));
    }
    return [...found].slice(0,60);
  }

  function detectFileUpload(){
    return !!document.querySelector('input[type="file"]');
  }

  async function uploadAttachments(attachments){
    if(!Array.isArray(attachments)||!attachments.length)return;
    const input=document.querySelector('input[type="file"]');
    if(!input)throw new Error('This provider does not expose a file-upload input in the current chat.');
    if(!input.multiple&&attachments.length>1)throw new Error('This provider currently accepts one file at a time in this chat.');
    const transfer=new DataTransfer();
    for(const item of attachments){
      const match=String(item.dataUrl||'').match(/^data:([^;,]*)(?:;charset=[^;,]*)?;base64,(.*)$/s);
      if(!match)throw new Error('Could not prepare '+String(item.name||'attachment')+' for upload.');
      const binary=atob(match[2]);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      transfer.items.add(new File([bytes],String(item.name||'attachment'),{type:String(item.type||match[1]||'application/octet-stream')}));
    }
    input.files=transfer.files;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await sleep(450);
  }

  async function setInput(el,text){
    el.focus();
    if(el.tagName==='TEXTAREA'||el.tagName==='INPUT'){
      const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter) setter.call(el,text);
      else el.value=text;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    el.textContent='';
    try{document.execCommand('insertText',false,text)}
    catch{el.textContent=text}
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  }

  function sendButtonLabel(el){
    return cleanLabel([
      el?.getAttribute?.('aria-label'),el?.getAttribute?.('title'),el?.getAttribute?.('mattooltip'),
      el?.getAttribute?.('data-tooltip'),el?.innerText,el?.textContent,
      el?.querySelector?.('mat-icon')?.textContent,
      el?.querySelector?.('[data-icon]')?.getAttribute?.('data-icon')
    ].filter(Boolean).join(' '));
  }

  function findSendButton(config,input){
    const direct=first(config.send||[]);
    if(direct&&!direct.disabled&&direct.getAttribute('aria-disabled')!=='true')return direct;
    const form=input?.closest?.('form');
    const formSubmit=form?.querySelector?.('button[type="submit"]:not([disabled])');
    if(formSubmit&&visible(formSubmit)&&formSubmit.getAttribute('aria-disabled')!=='true')return formSubmit;

    let root=input;
    for(let depth=0;depth<7&&root;depth++,root=root.parentElement){
      const buttons=[...root.querySelectorAll?.('button,[role="button"]')||[]].filter(visible);
      for(const button of buttons){
        if(button.disabled||button.getAttribute('aria-disabled')==='true')continue;
        const label=sendButtonLabel(button);
        const semantic=/\b(send|submit|שלח|envoyer|senden|enviar|invia)\b/i.test(label);
        const classHint=/\b(send|submit)\b/i.test(String(button.className||'')+' '+String(button.getAttribute('data-testid')||''));
        if(semantic||classHint)return button;
      }
    }
    return null;
  }

  async function waitForSendButton(config,input,timeoutMs=3200){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const button=findSendButton(config,input);
      if(button)return button;
      await sleep(100);
    }
    return null;
  }

  function browserLabel(el){
    const text=[
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('title'),
      el.getAttribute?.('placeholder'),
      el.innerText,
      el.textContent
    ].filter(Boolean).join(' ');
    return String(text||'').replace(/\s+/g,' ').trim().slice(0,180);
  }

  function browserRole(el){
    const explicit=el.getAttribute?.('role');
    if(explicit)return explicit;
    const tag=String(el.tagName||'').toLowerCase();
    if(tag==='a')return 'link';
    if(tag==='button')return 'button';
    if(tag==='textarea')return 'textbox';
    if(tag==='select')return 'combobox';
    if(tag==='input'){
      const type=String(el.type||'text').toLowerCase();
      if(type==='checkbox')return 'checkbox';
      if(type==='radio')return 'radio';
      if(type==='submit'||type==='button')return 'button';
      return 'textbox';
    }
    if(el.isContentEditable)return 'textbox';
    return tag||'element';
  }

  function browserSnapshot(){
    browserElementMap=new Map();
    const selector=[
      'a[href]','button','input:not([type="hidden"])','textarea','select','summary',
      '[role="button"]','[role="link"]','[role="textbox"]','[role="checkbox"]','[role="radio"]',
      '[contenteditable="true"]','[tabindex]:not([tabindex="-1"])'
    ].join(',');
    const elements=[];
    let index=0;
    for(const el of document.querySelectorAll(selector)){
      if(elements.length>=140||!visible(el))continue;
      const rect=el.getBoundingClientRect();
      if(rect.width<2||rect.height<2)continue;
      if(rect.bottom<0||rect.right<0||rect.top>innerHeight||rect.left>innerWidth)continue;
      const id='e'+(++index);
      browserElementMap.set(id,el);
      const tag=String(el.tagName||'').toLowerCase();
      const inputType=tag==='input'?String(el.type||'text').toLowerCase():'';
      elements.push({
        id,
        role:browserRole(el),
        tag,
        label:browserLabel(el),
        inputType,
        href:tag==='a'?String(el.href||''):'',
        disabled:!!el.disabled,
        checked:typeof el.checked==='boolean'?el.checked:undefined,
        rect:{
          x:Math.round(rect.x),y:Math.round(rect.y),
          width:Math.round(rect.width),height:Math.round(rect.height)
        }
      });
    }
    const rawText=String(document.body?.innerText||'').replace(/\n{3,}/g,'\n\n').trim();
    return {
      url:location.href,
      title:document.title,
      text:rawText.slice(0,18000),
      selectedText:String(getSelection?.()?.toString?.()||'').slice(0,4000),
      viewport:{
        width:innerWidth,height:innerHeight,
        scrollX:Math.round(scrollX),scrollY:Math.round(scrollY),
        documentWidth:Math.max(document.documentElement?.scrollWidth||0,document.body?.scrollWidth||0),
        documentHeight:Math.max(document.documentElement?.scrollHeight||0,document.body?.scrollHeight||0)
      },
      elements
    };
  }

  async function browserAction(action={}){
    const type=String(action.type||'').toLowerCase();
    if(type==='snapshot')return {ok:true,snapshot:browserSnapshot()};
    if(type==='scroll'){
      const x=Math.max(-5000,Math.min(5000,Number(action.deltaX)||0));
      const y=Math.max(-5000,Math.min(5000,Number(action.deltaY)||0));
      window.scrollBy({left:x,top:y,behavior:'auto'});
      await sleep(80);
      return {ok:true};
    }

    const id=String(action.elementId||'');
    const el=browserElementMap.get(id);
    if(!el||!el.isConnected)throw new Error('The selected page element is no longer available. Take a new browser snapshot.');

    if(type==='click'){
      el.scrollIntoView({block:'center',inline:'center'});
      await sleep(40);
      el.click();
      return {ok:true};
    }
    if(type==='focus'){
      el.scrollIntoView({block:'center',inline:'center'});
      el.focus();
      return {ok:true};
    }
    if(type==='type'){
      if(el.disabled)throw new Error('The selected input is disabled.');
      await setInput(el,String(action.text||''));
      return {ok:true};
    }
    if(type==='select'){
      if(!(el instanceof HTMLSelectElement))throw new Error('The selected element is not a select control.');
      const value=String(action.value??'');
      if(![...el.options].some(option=>option.value===value))throw new Error('The requested select option is not available.');
      el.value=value;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return {ok:true};
    }

    throw new Error('Unsupported Browser Use page action: '+String(action.type||'unknown'));
  }

  async function waitForAnswer(c,before,requestId){
    let stable='';
    let stableCount=0;
    for(let i=0;i<360;i++){
      await sleep(500);
      const now=lastText(c.answers);
      if(now&&now!==before){
        if(now===stable) stableCount++;
        else{
          stable=now;stableCount=0;
          if(requestId)chrome.runtime.sendMessage({type:'freeai:stream',id:requestId,text:now}).catch(()=>{});
        }
        if(stableCount>=8) return now;
      }
    }
    throw new Error('Timed out waiting for the AI response.');
  }

  async function prompt(provider,text,toolRequest,effort,requestId,attachments){
    const c=configs[provider];
    if(!c) throw new Error('Unsupported provider.');
    const input=first(c.inputs);
    if(!input) throw new Error('Could not find the chat input. Open the chat page and wait for it to finish loading.');

    const prefixes=[];
    if(effort&&effort!=='default') prefixes.push('Reasoning preference: '+effort+'.');
    if(toolRequest?.mcp){
      prefixes.push('Use the already-installed MCP/connector "'+toolRequest.mcp+'" for this request if it is available in this account. Do not claim to use it if it is unavailable.');
    }
    const finalText=[...prefixes,String(text||'')].filter(Boolean).join('\n\n');

    const before=lastText(c.answers);
    await uploadAttachments(attachments);
    await setInput(input,finalText);
    await sleep(180);

    const send=await waitForSendButton(c,input);
    if(send){
      send.click();
    }else{
      const form=input.closest?.('form');
      if(form&&typeof form.requestSubmit==='function')form.requestSubmit();
      else throw new Error('Could not find the send control for '+provider+' on '+location.hostname+'. The provider UI may have changed.');
    }

    const answer=await waitForAnswer(c,before,requestId);
    return {text:answer,requestedTool:toolRequest?.mcp||null};
  }

  chrome.runtime.onMessage.addListener((m,_sender,sendResponse)=>{
    if(m?.type==='freeai:ping'){
      sendResponse({ok:true});
      return;
    }

    if(m?.type==='freeai:scanCapabilities'){
      const provider=String(m.provider||'');
      sendResponse({
        mcps:scanMcps(),
        modelName:detectActiveModel(provider),
        modelOptions:detectModelOptions(provider),
        fileUpload:detectFileUpload()
      });
      return;
    }

    if(m?.type==='freeai:browserSnapshot'){
      try{sendResponse(browserSnapshot())}
      catch(e){sendResponse({error:e?.message||String(e)})}
      return;
    }

    if(m?.type==='freeai:browserAction'){
      (async()=>{
        try{sendResponse(await browserAction(m.action||{}))}
        catch(e){sendResponse({error:e?.message||String(e)})}
      })();
      return true;
    }

    if(m?.type==='freeai:cancel'){
      const config=configs[m.provider];
      const stop=config?first(config.stop||[]):null;
      if(stop)stop.click();
      sendResponse({ok:!!stop});
      return;
    }

    if(m?.type!=='freeai:prompt') return;

    (async()=>{
      try{sendResponse(await prompt(m.provider,m.text,m.toolRequest,m.effort,m.id,m.attachments||[]))}
      catch(e){sendResponse({error:e?.message||String(e)})}
    })();

    return true;
  });
})();
