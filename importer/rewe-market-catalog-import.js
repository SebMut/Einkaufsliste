import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeOffer} from './product-normalizer.js';
import {applyProductIdentity} from './product-identity.js';
import {withMarketPolicy} from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const livePath=path.join(DATA,'offers-live.json');
const markets=JSON.parse(await fs.readFile(path.join(DATA,'markets.json'),'utf8'));
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const now=new Date().toISOString();
const UA='Mozilla/5.0 (compatible; AngebotsRadar/5.4; +https://github.com/SebMut/Einkaufsliste)';
const PAGE_SIZE=250;
const MAX_PAGES=40;
const norm=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const zipOf=s=>String(s??'').match(/\b(\d{5})\b/)?.[1]||null;
const streetKey=s=>norm(String(s??'').replace(/straße|str\.?/gi,'str'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function getJson(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{const r=await fetch(url,{headers:{'user-agent':UA,'accept':'application/json','accept-language':'de-DE,de;q=0.9'},signal:controller.signal,redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}
}
function matchesAllowed(local,remote){
  const localZip=zipOf(local.address),remoteZip=String(remote?.zipCode??'');if(localZip&&remoteZip&&localZip!==remoteZip)return false;
  const localStreet=streetKey(String(local.address).split(',')[0]),remoteStreet=streetKey(`${remote?.street||''} ${remote?.houseNumber||''}`);
  return !!localStreet&&!!remoteStreet&&(localStreet.includes(remoteStreet)||remoteStreet.includes(localStreet));
}
async function remoteMarkets(zip){
  for(const url of [`https://shop.rewe.de/api/marketselection/zipcodes/${zip}/services/pickup`,`https://www.rewe.de/api/marketselection/zipcodes/${zip}/services/pickup`]){try{const x=await getJson(url);if(Array.isArray(x))return x}catch{}}
  return [];
}
function productsFrom(body){return Array.isArray(body?._embedded?.products)?body._embedded.products:[]}
async function pageOf(wwIdent,page){
  const params=new URLSearchParams({search:'*',market:String(wwIdent),page:String(page),objectsPerPage:String(PAGE_SIZE),sorting:'RELEVANCE_DESC',serviceTypes:'PICKUP'});
  const url=`https://shop.rewe.de/api/products?${params}`;const body=await getJson(url);return{url,body,products:productsFrom(body),totalPages:Number(body?.pagination?.totalPages||1),totalResultCount:Number(body?.pagination?.totalResultCount||0)};
}
function euroFromCent(v){const n=Number(v);return Number.isFinite(n)&&n>0?+(n/100).toFixed(2):null}
function quantity(name,grammage,price){
  const t=String(grammage||name||'').replace(',', '.');let m=t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);
  if(m){const count=Number(m[1]),q=Number(m[2]),u=m[3].toLowerCase(),total=count*q,factor=(u==='g'||u==='ml')?total/1000:total,label=(u==='g'||u==='kg')?'€/kg':'€/l';return{size:`${m[1]}x${m[2]}${m[3]}`,unit:factor>0?price/factor:price,unitLabel:label}}
  m=t.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);if(m){const q=Number(m[1]),u=m[2].toLowerCase(),factor=(u==='g'||u==='ml')?q/1000:q,label=(u==='g'||u==='kg')?'€/kg':'€/l';return{size:`${m[1]}${m[2]}`,unit:factor>0?price/factor:price,unitLabel:label}}
  m=t.match(/(\d+)\s*(?:stück|stk\.?|st\.)\b/i);if(m){const q=Number(m[1]);return{size:`${q} Stück`,unit:price/q,unitLabel:'€/Stk.'}}
  return{size:grammage||'Packung',unit:price,unitLabel:'€/Packung'};
}
function seedCategory(name=''){
  const n=String(name).toLocaleLowerCase('de-DE');
  if(/\bbaby\b|babynahrung|windel|pampers|feuchttücher|schnuller|pre[- ]?nahrung|folgemilch|gläschen/.test(n))return'Baby & Kleinkind';
  if(/hundefutter|katzenfutter|hundesnack|katzensnack|tierfutter|katzenstreu/.test(n))return'Tierbedarf';
  if(/waschmittel|weichspüler|reiniger|spülmittel|spülmaschinen|toilettenpapier|küchentücher|müllbeutel|zahnpasta|zahnbürste|shampoo|duschgel|deo\b|seife|rasierer|hygiene|wc[- ]?reiniger/.test(n))return'Haushalt & Drogerie';
  return'Lebensmittel';
}
function rawProduct(p,local,sourceUrl){
  const article=p?._embedded?.articles?.[0]||{},listing=article?._embedded?.listing||{},pricing=listing?.pricing||{};
  const current=euroFromCent(pricing.currentRetailPrice??pricing.price);if(!current||!p?.productName)return null;
  const regular=euroFromCent(pricing?.discount?.regularPrice??pricing.regularPrice),isOffer=Number.isFinite(regular)&&regular>current+.001;
  const brand=typeof p.brand==='object'?p.brand?.name:(p.brand||''),gtinRaw=String(article.gtin??article.id??''),ean=/^\d{8,14}$/.test(gtinRaw)?gtinRaw:null;
  const grammage=pricing.grammage||p.grammage||'',q=quantity(p.productName,grammage,current),detail=p?._links?.detail?.href||'';
  const productUrl=detail?(detail.startsWith('http')?detail:`https://shop.rewe.de${detail}`):`https://www.rewe.de/produkte/${p.nan||p.id}`;
  const image=p?.media?.images?.[0]?._links?.self?.href||'';
  return{name:p.productName,originalName:p.productName,brand,ean,gtin:ean,size:q.size,currentPrice:current,regularPrice:regular||current,offerPrice:isOffer?current:null,isOffer,advertised:isOffer,price:current,unit:+Number(q.unit).toFixed(3),unitLabel:q.unitLabel,bio:/\bbio\b|bioland|naturland|demeter/i.test(`${p.productName} ${brand}`),cat:seedCategory(p.productName),store:'REWE',market:local.market,address:local.address,lat:local.lat??null,lon:local.lon??null,isRiemArcaden:!!local.isRiemArcaden,activeMarket:true,allowedArea:local.allowedArea,productUrl,image,sourceUrl,sourceType:'official_market_catalog_full',sourceScope:'market',sourceTransport:'rewe_shop_api',filialAvailabilityKnown:true,availability:'pickup-listed',importedAt:now,reweMarketId:String(local.reweMarketId||''),reweProductId:String(p.id??''),reweListingId:String(listing.id??'')};
}

const identify=o=>withMarketPolicy(applyProductIdentity(normalizeOffer(o)));
const reweMarkets=(markets.markets||[]).filter(m=>m.store==='REWE'&&m.activeMarket!==false),zipCache=new Map(),imported=[],sourceRows=[];
for(const local of reweMarkets){
  const zip=zipOf(local.address);if(!zip)continue;if(!zipCache.has(zip))zipCache.set(zip,await remoteMarkets(zip));
  const remote=zipCache.get(zip).find(r=>matchesAllowed(local,r));if(!remote?.wwIdent){console.log(`REWE ${local.market}: kein passender Pickup-Markt, Vollsortiment übersprungen.`);continue}
  local.reweMarketId=String(remote.wwIdent);const productMap=new Map();let totalResultCount=0,totalPages=1,loadedPages=0;
  try{
    const first=await pageOf(remote.wwIdent,1);totalResultCount=first.totalResultCount;totalPages=Math.min(MAX_PAGES,Math.max(1,first.totalPages));
    const consume=r=>{for(const p of r.products){const raw=rawProduct(p,local,r.url);if(!raw)continue;const key=raw.ean||raw.reweListingId||raw.reweProductId||`${norm(raw.name)}|${raw.size}`;if(!productMap.has(key))productMap.set(key,raw)}};
    consume(first);loadedPages=1;
    for(let page=2;page<=totalPages;page++){const r=await pageOf(remote.wwIdent,page);consume(r);loadedPages++;await sleep(80)}
  }catch(e){console.warn(`REWE ${local.market}: Vollsortiment teilweise fehlgeschlagen: ${String(e.message||e)}`)}
  const rows=[...productMap.values()];imported.push(...rows);sourceRows.push({store:'REWE',market:local.market,address:local.address,url:`https://shop.rewe.de/?market=${remote.wwIdent}`,sourceUrl:`https://shop.rewe.de/?market=${remote.wwIdent}`,scope:'market',sourceScope:'market',sourceType:'official_market_catalog_full',status:rows.length?'ok':'no_data',count:rows.length,marketId:String(remote.wwIdent),totalResultCount,totalPages,loadedPages,importedAt:now});
  console.log(`REWE ${local.market} (${remote.wwIdent}): ${rows.length} eindeutige Produkte aus ${loadedPages}/${totalPages} Seiten (API meldet ${totalResultCount}).`);
}

const map=new Map();
for(const o of live.offers||[]){const k=[o.store,o.market,o.ean||o.canonicalProductId||`${norm(o.name)}|${norm(o.size)}`].join('|');map.set(k,o)}
for(const raw of imported){const o=identify(raw),k=[o.store,o.market,o.ean||o.canonicalProductId||`${norm(o.name)}|${norm(o.size)}`].join('|'),prev=map.get(k);if(!prev||(!prev.isOffer&&o.isOffer)||String(prev.sourceType||'').includes('market_catalog'))map.set(k,o)}
const sourceMap=new Map((live.sources||[]).map(s=>[[s.store,s.market,s.sourceType||s.url||''].join('|'),s]));for(const s of sourceRows)sourceMap.set([s.store,s.market,s.sourceType].join('|'),s);
const offers=[...map.values()].map((o,i)=>({id:i+1,...o}));
const out={...live,generatedAt:now,sources:[...sourceMap.values()],offers,productCount:offers.length,offerCount:offers.filter(o=>o.isOffer).length,regularProductCount:offers.filter(o=>!o.isOffer).length,reweCatalog:{generatedAt:now,markets:sourceRows.length,products:imported.length,pages:sourceRows.reduce((n,s)=>n+(s.loadedPages||0),0)}};
await fs.writeFile(livePath,JSON.stringify(out,null,2)+'\n');console.log(`REWE-Vollsortiment: ${imported.length} standortbezogene Produkte aus ${sourceRows.length} Pickup-Filialen importiert.`);
