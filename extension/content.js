(()=>{
  if(globalThis.__FREE_AI_CONTENT_BRIDGE_LOADED__) return;
  globalThis.__FREE_AI_CONTENT_BRIDGE_LOADED__=true;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=el=>!!(el&&el.getClientRects().length);

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
      inputs:['#prompt-textarea','textarea[placeholder*="Message"]','div[contenteditable="true"][data-virtualkeyboard]','div[contenteditable="true"]'],
      send:['button[data-testid="send-button"]','button[aria-label*="Send"]'],
      stop:['button[data-testid="stop-button"]','button[aria-label*="Stop"]'],
      answers:['[data-message-author-role="assistant"]']
    },
    claude:{
      inputs:['div[contenteditable="true"][role="textbox"]','div.ProseMirror[contenteditable="true"]','textarea'],
      send:['button[aria-label*="Send"]','button[type="submit"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['[data-testid*="assistant"]','.font-claude-message']
    },
    gemini:{
      inputs:['rich-textarea div[contenteditable="true"]','div[contenteditable="true"][role="textbox"]','textarea'],
      send:['button[aria-label*="Send"]','button.send-button'],
      stop:['button[aria-label*="Stop"]','button[aria-label*="stop"]'],
      answers:['model-response','.model-response-text']
    },
    deepseek:{
      inputs:['textarea','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
      send:['button[aria-label*="Send"]','button[type="submit"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['.ds-markdown','[class*="markdown"]']
    },
    grok:{
      inputs:['textarea','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
      send:['button[aria-label*="Send"]','button[type="submit"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['[data-testid*="message"]','article']
    },
    manus:{
      inputs:['textarea','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
      send:['button[aria-label*="Send"]','button[type="submit"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['[data-role="assistant"]','[data-testid*="assistant"]','article']
    }
  };

  function cleanLabel(s){
    return String(s||'').replace(/\s+/g,' ').trim().replace(/^[-•]\s*/,'').slice(0,120);
  }

  function scanMcps(){
    const found=new Set();
    const selectors=['button','[role="menuitem"]','[role="option"]','a','[aria-label]','[title]'];
    for(const el of document.querySelectorAll(selectors.join(','))){
      if(!visible(el)) continue;
      const raw=[el.innerText,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');
      const text=cleanLabel(raw);
      if(!text) continue;
      if(/\b(mcp|connector|connectors|connected apps|plugins?|tools?)\b/i.test(text)&&text.length<120) found.add(text);
    }
    return [...found].slice(0,40);
  }

  function detectActiveModel(){
    const candidates=[...document.querySelectorAll('button,[role="button"],[aria-label],[data-testid]')].filter(visible);
    const patterns=[
      /GPT[-\s]?\d(?:\.\d+)?(?:\s+(?:Sol|Terra|Luna|Astra|Pro))?/i,
      /Claude(?:\s+\d(?:\.\d+)?)?(?:\s+(?:Opus|Sonnet|Haiku))?/i,
      /Gemini(?:\s+\d(?:\.\d+)?)?(?:\s+(?:Pro|Flash))?/i,
      /DeepSeek(?:[-\s][A-Za-z0-9.]+)?/i,
      /Grok(?:\s+\d(?:\.\d+)?)?/i,
      /Manus(?:\s+[A-Za-z0-9.]+)?/i
    ];
    for(const el of candidates){
      const raw=cleanLabel([el.innerText,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' '));
      if(!raw||raw.length>80) continue;
      for(const re of patterns){
        const m=raw.match(re);
        if(m) return m[0];
      }
    }
    return '';
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

  async function prompt(provider,text,toolRequest,effort,requestId){
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
    await setInput(input,finalText);
    await sleep(180);

    const send=first(c.send);
    if(!send) throw new Error('Could not find the send button for this provider.');
    send.click();

    const answer=await waitForAnswer(c,before,requestId);
    return {text:answer,usedTool:toolRequest?.mcp||null};
  }

  chrome.runtime.onMessage.addListener((m,_sender,sendResponse)=>{
    if(m?.type==='freeai:ping'){
      sendResponse({ok:true});
      return;
    }

    if(m?.type==='freeai:scanCapabilities'){
      sendResponse({mcps:scanMcps(),modelName:detectActiveModel()});
      return;
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
      try{sendResponse(await prompt(m.provider,m.text,m.toolRequest,m.effort,m.id))}
      catch(e){sendResponse({error:e?.message||String(e)})}
    })();

    return true;
  });
})();
