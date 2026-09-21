const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const visible=el=>!!(el&&el.getClientRects().length);
function first(selectors){for(const s of selectors){for(const el of document.querySelectorAll(s)){if(visible(el))return el}}return null}
function lastText(selectors){for(const s of selectors){const els=[...document.querySelectorAll(s)].filter(visible);if(els.length){const t=(els.at(-1).innerText||els.at(-1).textContent||'').trim();if(t)return t}}return ''}

const configs={
  chatgpt:{inputs:['#prompt-textarea','textarea[placeholder]','div[contenteditable="true"]'],send:['button[data-testid="send-button"]','button[aria-label*="Send"]'],answers:['[data-message-author-role="assistant"]']},
  claude:{inputs:['div[contenteditable="true"]','textarea'],send:['button[aria-label*="Send"]','button[type="submit"]'],answers:['[data-testid*="assistant"]','.font-claude-message']},
  gemini:{inputs:['div[contenteditable="true"]','textarea'],send:['button[aria-label*="Send"]','button.send-button'],answers:['model-response','.model-response-text']},
  deepseek:{inputs:['textarea','div[contenteditable="true"]'],send:['button[aria-label*="Send"]','button[type="submit"]'],answers:['.ds-markdown','[class*="markdown"]']},
  grok:{inputs:['textarea','div[contenteditable="true"]'],send:['button[aria-label*="Send"]','button[type="submit"]'],answers:['[data-testid*="message"]','article']},
  manus:{inputs:['textarea','div[contenteditable="true"]'],send:['button[aria-label*="Send"]','button[type="submit"]'],answers:['[data-role="assistant"]','[data-testid*="assistant"]','article']}
};

function cleanLabel(s){
  return String(s||'').replace(/\s+/g,' ').trim().replace(/^[-•]\s*/,'').slice(0,80);
}

function scanMcps(){
  const found=new Set();
  const selectors=[
    'button','[role="menuitem"]','[role="option"]','a','[aria-label]','[title]'
  ];
  for(const el of document.querySelectorAll(selectors.join(','))){
    if(!visible(el)) continue;
    const raw=[el.innerText,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');
    const text=cleanLabel(raw);
    if(!text) continue;
    if(/\b(mcp|connector|connectors|tools?)\b/i.test(text) && text.length<80){
      found.add(text);
    }
  }
  return [...found].slice(0,24);
}

async function setInput(el,text){
  el.focus();
  if(el.tagName==='TEXTAREA'||el.tagName==='INPUT'){
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter) setter.call(el,text); else el.value=text;
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }else{
    el.textContent='';
    document.execCommand('insertText',false,text);
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  }
}

async function prompt(provider,text,toolRequest){
  const c=configs[provider];
  if(!c) throw new Error('Unsupported provider.');
  const input=first(c.inputs);
  if(!input) throw new Error('Could not find the chat input. Open the chat page and wait for it to finish loading.');
  let finalText=text;
  if(toolRequest?.mcp){
    finalText='Use the already-installed connector/tool "'+toolRequest.mcp+'" for this request if it is available in this account. Do not claim to use it if it is unavailable.\n\n'+text;
  }
  const before=lastText(c.answers);
  await setInput(input,finalText);
  await sleep(120);
  const send=first(c.send);
  if(send) send.click();
  else{
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));
  }
  let stable='',stableCount=0;
  for(let i=0;i<300;i++){
    await sleep(500);
    const now=lastText(c.answers);
    if(now&&now!==before){
      if(now===stable) stableCount++; else{stable=now;stableCount=0}
      if(stableCount>=4) return {text:now,usedTool:toolRequest?.mcp||null};
    }
  }
  throw new Error('Timed out waiting for the AI response.');
}

chrome.runtime.onMessage.addListener((m,_s,sendResponse)=>{
  if(m?.type==='freeai:scanCapabilities'){
    sendResponse({mcps:scanMcps()});
    return;
  }
  if(m?.type!=='freeai:prompt') return;
  (async()=>{try{sendResponse(await prompt(m.provider,m.text,m.toolRequest))}catch(e){sendResponse({error:e.message})}})();
  return true;
});