import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { normalizeOffer, slug } from './product-normalizer.js';
import { isAllowedMarket } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const OUT=path.join(DATA,'catalog');
await fs.mkdir(OUT,{recursive:true});
const markets=JSON.parse(await fs.readFile(path.join(DATA,'markets.json'),'utf8'));
const generatedAt=new Date().toISOString();

const SEEDS={
  dm:[
    ['Haushalt','https://www.dm.de/haushalt'],
    ['Körperpflege','https://www.dm.de/pflege-und-parfum'],
    ['Haarpflege','https://www.dm.de/haare'],
    ['Mundpflege','https://www.dm.de/mund-und-zahnpflege'],
    ['Baby & Kleinkind','https://www.dm.de/baby-und-kind'],
    ['Lebensmittel','https://www.dm.de/ernaehrung'],
    ['Tierbedarf','https://www.dm.de/tier']
  ],
  ROSSMANN:[
    ['Haushalt','https://www.rossmann.de/de/haushalt/c/olcat1_3'],
    ['Körperpflege','https://www.rossmann.de/de/pflege-und-duft/c/olcat1_1'],
    ['Baby & Kleinkind','https://www.rossmann.de/de/baby-und-spielzeug/c/olcat1_2']
  ]
};

const dailyNeed=/baby|windel|feucht|pflege|shampoo|haar|zahn|mund|hygiene|deo|dusche|seife|creme|rasur|waschmittel|weichspüler|reiniger|putz|spül|toilettenpapier|küchentücher|taschentücher|müllbeutel|lebensmittel|drink|saft|wasser|kaffee|tee|snack|müsli|nahrung|milch|tier|katze|hund|futter|streu|haushalt/i;
const irrelevant=/spielzeug|buch|bücher|dvd|blu.?ray|multimedia|elektronik|küchengerät|haushaltsgerät|bekleidung|socken|shirt|hose|schmuck|möbel/i;
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const num=v=>{const n=Number(String(v??'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const first=(o,keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='' )return o[k];return null};
const asString=v=>typeof v==='string'?norm(v):'';
const money=v=>{
  if(typeof v==='number') return v;
  if(typeof v==='string') return num(v);
  if(v&&typeof v==='object') return money(first(v,['value','amount','gross','current','price']));
  return null;
};

function productFromObject(node,meta){
  if(!node||typeof node!=='object'||Array.isArray(node)) return null;
  const name=asString(first(node,['productName','displayName','name','title','shortDescription']));
  if(name.length<3 || irrelevant.test(name)) return null;
  const current=money(first(node,['currentPrice','salesPrice','salePrice','discountPrice','offerPrice','price']));
  if(!Number.isFinite(current)||current<=0.05||current>500) return null;
  const regular=money(first(node,['regularPrice','oldPrice','originalPrice','listPrice','strikePrice','rrp']));
  const ean=asString(first(node,['ean','EAN','gtin','GTIN','gtin13','barcode'])).replace(/\D/g,'');
  const brandRaw=first(node,['brand','brandName','manufacturer']);
  const brand=typeof brandRaw==='object'?asString(first(brandRaw,['name','label'])):asString(brandRaw);
  const size=asString(first(node,['contentSize','size','quantityText','netContent','packageSize','content']));
  const imageRaw=first(node,['image','imageUrl','imageURL','thumbnailUrl']);
  const image=typeof imageRaw==='object'?asString(first(imageRaw,['url','src'])):Array.isArray(imageRaw)?asString(imageRaw[0]):asString(imageRaw);
  const url=asString(first(node,['url','productUrl','canonicalUrl']));
  const isOffer=Number.isFinite(regular)&&regular>current+0.001 || /offer|promo|discount|aktion/i.test(JSON.stringify(node).slice(0,2500));
  return {name,brand,ean:ean.length>=8&&ean.length<=14?ean:null,size,currentPrice:+current.toFixed(2),regularPrice:Number.isFinite(regular)?+regular.toFixed(2):+current.toFixed(2),offerPrice:isOffer?+current.toFixed(2):null,isOffer,productUrl:url,image,sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category};
}

function walk(node,meta,out,depth=0){
  if(depth>12||node==null) return;
  if(Array.isArray(node)){for(const v of node.slice(0,3000))walk(v,meta,out,depth+1);return}
  if(typeof node!=='object') return;
  const p=productFromObject(node,meta); if(p) out.push(p);
  for(const v of Object.values(node)) if(v&&typeof v==='object') walk(v,meta,out,depth+1);
}

function dmTextProducts(text,meta){
  const out=[];
  const re=/Marke:\s*([^;\n]{1,80});\s*Produktname:\s*([^;\n]{3,180});([\s\S]{0,450}?)Preis:\s*(\d+[.,]\d{2})\s*€/gi;
  let m; while((m=re.exec(text))){
    const name=norm(`${m[1]} ${m[2]}`); if(irrelevant.test(name)) continue;
    const price=num(m[4]); if(!Number.isFinite(price)) continue;
    const base=(m[3].match(/Grundpreis:[^;\n]*?\((\d+[.,]\d{2})\s*€\s*je\s*1\s*(kg|l|wl|stück)/i)||[]);
    out.push({name,brand:norm(m[1]),ean:null,size:(m[2].match(/,\s*([^,]{1,30})$/)||[])[1]||'',currentPrice:price,regularPrice:price,offerPrice:null,isOffer:false,basePrice:base[1]?num(base[1]):null,baseUnit:base[2]?`€/${base[2].toLowerCase()==='stück'?'Stk.':base[2].toLowerCase()}`:null,productUrl:'',image:'',sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category});
  }
  return out;
}

function rossmannTextProducts(text,meta){
  const out=[];
  const cleanText=text.replace(/\r/g,'');
  const re=/([A-ZÄÖÜa-zäöüß0-9][^\n]{3,150})\n(?:[^\n]*\n){0,8}?(\d+[.,]\d{2})\s*€?\n(?:Aktueller\s+)?Artikelpreis:?\s*(\d+[.,]\d{2})\s*€/gi;
  let m; while((m=re.exec(cleanText))){
    const name=norm(m[1].replace(/^###\s*/,'')); if(irrelevant.test(name)||!dailyNeed.test(`${name} ${meta.category}`)) continue;
    const price=num(m[3]); if(!Number.isFinite(price)) continue;
    out.push({name,brand:'',ean:null,size:'',currentPrice:price,regularPrice:price,offerPrice:null,isOffer:false,productUrl:'',image:'',sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category});
  }
  return out;
}

async function fetchPage(retailer,category,url){
  const meta={retailer,category,url};
  const res=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 AngebotsRadar/5.0','accept-language':'de-DE,de;q=0.9'},signal:AbortSignal.timeout(30000)});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const html=await res.text();
  const $=cheerio.load(html); const products=[];
  $('script[type="application/ld+json"],script[type="application/json"],script#__NEXT_DATA__').each((_,el)=>{try{walk(JSON.parse($(el).text()),meta,products)}catch{}});
  const text=$('body').text().replace(/\t/g,' ').replace(/\n\s+/g,'\n');
  products.push(...(retailer==='dm'?dmTextProducts(text,meta):rossmannTextProducts(text,meta)));
  return products;
}

const index={schema:1,generatedAt,sourceType:'official_catalog',retailers:[],files:[],productCount:0};
for(const [retailer,seeds] of Object.entries(SEEDS)){
  const branches=(markets.markets||markets.nearbyMarkets||[]).filter(m=>m.store===retailer && isAllowedMarket(m));
  if(!branches.length) continue;
  const raw=[]; const sourceResults=[];
  for(const [category,url] of seeds){
    try{const ps=await fetchPage(retailer,category,url);raw.push(...ps);sourceResults.push({category,url,status:'ok',count:ps.length})}
    catch(e){sourceResults.push({category,url,status:'unavailable',count:0,message:String(e.message||e).slice(0,180)})}
  }
  const map=new Map();
  for(const p of raw){
    const normalized=normalizeOffer({name:p.name,store:retailer,market:'Katalog',cat:p.sourceCategory,size:p.size||'Packung',price:p.currentPrice,unit:p.basePrice||p.currentPrice,unitLabel:p.baseUnit||'€/Packung',bio:/\bbio\b|bioland|naturland|demeter/i.test(p.name)});
    const key=p.ean?`ean:${p.ean}`:`${normalized.exactMatchKey}|${p.name.toLocaleLowerCase('de-DE')}|${p.size}`;
    if(!map.has(key)) map.set(key,{...p,...normalized,price:p.currentPrice,currentPrice:p.currentPrice,regularPrice:p.regularPrice,offerPrice:p.offerPrice,isOffer:p.isOffer,ean:p.ean,gtin:p.ean,availability:null,filialAvailabilityKnown:false,importedAt:generatedAt});
  }
  const products=[...map.values()];
  const filename=`${slug(retailer)}.json`;
  await fs.writeFile(path.join(OUT,filename),JSON.stringify({schema:1,generatedAt,retailer,catalogStatus:products.length?'partial_catalog':'unavailable',branches:branches.map(b=>({market:b.market,address:b.address,isRiemArcaden:!!b.isRiemArcaden})),productCount:products.length,sources:sourceResults,products},null,2)+'\n');
  index.files.push(filename); index.productCount+=products.length;
  index.retailers.push({retailer,catalogStatus:products.length?'partial_catalog':'unavailable',productCount:products.length,branchCount:branches.length,sources:sourceResults});
}
await fs.writeFile(path.join(OUT,'index.json'),JSON.stringify(index,null,2)+'\n');
console.log(`Katalog: ${index.productCount} reguläre Produkte aus ${index.retailers.filter(r=>r.productCount).length}/${index.retailers.length} Händlern.`);
