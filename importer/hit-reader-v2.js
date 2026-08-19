import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT=path.resolve(process.cwd(),'..');
const liveFile=path.join(ROOT,'data/offers-live.json');
const data=JSON.parse(await fs.readFile(liveFile,'utf8'));
const markets=JSON.parse(await fs.readFile(path.join(ROOT,'data/markets.json'),'utf8'));
const source=markets.sources.find(x=>x.store==='HIT');
const now=new Date().toISOString();
const r=await fetch('https://r.jina.ai/'+source.url,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-HIT/2'}});
if(!r.ok)throw new Error(`HIT Reader HTTP ${r.status}`);
const md=await r.text();
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const spaced=s=>String(s).replace(/(\d{1,3})\.\s+(\d{2})(?!\d)/g,'$1.$2').replace(/(\d{1,3}),\s+(\d{2})(?!\d)/g,'$1,$2');
const num=v=>Number(String(v).replace(/\s+/g,'').replace(/[€*]/g,'').replace(',','.'));
const FOOD=/milch|butter|joghurt|käse|quark|sahne|eier|banane|apfel|äpfel|beeren|tomat|paprika|gurke|kartoff|zwiebel|salat|broccoli|avocado|gemüse|obst|hack|rind|schwein|hähn|pute|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|brot|brötchen|baguette|croissant|nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|pizza|flammkuchen|pommes|kaffee|espresso|müsli|schokolade|riegel|haribo|chips|snack|keks|eis|wasser|cola|fanta|sprite|saft|bier|wein|sekt|drink|whisky|gin|rum|energy|nutella|marmelade|konfitüre/i;
const ICONS={'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};
function sizeOf(t){for(const x of [/(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml))/i,/(\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml))/i,/(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?))/i]){const m=t.match(x);if(m)return m[1]}return'Packung'}
function quantity(s){let m=s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=num(m[1])*num(m[2]),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':'l'}}m=s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);if(!m)return null;let q=num(m[1]),u=m[2].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':u==='l'||u==='ml'?'l':'st'}}
function explicit(t){const m=t.match(/(?:\(|\b)1\s*(kg|l)\s*=\s*(\d+[.,]\d{2})/i);return m?{unit:num(m[2]),label:m[1].toLowerCase()==='kg'?'€/kg':'€/l'}:null}
function category(n){if(/wasser|cola|fanta|sprite|saft|bier|wein|sekt|whisky|gin|rum|energy|drink/i.test(n))return'Getränke';if(/banane|apfel|äpfel|beeren|tomat|paprika|gurke|kartoff|zwiebel|salat|broccoli|avocado|gemüse|obst/i.test(n))return'Obst & Gemüse';if(/milch|butter|joghurt|quark|käse|sahne|pudding/i.test(n))return'Milchprodukte';if(/hack|rind|schwein|hähn|pute|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel/i.test(n))return'Fleisch & Fisch';if(/kaffee|espresso|müsli|eier|marmelade|konfitüre/i.test(n))return'Kaffee & Frühstück';if(/nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|nutella/i.test(n))return'Vorrat';if(/pizza|flammkuchen|pommes|speiseeis|tiefgefroren/i.test(n))return'Tiefkühl';if(/schokolade|riegel|haribo|chips|snack|keks/i.test(n))return'Süßes & Snacks';if(/brot|brötchen|baguette|croissant/i.test(n))return'Backwaren';return'Lebensmittel'}
function key(n){for(const[k,x]of [['Butter',/butter/i],['Milch',/\bmilch\b/i],['Eier',/\beier\b/i],['Äpfel',/äpfel|apfel/i],['Beeren',/beeren|himbeer|heidelbeer|erdbeer/i],['Tomaten',/tomat/i],['Hackfleisch',/hack/i],['Hähnchen',/hähn/i],['Rindfleisch',/rind|steak/i],['Schweinefleisch',/schwein|schnitzel/i],['Lachs',/lachs/i],['Joghurt',/joghurt/i],['Käse',/käse|gouda|mozzarella/i],['Kaffee',/kaffee|espresso/i],['Nudeln',/nudel|pasta/i],['Pizza',/pizza|flammkuchen/i],['Wurst',/wurst|salami|schinken/i],['Bier',/bier|pils/i]])if(x.test(n))return k;return n.slice(0,55)}
function cleanStart(x){return norm(x).replace(/^.*?(?:Preis Vorwoche\s*\d+[.,]\d{2}|\d+[.,]\d{2}\*\*)\s*/i,'').replace(/^.*?(?:Günstigster Preis der letzten 30 Tage|Mehr anzeigen|Filter)\s*/i,'').replace(/^\d+[.)]\s*/,'')}
function nameOf(seg,marker){const p=seg.search(marker);let n=p>0?seg.slice(0,p):seg;n=cleanStart(n).replace(/\[[^\]]*$/,'').replace(/^.*?】\s*/,'');n=n.replace(/\([^)]*(?:1\s*(?:kg|l)|Pfand)[^)]*\)/gi,' ').replace(/\s+(?:Kasten:\s*)?(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?)\s*(?:[A-Za-z.-]+\s*){0,3}$/i,'').replace(/\s+/g,' ').trim();if(n.length>165){const words=n.split(' ');n=words.slice(-24).join(' ')}return n}
function make(seg,marker,price){const n=nameOf(seg,marker),p=num(price);if(n.length<3||!/[A-Za-zÄÖÜäöüß]{3}/.test(n)||!FOOD.test(n+' '+seg)||!Number.isFinite(p)||p<=.05||p>100)return null;const size=sizeOf(seg),q=quantity(size),b=explicit(seg);let unit=p,label='€/Packung';if(b){unit=b.unit;label=b.label}else if(q&&q.q>0){unit=p/q.q;label=q.type==='kg'?'€/kg':q.type==='l'?'€/l':'€/Stk.'}const cat=category(n);return{key:key(n),name:n,store:source.store,market:source.market,address:source.address,cat,size,price:+p.toFixed(2),unit:+unit.toFixed(3),unitLabel:label,icon:ICONS[cat]||'🛒',bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(n+' '+seg),app:false,coupon:false,advertised:true,sourceUrl:source.url,sourceScope:source.scope,sourceTransport:'hit-segment-reader',importedAt:now}}

const marker=/(?:AKTION!|-\d+%|DAUER DISCOUNT PREIS)\s*(\d+[.,]\d{2})/i;
const segments=[];
for(const raw of md.split(/\r?\n/)){
 let line=spaced(raw.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^[-*#> ]+/,''));
 if(!line||!/(AKTION!|-\d+%|DAUER DISCOUNT PREIS)/i.test(line))continue;
 line=line.replace(/((?:AKTION!|-\d+%|DAUER DISCOUNT PREIS)\s*\d+[.,]\d{2})/gi,'$1\n');
 for(const part of line.split('\n'))if(marker.test(part))segments.push(part.trim());
}
const offers=[];
for(const seg of segments){const m=seg.match(marker);if(!m)continue;const o=make(seg,marker,m[1]);if(o)offers.push(o)}
const map=new Map();for(const o of offers){const k=[o.name.toLowerCase(),o.size,o.price].join('|');if(!map.has(k))map.set(k,o)}
const clean=[...map.values()];
const old=(data.offers||[]).filter(x=>x.store==='HIT').length;
const log=[`HIT chars=${md.length} Segmente=${segments.length} valide=${clean.length} vorher=${old}`,...clean.slice(0,25).map(o=>`${o.price.toFixed(2)} | ${o.size} | ${o.name}`)].join('\n');
await fs.writeFile(path.join(ROOT,'data/hit-v2.log'),log+'\n');
if(clean.length>old){data.offers=(data.offers||[]).filter(x=>x.store!=='HIT').concat(clean);const s=(data.sources||[]).find(x=>x.store==='HIT');if(s){s.status='ok';s.count=clean.length;s.message=`${clean.length} Angebote über HIT Segmentreader`;s.transport='hit-segment-reader'}}
data.offerCount=(data.offers||[]).length;data.hitReaderV2At=now;await fs.writeFile(liveFile,JSON.stringify(data,null,2)+'\n');console.log(log);
