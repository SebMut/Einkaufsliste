import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const ROOT=path.resolve(process.cwd(),'..');
const OUT=path.join(ROOT,'docs','catalog-source-probe-v2.json');
const UA='Mozilla/5.0 (compatible; AngebotsRadar/6.0; +https://github.com/SebMut/Einkaufsliste)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function get(url,{json=false}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),35000);
  try{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'de-DE,de;q=0.9','accept':json?'application/json':'text/html,application/xhtml+xml,application/json;q=0.8'},redirect:'follow',signal:controller.signal});
    const text=await r.text();let body=null;if(json){try{body=JSON.parse(text)}catch{}}
    return {ok:r.ok,status:r.status,url:r.url,text,body,bytes:Buffer.byteLength(text),contentType:r.headers.get('content-type')||''};
  }catch(e){return{ok:false,status:0,url,text:'',body:null,bytes:0,error:String(e?.message||e)}}finally{clearTimeout(timer)}
}
function links(html,base,patterns=[]){
  const $=cheerio.load(html||'');const out=new Set();
  $('a[href]').each((_,a)=>{try{const u=new URL($(a).attr('href'),base).toString().split('#')[0];if(patterns.some(p=>p.test(u)))out.add(u)}catch{}});
  return [...out];
}
function jsonScripts(html){const $=cheerio.load(html||'');return $('script[type="application/ld+json"],script[type="application/json"],script[id*="NEXT_DATA"]') .map((_,x)=>$(x).text().length).get().sort((a,b)=>b-a).slice(0,8)}
function pageSummary(r,base,patterns){return{status:r.status,ok:r.ok,finalUrl:r.url,bytes:r.bytes,contentType:r.contentType,productLinks:links(r.text,base,patterns).length,sampleLinks:links(r.text,base,patterns).slice(0,5),jsonScriptSizes:jsonScripts(r.text),title:(cheerio.load(r.text||'')('title').text()||'').trim().slice(0,160)}}

const result={schema:2,generatedAt:new Date().toISOString(),retailers:{}};

// REWE: bekannte lokale Markt-IDs direkt gegen Produktsuche prüfen, mit und ohne PICKUP-Filter.
result.retailers.REWE={markets:{}};
for(const m of [{name:'Feldkirchen',id:'461761'},{name:'Aschheim-Dornach',id:'440674'},{name:'Aschheim',id:'562345'}]){
  const variants={};
  for(const [label,service] of [['pickup','PICKUP'],['none',null]]){
    const q=new URLSearchParams({search:'*',market:m.id,page:'1',objectsPerPage:'250',sorting:'RELEVANCE_DESC'});if(service)q.set('serviceTypes',service);
    const r=await get(`https://shop.rewe.de/api/products?${q}`,{json:true});
    variants[label]={status:r.status,ok:r.ok,products:Array.isArray(r.body?._embedded?.products)?r.body._embedded.products.length:0,totalResultCount:r.body?.pagination?.totalResultCount??null,totalPages:r.body?.pagination?.totalPages??null,market:r.body?.market??null};
    await sleep(250);
  }
  result.retailers.REWE.markets[m.name]={id:m.id,...variants};
}

const probes=[
  ['ALDI SÜD','https://www.aldi-sued.de/produkte',[/\/produkt\//i,/\/produkte\/.+\/p\//i]],
  ['PENNY','https://www.penny.de/sortiment',[/\/produkte?\//i,/\/sortiment\/.+\//i]],
  ['Lidl','https://www.lidl.de/c/lidl-plus-sortimentsliste/s10007380',[/\/p\//i,/\/c\/.+\/s\d+/i]],
  ['ROSSMANN','https://www.rossmann.de/de/haushalt/c/olcat1_3/',[/\/p\//i]],
  ['MÜLLER','https://www.mueller.de/c/drogerie/alle-drogerie-produkte/',[/\/p\//i,/\/p\/\d+/i]],
  ['EDEKA','https://www.edeka.de/unsere-marken/produkte.jsp',[/\/produkte\//i,/\/unsere-marken\//i]],
  ['Getränke Haußmann','https://www.getraenke-haussmann.de/',[/produkt/i,/sortiment/i]]
];
for(const [name,url,patterns] of probes){
  const base=await get(url);const rows={base:pageSummary(base,url,patterns),variants:{}};
  for(const [label,suffix] of [['page1',url.includes('?')?'&page=1':'?page=1'],['page2',url.includes('?')?'&page=2':'?page=2'],['pageIndex1',url.includes('?')?'&pageIndex=1':'?pageIndex=1']]){
    const r=await get(suffix);rows.variants[label]=pageSummary(r,url,patterns);await sleep(300);
  }
  result.retailers[name]=rows;
}

// dm: relevante offizielle Hauptbereiche zählen.
result.retailers.dm={categories:{}};
for(const [name,id] of [['Ernährung','040000'],['Baby & Kind','050000'],['Haushalt','060000'],['Tierprodukte','070000'],['Gesundheit','030000'],['Pflege & Duft','020000'],['Haar','110000']]){
  const u=new URL('https://product-search.services.dmtech.com/de/search/crawl');u.searchParams.set('pageSize','1');u.searchParams.set('allCategories.id',id);
  const r=await get(u.toString(),{json:true});result.retailers.dm.categories[name]={id,status:r.status,count:r.body?.count??null,products:Array.isArray(r.body?.products)?r.body.products.length:0};await sleep(1400);
}

await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
