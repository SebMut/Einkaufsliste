import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const catalogDir=path.join(ROOT,'data','market-catalog');
const partNames=['part-01.json','part-02.json','part-03.json','part-04.json','part-05.json'];
const parts=await Promise.all(partNames.map(async n=>JSON.parse(await fs.readFile(path.join(catalogDir,n),'utf8'))));
const sources=JSON.parse(await fs.readFile(path.join(catalogDir,'sources.json'),'utf8'));
const raw=parts.flat();

const normalize=s=>String(s??'').toLocaleLowerCase('de-DE').replace(/straße/g,'str').replace(/strasse/g,'str').replace(/\s+/g,' ').trim();
const sourceFor=m=>sources.find(s=>s.store===m.store&&(s.scope==='regional'||s.market===m.market));
const seen=new Set();
const markets=[];
let duplicatesRemoved=0;
for(const original of raw){
  if(original.active===false) continue;
  if(!Number.isFinite(Number(original.distanceKm))||Number(original.distanceKm)>15) continue;
  const key=[normalize(original.store),normalize(original.address),original.lat??'',original.lon??''].join('|');
  if(seen.has(key)){duplicatesRemoved++;continue}
  seen.add(key);
  const src=sourceFor(original);
  const m={...original,distanceKm:+Number(original.distanceKm).toFixed(1)};
  if(src?.importStatus) m.importStatus=src.importStatus;
  markets.push(m);
}
markets.sort((a,b)=>a.distanceKm-b.distanceKm||a.store.localeCompare(b.store,'de')||a.market.localeCompare(b.market,'de'));

const countBy=key=>Object.fromEntries([...markets.reduce((map,m)=>map.set(m[key],(map.get(m[key])||0)+1),new Map())].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'de')));
const importCounts=Object.fromEntries([...markets.reduce((map,m)=>map.set(m.importStatus,(map.get(m.importStatus)||0)+1),new Map())].sort());
const brandCount=new Set(markets.map(m=>m.store)).size;
const verified=markets.filter(m=>m.distanceVerified).length;
const boundary=markets.filter(m=>m.distanceKm>=14.5).map(m=>({store:m.store,market:m.market,distanceKm:m.distanceKm,distanceVerified:m.distanceVerified}));

const result={schema:8,generatedAt:new Date().toISOString(),center:{name:'85622 Feldkirchen bei München',lat:48.145,lon:11.73,radiusKm:15},markets,nearbyMarkets:markets,sources,audit:{method:'Mehrstufige Recherche: offizielle Händler-/Filialsuchen plus Karten-/Business-Suche; Radiusprüfung um 48.145, 11.730. Keine Koordinaten erfunden.',before:{brands:12,branches:27},after:{brands:brandCount,branches:markets.length},duplicatesRemoved,distanceVerified:verified,distanceEstimated:markets.length-verified,boundaryCases:boundary,storeCounts:countBy('store'),typeCounts:countBy('type'),importStatusCounts:importCounts,coordinateNote:'lat/lon bleiben null, wenn keine belastbaren Koordinaten vorlagen. distanceVerified=false kennzeichnet eine Distanzschätzung. Grenzfälle ab 14,5 km werden separat im Audit ausgewiesen.'}};
await fs.writeFile(path.join(ROOT,'data','markets.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Marktkatalog: ${brandCount} Händler, ${markets.length} Filialen, ${duplicatesRemoved} Duplikate entfernt, ${verified} Distanzen verifiziert.`);
