import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { normalizeOffer, slug } from './product-normalizer.js';
import { applyProductIdentity, normalizeGtin } from './product-identity.js';
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

const dailyNeed=/baby|windel|feucht|pflege|shampoo|haar|zahn|mund|hygiene|deo|dusche|seife|creme|rasur|waschmittel|weichspüler|reiniger|putz|spül|toilettenpapier|küchentücher|taschentücher|müllbeutel|lebensmittel|drink|saft|wasser|kaffee|tee|snack|müsli|nahrung|milch|tier|katze|hund|futter|streu|haushalt|papier|kosmetik|damenhygiene|windeln/i;
const irrelevant=/spielzeug|buch|bücher|dvd|blu.?ray|multimedia|elektronik|küchengerät|haushaltsgerät|bekleidung|socken|shirt|hose|schmuck|möbel|rucksack|puppe|autogarage|besteckset/i;
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const num=v=>{const s=String(v??'').trim();const normalized=/,/.test(s)?s.replace(/\./g,'').replace(',','.'):s;const n=Number(normalized.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const first=(o,keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='' )return o[k];return null};
const str=v=>typeof v==='string'?norm(v):'';
const money=v=>typeof v==='number'?v:typeof v==='string'?num(v):(v&&typeof v==='object'?money(first(v,['value','amount','gross','current','price','formattedValue'])):null);

function productFromObject(node,meta){
  if(!node||typeof node!=='object'||Array.isArray(node))return null;
  const name=str(first(node,['productName','displayName','name','title','shortDescription','description']));
  if(name.length<3||name.length>240||irrelevant.test(name))return null;
  const offers=node.offers&&typeof node.offers==='object'?node.offers:null;
  const current=money(first(node,['currentPrice','salesPrice','salePrice','discountPrice','offerPrice','price']))??money(offers?.price)??money(offers?.lowPrice);
  if(!Number.isFinite(current)||current<=0.05||current>500)return null;
  const regular=money(first(node,['regularPrice','oldPrice','originalPrice','listPrice','strikePrice','rrp','previousPrice']));
  const eanRaw=str(first(node,['ean','EAN','gtin','GTIN','gtin8','gtin12','gtin13','gtin14','barcode','productId']));
  const ean=normalizeGtin(eanRaw)||null;
  const brandRaw=first(node,['brand','brandName','manufacturer']);
  const brand=typeof brandRaw==='object'?str(first(brandRaw,['name','label'])):str(brandRaw);
  const size=str(first(node,['contentSize','size','quantityText','netContent','packageSize','content','netQuantity']));
  const imageRaw=first(node,['image','imageUrl','imageURL','thumbnailUrl']);
  const image=typeof imageRaw==='object'?str(first(imageRaw,['url','src'])):Array.isArray(imageRaw)?str(imageRaw[0]):str(imageRaw);
  const productUrl=str(first(node,['url','productUrl','canonicalUrl']))||str(offers?.url);
  const serialized=JSON.stringify(node).slice(0,5000);
  const isOffer=Number.isFinite(regular)&&regular>current+0.001||/offer|promo|discount|aktion|werbung|reduced/i.test(serialized);
  return {name,brand,ean,size,currentPrice:+current.toFixed(2),regularPrice:Number.isFinite(regular)?+regular.toFixed(2):+current.toFixed(2),offerPrice:isOffer?+current.toFixed(2):null,isOffer,productUrl,image,sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category};
}
function walk(node,meta,out,depth=0){
  if(depth>15||node==null)return;
  if(Array.isArray(node)){for(const v of node.slice(0,8000))walk(v,meta,out,depth+1);return}
  if(typeof node!=='object')return;
  const p=productFromObject(node,meta);if(p)out.push(p);
  for(const v of Object.values(node))if(v&&typeof v==='object')walk(v,meta,out,depth+1);
}

function parsePrice(text){
  const patterns=[/Aktueller\s+Artikelpreis:?\s*(\d+[.,]\d{2})\s*€/i,/Artikelpreis:?\s*(\d+[.,]\d{2})\s*€/i,/(?:^|[;\s])Preis:\s*(\d+[.,]\d{2})\s*€/i,/(\d+[.,]\d{2})\s*€/i,/\b(\d{1,3})[.]([0-9]{2})\b/];
  for(const re of patterns){const m=String(text).match(re);if(m){const v=m[2]?Number(`${m[1]}.${m[2]}`):num(m[1]);if(Number.isFinite(v)&&v>.05&&v<500)return v}}
  return null;
}
function parseBase(text){
  const m=String(text).match(/(\d+[.,]\d{2})\s*€\s*(?:je|\/|pro|=)\s*(?:1\s*)?(kg|l|wl|stück|st\.?)/i);
  if(!m)return{basePrice:null,baseUnit:null};
  const raw=m[2].toLowerCase(),unit=raw.startsWith('st')||raw==='stück'?'Stk.':raw;
  return{basePrice:num(m[1]),baseUnit:`€/${unit}`};
}
function urlGtin(url=''){
  const m=String(url).match(/(?:-p|\/p\/)(\d{8,14})(?:\.html|[/?#]|$)/i);
  return m?normalizeGtin(m[1]):null;
}
function cardProduct($,el,meta){
  const node=$(el),text=norm(node.text());
  if(text.length<8||text.length>10000)return null;
  const href=node.is('a')?node.attr('href'):node.find('a[href]').first().attr('href');
  const attrs=[];node.find('*').addBack().each((_,n)=>{for(const v of Object.values(n.attribs||{}))if(typeof v==='string'&&v.length<1500)attrs.push(v)});
  const combined=norm(`${text} ${attrs.join(' ')}`);
  const price=parsePrice(combined);if(!Number.isFinite(price))return null;
  let name=norm(node.find('h2,h3,h4,[data-testid*="name"],[class*="name"],[class*="title"]').first().text());
  if(!name)name=norm(node.attr('aria-label')||node.attr('title')||'');
  if(!name||name.length<3||name.length>240){
    const lines=text.split(/\n|Aktueller Artikelpreis|Artikelpreis|Preis:|Hinweise|Anzahl/i).map(norm).filter(x=>x.length>=4&&x.length<=200&&!/^\d/.test(x));
    name=lines[0]||'';
  }
  if(!name||irrelevant.test(name)||meta.retailer==='ROSSMANN'&&!dailyNeed.test(`${name} ${meta.category}`))return null;
  const brand=(combined.match(/Marke:\s*([^;\n]{1,80})/i)||[])[1]||'';
  const oldRaw=(combined.match(/(?:Ehemaliger Preis|statt|UVP|vorher)\s*:?[ ]*(\d+[.,]\d{2})\s*€/i)||[])[1];
  const old=oldRaw?num(oldRaw):null,isOffer=Number.isFinite(old)&&old>price+.001||/Aus der Werbung|%\s*Sparen|Aktion|Angebot/i.test(combined);
  const size=(combined.match(/\b(\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg|wl|stück|st\.?))(?:\b|\s|\()/i)||[])[1]||'';
  const gtin=(combined.match(/\b(?:EAN|GTIN)\D{0,8}(\d{8,14})\b/i)||[])[1]||urlGtin(href);
  return {name,brand:norm(brand),ean:normalizeGtin(gtin)||null,size,currentPrice:price,regularPrice:Number.isFinite(old)?old:price,offerPrice:isOffer?price:null,isOffer,...parseBase(combined),productUrl:href||'',image:node.find('img').first().attr('src')||'',sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category};
}
function parseHtml(html,meta,networkProducts=[]){
  const $=cheerio.load(html),out=[...networkProducts],seenEl=new Set();
  $('script').each((_,el)=>{const raw=$(el).text().trim();if(!raw||raw.length>15_000_000)return;if(raw.startsWith('{')||raw.startsWith('[')){try{walk(JSON.parse(raw),meta,out)}catch{}}});
  const selectors=['article','[data-testid*="product"]','[data-dmid*="product"]','[class*="product-tile"]','[class*="product-card"]','[class*="ProductTile"]','li[class*="product"]','a[href*="-p"][href$=".html"]','a[href*="/p/"]'];
  for(const selector of selectors)$(selector).each((_,el)=>{if(seenEl.has(el))return;seenEl.add(el);const p=cardProduct($,el,meta);if(p)out.push(p)});
  return out;
}

async function staticFetch(meta){
  const res=await fetch(meta.url,{headers:{'user-agent':'Mozilla/5.0 (compatible; AngebotsRadar/5.1)','accept-language':'de-DE,de;q=0.9','accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const html=await res.text();return{products:parseHtml(html,meta),mode:'static',htmlBytes:Buffer.byteLength(html)};
}

async function browserFetch(browser,meta){
  const context=await browser.newContext({locale:'de-DE',viewport:{width:1280,height:1800}});const page=await context.newPage();const networkProducts=[];let jsonResponses=0;
  page.on('response',async response=>{
    try{
      if(jsonResponses>300)return;
      const ct=(response.headers()['content-type']||'').toLowerCase();if(!ct.includes('json'))return;
      const u=response.url();if(!/dm\.de|rossmann\.de/i.test(u))return;
      const body=await response.json();jsonResponses++;walk(body,meta,networkProducts);
    }catch{}
  });
  await page.goto(meta.url,{waitUntil:'domcontentloaded',timeout:60000});
  for(const label of [/Alle akzeptieren/i,/Akzeptieren/i,/Zustimmen/i]){try{const b=page.getByRole('button',{name:label}).first();if(await b.isVisible({timeout:1200})){await b.click({timeout:1500});break}}catch{}}
  let stable=0,lastHeight=0;
  for(let i=0;i<10;i++){
    for(const label of [/Mehr anzeigen/i,/Mehr Produkte/i,/Weitere Produkte/i,/Alle anzeigen/i]){
      try{const b=page.getByRole('button',{name:label}).last();if(await b.isVisible({timeout:500})){await b.click({timeout:1500});await page.waitForTimeout(700)}}catch{}
    }
    const h=await page.evaluate(()=>{window.scrollTo(0,document.body.scrollHeight);return document.body.scrollHeight});
    await page.waitForTimeout(1100);
    if(h===lastHeight)stable++;else stable=0;lastHeight=h;if(stable>=2)break;
  }
  const html=await page.content();const products=parseHtml(html,meta,networkProducts);
  const diagnostics={mode:'browser',htmlBytes:Buffer.byteLength(html),jsonResponses,networkProducts:networkProducts.length,bodyChars:(await page.locator('body').innerText().catch(()=>'' )).length};
  await context.close();return{products,...diagnostics};
}

function dedupe(raw,retailer){
  const map=new Map();
  for(const p of raw){
    if(!p||!Number.isFinite(Number(p.currentPrice)))continue;
    const normalized=applyProductIdentity(normalizeOffer({name:p.name,brand:p.brand,ean:p.ean,store:retailer,market:'Katalog',cat:p.sourceCategory,size:p.size||'Packung',price:p.currentPrice,unit:p.basePrice||p.currentPrice,unitLabel:p.baseUnit||'€/Packung',bio:/\bbio\b|bioland|naturland|demeter/i.test(p.name)}));
    const key=normalized.ean?`ean:${normalized.ean}`:`${normalized.canonicalProductId}|${norm(p.name).toLocaleLowerCase('de-DE')}|${norm(p.size)}`;
    if(!map.has(key))map.set(key,{...p,...normalized,price:p.currentPrice,currentPrice:p.currentPrice,regularPrice:p.regularPrice,offerPrice:p.offerPrice,isOffer:!!p.isOffer,ean:normalized.ean||null,gtin:normalized.ean||null,availability:null,filialAvailabilityKnown:false,importedAt:generatedAt});
  }
  return [...map.values()];
}

let browser=null;
const index={schema:3,generatedAt,sourceType:'official_catalog',retailers:[],files:[],productCount:0};const runtimeStatus=new Map();
try{
  for(const [retailer,seeds] of Object.entries(SEEDS)){
    const branches=(markets.markets||markets.nearbyMarkets||[]).filter(m=>m.store===retailer&&isAllowedMarket(m));if(!branches.length)continue;
    const raw=[],sourceResults=[];
    for(const [category,url] of seeds){
      const meta={retailer,category,url};
      try{
        let result=await staticFetch(meta);
        if(result.products.length===0){browser??=await chromium.launch({headless:true});result=await browserFetch(browser,meta)}
        raw.push(...result.products);sourceResults.push({category,url,status:result.products.length?'ok':'no_data',count:result.products.length,mode:result.mode,htmlBytes:result.htmlBytes,jsonResponses:result.jsonResponses??0,networkProducts:result.networkProducts??0});
      }catch(e){sourceResults.push({category,url,status:'unavailable',count:0,message:String(e.message||e).slice(0,220)})}
    }
    const products=dedupe(raw,retailer),status=products.length?'partial_catalog':'unavailable';runtimeStatus.set(retailer,status);const filename=`${slug(retailer)}.json`;
    await fs.writeFile(path.join(OUT,filename),JSON.stringify({schema:3,generatedAt,retailer,catalogStatus:status,branches:branches.map(b=>({market:b.market,address:b.address,isRiemArcaden:!!b.isRiemArcaden})),productCount:products.length,sources:sourceResults,products},null,2)+'\n');
    index.files.push(filename);index.productCount+=products.length;index.retailers.push({retailer,catalogStatus:status,productCount:products.length,branchCount:branches.length,sources:sourceResults});
  }
}finally{if(browser)await browser.close()}
await fs.writeFile(path.join(OUT,'index.json'),JSON.stringify(index,null,2)+'\n');
for(const key of ['markets','nearbyMarkets','sources'])for(const m of markets[key]||[])if(runtimeStatus.has(m.store))m.catalogStatus=runtimeStatus.get(m.store);
if(markets.audit)markets.audit.catalogStatusCounts=(markets.markets||[]).reduce((a,m)=>(a[m.catalogStatus]=(a[m.catalogStatus]||0)+1,a),{});
await fs.writeFile(marketsPath,JSON.stringify(markets,null,2)+'\n');
console.log(`Katalog: ${index.productCount} reguläre Produkte aus ${index.retailers.filter(r=>r.productCount).length}/${index.retailers.length} Händlern.`);
