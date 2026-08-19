import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeOffer, norm, slug } from './product-normalizer.js';
import { applyProductIdentity } from './product-identity.js';
import { isAllowedMarket } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const historyPath=path.join(DATA,'price-history.json');
const reportPath=path.join(DATA,'history-backfill-report.json');
const minConfidence=0.80;
const round=n=>Number.isFinite(Number(n))?+Number(n).toFixed(4):null;
const val=(o,...keys)=>keys.map(k=>o?.[k]).find(v=>v!=null&&String(v).trim()!=='');
const iso=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null};
const day=v=>iso(v)?.slice(0,10)||null;
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:80*1024*1024}).trim();

let commits=[];
try{commits=git('log','--format=%H|%cI','--','data/offers-live.json').split('\n').filter(Boolean).map(line=>{const i=line.indexOf('|');return{sha:line.slice(0,i),date:line.slice(i+1)}}).reverse()}catch(e){console.warn('Git-Historie nicht lesbar:',e.message)}

const events=[],archivedEvents=[];let duplicatesRemoved=0,rejectedUncertain=0,filesRead=0,rawPrices=0;const lastBySeries=new Map();
const metric=o=>Number.isFinite(Number(o.unit??o.basePrice))&&Number(o.unit??o.basePrice)>0?Number(o.unit??o.basePrice):Number(o.currentPrice??o.price);
const seriesKey=e=>[e.canonicalProductId,e.store,e.market,e.baseUnit,e.isOffer?'offer':'regular'].join('|');
const samePrice=(a,b)=>a&&b&&a.canonicalProductId===b.canonicalProductId&&a.store===b.store&&a.market===b.market&&a.baseUnit===b.baseUnit&&a.regularPrice===b.regularPrice&&a.offerPrice===b.offerPrice&&a.effectivePrice===b.effectivePrice&&a.validFrom===b.validFrom&&a.validTo===b.validTo;

function add(raw,observedAt,source,sourceType){
  rawPrices++;
  const o=applyProductIdentity(normalizeOffer(raw));
  if((Number(o.confidence)||0)<minConfidence && !o.ean){rejectedUncertain++;return}
  const effective=Number(val(raw,'currentPrice','effectivePrice','price'));const base=metric(raw);
  if(!o.canonicalId||!o.store||!Number.isFinite(effective)||effective<=0||!Number.isFinite(base)||base<=0){rejectedUncertain++;return}
  const explicitOffer=val(raw,'isOffer');const isOffer=explicitOffer!=null?!!explicitOffer:raw.advertised!==false;
  const regular=Number(val(raw,'regularPrice','regular_price'));const offer=Number(val(raw,'offerPrice','offer_price'));const active=isAllowedMarket(raw);
  const event={
    canonicalProductId:o.canonicalProductId||slug(`${o.store}|${o.name}|${o.size||''}`)||o.canonicalId,
    canonicalId:o.canonicalId,canonicalGroup:o.canonicalGroup,canonicalProduct:o.canonicalProduct,exactMatchKey:o.exactMatchKey,similarityKey:o.similarityKey,ean:o.ean||null,
    organic:!!o.bio,store:norm(o.store),market:norm(o.market),address:norm(raw.address||''),name:norm(o.name),size:norm(o.size),
    regularPrice:Number.isFinite(regular)?round(regular):isOffer?null:round(effective),offerPrice:isOffer?round(Number.isFinite(offer)?offer:effective):null,effectivePrice:round(effective),price:round(effective),
    basePrice:round(base),baseUnit:norm(raw.unitLabel||raw.baseUnit||'€/Packung'),isOffer,validFrom:day(val(raw,'validFrom','valid_from','offerValidFrom')),validTo:day(val(raw,'validTo','valid_to','offerValidTo')),
    observedAt:iso(observedAt),firstSeen:iso(observedAt),lastSeen:iso(observedAt),source:source||norm(raw.sourceUrl||''),sourceType,activeMarket:active,historicalImportConfidence:o.ean?1:Math.max(minConfidence,Number(o.confidence)||0)
  };
  const target=active?events:archivedEvents;const sk=seriesKey(event);const prev=lastBySeries.get(sk);
  if(prev&&samePrice(prev,event)){
    const gap=Math.abs(new Date(event.observedAt)-new Date(prev.lastSeen||prev.observedAt))/86400000;
    if(event.validFrom||event.validTo||gap<=8){prev.lastSeen=event.observedAt;duplicatesRemoved++;return}
  }
  event.eventId=`${event.canonicalProductId}-${event.store}-${Date.parse(event.observedAt)}-${target.length}`;target.push(event);lastBySeries.set(sk,event);
}

for(const c of commits){
  let doc;try{doc=JSON.parse(git('show',`${c.sha}:data/offers-live.json`));filesRead++}catch{continue}
  for(const raw of doc.offers||[]) add(raw,c.date,c.sha,'github_commit');
}
try{const live=JSON.parse(await fs.readFile(path.join(DATA,'offers-live.json'),'utf8'));for(const raw of live.offers||[])add(raw,live.generatedAt||new Date().toISOString(),raw.sourceUrl||'',raw.sourceType||'live_import')}catch{}

events.sort((a,b)=>new Date(a.observedAt)-new Date(b.observedAt));archivedEvents.sort((a,b)=>new Date(a.observedAt)-new Date(b.observedAt));
const retailers=[...new Set(events.map(e=>e.store))].sort((a,b)=>a.localeCompare(b,'de'));const products=new Set(events.map(e=>e.canonicalProductId));const oldest=events[0]?.observedAt||null;
const history={schema:2,updatedAt:new Date().toISOString(),minObservationsForRating:4,eventCount:events.length,productCount:products.size,archivedEventCount:archivedEvents.length,events,archivedEvents};
const report={schema:1,generatedAt:history.updatedAt,gitCommitsInspected:commits.length,offerFilesRead:filesRead,rawPriceRecords:rawPrices,historicalPriceEvents:events.length,productsWithHistory:products.size,oldestPriceDate:oldest,retailers,duplicatesRemoved,rejectedUncertain,archivedExcludedMarketEvents:archivedEvents.length,minConfidence};
await fs.writeFile(historyPath,JSON.stringify(history,null,2)+'\n');await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(`Backfill: ${events.length} aktive Preisereignisse / ${products.size} Produkte; ${duplicatesRemoved} Dubletten zusammengeführt; ${rejectedUncertain} unsichere verworfen; ${archivedEvents.length} ausgeschlossene Markt-Ereignisse archiviert.`);
