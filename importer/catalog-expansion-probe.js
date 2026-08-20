import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const OUT=path.join(ROOT,'docs','catalog-expansion-probe.json');
const UA='Mozilla/5.0 (compatible; AngebotsRadar/5.4; +https://github.com/SebMut/Einkaufsliste)';

async function fetchAny(url,{json=true}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'de-DE,de;q=0.9','accept':json?'application/json':'text/html,application/xhtml+xml'},signal:controller.signal,redirect:'follow'});
    const text=await r.text();let body=null;if(json){try{body=JSON.parse(text)}catch{}}
    return{ok:r.ok,status:r.status,url:r.url,text:json?null:text,body,bytes:Buffer.byteLength(text)};
  }catch(e){return{ok:false,status:0,url,error:String(e?.message||e)}}finally{clearTimeout(timer)}
}
function reweProducts(body){return Array.isArray(body?._embedded?.products)?body._embedded.products:[]}
function dmProducts(body){return Array.isArray(body?.products)?body.products:[]}
function uniqueProductLinks(html=''){
  const set=new Set();
  for(const m of html.matchAll(/href=["']([^"']+)["']/gi)){
    const href=m[1];
    if(/rossmann\.de\/de\/.+\/p\//i.test(href)||/\/de\/.+\/p\//i.test(href))set.add(href.split(/[?#]/)[0]);
  }
  return [...set];
}
const result={schema:1,generatedAt:new Date().toISOString(),rewe:{},dm:{},rossmann:{}};

// REWE Aschheim: bestehender verifizierter Pickup-Markt 562345.
for(const term of ['*','milch','brot','getränke']){
  const params=new URLSearchParams({search:term,market:'562345',page:'1',objectsPerPage:'250',sorting:'RELEVANCE_DESC',serviceTypes:'PICKUP'});
  const r=await fetchAny(`https://shop.rewe.de/api/products?${params}`);
  const products=reweProducts(r.body);
  result.rewe[term]={status:r.status,ok:r.ok,products:products.length,totalResultCount:r.body?.pagination?.totalResultCount??null,totalPages:r.body?.pagination?.totalPages??null,objectsPerPage:r.body?.pagination?.objectsPerPage??null,sample:products.slice(0,5).map(p=>p.productName)};
}

// dm: öffentliche Produktsuche, mit deutlich größerer pageSize als unsere bisherige Landingpage-Erfassung.
for(const query of ['*','milch','lebensmittel','baby','haushalt']){
  const u=new URL('https://product-search.services.dmtech.com/de/search');u.searchParams.set('query',query);u.searchParams.set('pageSize','500');
  const r=await fetchAny(u.toString());const products=dmProducts(r.body);
  result.dm[query]={status:r.status,ok:r.ok,products:products.length,topLevelKeys:r.body&&typeof r.body==='object'?Object.keys(r.body):[],total:r.body?.total??r.body?.totalCount??r.body?.pagination?.total??null,sample:products.slice(0,5).map(p=>({dan:p.dan,brand:p.brandName,title:p.title,price:p.price??p.currentPrice??null}))};
}

// Rossmann: prüfen, ob pageIndex wirklich weitere Produktseiten liefert.
for(const [name,base] of Object.entries({haushalt:'https://www.rossmann.de/de/haushalt/c/olcat1_3/',pflege:'https://www.rossmann.de/de/pflege-und-duft/c/olcat1_1',baby:'https://www.rossmann.de/de/baby-und-spielzeug/c/olcat1_2'})){
  const pages=[];const all=new Set();
  for(let pageIndex=0;pageIndex<4;pageIndex++){
    const u=new URL(base);u.searchParams.set('pageIndex',String(pageIndex));const r=await fetchAny(u.toString(),{json:false});const links=uniqueProductLinks(r.text||'');links.forEach(x=>all.add(x));pages.push({pageIndex,status:r.status,bytes:r.bytes||0,productLinks:links.length,sample:links.slice(0,3)});
  }
  result.rossmann[name]={uniqueProductLinks:[...all].length,pages};
}

result.summary={
  reweStarTotal:result.rewe['*']?.totalResultCount??0,
  reweStarFirstPage:result.rewe['*']?.products??0,
  dmStar:result.dm['*']?.products??0,
  dmBroadUniquePotential:Object.values(result.dm).reduce((n,x)=>n+(x.products||0),0),
  rossmannPagePotential:Object.values(result.rossmann).reduce((n,x)=>n+(x.uniqueProductLinks||0),0)
};
await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary,null,2));
