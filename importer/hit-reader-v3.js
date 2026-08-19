import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const livePath=path.join(ROOT,'data/offers-live.json');
const markets=JSON.parse(await fs.readFile(path.join(ROOT,'data/markets.json'),'utf8'));
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const source=markets.sources.find(x=>x.store==='HIT');
const importedAt=new Date().toISOString();

const res=await fetch('https://r.jina.ai/'+source.url,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-HIT/3.1'}});
if(!res.ok)throw new Error(`HIT Reader HTTP ${res.status}`);
const md=await res.text();

const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const n=v=>Number(String(v??'').replace(/\s+/g,'').replace(/[€*]/g,'').replace(',','.'));
const FOOD=/milch|butter|joghurt|käse|quark|sahne|eier|kiwi|banane|apfel|äpfel|beeren|tomat|paprika|gurke|kartoff|zwiebel|salat|broccoli|avocado|hack|rind|schwein|hähn|pute|lamm|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|braten|fleisch|brot|brötchen|baguette|croissant|nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|pizza|flammkuchen|pommes|kaffee|espresso|müsli|schokolade|riegel|haribo|chips|snack|keks|eis|wasser|cola|powerade|fanta|sprite|saft|bier|wein|sekt|prosecco|whisky|gin|rum|energy|nutella|marmelade|konfitüre|philadelphia|gouda|schnittkäse|weichkäse|hartkäse|haferdrink/i;
const ICONS={'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};

function category(x){if(/wasser|cola|powerade|fanta|sprite|saft|bier|wein|sekt|prosecco|whisky|gin|rum|energy|haferdrink/i.test(x))return'Getränke';if(/kiwi|banane|apfel|äpfel|beeren|tomat|paprika|gurke|kartoff|zwiebel|salat|broccoli|avocado/i.test(x))return'Obst & Gemüse';if(/milch|butter|joghurt|quark|käse|gouda|sahne|philadelphia|schnittkäse|weichkäse|hartkäse/i.test(x))return'Milchprodukte';if(/hack|rind|schwein|hähn|pute|lamm|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|braten|fleisch/i.test(x))return'Fleisch & Fisch';if(/kaffee|espresso|müsli|eier|marmelade|konfitüre/i.test(x))return'Kaffee & Frühstück';if(/nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|nutella/i.test(x))return'Vorrat';if(/pizza|flammkuchen|pommes|speiseeis|eisgenuss|tiefgefroren/i.test(x))return'Tiefkühl';if(/schokolade|riegel|haribo|chips|snack|keks/i.test(x))return'Süßes & Snacks';if(/brot|brötchen|baguette|croissant/i.test(x))return'Backwaren';return'Lebensmittel'}
function key(x){for(const[k,r]of [['Butter',/butter/i],['Milch',/\bmilch\b|haferdrink/i],['Eier',/\beier\b/i],['Äpfel',/äpfel|apfel/i],['Beeren',/beeren|himbeer|heidelbeer|erdbeer/i],['Tomaten',/tomat/i],['Hackfleisch',/hack/i],['Hähnchen',/hähn/i],['Rindfleisch',/rind|entrecôte|steak/i],['Schweinefleisch',/schwein|schnitzel|nacken/i],['Lachs',/lachs/i],['Joghurt',/joghurt|almighurt/i],['Käse',/käse|gouda|philadelphia|beemster/i],['Kaffee',/kaffee|espresso/i],['Nudeln',/nudel|pasta/i],['Pizza',/pizza|ofenfrische|tradizionale/i],['Wurst',/wurst|salami|schinken/i],['Mineralwasser',/mineralwasser/i],['Cola',/cola|powerade/i],['Bier',/bier|pils|helles/i]])if(r.test(x))return k;return x.replace(/\bbio\b/ig,'').slice(0,55)}
function size(block){const withoutBase=block.replace(/\(1\s*(?:kg|l)[^)]*\)/gi,' ');const ms=[...withoutBase.matchAll(/(?:Kasten:\s*)?((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|l|ml|Stück|St\.?))/gi)];return ms.length?norm(ms.at(-1)[1]):'Packung'}
function quantity(s){let m=s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=n(m[1])*n(m[2]),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':'l'}}m=s.match(/(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?\s*(kg|g|l|ml|Stück|St\.?)/i);if(!m)return null;let q=n(m[2]||m[1]),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':u==='l'||u==='ml'?'l':'st'}}
function base(block){const m=block.match(/\(1\s*(kg|l)\s*=\s*(\d+[.,]\d{2})(?:\s*[-–]\s*(\d+[.,]\d{2}))?\)/i);if(!m)return null;const vals=[n(m[2]),m[3]?n(m[3]):NaN].filter(Number.isFinite);return{unit:Math.min(...vals),label:`€/${m[1].toLowerCase()}${vals.length>1?' ab':''}`}}
function prices(block){const m=block.match(/(?:AKTION!|-\d+%|DAUER DISCOUNT PREIS)\s*([\s\S]*)$/i);if(!m)return null;let tail=m[1].replace(/Preis Vorwoche[\s\S]*$/i,'').replace(/\+\s*\d+[.,]\d+\s*Pfand[\s\S]*$/i,'').trim();const split=tail.match(/^(\d+)\.\s+(\d+[.,]\d{2})\*?/);if(split)return{regular:n(split[2]),app:null};const vals=[...tail.matchAll(/(\d+[.,]\d{2})/g)].map(x=>n(x[1])).filter(x=>x>.05&&x<100);if(!vals.length)return null;return{regular:vals[0],app:vals.length>1&&vals[1]<vals[0]?vals[1]:null}}
function productName(block){const marker=block.search(/(?:AKTION!|-\d+%|DAUER DISCOUNT PREIS)/i);let x=marker>0?block.slice(0,marker):block;x=x.replace(/^\d+\s+###\s*/,'').replace(/!Image\s*\d+/gi,' ').replace(/\(1\s*(?:kg|l)[^)]*\)/gi,' ');x=x.replace(/\s+(?:Kasten:\s*)?(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|l|ml|Stück|St\.?)\s*(?:Packung|Packg\.?|Flaschen?|Flasche|Pfandglas|Glas|PET EW Flasche|Vac\. Packung)?\s*$/i,'');return norm(x).replace(/[,*]+$/,'')}
function offer(block,price,app){const name=productName(block);if(!name||name.length<3||name.length>180||!/[A-Za-zÄÖÜäöüß]{3}/.test(name)||!FOOD.test(name+' '+block)||!Number.isFinite(price)||price<=.05||price>100)return null;const pack=size(block),q=quantity(pack),bp=base(block);let unit=price,label='€/Packung';if(bp){unit=bp.unit;label=bp.label}else if(q&&q.q>0){unit=price/q.q;label=q.type==='kg'?'€/kg':q.type==='l'?'€/l':'€/Stk.'}const cat=category(name);return{key:key(name),name,store:source.store,market:source.market,address:source.address,cat,size:pack,price:+price.toFixed(2),unit:+unit.toFixed(3),unitLabel:label,icon:ICONS[cat]||'🛒',bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(name+' '+block),app,coupon:false,advertised:true,sourceUrl:source.url,sourceScope:source.scope,sourceTransport:'hit-image-reader-v3',importedAt}}

const rawBlocks=[];
for(const m of md.matchAll(/!\[Image\s+\d+:\s*([^\]]+?)\]/gi)){const alt=norm(m[1]);if(!alt.includes('###')||!/(AKTION!|-\d+%|DAUER DISCOUNT PREIS)/i.test(alt))continue;rawBlocks.push(alt.slice(alt.lastIndexOf('###')+3).trim())}
const offers=[];
for(const block of rawBlocks){const p=prices(block);if(!p)continue;const regular=offer(block,p.regular,false);if(regular)offers.push(regular);if(p.app!=null){const app=offer(block,p.app,true);if(app)offers.push(app)}}
const unique=new Map();for(const o of offers){const k=[o.name.toLowerCase(),o.size,o.price,o.app].join('|');if(!unique.has(k))unique.set(k,o)}
const clean=[...unique.values()];
const old=(live.offers||[]).filter(x=>x.store==='HIT').length;
const log=[`HIT chars=${md.length} Blöcke=${rawBlocks.length} valide=${clean.length} vorher=${old}`,...clean.slice(0,40).map(o=>`${o.app?'APP':'REG'} ${o.price.toFixed(2)} | ${o.size} | ${o.name}`)].join('\n');
await fs.writeFile(path.join(ROOT,'data/hit-v3.log'),log+'\n');
if(clean.length>=20){live.offers=(live.offers||[]).filter(x=>x.store!=='HIT').concat(clean);const s=(live.sources||[]).find(x=>x.store==='HIT');if(s){s.status='ok';s.count=clean.length;s.message=`${clean.length} Angebote über HIT Bildblock-Reader V3`;s.transport='hit-image-reader-v3'}}
live.offerCount=(live.offers||[]).length;live.hitReaderV3At=importedAt;await fs.writeFile(livePath,JSON.stringify(live,null,2)+'\n');console.log(log);
