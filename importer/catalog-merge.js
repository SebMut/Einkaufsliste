import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeOffer, norm } from './product-normalizer.js';
import { applyProductIdentity } from './product-identity.js';
import { isAllowedMarket, withMarketPolicy } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const livePath=path.join(DATA,'offers-live.json');
const catalogDir=path.join(DATA,'catalog');
const markets=JSON.parse(await fs.readFile(path.join(DATA,'markets.json'),'utf8'));
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
let index={files:[]};
try{index=JSON.parse(await fs.readFile(path.join(catalogDir,'index.json'),'utf8'))}catch{}

const identify=o=>applyProductIdentity(normalizeOffer(o));
const branchMap=new Map();
for(const m of markets.markets||markets.nearbyMarkets||[]){
  if(!isAllowedMarket(m)) continue;
  if(!branchMap.has(m.store)) branchMap.set(m.store,[]);
  branchMap.get(m.store).push(m);
}

const normalized=[];
for(const raw of live.offers||[]){
  if(!isAllowedMarket(raw)) continue;
  const isOffer=raw.isOffer ?? raw.advertised !== false;
  const o=identify(raw);
  normalized.push(withMarketPolicy({
    ...o,
    currentPrice:Number(raw.currentPrice ?? raw.price),
    regularPrice:Number.isFinite(Number(raw.regularPrice))?Number(raw.regularPrice):isOffer?null:Number(raw.currentPrice ?? raw.price),
    offerPrice:isOffer?Number(raw.offerPrice ?? raw.price):null,
    isOffer:!!isOffer,advertised:!!isOffer,
    sourceType:raw.sourceType||'official_offer'
  }));
}

for(const filename of index.files||[]){
  let catalog; try{catalog=JSON.parse(await fs.readFile(path.join(catalogDir,filename),'utf8'))}catch{continue}
  const branches=branchMap.get(catalog.retailer)||[];
  for(const p of catalog.products||[]){
    for(const b of branches){
      normalized.push(withMarketPolicy(identify({
        ...p,store:catalog.retailer,market:b.market,address:b.address,lat:b.lat??null,lon:b.lon??null,isRiemArcaden:!!b.isRiemArcaden,
        currentPrice:Number(p.currentPrice ?? p.price),price:Number(p.currentPrice ?? p.price),
        regularPrice:Number.isFinite(Number(p.regularPrice))?Number(p.regularPrice):Number(p.currentPrice ?? p.price),
        offerPrice:p.isOffer?Number(p.offerPrice ?? p.currentPrice ?? p.price):null,isOffer:!!p.isOffer,advertised:!!p.isOffer,
        sourceType:'official_catalog',sourceScope:'catalog',importedAt:catalog.generatedAt||index.generatedAt||live.generatedAt
      })));
    }
  }
}

// Ein aktuelles Angebot gewinnt gegen denselben regulären Katalogartikel derselben Filiale.
const map=new Map();
for(const o of normalized){
  if(!o.activeMarket||!Number.isFinite(Number(o.price))) continue;
  const productKey=o.ean?`ean:${o.ean}`:`${o.canonicalProductId}|${norm(o.size)}`;
  const k=[o.store,o.market,productKey].join('|');
  const previous=map.get(k);
  if(!previous || (!previous.isOffer&&o.isOffer) || (previous.sourceType==='official_catalog'&&o.sourceType==='official_offer')) map.set(k,o);
}

const products=[...map.values()].sort((a,b)=>a.key.localeCompare(b.key,'de')||Number(b.bio)-Number(a.bio)||Number(a.price)-Number(b.price));
const offers=products.map((o,i)=>({id:i+1,...o}));
const out={...live,schema:4,generatedAt:new Date().toISOString(),center:markets.center,marketPolicy:markets.marketPolicy,nearbyMarkets:markets.nearbyMarkets,sources:live.sources||[],productCount:offers.length,offerCount:offers.filter(o=>o.isOffer).length,regularProductCount:offers.filter(o=>!o.isOffer).length,catalogIndex:'data/catalog/index.json',offers};
await fs.writeFile(livePath,JSON.stringify(out,null,2)+'\n');
console.log(`Aktive Daten: ${out.productCount} Produkte (${out.offerCount} Angebote, ${out.regularProductCount} regulär); ausgeschlossene Märkte entfernt.`);
