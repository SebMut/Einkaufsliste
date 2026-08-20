import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const catalogDir=path.join(DATA,'catalog');
const outPath=path.join(catalogDir,'dm.json');
const indexPath=path.join(catalogDir,'index.json');
const now=new Date().toISOString();
const UA='Mozilla/5.0 (compatible; AngebotsRadar/5.4; +https://github.com/SebMut/Einkaufsliste)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Die dm-Crawl-Schnittstelle liefert maximal etwa 1.000 Treffer je Abfrage.
// Deshalb werden die für unsere Einkaufs-App relevanten Hauptbereiche zusätzlich
// nach Preisfenstern geteilt. So bleibt jede Abfrage unter dem API-Limit.
const PARTITIONS=[
  ['Lebensmittel','040000',null,2],
  ['Lebensmittel','040000',2,4],
  ['Lebensmittel','040000',4,null],
  ['Baby & Kleinkind','050000',null,2],
  ['Baby & Kleinkind','050000',2,6],
  ['Baby & Kleinkind','050000',6,10],
  ['Baby & Kleinkind','050000',10,null],
  ['Haushalt','060000',null,3],
  ['Haushalt','060000',3,null],
  ['Tierbedarf','070000',null,null]
];

function numeric(v){
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  const m=String(v??'').replace(/\u00a0/g,' ').replace(/€/g,'').replace(/\./g,'').replace(',','.').match(/\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function cleanUnit(u=''){const x=String(u).trim().toLowerCase();return ({g:'g',kg:'kg',ml:'ml',l:'l',stk:'Stück',st:'Stück',stück:'Stück',wl:'WL'})[x]||String(u).trim()}
function sizeOf(p){
  const q=Number(p?.netQuantityContent??p?.basePriceQuantity);const u=cleanUnit(p?.contentUnit??p?.basePriceUnit??'');
  if(Number.isFinite(q)&&q>0&&u)return `${String(q).replace('.',',')} ${u}`;
  const title=String(p?.title??'');return title.match(/(\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|Stück|St\.?|WL))\b/i)?.[1]||'Packung';
}
function imageOf(p){return p?.tileData?.images?.[0]?.tileSrc||p?.imageUrl||p?.image||''}
function urlOf(p){
  const self=p?.tileData?.self||p?.self||'';if(self)return self.startsWith('http')?self:`https://www.dm.de${self}`;
  const dan=p?.dan??p?.tileData?.dan;return dan?`https://www.dm.de/product-p${dan}.html`:'https://www.dm.de/';
}
function normalizeProduct(p,category,sourceUrl){
  const current=numeric(p?.price?.value??p?.price??p?.tileData?.trackingData?.price??p?.tileData?.price?.price?.current?.value);
  if(!Number.isFinite(current)||current<=0)return null;
  const gtin=String(p?.gtin??p?.tileData?.gtin??'').replace(/\D/g,'');
  const title=String(p?.title??p?.tileData?.title?.tileHeadline??'').trim();if(title.length<2)return null;
  const brand=String(p?.brandName??p?.tileData?.brand?.name??'').trim();
  return {
    name:title,originalName:title,brand,ean:/^\d{8,14}$/.test(gtin)?gtin:null,gtin:/^\d{8,14}$/.test(gtin)?gtin:null,
    size:sizeOf(p),currentPrice:+current.toFixed(2),regularPrice:+current.toFixed(2),offerPrice:null,isOffer:false,advertised:false,
    productUrl:urlOf(p),image:imageOf(p),sourceUrl,sourceType:'official_catalog_full',sourceScope:'catalog',sourceCategory:category,
    category,department:category==='Baby & Kleinkind'?'Baby & Kleinkind':category==='Haushalt'?'Haushalt & Drogerie':category,
    filialAvailabilityKnown:false,availability:null,importedAt:now,dan:String(p?.dan??p?.tileData?.dan??'')
  };
}
async function fetchPartition(category,id,from,to){
  const u=new URL('https://product-search.services.dmtech.com/de/search/crawl');u.searchParams.set('pageSize','1000');u.searchParams.set('allCategories.id',id);
  if(from!=null)u.searchParams.set('price.value.from',String(from));if(to!=null)u.searchParams.set('price.value.to',String(to));
  let backoff=2500;
  for(let attempt=0;attempt<6;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    try{
      const r=await fetch(u,{headers:{'user-agent':UA,'accept':'application/json','accept-language':'de-DE,de;q=0.9'},signal:controller.signal});
      if(r.status===429){console.log(`dm ${category}: 429, neuer Versuch in ${backoff} ms`);await sleep(backoff);backoff=Math.min(backoff*2,20000);continue}
      if(!r.ok)throw new Error(`HTTP ${r.status}`);const body=await r.json(),products=Array.isArray(body?.products)?body.products:[];
      if(Number(body?.count)>products.length)console.warn(`dm ${category}: Fenster hat ${body.count} Treffer, API lieferte ${products.length}.`);
      return{url:u.toString(),count:Number(body?.count||products.length),products};
    }finally{clearTimeout(timer)}
  }
  throw new Error(`dm ${category}: Rate-Limit nach mehreren Versuchen`);
}

await fs.mkdir(catalogDir,{recursive:true});
const map=new Map(),sources=[];
for(const [category,id,from,to] of PARTITIONS){
  try{
    const r=await fetchPartition(category,id,from,to);let accepted=0;
    for(const p of r.products){const x=normalizeProduct(p,category,r.url);if(!x)continue;const k=x.ean?`ean:${x.ean}`:`dan:${x.dan||x.productUrl}`;if(!map.has(k)){map.set(k,x);accepted++}}
    sources.push({category,id,priceFrom:from,priceTo:to,url:r.url,status:'ok',reportedCount:r.count,received:r.products.length,newProducts:accepted});
    console.log(`dm ${category} ${from??0}–${to??'∞'} €: ${r.products.length} geladen, ${accepted} neu.`);
  }catch(e){sources.push({category,id,priceFrom:from,priceTo:to,status:'error',message:String(e?.message||e)});console.warn(String(e?.message||e))}
  await sleep(1800);
}
const products=[...map.values()];
const catalog={schema:2,generatedAt:now,retailer:'dm',sourceType:'official_catalog_full',catalogStatus:'expanded_catalog',productCount:products.length,categories:[...new Set(products.map(p=>p.sourceCategory))],sources,products};
await fs.writeFile(outPath,JSON.stringify(catalog,null,2)+'\n');

try{
  const idx=JSON.parse(await fs.readFile(indexPath,'utf8'));const row=(idx.retailers||[]).find(x=>x.retailer==='dm');
  if(row){row.catalogStatus='expanded_catalog';row.productCount=products.length;row.sources=sources}
  idx.generatedAt=now;idx.productCount=(idx.retailers||[]).reduce((n,x)=>n+Number(x.productCount||0),0);if(!idx.files?.includes('dm.json'))idx.files=[...(idx.files||[]),'dm.json'];
  await fs.writeFile(indexPath,JSON.stringify(idx,null,2)+'\n');
}catch{}
console.log(`dm Vollkatalog relevant: ${products.length} eindeutige Produkte aus Lebensmittel, Haushalt, Baby/Kleinkind und Tierbedarf.`);
