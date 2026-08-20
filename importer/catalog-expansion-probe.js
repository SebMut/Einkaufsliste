import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT=path.resolve(process.cwd(),'..'),OUT=path.join(ROOT,'docs','catalog-expansion-probe.json');
const UA='Mozilla/5.0 (compatible; AngebotsRadar/5.4; +https://github.com/SebMut/Einkaufsliste)',sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJson(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const r=await fetch(url,{headers:{'user-agent':UA,'accept':'application/json','accept-language':'de-DE,de;q=0.9'},signal:controller.signal});const text=await r.text();let body=null;try{body=JSON.parse(text)}catch{}return{status:r.status,ok:r.ok,body}}catch(e){return{status:0,ok:false,error:String(e?.message||e)}}finally{clearTimeout(timer)}}
const result={schema:4,generatedAt:new Date().toISOString(),rewe:{},dm:{categories:{}}};
for(const term of ['*','milch','brot','getränke']){const params=new URLSearchParams({search:term,market:'562345',page:'1',objectsPerPage:'250',sorting:'RELEVANCE_DESC',serviceTypes:'PICKUP'}),r=await getJson(`https://shop.rewe.de/api/products?${params}`),p=Array.isArray(r.body?._embedded?.products)?r.body._embedded.products:[];result.rewe[term]={status:r.status,products:p.length,totalResultCount:r.body?.pagination?.totalResultCount??null,totalPages:r.body?.pagination?.totalPages??null,sample:p.slice(0,5).map(x=>x.productName)}}
for(let i=1;i<=10;i++){
  const id=`${String(i).padStart(2,'0')}0000`,u=new URL('https://product-search.services.dmtech.com/de/search/crawl');u.searchParams.set('pageSize','20');u.searchParams.set('allCategories.id',id);
  let r=await getJson(u.toString());if(r.status===429){await sleep(4000);r=await getJson(u.toString())}
  const p=Array.isArray(r.body?.products)?r.body.products:[];result.dm.categories[id]={status:r.status,count:r.body?.count??null,products:p.length,sample:p.slice(0,8).map(x=>({brand:x.brandName,title:x.title,price:x.price?.value??x.tileData?.trackingData?.price??null,category:x.tileData?.trackingData?.categories??[]}))};await sleep(1800);
}
result.summary={reweStarTotal:result.rewe['*']?.totalResultCount??0,dmCategories:Object.fromEntries(Object.entries(result.dm.categories).map(([id,x])=>[id,{status:x.status,count:x.count,sample:x.sample?.slice(0,2).map(p=>`${p.brand} ${p.title}`)}]))};
await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary,null,2));
