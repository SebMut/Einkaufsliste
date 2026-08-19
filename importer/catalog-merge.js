import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeOffer, norm } from './product-normalizer.js';
import { applyProductIdentity } from './product-identity.js';
import { isAllowedMarket, withMarketPolicy, normalizeMarketText } from './market-policy.js';

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
  if(!isAllowedMarket(m))continue;
  if(!branchMap.has(m.store))branchMap.set(m.store,[]);
  branchMap.get(m.store).push(m);
}

function concreteBranches(raw){
  const branches=branchMap.get(raw.store)||[];
  if(!branches.length)return isAllowedMarket(raw)?[raw]:[];
  const address=normalizeMarketText(raw.address),market=normalizeMarketText(raw.market);
  const exactAddress=address&&branches.find(b=>normalizeMarketText(b.address)===address);
  const exactMarket=market&&branches.find(b=>normalizeMarketText(b.market)===market);
  const regional=raw.sourceScope==='regional'||raw.scope==='regional'||/\bregion\b/.test(market);
  if(regional)return branches;
  if(exactAddress)return[exactAddress];
  if(exactMarket)return[exactMarket];
  return isAllowedMarket(raw)?[raw]:[];
}

const normalized=[];
for(const raw of live.offers||[]){
  if(raw.sourceType==='official_catalog'||raw.sourceScope==='catalog')continue;
  if(!isAllowedMarket(raw))continue;
  const current=Number(raw.currentPrice??raw.price);if(!Number.isFinite(current)||current<=0)continue;
  const offerFlag=raw.isOffer??raw.advertised!==false;
  for(const b of concreteBranches(raw)){
    const o=identify({...raw,market:b.market,address:b.address,lat:b.lat??raw.lat??null,lon:b.lon??raw.lon??null,isRiemArcaden:!!b.isRiemArcaden});
    normalized.push(withMarketPolicy({
      ...o,market:b.market,address:b.address,lat:b.lat??o.lat??null,lon:b.lon??o.lon??null,isRiemArcaden:!!b.isRiemArcaden,
      currentPrice:current,
      regularPrice:Number.isFinite(Number(raw.regularPrice))?Number(raw.regularPrice):offerFlag?null:current,
      offerPrice:offerFlag?Number(raw.offerPrice??raw.price):null,
      isOffer:!!offerFlag,advertised:!!offerFlag,sourceType:raw.sourceType||'official_offer'
    }));
  }
}

for(const filename of index.files||[]){
  let catalog;try{catalog=JSON.parse(await fs.readFile(path.join(catalogDir,filename),'utf8'))}catch{continue}
  const branches=branchMap.get(catalog.retailer)||[];
  for(const p of catalog.products||[]){
    for(const b of branches){
      const current=Number(p.currentPrice??p.price);if(!Number.isFinite(current)||current<=0)continue;
      normalized.push(withMarketPolicy(identify({
        ...p,store:catalog.retailer,market:b.market,address:b.address,lat:b.lat??null,lon:b.lon??null,isRiemArcaden:!!b.isRiemArcaden,
        currentPrice:current,price:current,
        regularPrice:Number.isFinite(Number(p.regularPrice))?Number(p.regularPrice):current,
        offerPrice:p.isOffer?Number(p.offerPrice??current):null,isOffer:!!p.isOffer,advertised:!!p.isOffer,
        sourceType:'official_catalog',sourceScope:'catalog',importedAt:catalog.generatedAt||index.generatedAt||live.generatedAt
      })));
    }
  }
}

const map=new Map();
for(const o of normalized){
  if(!o.activeMarket||!Number.isFinite(Number(o.price)))continue;
  const productKey=o.ean?`ean:${o.ean}`:`${o.canonicalProductId}|${norm(o.size)}`;
  const k=[o.store,o.market,productKey].join('|');
  const previous=map.get(k);
  if(!previous||(!previous.isOffer&&o.isOffer)||(previous.sourceType==='official_catalog'&&o.sourceType==='official_offer'))map.set(k,o);
}
const products=[...map.values()].sort((a,b)=>(a.key||a.name).localeCompare(b.key||b.name,'de')||Number(b.bio)-Number(a.bio)||Number(a.price)-Number(b.price));
const offers=products.map((o,i)=>({id:i+1,...o}));

// Diagnose-/Quellenmetadaten ebenfalls strikt auf konkrete erlaubte Filialen begrenzen.
const sourceMap=new Map();
for(const source of live.sources||[]){
  if(!branchMap.has(source.store))continue;
  for(const b of concreteBranches(source)){
    if(!isAllowedMarket(b))continue;
    const s=withMarketPolicy({...source,market:b.market,address:b.address,lat:b.lat??null,lon:b.lon??null,isRiemArcaden:!!b.isRiemArcaden});
    delete s.mode;
    const k=[s.store,s.market,s.url||s.sourceUrl||''].join('|');
    if(!sourceMap.has(k))sourceMap.set(k,s);
  }
}
const activeSources=[...sourceMap.values()];

// Harte Ausgabe-Validierung: jedes Produkt muss exakt einer aktiven Filiale zuordenbar sein.
const branchKeys=new Set((markets.markets||[]).map(m=>[normalizeMarketText(m.store),normalizeMarketText(m.market),normalizeMarketText(m.address)].join('|')));
const invalid=offers.filter(o=>!branchKeys.has([normalizeMarketText(o.store),normalizeMarketText(o.market),normalizeMarketText(o.address)].join('|')));
if(invalid.length)throw new Error(`Markt-Guard: ${invalid.length} Produkte ohne konkrete erlaubte Filiale.`);

const out={...live,schema:6,generatedAt:new Date().toISOString(),center:markets.center,marketPolicy:markets.marketPolicy,nearbyMarkets:markets.nearbyMarkets,sources:activeSources,productCount:offers.length,offerCount:offers.filter(o=>o.isOffer).length,regularProductCount:offers.filter(o=>!o.isOffer).length,catalogIndex:'data/catalog/index.json',offers};
await fs.writeFile(livePath,JSON.stringify(out,null,2)+'\n');
console.log(`Aktive Daten: ${out.productCount} Produkte (${out.offerCount} Angebote, ${out.regularProductCount} regulär) in ${markets.markets?.length||0} konkreten Filialen; ${activeSources.length} aktive Importquellen.`);
