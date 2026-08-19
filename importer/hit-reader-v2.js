import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const liveFile=path.join(ROOT,'data/offers-live.json');
const data=JSON.parse(await fs.readFile(liveFile,'utf8'));
const markets=JSON.parse(await fs.readFile(path.join(ROOT,'data/markets.json'),'utf8'));
const source=markets.sources.find(x=>x.store==='HIT');
const now=new Date().toISOString();

const response=await fetch('https://r.jina.ai/'+source.url,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-HIT/3'}});
if(!response.ok)throw new Error(`HIT Reader HTTP ${response.status}`);
const md=await response.text();

const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const spaced=s=>String(s)
  .replace(/(\d{1,3})\.\s+(\d{2})(?!\d)/g,'$1.$2')
  .replace(/(\d{1,3}),\s+(\d{2})(?!\d)/g,'$1,$2');
const num=v=>Number(String(v??'').replace(/\s+/g,'').replace(/[€*]/g,'').replace(',','.'));

const FOOD=/milch|butter|joghurt|käse|quark|sahne|eier|banane|kiwi|apfel|äpfel|beeren|tomat|paprika|gurke|kartoff|zwiebel|salat|broccoli|avocado|gemüse|obst|hack|rind|schwein|hähn|pute|lamm|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|braten|fleisch|brot|brötchen|baguette|croissant|nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|pizza|flammkuchen|pommes|kaffee|espresso|müsli|schokolade|riegel|haribo|chips|snack|keks|eis|wasser|cola|fanta|sprite|saft|bier|wein|sekt|prosecco|drink|whisky|gin|rum|energy|nutella|marmelade|konfitüre|frischkäse|gouda|schnittkäse|weichkäse|hartkäse|haferdrink/i;
const ICONS={'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};

function category(n){
 if(/wasser|cola|fanta|sprite|saft|bier|wein|sekt|prosecco|whisky|gin|rum|energy|drink|haferdrink/i.test(n))return'Getränke';
 if(/banane|kiwi|apfel|äpfel|beeren|tomat|paprika|gurke|kartoff|zwiebel|salat|broccoli|avocado|gemüse|obst/i.test(n))return'Obst & Gemüse';
 if(/milch|butter|joghurt|quark|käse|gouda|sahne|pudding|frischkäse|schnittkäse|weichkäse|hartkäse/i.test(n))return'Milchprodukte';
 if(/hack|rind|schwein|hähn|pute|lamm|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|braten|fleisch/i.test(n))return'Fleisch & Fisch';
 if(/kaffee|espresso|müsli|eier|marmelade|konfitüre/i.test(n))return'Kaffee & Frühstück';
 if(/nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|nutella/i.test(n))return'Vorrat';
 if(/pizza|flammkuchen|pommes|speiseeis|eisgenuss|tiefgefroren/i.test(n))return'Tiefkühl';
 if(/schokolade|riegel|haribo|chips|snack|keks/i.test(n))return'Süßes & Snacks';
 if(/brot|brötchen|baguette|croissant/i.test(n))return'Backwaren';
 return'Lebensmittel';
}
function keyOf(n){
 for(const[k,r]of [['Butter',/butter/i],['Milch',/\bmilch\b|haferdrink/i],['Eier',/\beier\b/i],['Äpfel',/äpfel|apfel/i],['Beeren',/beeren|himbeer|heidelbeer|erdbeer/i],['Tomaten',/tomat/i],['Kartoffeln',/kartoff/i],['Hackfleisch',/hack/i],['Hähnchen',/hähn/i],['Rindfleisch',/rind|entrecôte|steak/i],['Schweinefleisch',/schwein|schnitzel|nackensteak/i],['Lachs',/lachs/i],['Joghurt',/joghurt|almighurt/i],['Käse',/käse|gouda|philadelphia|beemster/i],['Kaffee',/kaffee|espresso/i],['Nudeln',/nudel|pasta/i],['Pizza',/pizza|ofenfrische|tradizionale/i],['Wurst',/wurst|salami|schinken/i],['Mineralwasser',/mineralwasser/i],['Cola',/cola|powerade/i],['Bier',/bier|pils|helles/i]])if(r.test(n))return k;
 return n.replace(/\bbio\b/ig,'').slice(0,55);
}
function sizeOf(t){
 const cleaned=t.replace(/\(1\s*(?:kg|l)[^)]*\)/gi,' ');
 const matches=[...cleaned.matchAll(/(?:Kasten:\s*)?((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|l|ml|Stück|St\.?))/gi)];
 return matches.length?norm(matches.at(-1)[1]):'Packung';
}
function qty(size){
 let m=size.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);
 if(m){let q=num(m[1])*num(m[2]),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':'l'}}
 m=size.match(/(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?\s*(kg|g|l|ml|Stück|St\.?)/i);
 if(!m)return null;
 let q=num(m[2]||m[1]),u=m[3].toLowerCase(); // bei Spannen: größere Packung => günstigster Grundpreis
 if(u==='g'||u==='ml')q/=1000;
 return{q,type:u==='g'||u==='kg'?'kg':u==='l'||u==='ml'?'l':'st'};
}
function explicitBase(t){
 const m=t.match(/\(1\s*(kg|l)\s*=\s*(\d+[.,]\d{2})(?:\s*[-–]\s*(\d+[.,]\d{2}))?\)/i);
 if(!m)return null;
 const vals=[num(m[2]),m[3]?num(m[3]):NaN].filter(Number.isFinite);
 return{unit:Math.min(...vals),label:`€/${m[1].toLowerCase()}${vals.length>1?' ab':''}`};
}
function priceFrom(block){
 const marker=block.match(/(?:AKTION!|-\d+%|DAUER DISCOUNT PREIS)\s*([\s\S]*)$/i);
 if(!marker)return null;
 const tail=marker[1].replace(/Preis Vorwoche[\s\S]*$/i,'').replace(/\+\s*\d+[.,]\d+\s*Pfand[\s\S]*$/i,'').trim();
 // HIT rendert Preise gelegentlich als "1. 1.00*". In diesem Fall ist der zweite vollständige Wert der Preis.
 let m=tail.match(/^(\d+)\.\s+(\d+[.,]\d{2})\*?/);
 if(m)return{price:num(m[2]),extra:null};
 const values=[...tail.matchAll(/(\d+[.,]\d{2})/g)].map(x=>num(x[1])).filter(x=>x>.05&&x<100);
 if(!values.length)return null;
 const price=values[0];
 // Zweiter, niedrigerer Preis innerhalb derselben Kachel ist bei HIT regelmäßig der App-Preis.
 const extra=values.length>1&&values[1]<price?values[1]:null;
 return{price,extra};
}
function cleanName(block){
 const markerIndex=block.search(/(?:AKTION!|-\d+%|DAUER DISCOUNT PREIS)/i);
 let n=markerIndex>0?block.slice(0,markerIndex):block;
 n=n.replace(/^\d+\s+###\s*/,'').replace(/!Image\s*\d+/gi,' ').replace(/\(1\s*(?:kg|l)[^)]*\)/gi,' ');
 // Verkaufsmenge/Verpackung am Ende aus dem Produktnamen entfernen.
 n=n.replace(/\s+(?:Kasten:\s*)?(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|l|ml|Stück|St\.?)\s*(?:Packung|Packg\.?|Flaschen?|Flasche|Pfandglas|Glas|PET EW Flasche|Vac\. Packung)?\s*$/i,'');
 return norm(n).replace(/[,*]+$/,'').trim();
}
function make(block,url,app=false,forcedPrice=null){
 const name=cleanName(block),pInfo=priceFrom(block),price=forcedPrice??pInfo?.price;
 if(!name||name.length<3||name.length>180||!/[A-Za-zÄÖÜäöüß]{3}/.test(name)||!FOOD.test(name+' '+block)||!Number.isFinite(price)||price<=.05||price>100)return null;
 const size=sizeOf(block),q=qty(size),base=explicitBase(block);
 let unit=price,label='€/Packung';
 if(base){unit=base.unit;label=base.label}else if(q&&q.q>0){unit=price/q.q;label=q.type==='kg'?'€/kg':q.type==='l'?'€/l':'€/Stk.'}
 const cat=category(name);
 return{key:keyOf(name),name,store:source.store,market:source.market,address:source.address,cat,size,price:+price.toFixed(2),unit:+unit.toFixed(3),unitLabel:label,icon:ICONS[cat]||'🛒',bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(name+' '+block),app,coupon:false,advertised:true,sourceUrl:url||source.url,sourceScope:source.scope,sourceTransport:'hit-image-reader',importedAt:now};
}

const offers=[];
const imageRe=/!\[Image\s+\d+:\s*([^\]]+?)\]\((https:\/\/www\.hit\.de\/angebot\/[^)]+)\)/gi;
for(const match of md.matchAll(imageRe)){
 const block=spaced(norm(match[1]));
 if(!/###/.test(block)||!/(AKTION!|-\d+%|DAUER DISCOUNT PREIS)/i.test(block))continue;
 const product=block.slice(block.lastIndexOf('###')+3).trim();
 const info=priceFrom(product);
 if(!info)continue;
 const normal=make(product,match[2],false,info.price);if(normal)offers.push(normal);
 if(info.extra!=null){const app=make(product,match[2],true,info.extra);if(app)offers.push(app)}
}

const map=new Map();
for(const o of offers){const k=[o.name.toLowerCase(),o.size,o.price,!!o.app].join('|');if(!map.has(k))map.set(k,o)}
const clean=[...map.values()];
const old=(data.offers||[]).filter(x=>x.store==='HIT').length;
const log=[`HIT chars=${md.length} Bildblöcke=${[...md.matchAll(/!\[Image\s+\d+:/g)].length} valide=${clean.length} vorher=${old}`,...clean.slice(0,35).map(o=>`${o.app?'APP ':'    '}${o.price.toFixed(2)} | ${o.size} | ${o.name}`)].join('\n');
await fs.writeFile(path.join(ROOT,'data/hit-v2.log'),log+'\n');

// Immer durch den neuen, sauberen Reader ersetzen, sobald er genügend plausible Treffer liefert.
if(clean.length>=20){
 data.offers=(data.offers||[]).filter(x=>x.store!=='HIT').concat(clean);
 const s=(data.sources||[]).find(x=>x.store==='HIT');
 if(s){s.status='ok';s.count=clean.length;s.message=`${clean.length} Angebote über HIT Bildblock-Reader`;s.transport='hit-image-reader'}
}
data.offerCount=(data.offers||[]).length;data.hitReaderV3At=now;
await fs.writeFile(liveFile,JSON.stringify(data,null,2)+'\n');
console.log(log);
