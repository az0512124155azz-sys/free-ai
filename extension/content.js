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

  function modelMenuTrigger(provider){
    const candidates=modelCandidates(provider);
    for(const item of candidates){
      const role=String(item.el.getAttribute?.('role')||'').toLowerCase();
      if(role==='option'||role==='menuitemradio')continue;
      if(item.el.hasAttribute?.('aria-haspopup'))return item.el;
    }
    const selectors=[
      'button[data-testid*="model" i]','button[data-test-id*="model" i]',
      'button[aria-label*="model" i]','[role="button"][aria-label*="model" i]',
      'header button[aria-haspopup]','nav button[aria-haspopup]'
    ];
    return first(selectors);
  }

  async function closeTransientControl(trigger){
    if(trigger?.getAttribute?.('aria-expanded')==='true'){
      try{trigger.click();await sleep(80);return}catch{}
    }
    try{
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
      document.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true}));
      await sleep(80);
    }catch{}
  }

  async function probeModelOptions(provider){
    const before=detectModelOptions(provider);
    const trigger=modelMenuTrigger(provider);
    if(!trigger)return before;
    const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
    if(!wasExpanded){
      try{trigger.click();await sleep(260)}catch{return before}
    }
    const after=detectModelOptions(provider);
    if(!wasExpanded)await closeTransientControl(trigger);
    const values=[];
    const seen=new Set();
    for(const value of [...after,...before]){
      const key=String(value||'').trim().toLowerCase();
      if(!key||seen.has(key))continue;
      seen.add(key);values.push(String(value).trim());
    }
    return values.slice(0,24);
  }

  async function selectProviderModel(provider,target){
    const desired=cleanLabel(target);
    if(!desired)throw new Error('Choose a provider model first.');
    const current=detectActiveModel(provider);
    if(current&&current.toLowerCase()===desired.toLowerCase())return {ok:true,modelName:current};

    const trigger=modelMenuTrigger(provider);
    if(!trigger)throw new Error('Could not find the model selector in this '+provider+' tab.');
    const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
    if(!wasExpanded){trigger.click();await sleep(280)}

    const candidates=modelCandidates(provider);
    const normalized=desired.toLowerCase();
    const option=candidates.find(item=>{
      if(item.el===trigger)return false;
      const role=String(item.el.getAttribute?.('role')||'').toLowerCase();
      const optionLike=role==='option'||role==='menuitemradio'||role==='menuitem'||item.el.closest?.('[role="menu"],[role="listbox"],[role="dialog"]');
      return optionLike&&item.model.toLowerCase()===normalized;
    })||candidates.find(item=>item.el!==trigger&&item.model.toLowerCase().includes(normalized));

    if(!option){
      if(!wasExpanded)await closeTransientControl(trigger);
      throw new Error('The requested model "'+desired+'" is not available in this tab right now.');
    }

    option.el.click();
    await sleep(420);
    const active=detectActiveModel(provider)||desired;
    return {ok:true,modelName:active};
  }

  const effortAliases=[
    ['extra-high',/^(extra\s*high|maximum|max)$/i],
    ['high',/^high$/i],
    ['medium',/^medium$/i],
    ['instant',/^(instant|fast)$/i],
    ['pro-extended',/^(pro\s*extended|extended)$/i],
    ['pro-standard',/^(pro\s*standard|standard)$/i],
    ['deep-think',/^(deep\s*think|deep)$/i],
    ['heavy',/^heavy$/i]
  ];

  function effortLevelFromLabel(value){
    const label=cleanLabel(value);
    for(const [id,re] of effortAliases)if(re.test(label))return id;
    return '';
  }

  function effortCandidates(){
    const selectors=[
      'button','[role="button"]','[role="option"]','[role="menuitemradio"]','[role="menuitem"]',
      '[aria-selected="true"]','[aria-checked="true"]'
    ];
    const out=[];
    const seen=new Set();
    for(const el of document.querySelectorAll(selectors.join(','))){
      if(!visible(el)||seen.has(el))continue;
      seen.add(el);
      const label=controlLabel(el);
      const level=effortLevelFromLabel(label);
      const explicit=/reasoning|thinking|effort|intelligence/i.test(label+' '+String(el.getAttribute?.('aria-label')||'')+' '+String(el.getAttribute?.('data-testid')||''));
      if(!level&&!explicit)continue;
      let score=0;
      if(level)score+=4;
      if(explicit)score+=4;
      if(el.getAttribute?.('aria-selected')==='true'||el.getAttribute?.('aria-checked')==='true')score+=8;
      if(el.hasAttribute?.('aria-haspopup'))score+=3;
      out.push({el,label,level,score});
    }
    return out.sort((a,b)=>b.score-a.score);
  }

  function effortTrigger(){
    return effortCandidates().find(item=>{
      const role=String(item.el.getAttribute?.('role')||'').toLowerCase();
      return role!=='option'&&role!=='menuitemradio'&&item.el.hasAttribute?.('aria-haspopup');
    })?.el||null;
  }

  function detectEffortState(){
    const candidates=effortCandidates();
    const levels=[];
    const seen=new Set();
    let active='default';
    for(const item of candidates){
      if(!item.level)continue;
      if(!seen.has(item.level)){seen.add(item.level);levels.push(item.level)}
      if(item.el.getAttribute?.('aria-selected')==='true'||item.el.getAttribute?.('aria-checked')==='true')active=item.level;
    }
    return {levels,active};
  }

  async function probeEffortState(){
    const before=detectEffortState();
    const trigger=effortTrigger();
    if(!trigger)return before;
    const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
    if(!wasExpanded){try{trigger.click();await sleep(220)}catch{return before}}
    const after=detectEffortState();
    if(!wasExpanded)await closeTransientControl(trigger);
    const levels=[...new Set([...after.levels,...before.levels])];
    return {levels,active:after.active!=='default'?after.active:before.active};
  }

  async function selectProviderEffort(level){
    const desired=String(level||'default');
    if(!desired||desired==='default')return {ok:true,activeEffort:'default'};
    const state=detectEffortState();
    if(state.active===desired)return {ok:true,activeEffort:desired};
    const trigger=effortTrigger();
    if(!trigger)throw new Error('This provider tab does not expose a native reasoning-effort control.');
    const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
    if(!wasExpanded){trigger.click();await sleep(220)}
    const option=effortCandidates().find(item=>item.el!==trigger&&item.level===desired);
    if(!option){
      if(!wasExpanded)await closeTransientControl(trigger);
      throw new Error('Reasoning effort "'+desired+'" is not available in this provider tab.');
    }
    option.el.click();
    await sleep(240);
    return {ok:true,activeEffort:desired};
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

  function visibleIntegrationNames(){
    const found=new Set();
    const generic=/^(tools?|apps?|plugins?|connectors?|connected apps?|add|more|manage|settings|files?|photos?|camera|search|deep research)$/i;
    const roots=[...document.querySelectorAll('[role="menu"],[role="listbox"],[role="dialog"],[class*="menu"],[class*="popover"]')].filter(visible);
    for(const root of roots){
      for(const el of root.querySelectorAll('[role="menuitem"],[role="option"],button,a')){
        if(!visible(el))continue;
        const label=cleanLabel(controlLabel(el));
        if(!label||generic.test(label)||label.length>100)continue;
        const hint=label+' '+String(el.getAttribute?.('data-testid')||'')+' '+String(el.getAttribute?.('href')||'');
        if(/plugin|connector|app|tool|gmail|drive|github|calendar|notion|slack|canva|figma|dropbox|onedrive|sharepoint|outlook/i.test(hint))found.add(label);
      }
    }
    return [...found];
  }

  async function probeMcps(){
    const found=new Set(scanMcps());
    const triggers=[];
    for(const el of document.querySelectorAll('button,[role="button"]')){
      if(!visible(el))continue;
      const label=controlLabel(el);
      if(!/(tools?|apps?|plugins?|connectors?|connected apps?|add files|add|more)/i.test(label))continue;
      if(triggers.length<6)triggers.push(el);
    }

    for(const trigger of triggers){
      const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
      if(!wasExpanded){
        try{trigger.click();await sleep(180)}catch{continue}
      }
      for(const name of scanMcps())found.add(name);
      for(const name of visibleIntegrationNames())found.add(name);

      const nested=[...document.querySelectorAll('[role="menuitem"],[role="option"],button')].filter(el=>visible(el)&&/^(apps?|plugins?|connectors?|connected apps?|tools?)$/i.test(cleanLabel(controlLabel(el))));
      for(const item of nested.slice(0,2)){
        try{
          item.click();await sleep(180);
          for(const name of scanMcps())found.add(name);
          for(const name of visibleIntegrationNames())found.add(name);
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
          await sleep(60);
        }catch{}
      }
      if(!wasExpanded)await closeTransientControl(trigger);
    }
    return [...found].filter(Boolean).slice(0,80);
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
    if(effort&&effort!=='default') await selectProviderEffort(effort);
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
      (async()=>{
        try{
          const modelOptions=m.probeModels?await probeModelOptions(provider):detectModelOptions(provider);
          const effort=m.probeModels?await probeEffortState():detectEffortState();
          const mcps=m.probeTools?await probeMcps():scanMcps();
          sendResponse({
            mcps,
            modelName:detectActiveModel(provider),
            modelOptions,
            effortLevels:effort.levels,
            activeEffort:effort.active,
            effortControl:effort.levels.length>1?'native':null,
            fileUpload:detectFileUpload()
          });
        }catch(e){sendResponse({error:e?.message||String(e),mcps:scanMcps(),modelName:detectActiveModel(provider),modelOptions:detectModelOptions(provider),fileUpload:detectFileUpload()})}
      })();
      return true;
    }

    if(m?.type==='freeai:setProviderModel'){
      (async()=>{
        try{sendResponse(await selectProviderModel(String(m.provider||''),String(m.modelName||'')))}
        catch(e){sendResponse({error:e?.message||String(e)})}
      })();
      return true;
    }

    if(m?.type==='freeai:setProviderEffort'){
      (async()=>{
        try{sendResponse(await selectProviderEffort(String(m.effort||'default')))}
        catch(e){sendResponse({error:e?.message||String(e)})}
      })();
      return true;
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
