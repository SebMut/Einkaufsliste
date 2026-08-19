import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const marketFile=path.join(ROOT,'data/markets.json');
const reportFile=path.join(ROOT,'data/market-audit-report.json');
const CENTER={name:'85622 Feldkirchen bei München',lat:48.145,lon:11.73,radiusKm:15};
const old=JSON.parse(await fs.readFile(marketFile,'utf8'));
const before=Array.isArray(old.markets)?old.markets:(old.nearbyMarkets||[]);
const beforeBrands=new Set(before.map(x=>x.store).filter(Boolean));

const ENDPOINTS=[
 'https://overpass-api.de/api/interpreter',
 'https://overpass.kumi.systems/api/interpreter',
 'https://overpass.private.coffee/api/interpreter'
];
const chainRules=[
 [/\brewe\b/i,'REWE','Supermarkt','https://www.rewe.de/marktsuche/','https://www.rewe.de/angebote/','partial'],
 [/\bedeka\b|\be center\b|\be xpress\b/i,'EDEKA','Supermarkt','https://www.edeka.de/marktsuche/','https://www.edeka.de/angebote/','partial'],
 [/\bhit\b/i,'HIT','Supermarkt','https://www.hit.de/maerkte/','https://www.hit.de/maerkte/','supported'],
 [/\bkaufland\b/i,'Kaufland','Supermarkt','https://filiale.kaufland.de/','https://filiale.kaufland.de/','partial'],
 [/\bv-?markt\b/i,'V-Markt','Supermarkt','https://www.v-markt.de/standorte_vmarkt','https://www.v-markt.de/standorte_vmarkt','not_yet_implemented'],
 [/\btegut\b|\bbasic\b/i,'tegut','Supermarkt','https://www.tegut.com/maerkte.html','https://www.tegut.com/angebote.html','not_yet_implemented'],
 [/\baez\b/i,'AEZ','Supermarkt','','','not_yet_implemented'],
 [/\bfeneberg\b/i,'Feneberg','Supermarkt','https://www.feneberg.de/maerkte','https://www.feneberg.de/angebote','not_yet_implemented'],
 [/\baldi\b/i,'ALDI SÜD','Discounter','https://www.aldi-sued.de/filialen','https://www.aldi-sued.de/angebote','partial'],
 [/\blidl\b/i,'Lidl','Discounter','https://www.lidl.de/s/de-DE/filialen','https://www.lidl.de/c/indexangebote','partial'],
 [/\bpenny\b/i,'PENNY','Discounter','https://www.penny.de/marktsuche','https://www.penny.de/angebote','partial'],
 [/\bnetto\b/i,'Netto','Discounter','https://www.netto-online.de/filialfinder','https://www.netto-online.de/filialfinder','partial'],
 [/\bnorma\b/i,'NORMA','Discounter','https://www.norma-online.de/de/filialfinder/','https://www.norma-online.de/de/angebote/?desktop=1','partial'],
 [/\bdm\b|dm-drogerie/i,'dm','Drogerie','https://www.dm.de/store','https://www.dm.de/baby-und-kind','partial'],
 [/rossmann/i,'ROSSMANN','Drogerie','https://www.rossmann.de/de/filialen/','https://www.rossmann.de/de/baby-und-spielzeug/c/olcat1_2','partial'],
 [/\bmüller\b|\bmueller\b/i,'Müller','Drogerie','https://www.mueller.de/meine-filiale/','https://www.mueller.de/aktuell/','not_yet_implemented'],
 [/alnatura/i,'Alnatura','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/','https://www.alnatura.de/de-de/angebote/','not_yet_implemented'],
 [/denns|denn.?s biomarkt/i,'Denns BioMarkt','Bio-Supermarkt','https://www.biomarkt.de/marktindex/','https://www.biomarkt.de/angebote','not_yet_implemented'],
 [/vollcorner/i,'VollCorner','Bio-Supermarkt','https://www.vollcorner.de/maerkte/','https://www.vollcorner.de/angebote/','not_yet_implemented'],
 [/\bmetro\b/i,'METRO','Großhandel','https://www.metro.de/maerkte','https://www.metro.de/angebote','login_required'],
 [/selgros/i,'SELGROS','Großhandel','https://www.selgros.de/markt','https://www.selgros.de/angebote','not_yet_implemented'],
 [/fristo/i,'FRISTO','Getränkemarkt','https://www.fristo.de/angebote-maerkte/marktfinder/','https://www.fristo.de/angebote-maerkte/','not_yet_implemented'],
 [/orter(er)?/i,'Orterer','Getränkemarkt','https://www.orterer.de/','https://www.orterer.de/','not_yet_implemented'],
 [/getränke hoffmann/i,'Getränke Hoffmann','Getränkemarkt','https://www.getraenke-hoffmann.de/filialen','https://www.getraenke-hoffmann.de/angebote','not_yet_implemented'],
 [/babyone/i,'BabyOne','Babyfachmarkt','https://www.babyone.de/fachmarkt','https://www.babyone.de/angebote','not_yet_implemented']
];
function hav(a,b,c,d){const R=6371,r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b),q=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;return R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
function norm(v=''){return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim()}
function addr(t={}){const s=[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' '),c=[t['addr:postcode'],t['addr:city']||t['addr:suburb']].filter(Boolean).join(' ');return[s,c].filter(Boolean).join(', ')}
function classify(t={}){const name=t.name||'',brand=t.brand||'',text=`${brand} ${name}`;for(const [re,store,type,sourceUrl,offerUrl,importStatus] of chainRules)if(re.test(text))return{store,type,sourceUrl,offerUrl,importStatus};const organic=/bio|naturkost|organic|ökologisch|oeko/i.test(text)||t.organic==='only';if(t.shop==='supermarket')return{store:name||brand||'Lokaler Supermarkt',type:organic?'Bio-Supermarkt':'Supermarkt',sourceUrl:t.website||'',offerUrl:'',importStatus:'no_offer_source'};if(t.shop==='chemist')return{store:name||brand||'Lokale Drogerie',type:'Drogerie',sourceUrl:t.website||'',offerUrl:'',importStatus:'no_offer_source'};if(t.shop==='beverages')return{store:name||brand||'Getränkemarkt',type:'Getränkemarkt',sourceUrl:t.website||'',offerUrl:'',importStatus:'no_offer_source'};if(t.shop==='baby_goods')return{store:name||brand||'Babyfachmarkt',type:'Babyfachmarkt',sourceUrl:t.website||'',offerUrl:'',importStatus:'no_offer_source'};if(t.shop==='wholesale'&&/food|lebensmittel|gastro|cash|carry|metro|selgros/i.test(text+' '+(t.description||'')))return{store:name||brand||'Großhandel',type:'Großhandel',sourceUrl:t.website||'',offerUrl:'',importStatus:'no_offer_source'};return null;}
function irrelevant(t={}){const n=norm(`${t.name||''} ${t.brand||''} ${t.description||''}`);return /rewe to go|tankstelle|aral|shell|esso|agip|avia|totalenergies|backerei|baeckerei|metzgerei|apotheke|kiosk|restaurant|imbiss|mode|elektronik|mobel|blumen|florist/.test(n);}
async function oneQuery(q,label){for(const endpoint of ENDPOINTS){try{const url=endpoint+'?data='+encodeURIComponent(q);const r=await fetch(url,{headers:{'user-agent':'AngebotsRadar-MarketAudit/2.0'},signal:AbortSignal.timeout(50000)});if(r.ok){const j=await r.json();console.log(`${label}: ${j.elements?.length||0} Treffer via ${new URL(endpoint).host}`);return j.elements||[]}console.error(`${label}: ${new URL(endpoint).host} HTTP ${r.status}`)}catch(e){console.error(`${label}: ${new URL(endpoint).host}: ${e.message}`)}}console.error(`${label}: alle Server fehlgeschlagen`);return[];}
const around=`around:${CENTER.radiusKm*1000},${CENTER.lat},${CENTER.lon}`;
const specs=[
 ['Supermärkte',`[out:json][timeout:40];nwr(${around})[shop=supermarket];out center tags;`],
 ['Drogerien',`[out:json][timeout:40];nwr(${around})[shop=chemist];out center tags;`],
 ['Getränkemärkte',`[out:json][timeout:40];nwr(${around})[shop=beverages];out center tags;`],
 ['Babyfachmärkte',`[out:json][timeout:40];nwr(${around})[shop=baby_goods];out center tags;`],
 ['Großhandel',`[out:json][timeout:40];nwr(${around})[shop=wholesale];out center tags;`],
 ['Marken A-M',`[out:json][timeout:40];nwr(${around})[name~"REWE|EDEKA|HIT|Kaufland|V-Markt|tegut|ALDI|Lidl|PENNY|Netto|NORMA|dm|ROSSMANN|Müller|Alnatura|Denns|VollCorner|METRO",i];out center tags;`],
 ['Marken N-Z',`[out:json][timeout:40];nwr(${around})[name~"SELGROS|FRISTO|Orterer|Getränke Hoffmann|BabyOne|AEZ|Feneberg",i];out center tags;`]
];
const raw=[];for(const [label,q] of specs){raw.push(...await oneQuery(q,label));await new Promise(r=>setTimeout(r,900));}
const byOsm=new Map();for(const e of raw)byOsm.set(`${e.type}/${e.id}`,e);
const markets=[];
for(const e of byOsm.values()){
 const t=e.tags||{};if(irrelevant(t))continue;const c=classify(t);if(!c)continue;const lat=Number(e.lat??e.center?.lat),lon=Number(e.lon??e.center?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;const distance=hav(CENTER.lat,CENTER.lon,lat,lon);if(distance>15.0001)continue;
 const address=addr(t),market=t.branch||t['addr:suburb']||t['addr:city']||String(t.name||'').replace(new RegExp(c.store.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'').trim();
 markets.push({store:c.store,market,address,lat:+lat.toFixed(6),lon:+lon.toFixed(6),distanceKm:+distance.toFixed(2),distanceVerified:true,type:c.type,sourceUrl:t.website||c.sourceUrl||'',offerUrl:c.offerUrl||'',scope:['REWE','EDEKA','HIT','Kaufland','Netto','METRO','V-Markt','FRISTO','BabyOne'].includes(c.store)?'market':'regional',active:true,importStatus:c.importStatus,discoverySource:'OpenStreetMap/Overpass',osmId:`${e.type}/${e.id}`});
}
// Bestehende, bereits verifizierte Filialen nicht verlieren. Nur übernehmen, wenn Koordinaten vorhanden und innerhalb Radius; ohne Koordinaten werden sie durch OSM ersetzt.
for(const m of before){if(!Number.isFinite(Number(m.lat))||!Number.isFinite(Number(m.lon)))continue;const d=hav(CENTER.lat,CENTER.lon,Number(m.lat),Number(m.lon));if(d>15.0001)continue;markets.push({...m,distanceKm:+d.toFixed(2),distanceVerified:true,active:m.active!==false,type:m.type||classify({name:m.store,shop:'supermarket'})?.type||'Supermarkt',importStatus:m.importStatus||classify({name:m.store,shop:'supermarket'})?.importStatus||'not_yet_implemented'});}
markets.sort((a,b)=>a.distanceKm-b.distanceKm||a.store.localeCompare(b.store,'de'));
const clean=[];let duplicates=0;for(const m of markets){const dupe=clean.find(x=>norm(x.store)===norm(m.store)&&((x.address&&m.address&&norm(x.address)===norm(m.address))||hav(x.lat,x.lon,m.lat,m.lon)<0.06));if(dupe){duplicates++;if(!dupe.address&&m.address)dupe.address=m.address;if(!dupe.sourceUrl&&m.sourceUrl)dupe.sourceUrl=m.sourceUrl;if(!dupe.offerUrl&&m.offerUrl)dupe.offerUrl=m.offerUrl;continue}clean.push(m)}
// Quellen der funktionierenden Importer unverändert bewahren. Distanz/Typ aus neuer Filialliste ergänzen.
const sources=(old.sources||[]).map(s=>{const m=clean.find(x=>norm(x.store)===norm(s.store)&&((x.address&&s.address&&norm(x.address)===norm(s.address))||norm(x.market)===norm(s.market)));return{...s,type:m?.type||s.type||'Supermarkt',lat:m?.lat??s.lat,lon:m?.lon??s.lon,distanceKm:m?.distanceKm??s.distanceKm,importStatus:m?.importStatus||s.importStatus||'partial'};});
const counts={},types={},statuses={};for(const m of clean){counts[m.store]=(counts[m.store]||0)+1;types[m.type]=(types[m.type]||0)+1;statuses[m.importStatus]=(statuses[m.importStatus]||0)+1;}
const brands=new Set(clean.map(x=>x.store));const result={schema:6,generatedAt:new Date().toISOString(),center:CENTER,markets:clean,nearbyMarkets:clean.map(({store,market,address,lat,lon,distanceKm,type,active,importStatus})=>({store,market,address,lat,lon,distanceKm,type,active,importStatus})),sources,audit:{method:'Split Overpass V2 + exakte Haversine-Distanz + bestehende verifizierte Quellen',before:{handlers:beforeBrands.size,branches:before.length},after:{handlers:brands.size,branches:clean.length},duplicatesRemoved:duplicates,storeCounts:counts,typeCounts:types,importStatusCounts:statuses}};
await fs.writeFile(marketFile,JSON.stringify(result,null,2)+'\n');
const report={generatedAt:result.generatedAt,region:'85622 Feldkirchen bei München + 15 km Luftlinie',before:result.audit.before,after:result.audit.after,newHandlers:[...brands].filter(x=>!beforeBrands.has(x)).sort((a,b)=>a.localeCompare(b,'de')),alreadyPresent:[...brands].filter(x=>beforeBrands.has(x)).sort((a,b)=>a.localeCompare(b,'de')),removedHandlers:[...beforeBrands].filter(x=>!brands.has(x)).sort((a,b)=>a.localeCompare(b,'de')),duplicatesRemoved:duplicates,byStore:counts,byType:types,importStatusCounts:statuses,notes:['Entfernung aus OSM-Koordinaten per Haversine.','Filialen > 15,00 km werden nicht gespeichert.','Unabhängige shop=supermarket-Märkte werden ebenfalls erfasst.','Restaurants, Bäckereien, Metzgereien, Tankstellen, Kioske, Apotheken sowie Blumen-/Möbel-/Elektronikgeschäfte werden ausgeschlossen.']};
await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
