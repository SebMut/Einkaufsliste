import fs from 'node:fs/promises';
import path from 'node:path';
import { ALLOWED_AREAS, catalogStatusFor, isAllowedMarket, withMarketPolicy, normalizeMarketText } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const catalogDir=path.join(ROOT,'data','market-catalog');
const partNames=['part-01.json','part-02.json','part-03.json','part-04.json','part-05.json'];
const parts=await Promise.all(partNames.map(async n=>JSON.parse(await fs.readFile(path.join(catalogDir,n),'utf8'))));
const baseSources=JSON.parse(await fs.readFile(path.join(catalogDir,'sources.json'),'utf8'));
let extraSources=[];
try{extraSources=JSON.parse(await fs.readFile(path.join(catalogDir,'sources-extra.json'),'utf8'))}catch{}
const rawSources=[...baseSources,...extraSources];
const raw=parts.flat();

const keyOf=m=>[normalizeMarketText(m.store),normalizeMarketText(m.address),m.lat??'',m.lon??''].join('|');
const seen=new Set();
const markets=[];
let duplicatesRemoved=0;
const excluded=[];

for(const original of raw){
  if(original.active===false) continue;
  if(!isAllowedMarket(original)) {
    excluded.push({store:original.store,market:original.market,address:original.address,reason:'outside_strict_whitelist'});
    continue;
  }
  const key=keyOf(original);
  if(seen.has(key)){duplicatesRemoved++;continue}
  seen.add(key);
  const source=rawSources.find(s=>s.store===original.store && s.scope==='market' && (s.market===original.market || normalizeMarketText(s.address)===normalizeMarketText(original.address)))
    || rawSources.find(s=>s.store===original.store && s.scope==='regional');
  const m=withMarketPolicy({
    ...original,
    distanceKm:Number.isFinite(Number(original.distanceKm)) ? +Number(original.distanceKm).toFixed(1) : null,
    importStatus:source?.importStatus || original.importStatus,
    catalogStatus:catalogStatusFor({...original,...source})
  });
  markets.push(m);
}
markets.sort((a,b)=>(a.distanceKm??999)-(b.distanceKm??999)||a.store.localeCompare(b.store,'de')||a.market.localeCompare(b.market,'de'));

// Regionale Quellen werden auf eine tatsächlich erlaubte Filiale gebunden. Dadurch
// kann kein generischer "Region Feldkirchen"-Datensatz versehentlich einen Markt
// außerhalb der Whitelist in Angebote/Preisvergleiche tragen.
const sources=[];
const sourceSeen=new Set();
for(const source of rawSources){
  const candidates=markets.filter(m=>m.store===source.store);
  if(!candidates.length) continue;
  let branch=null;
  if(source.scope==='market') {
    branch=candidates.find(m=>m.market===source.market || normalizeMarketText(m.address)===normalizeMarketText(source.address));
    if(!branch) continue;
  } else {
    branch=candidates[0];
  }
  const rebound=withMarketPolicy({
    ...source,
    market:branch.market,
    address:branch.address,
    lat:branch.lat ?? null,
    lon:branch.lon ?? null,
    type:branch.type || source.type,
    branchMarkets:candidates.map(m=>({market:m.market,address:m.address,isRiemArcaden:!!m.isRiemArcaden})),
    catalogStatus:catalogStatusFor({...branch,...source})
  });
  delete rebound.mode; // dm/ROSSMANN nicht länger künstlich auf Baby beschränken.
  const sk=[rebound.store,rebound.scope,rebound.market,rebound.url].join('|');
  if(sourceSeen.has(sk)) continue;
  sourceSeen.add(sk);
  sources.push(rebound);
}

const countBy=key=>Object.fromEntries([...markets.reduce((map,m)=>map.set(m[key],(map.get(m[key])||0)+1),new Map())].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'de')));
const catalogCounts=Object.fromEntries([...markets.reduce((map,m)=>map.set(m.catalogStatus,(map.get(m.catalogStatus)||0)+1),new Map())].sort());
const brandCount=new Set(markets.map(m=>m.store)).size;
const result={
  schema:9,
  generatedAt:new Date().toISOString(),
  center:{name:'85622 Feldkirchen bei München',lat:48.145,lon:11.73},
  marketPolicy:{mode:'strict_whitelist',allowedAreas:ALLOWED_AREAS,riemArcadenRule:'Nur verifizierte Geschäfte in den Riem Arcaden; Standardadresse Willy-Brandt-Platz 5, 81829 München.'},
  markets,nearbyMarkets:markets,sources,
  audit:{
    method:'Strikte Orts-Whitelist statt Radius. Riem ist ausschließlich für nachweisliche Riem-Arcaden-Filialen erlaubt.',
    rawBranches:raw.filter(m=>m.active!==false).length,
    activeBranches:markets.length,
    activeBrands:brandCount,
    excludedBranches:excluded.length,
    duplicatesRemoved,
    excluded,
    storeCounts:countBy('store'),
    typeCounts:countBy('type'),
    catalogStatusCounts:catalogCounts
  }
};
await fs.writeFile(path.join(ROOT,'data','markets.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Markt-Whitelist: ${brandCount} Händler, ${markets.length} aktive Filialen, ${excluded.length} ausgeschlossen, ${duplicatesRemoved} Duplikate entfernt.`);
