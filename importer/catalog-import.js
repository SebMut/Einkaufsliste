import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { normalizeOffer, slug } from './product-normalizer.js';
import { applyProductIdentity } from './product-identity.js';
import { isAllowedMarket } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const OUT=path.join(DATA,'catalog');
await fs.mkdir(OUT,{recursive:true});
const marketsPath=path.join(DATA,'markets.json');
const markets=JSON.parse(await fs.readFile(marketsPath,'utf8'));
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

const dailyNeed=/baby|windel|feucht|pflege|shampoo|haar|zahn|mund|hygiene|deo|dusche|seife|creme|rasur|waschmittel|weichspüler|reiniger|putz|spül|toilettenpapier|küchentücher|taschentücher|müllbeutel|lebensmittel|drink|saft|wasser|kaffee|tee|snack|müsli|nahrung|milch|tier|katze|hund|futter|streu|haushalt|papier/i;
const irrelevant=/spielzeug|buch|bücher|dvd|blu.?ray|multimedia|elektronik|küchengerät|haushaltsgerät|bekleidung|socken|shirt|hose|schmuck|möbel|rucksack|puppe|autogarage|besteckset/i;
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const num=v=>{const s=String(v??'').trim();const normalized=/,/.test(s)?s.replace(/\./g,'').replace(',','.'):s;const n=Number(normalized.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const first=(o,keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='' )return o[k];return null};
const asString=v=>typeof v==='string'?norm(v):'';
const money=v=>{
  if(typeof v==='number') return v;
  if(typeof v==='string') return num(v);
  if(v&&typeof v==='object') return money(first(v,['value','amount','gross','current','price','formattedValue']));
  return null;
};

function offerPriceFrom(node){
  return money(first(node,['currentPrice','salesPrice','salePrice','discountPrice','offerPrice','price']))
    ?? money(node?.offers?.price) ?? money(node?.offers?.lowPrice);
}
function productFromObject(node,meta){
  if(!node||typeof node!=='object'||Array.isArray(node)) return null;
  const name=asString(first(node,['productName','displayName','name','title','shortDescription']));
  if(name.length<3||name.length>220||irrelevant.test(name)) return null;
  const current=offerPriceFrom(node);
  if(!Number.isFinite(current)||current<=0.05||current>500) return null;
  const regular=money(first(node,['regularPrice','oldPrice','originalPrice','listPrice','strikePrice','rrp']));
  const ean=asString(first(node,['ean','EAN','gtin','GTIN','gtin8','gtin12','gtin13','gtin14','barcode'])).replace(/\D/g,'');
  const brandRaw=first(node,['brand','brandName','manufacturer']);
  const brand=typeof brandRaw==='object'?asString(first(brandRaw,['name','label'])):asString(brandRaw);
  const size=asString(first(node,['contentSize','size','quantityText','netContent','packageSize','content','netQuantity']));
  const imageRaw=first(node,['image','imageUrl','imageURL','thumbnailUrl']);
  const image=typeof imageRaw==='object'?asString(first(imageRaw,['url','src'])):Array.isArray(imageRaw)?asString(imageRaw[0]):asString(imageRaw);
  const url=asString(first(node,['url','productUrl','canonicalUrl']));
  const isOffer=Number.isFinite(regular)&&regular>current+0.001||/offer|promo|discount|aktion|werbung/i.test(JSON.stringify(node).slice(0,3500));
  return {name,brand,ean:ean||null,size,currentPrice:+current.toFixed(2),regularPrice:Number.isFinite(regular)?+regular.toFixed(2):+current.toFixed(2),offerPrice:isOffer?+current.toFixed(2):null,isOffer,productUrl:url,image,sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category};
}
function walk(node,meta,out,depth=0){
  if(depth>14||node==null) return;
  if(Array.isArray(node)){for(const v of node.slice(0,5000))walk(v,meta,out,depth+1);return}
  if(typeof node!=='object') return;
  const p=productFromObject(node,meta);if(p)out.push(p);
  for(const v of Object.values(node))if(v&&typeof v==='object')walk(v,meta,out,depth+1);
}

function parsePrice(text){
  for(const re of [
    /Aktueller\s+Artikelpreis:?\s*(\d+[.,]\d{2})\s*€/i,
    /Artikelpreis\s*(\d+[.,]\d{2})\s*€/i,
    /(?:^|[;\s])Preis:\s*(\d+[.,]\d{2})\s*€/i,
    /(\d+[.,]\d{2})\s*€/i,
    /\b(\d{1,3})[.]([0-9]{2})\b/
  ]){
    const m=String(text).match(re);if(m){const value=m[2]?Number(`${m[1]}.${m[2]}`):num(m[1]);if(Number.isFinite(value)&&value>0.05&&value<500)return value}
  }
  return null;
}
function parseBase(text){
  const m=String(text).match(/(\d+[.,]\d{2})\s*€\s*(?:je|\/|pro|=)\s*(?:1\s*)?(kg|l|wl|stück|st\.?)/i);
  if(!m)return{basePrice:null,baseUnit:null};
  const unit=m[2].toLowerCase().startsWith('st')||m[2].toLowerCase()==='stück'?'Stk.':m[2].toLowerCase();
  return{basePrice:num(m[1]),baseUnit:`€/${unit}`};
}
function elementAttributes($,el){
  const vals=[];
  $(el).find('*').addBack().each((_,n)=>{for(const v of Object.values(n.attribs||{}))if(typeof v==='string'&&v.length<2500)vals.push(v)});
  return vals.join(' ');
}
function productFromCard($,el,meta){
  const text=norm($(el).text());const attrs=norm(elementAttributes($,el));const combined=norm(`${text} ${attrs}`);
  if(combined.length<10||combined.length>8000)return null;
  const named=combined.match(/Produktname:\s*([^;]{3,180})/i);
  let name=named?norm(named[1]):norm($(el).find('h2,h3,[data-testid*="name"],[class*="name"],[class*="title"]').first().text());
  if(!name||name.length<3||name.length>220){
    const candidate=text.split(/\n|Artikelpreis|Aktueller Artikelpreis|Hinweise|Anzahl/i).map(norm).filter(x=>x.length>=5&&x.length<=180&&!/^\d/.test(x));
    name=candidate[0]||'';
  }
  if(!name||irrelevant.test(name)||(!dailyNeed.test(`${name} ${meta.category}`)&&meta.retailer==='ROSSMANN'))return null;
  const price=parsePrice(combined);if(!Number.isFinite(price))return null;
  const brand=(combined.match(/Marke:\s*([^;]{1,80})/i)||[])[1]||'';
  const old=(combined.match(/(?:Ehemaliger Preis|statt|UVP)\s*:?[ ]*(\d+[.,]\d{2})\s*€/i)||[])[1];
  const oldPrice=old?num(old):null;const isOffer=Number.isFinite(oldPrice)&&oldPrice>price+0.001||/Aus der Werbung|%\s*Sparen|Aktion/i.test(combined);
  const size=(combined.match(/\b(\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg|wl|stück|st\.?))(?:\b|\s|\()/i)||[])[1]||'';
  const gtin=(combined.match(/\b(?:EAN|GTIN)\D{0,8}(\d{8,14})\b/i)||[])[1]||null;
  return {name,brand:norm(brand),ean:gtin,size,currentPrice:price,regularPrice:Number.isFinite(oldPrice)?oldPrice:price,offerPrice:isOffer?price:null,isOffer,...parseBase(combined),productUrl:'',image:'',sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category};
}
function cardProducts($,meta){
  const out=[];const seen=new Set();
  const selectors='article,[data-testid*="product"],[data-dmid*="product"],[class*="product-tile"],[class*="product-card"],[class*="ProductTile"],li[class*="product"]';
  $(selectors).each((_,el)=>{if(seen.has(el))return;seen.add(el);const p=productFromCard($,el,meta);if(p)out.push(p)});
  return out;
}
function labelledProducts($,meta){
  const out=[];const labels=[];
  $('*').each((_,el)=>{for(const v of Object.values(el.attribs||{}))if(typeof v==='string'&&/(Produktname:|Marke:|Artikelpreis|Preis:)/i.test(v))labels.push(v)});
  const all=labels.join('\n');
  const re=/Marke:\s*([^;\n]{1,80});?\s*Produktname:\s*([^;\n]{3,180});?([\s\S]{0,600}?)(?:Aktueller\s+Artikelpreis:?|Artikelpreis|Preis:)\s*(\d+[.,]\d{2})\s*€/gi;
  let m;while((m=re.exec(all))){const name=norm(`${m[1]} ${m[2]}`);if(irrelevant.test(name))continue;const price=num(m[4]);if(!Number.isFinite(price))continue;out.push({name,brand:norm(m[1]),ean:null,size:(m[2].match(/,\s*([^,]{1,35})$/)||[])[1]||'',currentPrice:price,regularPrice:price,offerPrice:null,isOffer:false,...parseBase(m[3]),productUrl:'',image:'',sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category})}
  return out;
}

async function fetchPage(retailer,category,url){
  const meta={retailer,category,url};
  const res=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; AngebotsRadar/5.0; +https://github.com/SebMut/Einkaufsliste)','accept-language':'de-DE,de;q=0.9','accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const html=await res.text();const $=cheerio.load(html);const products=[];
  $('script').each((_,el)=>{const raw=$(el).text().trim();if(!raw||raw.length>12_000_000)return;if(raw.startsWith('{')||raw.startsWith('[')){try{walk(JSON.parse(raw),meta,products)}catch{}}});
  products.push(...cardProducts($,meta),...labelledProducts($,meta));
  return products;
}

const index={schema:2,generatedAt,sourceType:'official_catalog',retailers:[],files:[],productCount:0};
const runtimeStatus=new Map();
for(const [retailer,seeds] of Object.entries(SEEDS)){
  const branches=(markets.markets||markets.nearbyMarkets||[]).filter(m=>m.store===retailer&&isAllowedMarket(m));if(!branches.length)continue;
  const raw=[];const sourceResults=[];
  for(const [category,url] of seeds){
    try{const ps=await fetchPage(retailer,category,url);raw.push(...ps);sourceResults.push({category,url,status:'ok',count:ps.length})}
    catch(e){sourceResults.push({category,url,status:'unavailable',count:0,message:String(e.message||e).slice(0,180)})}
  }
  const map=new Map();
  for(const p of raw){
    const normalized=applyProductIdentity(normalizeOffer({name:p.name,brand:p.brand,ean:p.ean,store:retailer,market:'Katalog',cat:p.sourceCategory,size:p.size||'Packung',price:p.currentPrice,unit:p.basePrice||p.currentPrice,unitLabel:p.baseUnit||'€/Packung',bio:/\bbio\b|bioland|naturland|demeter/i.test(p.name)}));
    const key=p.ean?`ean:${p.ean}`:`${normalized.canonicalProductId}|${p.currentPrice}`;
    if(!map.has(key))map.set(key,{...p,...normalized,price:p.currentPrice,currentPrice:p.currentPrice,regularPrice:p.regularPrice,offerPrice:p.offerPrice,isOffer:p.isOffer,ean:normalized.ean||null,gtin:normalized.ean||null,availability:null,filialAvailabilityKnown:false,importedAt:generatedAt});
  }
  const products=[...map.values()];const status=products.length?'partial_catalog':'unavailable';runtimeStatus.set(retailer,status);
  const filename=`${slug(retailer)}.json`;
  await fs.writeFile(path.join(OUT,filename),JSON.stringify({schema:2,generatedAt,retailer,catalogStatus:status,branches:branches.map(b=>({market:b.market,address:b.address,isRiemArcaden:!!b.isRiemArcaden})),productCount:products.length,sources:sourceResults,products},null,2)+'\n');
  index.files.push(filename);index.productCount+=products.length;index.retailers.push({retailer,catalogStatus:status,productCount:products.length,branchCount:branches.length,sources:sourceResults});
}
await fs.writeFile(path.join(OUT,'index.json'),JSON.stringify(index,null,2)+'\n');

// Händlerstatus nur aus dem realen Lauf ableiten, nicht vorab behaupten.
for(const key of ['markets','nearbyMarkets','sources'])for(const m of markets[key]||[])if(runtimeStatus.has(m.store))m.catalogStatus=runtimeStatus.get(m.store);
if(markets.audit){
  const statuses=(markets.markets||[]).reduce((a,m)=>(a[m.catalogStatus]=(a[m.catalogStatus]||0)+1,a),{});markets.audit.catalogStatusCounts=statuses;
}
await fs.writeFile(marketsPath,JSON.stringify(markets,null,2)+'\n');
console.log(`Katalog: ${index.productCount} reguläre Produkte aus ${index.retailers.filter(r=>r.productCount).length}/${index.retailers.length} Händlern.`);
