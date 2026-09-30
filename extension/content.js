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

  function answerElements(config,provider=''){
    if(provider!=='chatgpt'){
      for(const selector of config?.answers||[]){
        const els=[...document.querySelectorAll(selector)].filter(visible);
        if(els.length)return els;
      }
      return [];
    }

    const found=[];
    const seen=new Set();
    const add=el=>{
      if(!visible(el)||seen.has(el))return;
      seen.add(el);
      found.push(el);
    };
    for(const selector of config?.answers||[]){
      for(const el of document.querySelectorAll(selector))add(el);
    }
    for(const turn of document.querySelectorAll('section[data-turn="assistant"],article[data-turn="assistant"],[data-testid^="conversation-turn-"][data-turn="assistant"]')){
      add(turn);
      const roleNode=turn.querySelector?.('[data-message-author-role="assistant"],[data-testid*="assistant" i]');
      if(roleNode)add(roleNode);
    }
    found.sort((a,b)=>{
      if(a===b)return 0;
      if(a.contains?.(b))return -1;
      if(b.contains?.(a))return 1;
      const position=a.compareDocumentPosition?.(b)||0;
      if(position&Node.DOCUMENT_POSITION_FOLLOWING)return -1;
      if(position&Node.DOCUMENT_POSITION_PRECEDING)return 1;
      return 0;
    });
    return found;
  }

  function responseScope(root){
    return root?.closest?.('section[data-turn],section[data-testid^="conversation-turn-"],article[data-turn],article[data-testid^="conversation-turn-"],article[data-testid*="conversation-turn"],article,[role="article"],[data-testid*="message"]')||root||null;
  }

  function responseMimeFromUrl(url,fallback='application/octet-stream'){
    const value=String(url||'').toLowerCase().split(/[?#]/)[0];
    if(value.endsWith('.png'))return 'image/png';
    if(value.endsWith('.jpg')||value.endsWith('.jpeg'))return 'image/jpeg';
    if(value.endsWith('.webp'))return 'image/webp';
    if(value.endsWith('.gif'))return 'image/gif';
    if(value.endsWith('.svg'))return 'image/svg+xml';
    if(value.endsWith('.pdf'))return 'application/pdf';
    if(value.endsWith('.docx'))return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if(value.endsWith('.xlsx'))return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if(value.endsWith('.pptx'))return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if(value.endsWith('.zip'))return 'application/zip';
    if(value.endsWith('.csv'))return 'text/csv';
    if(value.endsWith('.txt'))return 'text/plain';
    return fallback;
  }

  function responseNameFromUrl(url,fallback){
    try{
      const parsed=new URL(String(url||''),location.href);
      const tail=decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1)||'').trim();
      return tail.slice(0,140)||fallback;
    }catch{return fallback}
  }

  function responseMedia(root){
    const scope=responseScope(root);
    if(!scope)return [];
    const items=[];
    const seen=new Set();
    const add=item=>{
      const key=String(item?.url||item?.dataUrl||'');
      if(!key||seen.has(key))return;
      seen.add(key);
      items.push(item);
    };
    for(const img of scope.querySelectorAll?.('img[src],picture img[src]')||[]){
      if(!visible(img))continue;
      const src=String(img.currentSrc||img.src||img.getAttribute('src')||'').trim();
      if(!/^(?:https?:|blob:|data:image\/)/i.test(src))continue;
      const rect=img.getBoundingClientRect();
      const alt=cleanLabel(img.getAttribute('alt')||img.getAttribute('aria-label')||'');
      const largeEnough=rect.width>=72&&rect.height>=72;
      if(!largeEnough&&!/generated|image|photo|picture|illustration|art/i.test(alt))continue;
      const mime=src.startsWith('data:')?String((src.match(/^data:([^;,]+)/i)||[])[1]||'image/png'):responseMimeFromUrl(src,'image/png');
      add({
        kind:'image',
        url:src,
        name:(alt||responseNameFromUrl(src,'Generated image')).slice(0,140),
        mime,
        width:Math.max(0,Math.round(img.naturalWidth||rect.width||0)),
        height:Math.max(0,Math.round(img.naturalHeight||rect.height||0))
      });
      if(items.length>=8)break;
    }
    if(items.length<8){
      const fileRe=/\.(?:png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?|zip|csv|txt)(?:$|[?#])/i;
      for(const link of scope.querySelectorAll?.('a[href]')||[]){
        const href=String(link.href||link.getAttribute('href')||'').trim();
        if(!/^(?:https?:|blob:|data:)/i.test(href))continue;
        if(!link.hasAttribute('download')&&!fileRe.test(href))continue;
        const mime=responseMimeFromUrl(href);
        const kind=mime.startsWith('image/')?'image':'file';
        add({
          kind,
          url:href,
          name:(cleanLabel(link.getAttribute('download')||link.innerText||link.textContent||'')||responseNameFromUrl(href,kind==='image'?'Generated image':'Attachment')).slice(0,140),
          mime
        });
        if(items.length>=8)break;
      }
    }
    return items.slice(0,8);
  }

  function chatgptGeneratedMedia(){
    const main=document.querySelector('main')||document.body;
    const images=[...main.querySelectorAll('img[src*="/backend-api/estuary/content"],img[src*="oaiusercontent"],img[alt^="Generated image" i]')].filter(visible);
    return images.slice(-8).map(img=>{
      const src=String(img.currentSrc||img.src||img.getAttribute('src')||'').trim();
      const rect=img.getBoundingClientRect();
      const alt=cleanLabel(img.getAttribute('alt')||img.getAttribute('aria-label')||'Generated image');
      return {
        kind:'image',
        url:src,
        name:(alt||'Generated image').slice(0,140),
        mime:responseMimeFromUrl(src,'image/png'),
        width:Math.max(0,Math.round(img.naturalWidth||rect.width||0)),
        height:Math.max(0,Math.round(img.naturalHeight||rect.height||0))
      };
    }).filter(item=>/^(?:https?:|blob:|data:image\/)/i.test(item.url));
  }

  function providerResponseMedia(provider,root){
    const combined=[...responseMedia(root)];
    if(provider==='chatgpt')combined.push(...chatgptGeneratedMedia());
    const seen=new Set();
    return combined.filter(item=>{
      const key=String(item?.url||item?.dataUrl||'');
      if(!key||seen.has(key))return false;
      seen.add(key);
      return true;
    }).slice(-8);
  }

  function responseSnapshot(config,provider=''){
    const elements=answerElements(config,provider);
    const root=elements.at(-1)||null;
    const text=String(root?.innerText||root?.textContent||'').trim();
    const media=providerResponseMedia(provider,root);
    const signature=[text,...media.map(item=>[item.kind,item.url,item.name,item.width||0,item.height||0].join('|'))].join('\n');
    return {root,count:elements.length,text,media,signature};
  }

  async function pageMediaDataUrl(url){
    const value=String(url||'');
    if(!/^(?:blob:|https?:)/i.test(value))return '';
    try{
      const response=await fetch(value,{credentials:'include',cache:'no-store'});
      if(!response.ok)return '';
      const blob=await response.blob();
      if(!blob.size||blob.size>16*1024*1024)return '';
      return await new Promise(resolve=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(typeof reader.result==='string'?reader.result:'');
        reader.onerror=()=>resolve('');
        reader.readAsDataURL(blob);
      });
    }catch{
      try{
        const image=[...document.images].find(img=>String(img.currentSrc||img.src||'')===value&&img.complete&&img.naturalWidth>0);
        if(!image)return '';
        const canvas=document.createElement('canvas');
        canvas.width=Math.min(image.naturalWidth,4096);
        canvas.height=Math.min(image.naturalHeight,4096);
        const context=canvas.getContext('2d');
        if(!context)return '';
        context.drawImage(image,0,0,canvas.width,canvas.height);
        return canvas.toDataURL('image/png');
      }catch{return ''}
    }
  }

  async function materializePageMedia(items){
    const out=[];
    for(const raw of Array.isArray(items)?items.slice(0,8):[]){
      const item={...raw};
      if(String(item.url||'').startsWith('data:'))item.dataUrl=item.url;
      else if(/^(?:blob:|https?:)/i.test(String(item.url||'')))item.dataUrl=await pageMediaDataUrl(item.url);
      out.push(item);
    }
    return out;
  }

  const genericConfig={
    inputs:['textarea:not([disabled])','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]'],
    send:['button[type="submit"]','button[aria-label*="Send" i]','button[data-testid*="send" i]','button[data-test-id*="send" i]'],
    stop:['button[aria-label*="Stop" i]','button[data-testid*="stop" i]','button[data-test-id*="stop" i]'],
    answers:['[data-message-author-role="assistant"]','[data-role="assistant"]','[data-testid*="assistant" i]','[class*="assistant" i]','[class*="markdown" i]','article']
  };
  const configs={
    chatgpt:{
      inputs:[
        '#prompt-textarea',
        'div[contenteditable="true"][role="textbox"][aria-label*="Chat" i]',
        'textarea[aria-label*="Chat" i]',
        'textarea[placeholder*="Ask" i]',
        'textarea[placeholder*="Message" i]',
        'div[contenteditable="true"][data-virtualkeyboard]',
        'div[contenteditable="true"][role="textbox"]'
      ],
      send:[
        'button[data-testid="send-button"]',
        '#composer-submit-button',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      stop:[
        'button[data-testid="stop-button"]',
        'form[data-chatgpt-composer] button[type="button"][aria-label="Stop"]',
        'button[aria-label*="Stop" i]'
      ],
      answers:[
        '[data-message-author-role="assistant"]',
        'section[data-turn="assistant"]',
        '[data-testid^="conversation-turn-"][data-turn="assistant"]',
        '[data-testid^="conversation-turn-"][data-message-author-role="assistant"]',
        '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
        '[data-turn-key]:has([data-conversation-role="assistant"])'
      ]
    },
    claude:{
      inputs:['div[contenteditable="true"][role="textbox"]','div.ProseMirror[contenteditable="true"]','textarea'],
      send:['button[aria-label*="Send"]','button[aria-label*="send"]','button[type="submit"]','button[data-testid*="send"]'],
      stop:['button[aria-label*="Stop"]','button[data-testid*="stop"]'],
      answers:['[data-testid*="assistant"]','.font-claude-message']
    },
    gemini:{
      inputs:['div.ql-editor[contenteditable="true"]','rich-textarea [contenteditable="true"]','rich-textarea div[contenteditable="true"]','[aria-label="Enter a prompt here"]','[aria-label*="prompt" i][contenteditable="true"]','div[contenteditable="true"][role="textbox"]','textarea'],
      send:['button[aria-label="Send message"]','button.send-button','button[aria-label*="Send" i]','button[mattooltip*="Send" i]','button[data-test-id*="send" i]','button[data-testid*="send" i]','.send-button-container button','button[type="submit"]'],
      stop:['button[aria-label*="Stop" i]','button[mattooltip*="Stop" i]'],
      answers:['model-response','.model-response-text','[data-test-id*="response"]','[data-testid*="response"]']
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

  function providerConfig(provider){return configs[provider]||genericConfig}
  function providerAdapterHealth(provider){
    const config=providerConfig(provider);
    const input=first(config.inputs||[]);
    if(!input){
      return {
        adapterReady:false,
        adapterIssue:'Free AI could not find the provider chat input. Open a chat and wait for it to finish loading. If this persists, the provider UI may have changed.'
      };
    }
    return {adapterReady:true,adapterIssue:''};
  }

  function cleanLabel(s){
    return String(s||'').replace(/\s+/g,' ').trim().replace(/^[-•]\s*/,'').slice(0,160);
  }

  function controlLabel(el){
    const values=[
      el?.innerText,
      el?.textContent,
      el?.getAttribute?.('aria-label'),
      el?.getAttribute?.('title'),
      el?.getAttribute?.('data-tooltip'),
      el?.getAttribute?.('mattooltip')
    ].map(value=>cleanLabel(value)).filter(Boolean);
    const unique=[];
    const seen=new Set();
    for(const value of values){
      const key=value.toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      unique.push(value);
    }
    return cleanLabel(unique.join(' '));
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
      '[data-testid*="model"]','[data-test-id*="model"]','[class*="model"] button','[role="menuitem"]'
    ];
    const out=[];
    const seen=new Set();
    for(const el of document.querySelectorAll(selectors.join(','))){
      if(!visible(el)||seen.has(el))continue;
      seen.add(el);
      const label=controlLabel(el);
      const marker=String(el.getAttribute('data-testid')||el.getAttribute('data-test-id')||el.getAttribute('aria-label')||el.className||'');
      let model=modelFromLabel(provider,label);
      if(!model&&/model/i.test(marker)&&label&&label.length<=80)model=label;
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
      if(!/tool|plugin|connector|connected app|apps?/i.test(context))continue;
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

  function providerAppNavigationItems(){
    const priority=label=>{
      const value=cleanLabel(label).toLowerCase();
      if(value==='more')return 0;
      if(value==='apps'||value==='plugins')return 1;
      if(value==='connected apps'||value==='connectors')return 2;
      if(value==='tools')return 3;
      if(value.startsWith('view all'))return 4;
      return 5;
    };
    return [...document.querySelectorAll('[role="menuitem"],[role="option"],button')].filter(el=>{
      if(!visible(el)||el.disabled||el.getAttribute?.('aria-disabled')==='true')return false;
      return /^(apps?|plugins?|connectors?|connected apps?|tools?|more|view all(?: tools| apps| plugins)?)$/i.test(cleanLabel(controlLabel(el)));
    }).sort((a,b)=>priority(controlLabel(a))-priority(controlLabel(b)));
  }

  function providerComposerTriggers(){
    const local=composerToolTriggers();
    if(local.length)return local.slice(0,8);
    return [...document.querySelectorAll('button,[role="button"]')].filter(el=>{
      if(!visible(el)||el.disabled||el.getAttribute?.('aria-disabled')==='true')return false;
      return /(tools?|apps?|plugins?|connectors?|connected apps?|add files|add|more|plus|\+)/i.test(controlLabel(el));
    }).slice(0,8);
  }

  function collectProviderApps(found){
    for(const name of scanMcps())found.add(name);
    for(const name of visibleIntegrationNames())found.add(name);
  }

  async function probeMcps(){
    const found=new Set(scanMcps());
    const triggers=providerComposerTriggers();
    for(const trigger of triggers){
      const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
      if(!wasExpanded){
        try{trigger.click();await sleep(200)}catch{continue}
      }
      collectProviderApps(found);

      const visited=new Set();
      for(let depth=0;depth<4;depth++){
        const item=providerAppNavigationItems().find(el=>el!==trigger&&!visited.has(el));
        if(!item)break;
        visited.add(item);
        try{item.click();await sleep(220)}catch{continue}
        collectProviderApps(found);
      }

      if(!wasExpanded)await closeTransientControl(trigger);
    }
    return [...found].filter(Boolean).slice(0,80);
  }


  async function activateProviderTool(toolName){
    const desired=cleanLabel(toolName);
    if(!desired)return {ok:true};
    const desiredLower=desired.toLowerCase();

    const findTarget=()=>{
      const candidates=[...document.querySelectorAll('[role="menuitem"],[role="option"],button,a')].filter(visible);
      return candidates.find(el=>{
        const label=cleanLabel(controlLabel(el));
        if(!label)return false;
        const lower=label.toLowerCase();
        return lower===desiredLower||lower.includes(desiredLower)||desiredLower.includes(lower);
      })||null;
    };

    let target=findTarget();
    if(target){target.click();await sleep(180);return {ok:true,name:desired}};

    const triggers=providerComposerTriggers();
    for(const trigger of triggers){
      const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
      if(!wasExpanded){
        try{trigger.click();await sleep(200)}catch{continue}
      }

      target=findTarget();
      if(target){
        target.click();await sleep(220);
        return {ok:true,name:desired};
      }

      const visited=new Set();
      for(let depth=0;depth<4;depth++){
        const item=providerAppNavigationItems().find(el=>el!==trigger&&!visited.has(el));
        if(!item)break;
        visited.add(item);
        try{item.click();await sleep(220)}catch{continue}
        target=findTarget();
        if(target){
          target.click();await sleep(240);
          return {ok:true,name:desired};
        }
      }

      if(!wasExpanded)await closeTransientControl(trigger);
    }

    throw new Error('Could not activate the connected tool "'+desired+'" in this provider tab. Open + → More in the provider once and confirm that the app is available.');
  }

  function nativeToolLabelMatches(kind,label){
    const value=cleanLabel(label);
    if(kind==='search')return /^(search|web search|search the web|search web|browse the web|browse web)$/i.test(value)||/\b(web search|search the web|browse the web)\b/i.test(value);
    if(kind==='deep-research')return /^(deep research|research|deepsearch|deep search)$/i.test(value)||/\b(deep research|deepsearch|deep search)\b/i.test(value);
    return false;
  }

  function nativeToolCandidates(kind){
    const selectors='button,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="option"]';
    const items=[];
    for(const el of document.querySelectorAll(selectors)){
      if(!visible(el)||el.disabled||el.getAttribute?.('aria-disabled')==='true')continue;
      const label=controlLabel(el);
      if(!nativeToolLabelMatches(kind,label))continue;
      const role=String(el.getAttribute?.('role')||'').toLowerCase();
      const context=el.closest?.('[role="menu"],[role="listbox"],[role="dialog"],form,[class*="popover"],[class*="menu"]');
      let score=0;
      if(role==='menuitem'||role==='menuitemradio'||role==='option')score+=8;
      if(context)score+=5;
      if(/tool|search|research/i.test(String(el.getAttribute?.('data-testid')||el.getAttribute?.('data-test-id')||el.className||'')))score+=5;
      if(el.getAttribute?.('aria-pressed')==='true'||el.getAttribute?.('aria-checked')==='true'||el.getAttribute?.('aria-selected')==='true')score+=4;
      const rect=el.getBoundingClientRect();
      if(rect.top>innerHeight*.45)score+=2;
      items.push({el,label,score});
    }
    return items.sort((a,b)=>b.score-a.score);
  }

  function composerToolTriggers(){
    const input=first([
      '#prompt-textarea','textarea','rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]','div.ProseMirror[contenteditable="true"]'
    ]);
    const roots=[];
    let node=input;
    for(let depth=0;depth<6&&node;depth++,node=node.parentElement)roots.push(node);
    const candidates=[];
    const seen=new Set();
    for(const root of roots){
      for(const el of root.querySelectorAll?.('button,[role="button"]')||[]){
        if(!visible(el)||seen.has(el)||el.disabled)continue;
        seen.add(el);
        const label=controlLabel(el);
        const hint=label+' '+String(el.getAttribute?.('data-testid')||el.getAttribute?.('data-test-id')||'');
        if(/tools?|apps?|plugins?|connectors?|connected apps?|view all(?: tools| apps| plugins)?|more|add|plus|\+/i.test(hint))candidates.push(el);
      }
    }
    for(const el of document.querySelectorAll('button,[role="button"]')){
      if(candidates.length>=12)break;
      if(!visible(el)||seen.has(el)||el.disabled)continue;
      const label=controlLabel(el);
      const hint=label+' '+String(el.getAttribute?.('data-testid')||el.getAttribute?.('data-test-id')||'');
      if(/^(tools?|view all tools|more|add)$/i.test(label)||/tool/i.test(hint)){
        seen.add(el);candidates.push(el);
      }
    }
    return candidates.slice(0,12);
  }

  async function activateProviderNativeTool(kind){
    let candidate=nativeToolCandidates(kind)[0];
    if(candidate){
      const selected=candidate.el.getAttribute?.('aria-pressed')==='true'||candidate.el.getAttribute?.('aria-checked')==='true'||candidate.el.getAttribute?.('aria-selected')==='true';
      if(!selected){candidate.el.click();await sleep(220)}
      return {ok:true,name:candidate.label};
    }

    for(const trigger of composerToolTriggers()){
      const wasExpanded=trigger.getAttribute?.('aria-expanded')==='true';
      if(!wasExpanded){
        try{trigger.click();await sleep(180)}catch{continue}
      }
      candidate=nativeToolCandidates(kind)[0];
      if(candidate){
        candidate.el.click();
        await sleep(240);
        return {ok:true,name:candidate.label};
      }

      const nested=[...document.querySelectorAll('[role="menuitem"],[role="option"],button')].filter(el=>visible(el)&&/^(tools?|more tools|view all tools)$/i.test(cleanLabel(controlLabel(el))));
      for(const item of nested.slice(0,3)){
        try{item.click();await sleep(160)}catch{continue}
        candidate=nativeToolCandidates(kind)[0];
        if(candidate){
          candidate.el.click();
          await sleep(240);
          return {ok:true,name:candidate.label};
        }
      }
      if(!wasExpanded)await closeTransientControl(trigger);
    }

    throw new Error(kind==='search'
      ? 'This provider tab does not expose a live web-search tool. Choose a browser model with Search available in its composer.'
      : 'This provider tab does not expose Deep Research in its current composer.');
  }

  function latestAnswerElement(config,provider=''){
    return answerElements(config,provider).at(-1)||null;
  }

  function unwrapSourceUrl(raw){
    try{
      const parsed=new URL(String(raw||''),location.href);
      if(parsed.protocol!=='https:')return '';
      if(parsed.hostname===location.hostname){
        for(const key of ['url','u','target','dest','destination']){
          const value=parsed.searchParams.get(key);
          if(!value)continue;
          try{
            const nested=new URL(decodeURIComponent(value));
            if(nested.protocol==='https:')return nested.toString();
          }catch{}
        }
      }
      return parsed.toString();
    }catch{return ''}
  }

  function extractResponseSources(config,provider=''){
    const answer=latestAnswerElement(config,provider);
    if(!answer)return [];
    const roots=[answer];
    const article=answer.closest?.('article,[role="article"],[data-testid*="message"]');
    if(article&&article!==answer)roots.push(article);
    const seen=new Set();
    const sources=[];
    for(const root of roots){
      for(const link of root.querySelectorAll?.('a[href]')||[]){
        const url=unwrapSourceUrl(link.getAttribute('href')||link.href);
        if(!url)continue;
        let parsed;try{parsed=new URL(url)}catch{continue}
        if(parsed.hostname===location.hostname)continue;
        const key=(parsed.origin+parsed.pathname+parsed.search).replace(/\/$/,'');
        if(seen.has(key))continue;
        seen.add(key);
        let title=cleanLabel(link.getAttribute('aria-label')||link.getAttribute('title')||link.innerText||link.textContent||'');
        if(!title||/^(source|citation|link|\d+)$/i.test(title))title=parsed.hostname.replace(/^www\./,'');
        sources.push({title,url:parsed.toString(),domain:parsed.hostname.replace(/^www\./,'')});
        if(sources.length>=12)return sources;
      }
    }
    return sources;
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
      el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:text}));
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    const selection=getSelection?.();
    let inserted=false;
    try{
      const range=document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      inserted=document.execCommand('insertText',false,text)===true;
    }catch{}
    if(!inserted&&String(el.innerText||el.textContent||'')!==text)el.textContent=text;
    el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:text}));
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    try{
      const range=document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }catch{}
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

  function sendControlDiagnostics(input){
    const root=input?.closest?.('form,input-area-v2,rich-textarea')||input?.parentElement?.parentElement||input?.parentElement||document.body;
    const controls=[...root.querySelectorAll?.('button,[role="button"]')||[]].filter(visible).slice(0,16);
    return controls.map(el=>({
      label:sendButtonLabel(el).slice(0,90),
      disabled:!!el.disabled||el.getAttribute('aria-disabled')==='true',
      testId:String(el.getAttribute('data-testid')||el.getAttribute('data-test-id')||'').slice(0,80),
      className:String(el.className||'').slice(0,100)
    }));
  }

  async function recoverGeminiComposer(input,finalText,config){
    await setInput(input,finalText);
    await sleep(420);
    let send=await waitForSendButton(config,input,4200);
    if(send)return send;
    const rich=input.closest?.('rich-textarea')||document.querySelector('rich-textarea');
    const alternate=rich?.querySelector?.('div.ql-editor[contenteditable="true"],[contenteditable="true"][role="textbox"],[contenteditable="true"]');
    if(alternate&&alternate!==input){
      await setInput(alternate,finalText);
      await sleep(420);
      send=await waitForSendButton(config,alternate,4200);
      if(send)return send;
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

  function researchActivityText(){
    const candidates=[...document.querySelectorAll('[role="status"],[aria-live],button,[data-testid*="status"],[data-test-id*="status"]')].filter(visible);
    const patterns=/\b(planning|searching|browsing|reading|researching|analyzing|analysing|synthesizing|synthesising|reviewing|collecting|checking sources|working)\b/i;
    for(const el of candidates.reverse()){
      const label=cleanLabel(controlLabel(el));
      if(label&&patterns.test(label)&&label.length<=180)return label;
    }
    return '';
  }

  async function waitForAnswer(c,before,requestId,{deepResearch=false,provider=''}={}){
    let stableSignature='';
    let stableCount=0;
    let lastActivity='';
    let lastStreamText='';
    const iterations=deepResearch?3600:360;
    const requiredStable=deepResearch?24:4;
    for(let i=0;i<iterations;i++){
      await sleep(500);
      if(deepResearch&&requestId&&i%4===0){
        const activity=researchActivityText();
        if(activity&&activity!==lastActivity){
          lastActivity=activity;
          chrome.runtime.sendMessage({type:'freeai:activity',id:requestId,text:activity}).catch(()=>{});
        }
      }
      const now=responseSnapshot(c,provider);
      const changed=now.count>Number(before?.count||0)
        ||(now.root&&before?.root&&now.root!==before.root)
        ||now.signature!==String(before?.signature||'');
      const hasPayload=!!(now.text||now.media.length);
      if(changed&&hasPayload){
        if(now.signature===stableSignature)stableCount++;
        else{stableSignature=now.signature;stableCount=0}
        if(requestId&&now.text&&now.text!==lastStreamText){
          lastStreamText=now.text;
          chrome.runtime.sendMessage({type:'freeai:stream',id:requestId,text:now.text}).catch(()=>{});
        }
        const stop=first(c.stop||[]);
        if(stableCount>=requiredStable&&!stop){
          const beforeMediaKeys=new Set((before?.media||[]).map(item=>String(item?.url||item?.dataUrl||'')));
          const responseMediaOnly=now.media.filter(item=>{
            const key=String(item?.url||item?.dataUrl||'');
            return key&&!beforeMediaKeys.has(key);
          });
          return {...now,media:await materializePageMedia(responseMediaOnly)};
        }
      }
    }
    throw new Error(deepResearch?'Deep Research timed out before the provider finished.':'Timed out waiting for the AI response.');
  }

  async function prompt(provider,text,toolRequest,effort,requestId,attachments,nativeTool){
    const c=providerConfig(provider);
    const input=first(c.inputs);
    if(!input) throw new Error('Could not find the chat input. Open the chat page and wait for it to finish loading.');

    const prefixes=[];
    if(effort&&effort!=='default') await selectProviderEffort(effort);
    if(toolRequest?.mcp)await activateProviderTool(toolRequest.mcp);
    if(nativeTool==='search')await activateProviderNativeTool('search');
    if(nativeTool==='deep-research')await activateProviderNativeTool('deep-research');
    const finalText=[...prefixes,String(text||'')].filter(Boolean).join('\n\n');

    const before=responseSnapshot(c,provider);
    await uploadAttachments(attachments);
    await setInput(input,finalText);
    await sleep(provider==='gemini'?420:180);

    let send=await waitForSendButton(c,input,provider==='gemini'?5200:3200);
    if(!send&&provider==='gemini')send=await recoverGeminiComposer(input,finalText,c);
    if(send){
      send.click();
    }else{
      const form=input.closest?.('form');
      if(form&&typeof form.requestSubmit==='function')form.requestSubmit();
      else{
        const controls=sendControlDiagnostics(input);
        console.warn('[FreeAI provider adapter] send control missing',{provider,host:location.hostname,controls});
        throw new Error('Could not find an enabled send control for '+provider+' on '+location.hostname+'. Reload the provider tab and refresh connections; the provider composer may have changed.');
      }
    }

    if(nativeTool==='deep-research'&&requestId)chrome.runtime.sendMessage({type:'freeai:activity',id:requestId,text:'Deep research started'}).catch(()=>{});
    const answer=await waitForAnswer(c,before,requestId,{deepResearch:nativeTool==='deep-research',provider});
    return {
      text:answer.text,
      media:Array.isArray(answer.media)?answer.media:[],
      requestedTool:toolRequest?.mcp||null,
      requestedNativeTool:nativeTool||null,
      sources:(nativeTool==='search'||nativeTool==='deep-research')?extractResponseSources(c,provider):[]
    };
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
            ...providerAdapterHealth(provider),
            mcps,
            modelName:detectActiveModel(provider),
            modelOptions,
            effortLevels:effort.levels,
            activeEffort:effort.active,
            effortControl:effort.levels.length>1?'native':null,
            fileUpload:detectFileUpload()
          });
        }catch(e){sendResponse({
          adapterReady:false,
          adapterIssue:e?.message||'Free AI could not inspect this provider UI.',
          error:e?.message||String(e),
          mcps:scanMcps(),
          modelName:detectActiveModel(provider),
          modelOptions:detectModelOptions(provider),
          fileUpload:detectFileUpload()
        })}
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
      const config=providerConfig(m.provider);
      const stop=config?first(config.stop||[]):null;
      if(stop)stop.click();
      sendResponse({ok:!!stop});
      return;
    }

    if(m?.type!=='freeai:prompt') return;

    (async()=>{
      try{sendResponse(await prompt(m.provider,m.text,m.toolRequest,m.effort,m.id,m.attachments||[],m.nativeTool||null))}
      catch(e){sendResponse({error:e?.message||String(e)})}
    })();

    return true;
  });
})();
