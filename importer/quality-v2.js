import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const file=path.join(DATA,'offers-live.json');
const reportFile=path.join(DATA,'quality-report.json');
const data=JSON.parse(await fs.readFile(file,'utf8'));
const previous=JSON.parse(await fs.readFile(reportFile,'utf8').catch(()=>'{"before":0,"after":0}'));
const before=(data.offers||[]).length;

const KEYS=[
 ['Windeln',/\b(?:windeln?|windelhose|schwimmwindeln|pants)\b/i],['Feuchttücher',/feuchttücher|wipes/i],
 ['Babymilch',/\b(?:pre|anfangs|folge|kinder)milch\b|säuglingsnahrung|milchnahrung/i],['Babybrei',/getreidebrei|milchbrei|babybrei/i],
 ['Butter',/\bbutter\b|streichzart/i],['Milch',/\b(?:vollmilch|frischmilch|h-?milch)\b/i],['Eier',/\beier\b/i],
 ['Bananen',/bananen?/i],['Äpfel',/äpfel|apfel/i],['Beeren',/heidelbeer|himbeer|erdbeer|brombeer/i],['Tomaten',/tomaten?/i],
 ['Paprika',/paprika/i],['Gurken',/gurken?/i],['Kartoffeln',/kartoffeln?/i],['Hackfleisch',/hackfleisch|rinderhack|schweinehack/i],
 ['Hähnchen',/hähnchen|chicken/i],['Rindfleisch',/rind|jungbullen|steak/i],['Schweinefleisch',/schwein|schnitzel/i],
 ['Joghurt',/joghurt|yoghurt|kefir|fruchtigurt/i],['Käse',/käse|gouda|emmentaler|mozzarella|frischkäse/i],
 ['Kaffee',/kaffee|espresso/i],['Nudeln',/nudeln|pasta|spaghetti|penne/i],['Reis',/\breis\b/i],['Öl',/öl|olivenöl|rapsöl/i],
 ['Pizza',/pizza|flammkuchen|pinsa/i],['Brot',/\bbrot\b/i],['Wurst',/wurst|salami|schinken/i],
 ['Mineralwasser',/mineralwasser/i],['Cola',/cola|fanta|sprite|pepsi|mezzo/i],['Bier',/bier|pils|helles|weißbier/i],
 ['Schokolade',/schokolade|duplo|kinder riegel|knoppers|haribo|lachgummi/i]
];
const ICONS={'Baby & Kleinkind':'👶','Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();

function cleanName(value=''){
 let n=norm(value).replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');
 const meta=n.match(/Marke:\s*([^;]{2,80});\s*Produktname:\s*([^;]{3,180});/i);
 if(meta)n=`${meta[1]} ${meta[2]}`;
 n=n
   .replace(/^[-–]?\d+%\s*(?:mit App)?\s*(?:[-–]?\d+%\s*)?/i,'')
   .replace(/^\*?€?\s*\d+[.,]\d{2}\*?\s*/i,'')
   .replace(/^(?:Angebotspreis|Aktionspreis|App-Preis|Preis)\s*\d+[.,]\d{2}\s*€?\s*(?:\d+[.,]\d{2})?\s*/i,'')
   .replace(/^(?:Aktion|Angebot|Knaller|Superknüller)\s+/i,'')
   .replace(/\*?\s+(?:mit App:|ohne App:|Nur mit|Streng limitiert).*$/i,'')
   .replace(/\s+(?:je\s+)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?)\s*(?:\([^)]*(?:kg|l|Stück)[^)]*\))?\s*$/i,'')
   .replace(/[,*]+\s*$/,'')
   .trim();
 return norm(n);
}
function keyOf(n){for(const[k,r]of KEYS)if(r.test(n))return k;return n.replace(/\bbio\b/ig,'').trim().slice(0,55)}
function cat(n,current=''){
 if(/baby|babylove|babydream|pampers|windel|pants|feuchttücher|wattepad|wattestäbchen|schnuller|säugling|beikost|anfangsmilch|folgemilch|\bpre\b|brei|wickel|sonnenspray baby/i.test(n))return'Baby & Kleinkind';
 if(/banane|apfel|äpfel|zwetsch|pflaum|tomat|paprika|gurke|kartoff|beeren|himbeer|heidelbeer|erdbeer|traube|avocado/i.test(n))return'Obst & Gemüse';
 if(/milch|butter|joghurt|yoghurt|kefir|fruchtigurt|quark|käse|gouda|mozzarella|pudding|milchreis/i.test(n))return'Milchprodukte';
 if(/hack|rind|schwein|hähnchen|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel/i.test(n))return'Fleisch & Fisch';
 if(/kaffee|espresso|tee|müsli|eier/i.test(n))return'Kaffee & Frühstück';
 if(/nudel|pasta|reis|mehl|öl|pesto|hummus/i.test(n))return'Vorrat';
 if(/pizza|flammkuchen|pinsa|pommes|eiscreme/i.test(n))return'Tiefkühl';
 if(/wasser|cola|fanta|sprite|pepsi|mezzo|saft|bier|wein|sekt|whisky|whiskey|energy/i.test(n))return'Getränke';
 if(/schokolade|duplo|kinder riegel|knoppers|haribo|lachgummi|chips|keks|snack/i.test(n))return'Süßes & Snacks';
 if(/brot|brötchen|semmel|breze|baguette/i.test(n))return'Backwaren';
 return ICONS[current]?current:'Lebensmittel';
}
function quantity(size=''){
 const s=norm(size);if(/\d\s*[\/–-]\s*\d/.test(s))return null;
 let m=s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=+m[1]*+m[2].replace(',','.');const u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:(u==='g'||u==='kg')?'kg':'l'}}
 m=s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);if(!m)return null;let q=+m[1].replace(',','.');const u=m[2].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:(u==='g'||u==='kg')?'kg':(u==='l'||u==='ml')?'l':'st'};
}
function recalc(o){const x=quantity(o.size);if(!x||!Number.isFinite(+o.price)||+o.price<=0)return o;const label=x.type==='kg'?'€/kg':x.type==='l'?'€/l':'€/Stk.';o.unit=+(+o.price/x.q).toFixed(3);o.unitLabel=label;return o}
function bad(n,o){
 if(!n||n.length<3||n.length>120)return'name';
 if(/^(?:\d+%\s*(?:billiger|günstiger)|je\s+\d|\d+[.,]\d+\s*(?:kg|g|l|ml)|pro\s+(?:stück|kg|l))/i.test(n))return'quantity_or_discount';
 if(/alle cookies|cookies akzeptieren|alle ablehnen|auflistung mit \d+ elementen|zum ende der liste|alle dm-märkte|alle rossmann-märkte|markt auswählen|filiale|prospekt|newsletter/i.test(n))return'ui';
 if(/Angebotspreis|Aktionspreis/i.test(n))return'concatenated_offer';
 if((String(o.name).match(/Angebotspreis/gi)||[]).length>1)return'concatenated_offer';
 if(!/[A-Za-zÄÖÜäöüß]{3}/.test(n))return'letters';
 if(!Number.isFinite(+o.price)||+o.price<=0.05||+o.price>150)return'price';
 if(!Number.isFinite(+o.unit)||+o.unit<=0)return'unit';
 const c=cat(n,o.cat);if(c==='Obst & Gemüse'&&+o.unit>80)return'produce_unit';
 if(+o.unit>600)return'unit_high';
 return null;
}
function normalizedComparable(n=''){return n.toLowerCase().replace(/\b(?:beba|hipp|bebivita|babylove|babydream)\b/g,'').replace(/[^a-zäöüß0-9]+/g,' ').trim()}

const rejected={};const examples=[];const repaired=[];
for(const raw of data.offers||[]){
 const o={...raw};const originalName=norm(o.name);o.name=cleanName(originalName);
 if(o.name!==originalName)repaired.push('name');
 // ALDI APIs liefern einzelne Preise teils in Cent.
 if(o.store==='ALDI SÜD'&&Number.isInteger(+o.price)&&+o.price>=100&&+o.price<=9999){o.price=+(+o.price/100).toFixed(2);repaired.push('aldi_cents')}
 const x=quantity(o.size);
 // Typischer ALDI-Fall: Rabatt-Prozent wurde als 0.xx Preis gelesen, tatsächlicher Packungspreis steckt im unit-Feld.
 if(o.store==='ALDI SÜD'&&x&&x.q<1&&+o.price<0.30&&+o.unit>=0.5&&+o.unit<=20){o.price=+(+o.unit).toFixed(2);repaired.push('aldi_discount_as_price')}
 o.key=keyOf(o.name);o.cat=cat(o.name,o.cat);o.icon=ICONS[o.cat]||'🛒';o.bio=/\bbio\b|bioland|naturland|demeter|öko-/i.test(`${originalName} ${o.name}`);
 recalc(o);
 const reason=bad(o.name,o);if(reason){rejected[reason]=(rejected[reason]||0)+1;if(examples.length<40)examples.push({store:o.store,name:originalName,reason});continue}
 repaired.push(o);
}

const cleaned=repaired.filter(x=>typeof x==='object');
// Exakte Dubletten bzw. gleiche Produkte derselben Filiale: günstigsten Preis je Preisart behalten.
const byExact=new Map();
for(const o of cleaned){const k=[o.store,o.market,o.name.toLowerCase(),norm(o.size).toLowerCase(),!!o.app,!!o.coupon].join('|');const prev=byExact.get(k);if(!prev||+o.price<+prev.price)byExact.set(k,o);else rejected.duplicate=(rejected.duplicate||0)+1}
let offers=[...byExact.values()];

// Doppelte Babyartikel, bei denen einmal die Marke fehlt (z.B. "BEBA - 2 Folgemilch" / "2 Folgemilch").
const keep=[];
for(const o of offers.sort((a,b)=>+a.price-+b.price)){
 const c=normalizedComparable(o.name);const duplicate=keep.some(k=>k.store===o.store&&norm(k.size).toLowerCase()===norm(o.size).toLowerCase()&&!!k.app===!!o.app&&!!k.coupon===!!o.coupon&&(()=>{const d=normalizedComparable(k.name);return c.length>8&&d.length>8&&(c===d||c.includes(d)||d.includes(c));})());
 if(duplicate){rejected.semantic_duplicate=(rejected.semantic_duplicate||0)+1;continue}keep.push(o)
}
offers=keep.sort((a,b)=>String(a.key).localeCompare(String(b.key),'de')||Number(!!b.bio)-Number(!!a.bio)||+a.unit-+b.unit);offers.forEach((o,i)=>o.id=i+1);

const counts=new Map();for(const o of offers)counts.set(`${o.store}|${o.market}`,(counts.get(`${o.store}|${o.market}`)||0)+1);
for(const s of data.sources||[]){const count=counts.get(`${s.store}|${s.market}`)||0;s.count=count;if(count>0){s.status='ok';s.message=`${count} qualitätsgeprüfte Angebote`;}else if(s.status==='ok'){s.status='no_data';s.message='Keine Angebote nach strenger Qualitätsprüfung.'}}
data.offers=offers;data.offerCount=offers.length;data.qualityV2={sanitizedAt:new Date().toISOString(),before,after:offers.length,rejected:before-offers.length,rejectedReasons:rejected};
const report={...previous,finalPass:{generatedAt:new Date().toISOString(),before,after:offers.length,rejected:before-offers.length,rejectedReasons:rejected,rejectedExamples:examples}};
await Promise.all([fs.writeFile(file,JSON.stringify(data,null,2)+'\n'),fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n')]);
console.log(`Qualität V2: ${before} -> ${offers.length}; ${before-offers.length} weitere Einträge entfernt.`);
