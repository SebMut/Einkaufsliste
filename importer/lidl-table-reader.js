import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const livePath=path.join(ROOT,'data/offers-live.json');
const markets=JSON.parse(await fs.readFile(path.join(ROOT,'data/markets.json'),'utf8'));
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const source=markets.sources.find(x=>x.store==='Lidl');
const now=new Date();
const importedAt=now.toISOString();

const ICONS={'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};
const FOOD=/milch|butter|joghurt|käse|quark|sahne|eier|banane|apfel|äpfel|beeren|heidelbeer|tomat|paprika|gurke|kartoff|möhren|karotten|zwiebel|salat|kohlrabi|champignon|zitrone|feigen|trauben|melone|mais|obst|gemüse|hack|rind|schwein|hähn|pute|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|brot|brötchen|baguette|croissant|nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|pizza|flammkuchen|pommes|kaffee|caff|espresso|müsli|schokolade|riegel|haribo|chips|snack|keks|eis|wasser|cola|schwip|fanta|sprite|saft|bier|wein|sekt|energy|limonade|lavazza/i;
const NONFOOD=/bettwäsche|parkside|silvercrest|rasenmäher|kettensäge|küchenmaschine|induktions|reiskocher|besteck|kaffeemaschine|eismaschine|pyjama|shirt|shorts|pfanne|topf|schuhe|pantoletten|akku|bohr|holzspalter|fernseher|smart-tv|jacke|kissen|mikrowelle|fritteuse/i;
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const num=v=>Number(String(v??'').replace(/\s+/g,'').replace(/[€*]/g,'').replace(',','.'));
function deDate(s){const m=String(s).match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);if(!m)return null;return{d:+m[1],m:+m[2],y:m[3]?+m[3]:null}}
function rangeFromLabel(label){const m=String(label).match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*[–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);if(!m)return null;const y1=m[3]?+m[3]:+m[6];return{start:new Date(Date.UTC(y1,+m[2]-1,+m[1])),end:new Date(Date.UTC(+m[6],+m[5]-1,+m[4],23,59,59)),label:`${m[1]}.${m[2]}.${y1} - ${m[4]}.${m[5]}.${m[6]}`}}
function currentRange(label){const r=rangeFromLabel(label);if(!r)return false;const t=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),12);return t>=r.start.getTime()&&t<=r.end.getTime()}
function cleanMd(s){return norm(String(s).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,''))}
function category(name,product=''){const x=`${product} ${name}`;if(/wasser|cola|schwip|fanta|sprite|saft|bier|wein|sekt|energy|limonade/i.test(x))return'Getränke';if(/banane|apfel|äpfel|beeren|heidelbeer|tomat|paprika|gurke|kartoff|möhren|karotten|zwiebel|salat|kohlrabi|champignon|zitrone|feigen|trauben|melone|mais/i.test(x))return'Obst & Gemüse';if(/milch|butter|joghurt|quark|käse|sahne/i.test(x))return'Milchprodukte';if(/hack|rind|schwein|hähn|pute|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel/i.test(x))return'Fleisch & Fisch';if(/kaffee|caff|espresso|müsli|eier/i.test(x))return'Kaffee & Frühstück';if(/nudel|pasta|reis|mehl|zucker|öl|sauce|pesto/i.test(x))return'Vorrat';if(/pizza|flammkuchen|pommes|tiefkühl|speiseeis/i.test(x))return'Tiefkühl';if(/schokolade|riegel|haribo|chips|snack|keks/i.test(x))return'Süßes & Snacks';if(/brot|brötchen|baguette|croissant/i.test(x))return'Backwaren';return'Lebensmittel'}
function key(name,product=''){const x=`${product} ${name}`;for(const[k,r]of [['Milch',/milch/i],['Äpfel',/äpfel|apfel/i],['Beeren',/beeren|heidelbeer/i],['Tomaten',/tomat/i],['Paprika',/paprika/i],['Kartoffeln',/kartoff/i],['Möhren',/möhren|karotten/i],['Kaffee',/kaffee|caff|lavazza/i],['Cola',/cola|schwip|limonade/i],['Schokolade',/schokolade|ritter sport/i],['Wurst',/wurst|schinken|salami/i]])if(r.test(x))return k;return name.replace(/\bbio\b/ig,'').slice(0,55)}
function sizeOf(name,product=''){const x=`${product} ${name}`;for(const r of [/(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml))/i,/(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?))/i]){const m=x.match(r);if(m)return m[1]}if(/lose/i.test(x)&&/apfel|äpfel|obst|gemüse/i.test(x))return'1 kg';return'Packung'}
function quantity(size){let m=size.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=num(m[1])*num(m[2]),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':'l'}}m=size.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);if(!m)return null;let q=num(m[1]),u=m[2].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':u==='l'||u==='ml'?'l':'st'}}

// Erst den aktuell gültigen offiziellen Lidl-Flyer bestimmen. Der Aggregator darf
// nur Daten für exakt denselben Zeitraum liefern.
const overviewRes=await fetch('https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/de-DE',{headers:{accept:'application/json','user-agent':'AngebotsRadar/1'}});
if(!overviewRes.ok)throw new Error(`Lidl Overview HTTP ${overviewRes.status}`);
const overview=await overviewRes.json();
const currentOfficial=[];
for(const c of overview.categories||[])for(const s of c.subcategories||[])for(const f of s.flyers||[])if(f.status==='current'&&/Aktionsprospekt/i.test(f.name||'')&&(f.regions||[]).some(r=>r.type==='national'&&String(r.code)==='0'))currentOfficial.push(f);
const official=currentOfficial.find(f=>currentRange(f.title||''))||currentOfficial[0];
if(!official)throw new Error('Kein aktuell gültiger nationaler Lidl Aktionsprospekt in offizieller API');
const officialRange=rangeFromLabel(official.title||'');
if(!officialRange)throw new Error(`Offizieller Lidl-Zeitraum nicht lesbar: ${official.title}`);

const tableUrl='https://rabatt-kompass.de/lidl-prospekte';
const tableRes=await fetch('https://r.jina.ai/'+tableUrl,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-Lidl-Fallback/1'}});
if(!tableRes.ok)throw new Error(`Lidl Tabellenfallback HTTP ${tableRes.status}`);
const md=await tableRes.text();
const rows=[];let activeRange=null,activePage=null;
for(const raw of md.split(/\r?\n/)){
 if(!raw.includes('|')||!/\d+[,.]\d{2}\s*€/.test(raw))continue;
 const cells=raw.split('|').map(cleanMd).filter(Boolean);if(cells.length<3)continue;
 const firstRange=rangeFromLabel(cells[0]);let offset=0;
 if(firstRange){activeRange=firstRange;offset=1}else if(!activeRange)continue;
 if(activeRange.label!==officialRange.label)continue;
 const priceCell=cells.at(-1),priceMatch=priceCell.match(/(\d+[,.]\d{2})\s*€/);if(!priceMatch)continue;
 const price=num(priceMatch[1]);if(!Number.isFinite(price)||price<=.05||price>100)continue;
 let product='',name='';
 const body=cells.slice(offset,-1);
 if(body.length>=3&&/^\d+$/.test(body[0])){activePage=+body[0];product=body[1];name=body.slice(2).join(' ')}
 else if(body.length>=2){product=body[0];name=body.slice(1).join(' ')}
 else continue;
 name=norm(name.replace(/\*+$/,''));product=norm(product);
 if(!name||NONFOOD.test(`${product} ${name}`)||!FOOD.test(`${product} ${name}`))continue;
 const size=sizeOf(name,product),q=quantity(size);let unit=price,unitLabel='€/Packung';if(q&&q.q>0){unit=price/q.q;unitLabel=q.type==='kg'?'€/kg':q.type==='l'?'€/l':'€/Stk.'}
 const cat=category(name,product);
 rows.push({key:key(name,product),name,store:source.store,market:source.market,address:source.address,cat,size,price:+price.toFixed(2),unit:+unit.toFixed(3),unitLabel,icon:ICONS[cat]||'🛒',bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(`${product} ${name}`),app:false,coupon:false,advertised:true,sourceUrl:official.flyerUrlAbsolute||source.url,sourceScope:source.scope,sourceTransport:'official-validated-aggregator',sourceDetailUrl:tableUrl,validFrom:officialRange.start.toISOString(),validTo:officialRange.end.toISOString(),flyerPage:activePage,importedAt});
}
const uniq=new Map();for(const o of rows){const k=[o.name.toLowerCase(),o.price,o.size].join('|');if(!uniq.has(k))uniq.set(k,o)}const offers=[...uniq.values()];
const old=(live.offers||[]).filter(o=>o.store==='Lidl').length;
await fs.writeFile(path.join(ROOT,'data/lidl-table.log'),[`official=${official.title}`,`tableChars=${md.length}`,`valid=${offers.length}`,`previous=${old}`,...offers.slice(0,50).map(o=>`${o.price.toFixed(2)} | ${o.size} | ${o.name}`)].join('\n')+'\n');
if(offers.length>=5){live.offers=(live.offers||[]).filter(o=>o.store!=='Lidl').concat(offers);const s=(live.sources||[]).find(x=>x.store==='Lidl');if(s){s.status='ok';s.count=offers.length;s.message=`${offers.length} Angebote; Zeitraum gegen offizielle Lidl-Flyer-API validiert`;s.transport='official-validated-aggregator'}}
live.offerCount=(live.offers||[]).length;live.lidlTableReaderAt=importedAt;await fs.writeFile(livePath,JSON.stringify(live,null,2)+'\n');console.log(`Lidl Tabellenreader: ${offers.length} Angebote (vorher ${old}), offizieller Zeitraum ${official.title}`);
