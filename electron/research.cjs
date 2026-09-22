const fs=require('fs');
const path=require('path');
const {app,dialog,BrowserWindow}=require('electron');

const MAX_SEARCH_QUERIES=5;
const MAX_SEARCH_RESULTS=24;
const MAX_READ_SOURCES=8;
const MAX_SOURCE_BYTES=650000;
const MAX_SOURCE_TEXT=9000;
const MAX_EVIDENCE_TEXT=56000;

function cleanText(value){
  return String(value||'').replace(/\u0000/g,'').replace(/\r/g,'').trim();
}

function normalizeDomain(value){
  const raw=String(value||'').trim().toLowerCase();
  if(!raw)return '';
  try{
    const url=new URL(raw.includes('://')?raw:'https://'+raw);
    return url.hostname.replace(/^www\./,'').replace(/\.$/,'');
  }catch{
    return raw.replace(/^https?:\/\//,'').split('/')[0].replace(/^www\./,'').replace(/\.$/,'');
  }
}

function hostForUrl(value){
  try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}
}

function domainMatches(host,domain){
  const cleanHost=String(host||'').toLowerCase().replace(/^www\./,'');
  const cleanDomain=normalizeDomain(domain);
  return !!cleanHost&&!!cleanDomain&&(cleanHost===cleanDomain||cleanHost.endsWith('.'+cleanDomain));
}

function normalizeSourceScope(scope={}){
  const mode=['web','only','prioritize'].includes(scope?.mode)?scope.mode:'web';
  const sites=[...new Set((Array.isArray(scope?.sites)?scope.sites:[]).map(normalizeDomain).filter(Boolean))].slice(0,20);
  const exclude=[...new Set((Array.isArray(scope?.exclude)?scope.exclude:[]).map(normalizeDomain).filter(Boolean))].slice(0,20);
  return {mode,sites,exclude};
}

function allowedByScope(url,scope){
  const host=hostForUrl(url);
  if(!host)return false;
  if(scope.exclude.some(domain=>domainMatches(host,domain)))return false;
  if(scope.mode==='only')return scope.sites.some(domain=>domainMatches(host,domain));
  return true;
}

function priorityForUrl(url,scope){
  if(scope.mode!=='prioritize'||!scope.sites.length)return 0;
  const host=hostForUrl(url);
  return scope.sites.some(domain=>domainMatches(host,domain))?1:0;
}

function validateSearxngUrl(value){
  let parsed;
  try{parsed=new URL(String(value||'').trim())}catch{throw new Error('Set a valid SearXNG Search API URL before starting independent research.')}
  if(parsed.username||parsed.password)throw new Error('Do not put SearXNG credentials in the URL.');
  const loopback=new Set(['localhost','127.0.0.1','[::1]','::1']);
  if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&loopback.has(parsed.hostname))){
    throw new Error('SearXNG must use HTTPS. HTTP is allowed only for localhost.');
  }
  parsed.hash='';
  return parsed.toString().replace(/\/$/,'');
}

function addScopeOperators(query,scope){
  const parts=[String(query||'').trim()];
  if(scope.mode==='only'&&scope.sites.length){
    parts.push('('+scope.sites.map(domain=>'site:'+domain).join(' OR ')+')');
  }
  for(const domain of scope.exclude)parts.push('-site:'+domain);
  return parts.filter(Boolean).join(' ');
}

function decodeEntities(value){
  return String(value||'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Number(n)||32))
    .replace(/&#x([0-9a-f]+);/gi,(_m,n)=>String.fromCodePoint(parseInt(n,16)||32));
}

function htmlTitle(html){
  const match=String(html||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?decodeEntities(match[1].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,300):'';
}

function readableHtml(html){
  return decodeEntities(String(html||'')
    .replace(/<!--([\s\S]*?)-->/g,' ')
    .replace(/<(script|style|noscript|svg|canvas|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/(p|div|section|article|main|li|h[1-6]|tr)>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .replace(/[ \t]+/g,' ')
    .replace(/\n\s*\n+/g,'\n')
    .trim();
}

async function fetchWithTimeout(url,options={},parentSignal=null,timeoutMs=18000){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(parentSignal?.aborted)controller.abort();
  else parentSignal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),Math.max(1500,Number(timeoutMs)||18000));
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }finally{
    clearTimeout(timer);
    parentSignal?.removeEventListener?.('abort',abort);
  }
}

async function responseTextBounded(response,maxBytes=MAX_SOURCE_BYTES){
  if(!response.body)return String(await response.text()).slice(0,maxBytes);
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let text='',bytes=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value?.byteLength||0;
      text+=decoder.decode(value,{stream:true});
      if(bytes>=maxBytes){try{await reader.cancel()}catch{};break}
    }
    text+=decoder.decode();
  }finally{
    try{reader.releaseLock()}catch{}
  }
  return text.slice(0,maxBytes*2);
}

async function searchSearxng(baseUrl,query,signal){
  const base=validateSearxngUrl(baseUrl);
  const endpoint=new URL(base.endsWith('/search')?base:base+'/search');
  endpoint.searchParams.set('q',String(query||'').trim());
  endpoint.searchParams.set('format','json');
  endpoint.searchParams.set('safesearch','1');
  const response=await fetchWithTimeout(endpoint.toString(),{
    headers:{'Accept':'application/json','User-Agent':'Free-AI-Research/0.6'}
  },signal,20000);
  if(!response.ok){
    throw new Error('SearXNG search failed with HTTP '+response.status+'. Confirm that this instance enables JSON Search API responses.');
  }
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('json'))throw new Error('SearXNG did not return JSON. This instance may have the JSON format disabled.');
  const data=await response.json();
  const results=Array.isArray(data?.results)?data.results:[];
  return results.map(item=>({
    url:String(item?.url||''),
    title:cleanText(item?.title||''),
    snippet:cleanText(item?.content||item?.snippet||'')
  })).filter(item=>/^https:\/\//i.test(item.url));
}

async function readSource(candidate,scope,signal){
  const inputUrl=String(candidate?.url||'');
  if(!/^https:\/\//i.test(inputUrl)||!allowedByScope(inputUrl,scope))return null;
  let response;
  try{
    response=await fetchWithTimeout(inputUrl,{
      redirect:'follow',
      headers:{
        'Accept':'text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.2',
        'User-Agent':'Mozilla/5.0 (compatible; Free-AI-Research/0.6; +https://github.com/az0512124155azz-sys/free-ai)'
      }
    },signal,18000);
  }catch(error){
    if(signal?.aborted)throw error;
    return null;
  }
  if(!response.ok)return null;
  const finalUrl=String(response.url||inputUrl);
  if(!/^https:\/\//i.test(finalUrl)||!allowedByScope(finalUrl,scope))return null;
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(!(type.includes('text/html')||type.includes('application/xhtml')||type.includes('text/plain')||type.includes('application/json'))){
    return null;
  }
  const raw=await responseTextBounded(response);
  const text=type.includes('html')||type.includes('xhtml')?readableHtml(raw):cleanText(raw);
  if(text.length<80)return null;
  const title=(type.includes('html')?htmlTitle(raw):'')||candidate.title||hostForUrl(finalUrl)||'Web source';
  return {
    url:finalUrl,
    title:String(title).slice(0,300),
    domain:hostForUrl(finalUrl),
    retrievedAt:new Date().toISOString(),
    excerpt:text.slice(0,650),
    text:text.slice(0,MAX_SOURCE_TEXT)
  };
}

function apiEndpoint(cfg){
  const base=String(cfg?.baseUrl||'').trim().replace(/\/$/,'');
  if(!/^https?:\/\//i.test(base))throw new Error('API endpoint must start with http:// or https://');
  if(!cfg?.model)throw new Error('API model is required.');
  return base.endsWith('/chat/completions')?base:base+'/chat/completions';
}

async function apiCompletion(cfg,messages,signal,onStream=null){
  const headers={'Content-Type':'application/json'};
  if(cfg.apiKey)headers.Authorization='Bearer '+cfg.apiKey;
  const stream=typeof onStream==='function';
  const response=await fetchWithTimeout(apiEndpoint(cfg),{
    method:'POST',
    headers,
    body:JSON.stringify({model:cfg.model,messages,stream})
  },signal,stream?30*60*1000:120000);
  if(!response.ok){
    const data=await response.json().catch(()=>({}));
    throw new Error(data?.error?.message||data?.message||('API request failed: '+response.status));
  }
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(stream&&contentType.includes('text/event-stream')&&response.body){
    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    let buffer='',full='';
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split(/\r?\n/);
      buffer=lines.pop()||'';
      for(const line of lines){
        const trimmed=line.trim();
        if(!trimmed.startsWith('data:'))continue;
        const raw=trimmed.slice(5).trim();
        if(!raw||raw==='[DONE]')continue;
        let chunk;try{chunk=JSON.parse(raw)}catch{continue}
        const delta=chunk?.choices?.[0]?.delta?.content;
        if(typeof delta==='string'&&delta){
          full+=delta;
          onStream(full);
        }
      }
    }
    if(full)return full;
    throw new Error('The API stream ended without a research report.');
  }
  const data=await response.json().catch(()=>({}));
  const out=data?.choices?.[0]?.message?.content;
  if(typeof out!=='string')throw new Error('The API returned an unsupported response format.');
  if(onStream)onStream(out);
  return out;
}

function parseQueries(raw,fallback){
  try{
    const text=String(raw||'');
    const start=text.indexOf('['),end=text.lastIndexOf(']');
    if(start>=0&&end>start){
      const parsed=JSON.parse(text.slice(start,end+1));
      const list=(Array.isArray(parsed)?parsed:[]).map(item=>cleanText(item)).filter(Boolean).slice(0,MAX_SEARCH_QUERIES);
      if(list.length)return list;
    }
  }catch{}
  return [cleanText(fallback)].filter(Boolean);
}

function dedupeCandidates(items,scope){
  const map=new Map();
  for(const item of items){
    if(!item?.url||!allowedByScope(item.url,scope))continue;
    let key;try{const u=new URL(item.url);u.hash='';key=u.toString()}catch{continue}
    if(!map.has(key))map.set(key,{...item,url:key});
  }
  const values=[...map.values()];
  if(scope.mode==='prioritize'&&scope.sites.length){
    values.sort((a,b)=>priorityForUrl(b.url,scope)-priorityForUrl(a.url,scope));
  }
  return values.slice(0,MAX_SEARCH_RESULTS);
}

function researchTitle(question){
  const value=cleanText(question).replace(/\s+/g,' ');
  return value.length>96?value.slice(0,93)+'…':value||'Research report';
}

async function runOwnedResearch({cfg,msg,onStream,emitActivity,activePrompts}){
  const requestId=String(msg?.requestId||'').trim();
  if(!requestId)throw new Error('Independent research requires a cancellable request ID.');
  const config=msg?.researchConfig&&typeof msg.researchConfig==='object'?msg.researchConfig:{};
  const plan=(Array.isArray(config.plan)?config.plan:[]).map(cleanText).filter(Boolean).slice(0,12);
  if(!plan.length)throw new Error('Review at least one research-plan step before starting.');
  const scope=normalizeSourceScope(config.sourceScope);
  if(scope.mode==='only'&&!scope.sites.length)throw new Error('Add at least one site when source scope is set to Only these sites.');
  const searxngUrl=validateSearxngUrl(config?.searchBackend?.url);
  const controller=new AbortController();
  const active={controller,cancelled:false};
  activePrompts.set(requestId,active);
  const startedAt=new Date().toISOString();
  const activity=[];
  const reportActivity=text=>{
    const value=cleanText(text);
    if(!value||activity.at(-1)===value)return;
    activity.push(value);
    emitActivity?.(value);
  };

  try{
    reportActivity('Planning search queries');
    const plannerPrompt=[
      'Create 3 to 5 concise web-search queries for this research request.',
      'Return only a JSON array of strings. Do not answer the research question.',
      '',
      'Research request:',
      cleanText(msg.text),
      '',
      'User-reviewed plan:',
      ...plan.map((step,index)=>(index+1)+'. '+step)
    ].join('\n');
    let queries;
    try{
      const rawQueries=await apiCompletion(cfg,[
        {role:'system',content:'You create search queries only. Output valid JSON and nothing else.'},
        {role:'user',content:plannerPrompt}
      ],controller.signal,null);
      queries=parseQueries(rawQueries,msg.text);
    }catch(error){
      if(controller.signal.aborted)throw error;
      queries=[cleanText(msg.text)].filter(Boolean);
    }
    queries=[...new Set(queries.map(query=>addScopeOperators(query,scope)).filter(Boolean))].slice(0,MAX_SEARCH_QUERIES);
    if(!queries.length)throw new Error('Could not derive a usable web-search query.');

    const found=[];
    for(const query of queries){
      if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
      reportActivity('Searching: '+query.slice(0,120));
      const results=await searchSearxng(searxngUrl,query,controller.signal);
      found.push(...results);
    }
    const candidates=dedupeCandidates(found,scope);
    if(!candidates.length)throw new Error('Search returned no HTTPS results inside the selected source scope.');

    const sources=[];
    for(const candidate of candidates){
      if(sources.length>=MAX_READ_SOURCES)break;
      reportActivity('Opening source: '+(candidate.title||hostForUrl(candidate.url)||candidate.url).slice(0,120));
      const source=await readSource(candidate,scope,controller.signal);
      if(!source)continue;
      reportActivity('Reading: '+(source.title||source.domain).slice(0,120));
      sources.push(source);
    }
    if(!sources.length)throw new Error('Search found results, but Free AI could not read any supported HTTPS text sources. No report was generated.');

    let evidence='';
    for(let index=0;index<sources.length;index++){
      const source=sources[index];
      const block='[S'+(index+1)+'] '+source.title+'\nURL: '+source.url+'\nRetrieved: '+source.retrievedAt+'\n\n'+source.text+'\n\n';
      if((evidence+block).length>MAX_EVIDENCE_TEXT)break;
      evidence+=block;
    }
    if(!evidence.trim())throw new Error('Readable sources did not contain enough text to synthesize a report.');

    reportActivity('Comparing retrieved sources');
    reportActivity('Synthesizing report');
    const synthesisPrompt=[
      'Write a standalone research report for the request below using only the retrieved source material.',
      'Every factual claim that depends on a source must cite one or more source IDs exactly as [S1], [S2], etc.',
      'Never invent a citation, URL, title, date, quote, or source. If evidence is incomplete or conflicting, say so.',
      'Use this structure: # Title, ## Executive summary, ## Findings, additional useful sections, ## Methodology, ## Sources.',
      'In the Sources section, list only the source IDs actually used.',
      '',
      'Research request:',
      cleanText(msg.text),
      '',
      'User-reviewed research plan:',
      ...plan.map((step,index)=>(index+1)+'. '+step),
      '',
      'Retrieved sources:',
      evidence
    ].join('\n');

    const report=await apiCompletion(cfg,[
      {role:'system',content:'You are a rigorous research synthesizer. Use only supplied evidence and preserve citation IDs exactly.'},
      {role:'user',content:synthesisPrompt}
    ],controller.signal,onStream);
    const citedIds=[...String(report||'').matchAll(/\\[S(\\d+)\\]/g)].map(match=>Number(match[1]));
    const invalidCitation=citedIds.find(id=>!Number.isInteger(id)||id<1||id>sources.length);
    if(invalidCitation){
      throw new Error('The research model returned a citation for a source Free AI did not read. The report was rejected to protect citation integrity.');
    }
    const completedAt=new Date().toISOString();
    reportActivity('Research complete');
    return {
      text:report,
      sources:sources.map(({text,...source})=>source),
      research:{
        status:'complete',
        mode:'free-ai-owned',
        backend:'searxng',
        title:researchTitle(msg.text),
        plan,
        sourceScope:scope,
        queries,
        startedAt,
        completedAt,
        activity:[...activity]
      }
    };
  }catch(error){
    if(error?.name==='AbortError'){
      if(active.cancelled)throw new Error('Generation stopped.');
      throw new Error('Research request timed out or was cancelled.');
    }
    throw error;
  }finally{
    if(activePrompts.get(requestId)===active)activePrompts.delete(requestId);
  }
}

function safeFileName(value){
  return String(value||'Research report').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/\s+/g,' ').trim().slice(0,100)||'Research report';
}

function reportSources(report){
  return (Array.isArray(report?.sources)?report.sources:[]).filter(source=>/^https:\/\//i.test(String(source?.url||''))).slice(0,30);
}

function reportMarkdown(report){
  const title=cleanText(report?.title)||'Research report';
  const plan=(Array.isArray(report?.plan)?report.plan:[]).map(cleanText).filter(Boolean);
  const sources=reportSources(report);
  const lines=['# '+title,''];
  if(report?.completedAt)lines.push('Completed: '+String(report.completedAt),'');
  if(report?.mode)lines.push('Research mode: '+String(report.mode),'');
  if(plan.length){
    lines.push('## Research plan','');
    plan.forEach((step,index)=>lines.push((index+1)+'. '+step));
    lines.push('');
  }
  lines.push(cleanText(report?.content||report?.text||''));
  if(sources.length){
    lines.push('','## Retrieved sources','');
    sources.forEach((source,index)=>{
      lines.push((index+1)+'. ['+(source.title||source.domain||source.url)+']('+source.url+')');
      if(source.retrievedAt)lines.push('   Retrieved: '+source.retrievedAt);
    });
  }
  return lines.join('\n').trim()+'\n';
}

function escapeHtml(value){
  return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function markdownBodyHtml(markdown){
  const lines=String(markdown||'').split(/\r?\n/);
  return lines.map(line=>{
    if(/^###\s+/.test(line))return '<h3>'+escapeHtml(line.replace(/^###\s+/,''))+'</h3>';
    if(/^##\s+/.test(line))return '<h2>'+escapeHtml(line.replace(/^##\s+/,''))+'</h2>';
    if(/^#\s+/.test(line))return '<h1>'+escapeHtml(line.replace(/^#\s+/,''))+'</h1>';
    if(/^\d+\.\s+/.test(line))return '<p class="list">'+escapeHtml(line)+'</p>';
    if(/^[-*]\s+/.test(line))return '<p class="list">• '+escapeHtml(line.replace(/^[-*]\s+/,''))+'</p>';
    if(!line.trim())return '<div class="spacer"></div>';
    return '<p>'+escapeHtml(line)+'</p>';
  }).join('');
}

function reportHtml(report){
  const markdown=reportMarkdown(report);
  return '<!doctype html><html><head><meta charset="utf-8"><style>'+
    '@page{size:A4;margin:18mm 17mm 20mm}body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#161616;font-size:10.5pt;line-height:1.55}'+
    'h1{font-size:24pt;line-height:1.15;margin:0 0 18px}h2{font-size:15pt;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:5px}h3{font-size:12pt;margin:18px 0 6px}'+
    'p{margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere}.list{padding-left:12px}.spacer{height:7px}a{color:#145cc5}'+
    '</style></head><body>'+markdownBodyHtml(markdown)+'</body></html>';
}

function xmlEscape(value){
  return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function docxParagraph(line){
  const text=String(line||'');
  if(!text)return '<w:p/>';
  const heading=/^(#{1,3})\s+(.*)$/.exec(text);
  const value=heading?heading[2]:text;
  const runProps=heading?'<w:rPr><w:b/><w:sz w:val="'+(heading[1].length===1?'36':heading[1].length===2?'28':'24')+'"/></w:rPr>':'';
  return '<w:p><w:r>'+runProps+'<w:t xml:space="preserve">'+xmlEscape(value)+'</w:t></w:r></w:p>';
}

let crcTable=null;
function makeCrcTable(){
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    table[n]=c>>>0;
  }
  return table;
}

function crc32(buffer){
  if(!crcTable)crcTable=makeCrcTable();
  let crc=0xFFFFFFFF;
  for(const byte of buffer)crc=crcTable[(crc^byte)&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

function dosDateTime(date=new Date()){
  const year=Math.max(1980,date.getFullYear());
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2);
  const day=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  return {time:time&0xFFFF,date:day&0xFFFF};
}

function zipStored(entries){
  const local=[],central=[];
  let offset=0;
  const stamp=dosDateTime();
  for(const entry of entries){
    const name=Buffer.from(entry.name,'utf8');
    const data=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(String(entry.data),'utf8');
    const crc=crc32(data);
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);header.writeUInt16LE(0,8);
    header.writeUInt16LE(stamp.time,10);header.writeUInt16LE(stamp.date,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);
    header.writeUInt16LE(name.length,26);header.writeUInt16LE(0,28);
    local.push(header,name,data);
    const ch=Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x0800,8);ch.writeUInt16LE(0,10);
    ch.writeUInt16LE(stamp.time,12);ch.writeUInt16LE(stamp.date,14);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);
    ch.writeUInt16LE(name.length,28);ch.writeUInt16LE(0,30);ch.writeUInt16LE(0,32);ch.writeUInt16LE(0,34);ch.writeUInt16LE(0,36);ch.writeUInt32LE(0,38);ch.writeUInt32LE(offset,42);
    central.push(ch,name);
    offset+=header.length+name.length+data.length;
  }
  const centralBuffer=Buffer.concat(central);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...local,centralBuffer,end]);
}

function reportDocx(report){
  const markdown=reportMarkdown(report);
  const body=markdown.split(/\r?\n/).map(docxParagraph).join('');
  const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return zipStored([
    {name:'[Content_Types].xml',data:types},
    {name:'_rels/.rels',data:rels},
    {name:'word/document.xml',data:document}
  ]);
}

async function exportResearchReport(win,payload={}){
  if(process.platform!=='win32')throw new Error('Research report export is currently available on Windows.');
  const report=payload?.report&&typeof payload.report==='object'?payload.report:payload;
  const format=['md','pdf','docx'].includes(String(payload?.format||'').toLowerCase())?String(payload.format).toLowerCase():'md';
  const title=cleanText(report?.title)||'Research report';
  const extension=format;
  const result=await dialog.showSaveDialog(win,{
    title:'Export research report',
    defaultPath:path.join(app.getPath('documents'),safeFileName(title)+'.'+extension),
    filters:format==='pdf'?[{name:'PDF',extensions:['pdf']}]:format==='docx'?[{name:'Word document',extensions:['docx']}]:[{name:'Markdown',extensions:['md']}],
    properties:['showOverwriteConfirmation']
  });
  if(result.canceled||!result.filePath)return {saved:false};

  if(format==='md'){
    await fs.promises.writeFile(result.filePath,reportMarkdown(report),'utf8');
    return {saved:true,filePath:result.filePath,format};
  }
  if(format==='docx'){
    await fs.promises.writeFile(result.filePath,reportDocx(report));
    return {saved:true,filePath:result.filePath,format};
  }

  const pdfWindow=new BrowserWindow({
    show:false,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}
  });
  try{
    await pdfWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(reportHtml(report)));
    const pdf=await pdfWindow.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});
    await fs.promises.writeFile(result.filePath,pdf);
    return {saved:true,filePath:result.filePath,format};
  }finally{
    if(!pdfWindow.isDestroyed())pdfWindow.destroy();
  }
}

module.exports={runOwnedResearch,exportResearchReport,normalizeSourceScope,reportMarkdown};
