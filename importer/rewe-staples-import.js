import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeOffer} from './product-normalizer.js';
import {applyProductIdentity} from './product-identity.js';
import {withMarketPolicy} from './market-policy.js';
import {matchStaple} from './staples-matcher.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const livePath=path.join(DATA,'offers-live.json');
const markets=JSON.parse(await fs.readFile(path.join(DATA,'markets.json'),'utf8'));
const staplesConfig=JSON.parse(await fs.readFile(path.join(DATA,'staples.json'),'utf8'));
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const now=new Date().toISOString();
const UA='Mozilla/5.0 (compatible; AngebotsRadar/5.3; +https://github.com/SebMut/Einkaufsliste)';
const activeStaples=(staplesConfig.items||[]).filter(s=>s.active!==false&&!s.needsDefinition);

const norm=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const zipOf=s=>String(s??'').match(/\b(\d{5})\b/)?.[1]||null;
const streetKey=s=>norm(String(s??'').replace(/straße|str\.?/gi,'str'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function queryFor(s){
  if(s.id==='andechser-bio-milch-glas')return'Andechser Vollmilch';
  if(s.id==='andechser-butter')return'Andechser Almbutter';
  if(s.id==='adelholzener-wasser')return'Adelholzener Mineralwasser';
  if(s.id==='alkoholfreies-bier')return'alkoholfreies Bier';
  if(s.id==='reis')return'Basmati Reis';
  return s.name.replace(/\s*[–-].*$/,'').trim();
}
const queries=[...new Set(activeStaples.map(queryFor).filter(Boolean))];

async function getJson(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept':'application/json','accept-language':'de-DE,de;q=0.9'},signal:controller.signal,redirect:'follow'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{clearTimeout(timer)}
}

function matchesAllowed(local,remote){
  const localZip=zipOf(local.address),remoteZip=String(remote?.zipCode??'');
  if(localZip&&remoteZip&&localZip!==remoteZip)return false;
  const localStreet=streetKey(String(local.address).split(',')[0]);
  const remoteStreet=streetKey(`${remote?.street||''} ${remote?.houseNumber||''}`);
  return !!localStreet&&!!remoteStreet&&(localStreet.includes(remoteStreet)||remoteStreet.includes(localStreet));
}

async function remoteMarkets(zip){
  const urls=[`https://shop.rewe.de/api/marketselection/zipcodes/${zip}/services/pickup`,`https://www.rewe.de/api/marketselection/zipcodes/${zip}/services/pickup`];
  for(const url of urls){try{const x=await getJson(url);if(Array.isArray(x))return x}catch{}}
  return [];
}

function productsFrom(body){
  if(Array.isArray(body?._embedded?.products))return body._embedded.products;
  const found=[];const seen=new Set();
  function walk(v,depth=0){
    if(v==null||depth>8)return;
    if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return}
    if(typeof v!=='object')return;
    if(typeof v.productName==='string'&&v.productName&&v._embedded?.articles){const k=String(v.id??v.productName);if(!seen.has(k)){seen.add(k);found.push(v)}}
    for(const [k,x] of Object.entries(v)){if(!['facets','quickFacets'].includes(k))walk(x,depth+1)}
  }
  walk(body);return found;
}

async function search(wwIdent,term){
  const params=new URLSearchParams({search:term,market:String(wwIdent),page:'1',objectsPerPage:'40',sorting:'RELEVANCE_DESC',serviceTypes:'PICKUP'});
  const urls=[`https://shop.rewe.de/api/products?${params}`,`https://www.rewe.de/shop/api/products?${params}`];
  for(const url of urls){try{const body=await getJson(url),products=productsFrom(body);if(products.length)return {products,url,total:body?.pagination?.totalResultCount??products.length}}catch{}}
  return {products:[],url:null,total:0};
}

function euroFromCent(v){const n=Number(v);return Number.isFinite(n)&&n>0?+(n/100).toFixed(2):null}
function quantity(name,grammage,price){
  const t=String(grammage||name||'').replace(',', '.');
  let m=t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);
  if(m){const count=Number(m[1]),q=Number(m[2]),u=m[3].toLowerCase(),total=count*q;const factor=(u==='g'||u==='ml')?total/1000:total;const label=(u==='g'||u==='kg')?'€/kg':'€/l';return{size:`${m[1]}x${m[2]}${m[3]}`,unit:factor>0?price/factor:price,unitLabel:label}}
  m=t.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);
  if(m){const q=Number(m[1]),u=m[2].toLowerCase(),factor=(u==='g'||u==='ml')?q/1000:q;const label=(u==='g'||u==='kg')?'€/kg':'€/l';return{size:`${m[1]}${m[2]}`,unit:factor>0?price/factor:price,unitLabel:label}}
  m=t.match(/(\d+)\s*(?:stück|stk\.?|st\.)\b/i);
  if(m){const q=Number(m[1]);return{size:`${q} Stück`,unit:price/q,unitLabel:'€/Stk.'}}
  return{size:grammage||'Packung',unit:price,unitLabel:'€/Packung'};
}
function categoryFor(staple){
  if(['andechser-bio-milch-glas','andechser-butter','halloumi','eier','joghurt','quark'].includes(staple.id))return'Milchprodukte';
  if(['adelholzener-wasser','alkoholfreies-bier'].includes(staple.id))return'Getränke';
  if(staple.id==='brot')return'Backwaren';
  if(['nudeln','reis','mehl'].includes(staple.id))return'Vorrat';
  if(staple.id==='kartoffeln')return'Obst & Gemüse';
  return'Lebensmittel';
}
function toRaw(p,local,searchUrl){
  const article=p?._embedded?.articles?.[0]||{};
  const listing=article?._embedded?.listing||{};
  const pricing=listing?.pricing||{};
  const current=euroFromCent(pricing.currentRetailPrice??pricing.price);if(!current)return null;
  const regular=euroFromCent(pricing?.discount?.regularPrice??pricing.regularPrice);
  const isOffer=Number.isFinite(regular)&&regular>current+.001;
  const brand=typeof p.brand==='object'?p.brand?.name:(p.brand||'');
  const gtin=String(article.gtin??article.id??'');const ean=/^\d{8,14}$/.test(gtin)?gtin:null;
  const grammage=pricing.grammage||p.grammage||'';const q=quantity(p.productName,grammage,current);
  const probe={name:p.productName,brand,price:current,unit:q.unit,unitLabel:q.unitLabel,size:q.size,bio:/\bbio\b|bioland|naturland|demeter/i.test(`${p.productName} ${brand}`),semanticType:null,canonicalGroup:p.productName,category:'Lebensmittel'};
  const matched=activeStaples.map(s=>({s,m:matchStaple(s,probe)})).filter(x=>x.m.matches);
  if(!matched.length)return null;
  const primary=matched.sort((a,b)=>b.m.score-a.m.score)[0].s;
  const detail=p?._links?.detail?.href||'';
  const productUrl=detail?(detail.startsWith('http')?detail:`https://shop.rewe.de${detail}`):`https://www.rewe.de/produkte/${p.nan||p.id}`;
  const image=p?.media?.images?.[0]?._links?.self?.href||'';
  return {
    name:p.productName,originalName:p.productName,brand,ean,gtin:ean,size:q.size,currentPrice:current,regularPrice:regular||current,offerPrice:isOffer?current:null,isOffer,advertised:isOffer,
    price:current,unit:+Number(q.unit).toFixed(3),unitLabel:q.unitLabel,bio:probe.bio,organic:probe.bio,cat:categoryFor(primary),category:categoryFor(primary),department:categoryFor(primary),
    store:'REWE',market:local.market,address:local.address,lat:local.lat??null,lon:local.lon??null,isRiemArcaden:!!local.isRiemArcaden,activeMarket:true,allowedArea:local.allowedArea,
    productUrl,image,sourceUrl:searchUrl||local.sourceUrl,sourceType:'official_market_catalog',sourceScope:'market',sourceTransport:'rewe_shop_api',filialAvailabilityKnown:true,availability:'pickup-listed',importedAt:now,
    reweMarketId:String(local.reweMarketId||''),reweProductId:String(p.id??''),reweListingId:String(listing.id??''),stapleIds:matched.map(x=>x.s.id)
  };
}

const reweMarkets=(markets.markets||[]).filter(m=>m.store==='REWE'&&m.activeMarket!==false);
const zipCache=new Map();const imported=[];const sourceRows=[];
for(const local of reweMarkets){
  const zip=zipOf(local.address);if(!zip)continue;
  if(!zipCache.has(zip))zipCache.set(zip,await remoteMarkets(zip));
  const remote=zipCache.get(zip).find(r=>matchesAllowed(local,r));
  if(!remote?.wwIdent){console.log(`REWE ${local.market}: kein passender Pickup-Markt, übersprungen.`);continue}
  local.reweMarketId=String(remote.wwIdent);
  const marketProducts=new Map();let queryHits=0;
  for(const term of queries){
    const r=await search(remote.wwIdent,term);if(r.products.length)queryHits++;
    for(const p of r.products){const raw=toRaw(p,local,r.url);if(!raw)continue;const key=raw.ean||raw.reweListingId||`${norm(raw.name)}|${raw.size}`;if(!marketProducts.has(key))marketProducts.set(key,raw)}
    await sleep(120);
  }
  const rows=[...marketProducts.values()];imported.push(...rows);
  sourceRows.push({store:'REWE',market:local.market,address:local.address,url:`https://shop.rewe.de/?market=${remote.wwIdent}`,sourceUrl:`https://shop.rewe.de/?market=${remote.wwIdent}`,scope:'market',sourceScope:'market',sourceType:'official_market_catalog',status:rows.length?'ok':'no_data',count:rows.length,queryHits,marketId:String(remote.wwIdent),importedAt:now});
  console.log(`REWE ${local.market} (${remote.wwIdent}): ${rows.length} passende Grundlebensmittel aus ${queryHits}/${queries.length} Suchabfragen.`);
}

const identify=o=>withMarketPolicy(applyProductIdentity(normalizeOffer(o)));
const map=new Map();
for(const o of live.offers||[]){const k=[o.store,o.market,o.ean||o.canonicalProductId||`${norm(o.name)}|${norm(o.size)}`].join('|');map.set(k,o)}
for(const raw of imported){const o=identify(raw);const k=[o.store,o.market,o.ean||o.canonicalProductId||`${norm(o.name)}|${norm(o.size)}`].join('|');const prev=map.get(k);if(!prev||(!prev.isOffer&&o.isOffer))map.set(k,o)}
const sourceMap=new Map((live.sources||[]).map(s=>[[s.store,s.market,s.sourceType||s.url||''].join('|'),s]));
for(const s of sourceRows)sourceMap.set([s.store,s.market,s.sourceType].join('|'),s);
const offers=[...map.values()].map((o,i)=>({id:i+1,...o}));
const out={...live,generatedAt:now,sources:[...sourceMap.values()],offers,productCount:offers.length,offerCount:offers.filter(o=>o.isOffer).length,regularProductCount:offers.filter(o=>!o.isOffer).length,reweStaples:{generatedAt:now,markets:sourceRows.length,products:imported.length}};
await fs.writeFile(livePath,JSON.stringify(out,null,2)+'\n');
console.log(`REWE-Grundlebensmittel: ${imported.length} standortbezogene Produkte aus ${sourceRows.length} Pickup-Filialen importiert.`);
