import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { normalizeOffer, norm, slug } from './product-normalizer.js';
import { applyProductIdentity, normalizeGtin } from './product-identity.js';
import { isAllowedMarket } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const OUT=path.join(DATA,'catalog');
const marketsPath=path.join(DATA,'markets.json');
const indexPath=path.join(OUT,'index.json');
const generatedAt=new Date().toISOString();
const RETAILER='MÜLLER';
const seeds=[
  ['Drogerie','https://www.mueller.de/c/drogerie/alle-drogerie-produkte/'],
  ['Haushalt & Reinigung','https://www.mueller.de/c/drogerie/haushalt/'],
  ['Baby & Kleinkind','https://www.mueller.de/c/drogerie/kind-mama/windeln-zubehoer/'],
  ['Lebensmittel','https://www.mueller.de/c/naturshop/lebensmittel/'],
  ['Tierbedarf','https://www.mueller.de/c/tiershop/alle-tiershop-produkte/']
];
const irrelevant=/spielzeug|dvd|blu.?ray|multimedia|videospiel|konsole|modellbau|schreibwaren|strumpf|socke|bekleidung|mode|schmuck/i;
const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const parseNumber=v=>{const s=String(v??'').trim();const x=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;const n=Number(x.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
const first=(o,keys)=>{for(const k of keys)if(o?.[k]!=null&&o[k]!=='')return o[k];return null};
const money=v=>typeof v==='number'?v:typeof v==='string'?parseNumber(v):(v&&typeof v==='object'?money(first(v,['value','amount','gross','current','price','formattedValue'])):null);
const str=v=>typeof v==='string'?clean(v):'';

function objectProduct(node,meta){
  if(!node||typeof node!=='object'||Array.isArray(node))return null;
  const name=str(first(node,['productName','displayName','name','title','shortDescription']));
  if(name.length<3||name.length>240||irrelevant.test(name))return null;
  const offers=node.offers&&typeof node.offers==='object'?node.offers:null;
  const current=money(first(node,['currentPrice','salesPrice','salePrice','discountPrice','offerPrice','price']))??money(offers?.price)??money(offers?.lowPrice);
  if(!Number.isFinite(current)||current<0.05||current>500)return null;
  const regular=money(first(node,['regularPrice','oldPrice','originalPrice','listPrice','strikePrice','rrp','uvp','previousPrice']));
  const gtin=normalizeGtin(str(first(node,['ean','EAN','gtin','GTIN','gtin13','barcode'])))||null;
  const brandRaw=first(node,['brand','brandName','manufacturer']);
  const brand=typeof brandRaw==='object'?str(first(brandRaw,['name','label'])):str(brandRaw);
  const size=str(first(node,['contentSize','size','quantityText','netContent','packageSize','content','netQuantity']));
  const imageRaw=first(node,['image','imageUrl','imageURL','thumbnailUrl']);
  const image=typeof imageRaw==='object'?str(first(imageRaw,['url','src'])):Array.isArray(imageRaw)?str(imageRaw[0]):str(imageRaw);
  const productUrl=str(first(node,['url','productUrl','canonicalUrl']))||str(offers?.url);
  const isOffer=Number.isFinite(regular)&&regular>current+0.001||/sale|discount|aktion|angebot|reduced/i.test(JSON.stringify(node).slice(0,5000));
  return {name,brand,ean:gtin,size,currentPrice:+current.toFixed(2),regularPrice:Number.isFinite(regular)?+regular.toFixed(2):+current.toFixed(2),offerPrice:isOffer?+current.toFixed(2):null,isOffer,productUrl,image,sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category};
}
function walk(node,meta,out,depth=0){
  if(depth>14||node==null)return;
  if(Array.isArray(node)){for(const v of node.slice(0,8000))walk(v,meta,out,depth+1);return}
  if(typeof node!=='object')return;
  const p=objectProduct(node,meta);if(p)out.push(p);
  for(const v of Object.values(node))if(v&&typeof v==='object')walk(v,meta,out,depth+1);
}
function firstPrice(text){
  const m=String(text).match(/(?:Artikelpreis:?\s*)?(\d{1,3}[.,]\d{2})\s*€/i);return m?parseNumber(m[1]):null;
}
function basePrice(text){
  const m=String(text).match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*€\s*\/\s*(?:1\s*)?(kg|l|st\.?|stk\.?|stück|100\s*stk\.?)/i);
  if(!m)return{basePrice:null,baseUnit:null};
  const raw=m[2].toLowerCase();const unit=raw.includes('100')?'100 Stk.':raw.startsWith('st')?'Stk.':raw;
  return{basePrice:parseNumber(m[1]),baseUnit:`€/${unit}`};
}
function cardProduct($,el,meta){
  const node=$(el),text=clean(node.text());if(text.length<8||text.length>9000)return null;
  const price=firstPrice(text);if(!Number.isFinite(price))return null;
  let name=clean(node.find('h2,h3,h4,[class*="name"],[class*="title"],[data-testid*="name"]').first().text());
  if(!name){const imgAlt=node.find('img[alt]').first().attr('alt')||'';name=clean(imgAlt.replace(/^Produkt\s+\d+\s*/i,''))}
  if(!name||name.length<3||name.length>240||irrelevant.test(name))return null;
  const oldRaw=(text.match(/(?:UVP|statt|vorher)\s*(\d{1,3}[.,]\d{2})\s*€/i)||[])[1];const regular=oldRaw?parseNumber(oldRaw):price;
  const isOffer=Number.isFinite(regular)&&regular>price+0.001||/\bSale\b|rabattiert|Angebot/i.test(text);
  const size=(text.match(/\b(\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg|stk\.?|stück))(?:\b|\s|\/)/i)||[])[1]||'';
  const href=node.is('a')?node.attr('href'):node.find('a[href]').first().attr('href')||'';
  return {name,brand:'',ean:null,size,currentPrice:price,regularPrice:regular,offerPrice:isOffer?price:null,isOffer,...basePrice(text),productUrl:href,image:node.find('img').first().attr('src')||'',sourceUrl:meta.url,sourceType:'official_catalog',sourceCategory:meta.category};
}
function parseHtml(html,meta,network=[]){
  const $=cheerio.load(html),out=[...network],seen=new Set();
  $('script').each((_,el)=>{const raw=$(el).text().trim();if(!raw||raw.length>15_000_000)return;if(raw.startsWith('{')||raw.startsWith('[')){try{walk(JSON.parse(raw),meta,out)}catch{}}});
  const selectors=['article','[data-testid*="product"]','[class*="product-card"]','[class*="product-tile"]','[class*="ProductTile"]','li[class*="product"]','a[href*="/p/"]'];
  for(const selector of selectors)$(selector).each((_,el)=>{if(seen.has(el))return;seen.add(el);const p=cardProduct($,el,meta);if(p)out.push(p)});
  return out;
}
async function staticFetch(meta){
  const r=await fetch(meta.url,{headers:{'user-agent':'Mozilla/5.0 (compatible; AngebotsRadar/5.1)','accept-language':'de-DE,de;q=0.9'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const html=await r.text();return{products:parseHtml(html,meta),mode:'static',htmlBytes:Buffer.byteLength(html)};
}
async function browserFetch(browser,meta){
  const context=await browser.newContext({locale:'de-DE',viewport:{width:1280,height:1800}}),page=await context.newPage(),network=[];let jsonResponses=0;
  page.on('response',async r=>{try{const ct=(r.headers()['content-type']||'').toLowerCase();if(jsonResponses>300||!ct.includes('json')||!/mueller\.de/i.test(r.url()))return;walk(await r.json(),meta,network);jsonResponses++}catch{}});
  await page.goto(meta.url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('body',{timeout:10000}).catch(()=>{});
  for(const label of [/Alle akzeptieren/i,/Akzeptieren/i,/Zustimmen/i]){try{const b=page.getByRole('button',{name:label}).first();if(await b.isVisible({timeout:800})){await b.click({timeout:1500});break}}catch{}}
  for(let i=0;i<6;i++){
    for(const label of [/Weitere Artikel zeigen/i,/Mehr anzeigen/i,/Mehr Produkte/i]){try{const b=page.getByRole('button',{name:label}).last();if(await b.isVisible({timeout:500})){await b.click({timeout:1500});await page.waitForTimeout(700)}}catch{}}
    await page.evaluate(()=>{if(document.body)window.scrollTo(0,document.body.scrollHeight)}).catch(()=>{});await page.waitForTimeout(900);
  }
  const html=await page.content(),products=parseHtml(html,meta,network);await context.close();return{products,mode:'browser',htmlBytes:Buffer.byteLength(html),jsonResponses,networkProducts:network.length};
}
function dedupe(raw){
  const map=new Map();
  for(const p of raw){if(!Number.isFinite(Number(p.currentPrice)))continue;const normalized=applyProductIdentity(normalizeOffer({name:p.name,brand:p.brand,ean:p.ean,store:RETAILER,market:'Katalog',cat:p.sourceCategory,size:p.size||'Packung',price:p.currentPrice,unit:p.basePrice||p.currentPrice,unitLabel:p.baseUnit||'€/Packung',bio:/\bbio\b|demeter|bioland|naturland/i.test(p.name)}));const key=normalized.ean?`ean:${normalized.ean}`:`${normalized.canonicalProductId}|${norm(p.name).toLowerCase()}|${norm(p.size)}`;if(!map.has(key))map.set(key,{...p,...normalized,price:p.currentPrice,currentPrice:p.currentPrice,regularPrice:p.regularPrice,offerPrice:p.offerPrice,isOffer:!!p.isOffer,ean:normalized.ean||null,gtin:normalized.ean||null,availability:null,filialAvailabilityKnown:false,importedAt:generatedAt})}
  return [...map.values()];
}

const marketData=JSON.parse(await fs.readFile(marketsPath,'utf8'));const branches=(marketData.markets||[]).filter(m=>m.store===RETAILER&&isAllowedMarket(m));
if(!branches.length){console.log('MÜLLER: keine erlaubte Filiale, Import übersprungen.');process.exit(0)}
let browser=null;const raw=[],sourceResults=[];
try{
  for(const [category,url] of seeds){const meta={retailer:RETAILER,category,url};try{let result=await staticFetch(meta);if(!result.products.length){browser??=await chromium.launch({headless:true});result=await browserFetch(browser,meta)}raw.push(...result.products);sourceResults.push({category,url,status:result.products.length?'ok':'no_data',count:result.products.length,mode:result.mode,htmlBytes:result.htmlBytes,jsonResponses:result.jsonResponses??0,networkProducts:result.networkProducts??0})}catch(e){sourceResults.push({category,url,status:'unavailable',count:0,message:String(e.message||e).slice(0,220)})}}
}finally{if(browser)await browser.close()}
const products=dedupe(raw),status=products.length?'partial_catalog':'unavailable';const filename='mueller.json';
await fs.writeFile(path.join(OUT,filename),JSON.stringify({schema:1,generatedAt,retailer:RETAILER,catalogStatus:status,branches:branches.map(b=>({market:b.market,address:b.address,isRiemArcaden:!!b.isRiemArcaden})),productCount:products.length,sources:sourceResults,products},null,2)+'\n');
let index={schema:4,generatedAt,sourceType:'official_catalog',retailers:[],files:[],productCount:0};try{index=JSON.parse(await fs.readFile(indexPath,'utf8'))}catch{}
index.files=[...(index.files||[]).filter(f=>f!==filename),filename];index.retailers=[...(index.retailers||[]).filter(r=>r.retailer!==RETAILER),{retailer:RETAILER,catalogStatus:status,productCount:products.length,branchCount:branches.length,sources:sourceResults}];index.productCount=index.retailers.reduce((s,r)=>s+Number(r.productCount||0),0);index.generatedAt=generatedAt;
await fs.writeFile(indexPath,JSON.stringify(index,null,2)+'\n');
for(const key of ['markets','nearbyMarkets','sources'])for(const m of marketData[key]||[])if(m.store===RETAILER)m.catalogStatus=status;
if(marketData.audit)marketData.audit.catalogStatusCounts=(marketData.markets||[]).reduce((a,m)=>(a[m.catalogStatus]=(a[m.catalogStatus]||0)+1,a),{});
await fs.writeFile(marketsPath,JSON.stringify(marketData,null,2)+'\n');
console.log(`MÜLLER: ${products.length} reguläre Produkte aus ${sourceResults.filter(s=>s.status==='ok').length}/${seeds.length} offiziellen Kategorien (${status}).`);
