import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeOffer, norm, slug } from './product-normalizer.js';
import { applyProductIdentity } from './product-identity.js';
import { isAllowedMarket } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const livePath=path.join(DATA,'offers-live.json');
const historyPath=path.join(DATA,'price-history.json');
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
let history={schema:2,updatedAt:null,minObservationsForRating:4,events:[],archivedEvents:[]};
try{const old=JSON.parse(await fs.readFile(historyPath,'utf8'));history={...history,...old,events:Array.isArray(old.events)?old.events:[],archivedEvents:Array.isArray(old.archivedEvents)?old.archivedEvents:[]}}catch{}

const value=(o,...keys)=>keys.map(k=>o?.[k]).find(v=>v!=null&&String(v).trim()!=='');
const nowIso=new Date(live.generatedAt||Date.now()).toISOString();
const day=v=>{if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null};
const round=n=>Number.isFinite(Number(n))?+Number(n).toFixed(4):null;
const metric=o=>Number.isFinite(Number(o.unit??o.basePrice))&&Number(o.unit??o.basePrice)>0?Number(o.unit??o.basePrice):Number(o.price);
const seriesKey=e=>[e.canonicalProductId,e.store,e.market,e.baseUnit,e.isOffer?'offer':'regular'].join('|');
const samePrice=(a,b)=>a&&b&&a.canonicalProductId===b.canonicalProductId&&a.store===b.store&&a.market===b.market&&a.baseUnit===b.baseUnit&&a.regularPrice===b.regularPrice&&a.offerPrice===b.offerPrice&&a.effectivePrice===b.effectivePrice&&a.validFrom===b.validFrom&&a.validTo===b.validTo;

for(const bucket of [history.events,history.archivedEvents]) for(const e of bucket){
  e.canonicalProductId=e.canonicalProductId||slug(`${e.store}|${e.name}|${e.size||''}`)||e.canonicalId;
  e.effectivePrice=round(e.effectivePrice??e.price);e.observedAt=e.observedAt||e.firstSeen||e.lastSeen||null;e.sourceType=e.sourceType||'existing_history';
}
const lastBySeries=new Map();
for(const e of [...history.events,...history.archivedEvents].sort((a,b)=>new Date(a.lastSeen||a.observedAt||0)-new Date(b.lastSeen||b.observedAt||0))) lastBySeries.set(seriesKey(e),e);
let inserted=0,extended=0;
for(const raw of live.offers||[]){
  const o=applyProductIdentity(normalizeOffer(raw));const effective=Number(value(raw,'currentPrice','price'));const base=metric(raw);
  if(!o.canonicalId||!o.store||!Number.isFinite(effective)||!Number.isFinite(base)||effective<=0||base<=0) continue;
  const explicit=value(raw,'isOffer');const isOffer=explicit!=null?!!explicit:raw.advertised!==false;
  const regular=Number(value(raw,'regularPrice','regular_price'));const offered=Number(value(raw,'offerPrice','offer_price'));const active=isAllowedMarket(raw);
  const e={
    canonicalProductId:o.canonicalProductId||slug(`${o.store}|${o.name}|${o.size||''}`)||o.canonicalId,canonicalId:o.canonicalId,canonicalGroup:o.canonicalGroup,canonicalProduct:o.canonicalProduct,
    exactMatchKey:o.exactMatchKey,similarityKey:o.similarityKey,ean:o.ean||null,organic:!!o.bio,store:norm(o.store),market:norm(o.market),address:norm(raw.address||''),name:norm(o.name),size:norm(o.size),
    regularPrice:Number.isFinite(regular)?round(regular):isOffer?null:round(effective),offerPrice:isOffer?round(Number.isFinite(offered)?offered:effective):null,effectivePrice:round(effective),price:round(effective),
    basePrice:round(base),baseUnit:norm(raw.unitLabel||raw.baseUnit||'€/Packung'),isOffer,validFrom:day(value(raw,'validFrom','valid_from','offerValidFrom')),validTo:day(value(raw,'validTo','valid_to','offerValidTo')),
    observedAt:nowIso,firstSeen:nowIso,lastSeen:nowIso,source:norm(raw.sourceUrl||''),sourceType:raw.sourceType||'live_import',activeMarket:active
  };
  const prev=lastBySeries.get(seriesKey(e));
  if(prev&&samePrice(prev,e)){
    const gap=Math.abs(new Date(e.observedAt)-new Date(prev.lastSeen||prev.observedAt||0))/86400000;
    if(e.validFrom||e.validTo||gap<=8){prev.lastSeen=e.observedAt;extended++;continue}
  }
  const target=active?history.events:history.archivedEvents;e.eventId=`${e.canonicalProductId}-${Date.parse(e.observedAt)}-${target.length}`;target.push(e);lastBySeries.set(seriesKey(e),e);inserted++;
}

// Alte, inzwischen ausgeschlossene Märkte aus dem aktiven Pool entfernen. Nur Ereignisse,
// die sicher als aktiv klassifiziert wurden, bleiben für aktuelle Preisbewertungen übrig.
const activeNow=[],archiveNow=[...history.archivedEvents];
for(const e of history.events){
  if(e.activeMarket===false){archiveNow.push(e);continue}
  if(e.address||e.market){e.activeMarket=isAllowedMarket(e)}
  if(e.activeMarket===false) archiveNow.push(e); else activeNow.push(e);
}
history.events=activeNow.sort((a,b)=>new Date(a.observedAt||a.firstSeen||0)-new Date(b.observedAt||b.firstSeen||0));
history.archivedEvents=archiveNow.filter((e,i,a)=>a.findIndex(x=>x.eventId===e.eventId)===i).sort((a,b)=>new Date(a.observedAt||a.firstSeen||0)-new Date(b.observedAt||b.firstSeen||0));
history.schema=2;history.updatedAt=nowIso;history.minObservationsForRating=4;history.eventCount=history.events.length;history.archivedEventCount=history.archivedEvents.length;history.productCount=new Set(history.events.map(e=>e.canonicalProductId)).size;
await fs.writeFile(historyPath,JSON.stringify(history,null,2)+'\n');
console.log(`Preishistorie: ${inserted} neue Preisereignisse, ${extended} fortgeschrieben, ${history.events.length} aktiv, ${history.archivedEvents.length} archiviert.`);
