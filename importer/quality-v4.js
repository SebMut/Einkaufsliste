import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const livePath=path.join(ROOT,'data/offers-live.json');
const reportPath=path.join(ROOT,'data/quality-report.json');
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const report=JSON.parse(await fs.readFile(reportPath,'utf8').catch(()=>('{}'));
const before=(live.offers||[]).length;
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const ICONS={'Baby & Kleinkind':'👶','Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};

function category(n,store,old){
 const x=` ${n.toLowerCase()} `;
 if((store==='dm'||store==='ROSSMANN')&&/baby|babylove|babydream|pampers|windel|pants|feuchttücher|schnuller|säugling|beikost|anfangsmilch|folgemilch|kindermilch|\bpre\b|brei|wickel|flaschen|sauger|watte|sonnenspray/.test(x))return'Baby & Kleinkind';
 if(/mineralwasser|\bwasser\b|coca.?cola|\bcola\b|\bfanta\b|\bsprite\b|\bpepsi\b|\bmezzo\b|\bsaft\b|nektar|smoothie|\bbier\b|\bpils\b|\bwein\b|\bsekt\b|prosecco|\bwhisky\b|\bwhiskey\b|\bgin\b|\brum\b|energy.?drink|haferdrink|eistee|powerade|active o2/.test(x))return'Getränke';
 if(/banane|\bapfel\b|äpfel|zwetsch|pflaum|tomat|paprika|gurke|kartoff|beeren|himbeer|heidelbeer|erdbeer|traube|avocado|kiwi|mango|melon|salat|broccoli|nektarin|pfirsich|gemüse|obst/.test(x))return'Obst & Gemüse';
 if(/\bmilch\b|butter|joghurt|yoghurt|kefir|quark|käse|gouda|mozzarella|pudding|skyr|frischkäse|philadelphia|schnittkäse|weichkäse|hartkäse/.test(x))return'Milchprodukte';
 if(/hack|rind|schwein|hähn|pute|lamm|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|braten|fleisch|aufschnitt/.test(x))return'Fleisch & Fisch';
 if(/kaffee|espresso|\btee\b|müsli|cerealien|\beier\b|marmelade|konfitüre|honig|cappuccino|kakao/.test(x))return'Kaffee & Frühstück';
 if(/nudel|pasta|\breis\b|mehl|zucker|\böl\b|sauce|pesto|hummus|oliven|bohnen|mayonnaise|senf|ketchup|nutella/.test(x))return'Vorrat';
 if(/pizza|flammkuchen|pinsa|pommes|tiefgefroren|speiseeis|eisgenuss|ben\s*&\s*jerry/.test(x))return'Tiefkühl';
 if(/schokolade|riegel|haribo|fruchtgummi|chips|snack|keks|bonbon|lindt|storck|pringles/.test(x))return'Süßes & Snacks';
 if(/\bbrot\b|brötchen|semmel|breze|baguette|croissant|wasa/.test(x))return'Backwaren';
 return old&&ICONS[old]?old:'Lebensmittel';
}
function key(n){for(const[k,r]of [['Windeln',/windel|pants/i],['Babymilch',/anfangsmilch|folgemilch|kindermilch|\bpre\b/i],['Babybrei',/brei/i],['Butter',/butter/i],['Milch',/\bmilch\b/i],['Eier',/\beier\b/i],['Äpfel',/äpfel|\bapfel\b/i],['Beeren',/beeren|himbeer|heidelbeer|erdbeer/i],['Tomaten',/tomat/i],['Kartoffeln',/kartoff/i],['Hackfleisch',/hack/i],['Hähnchen',/hähn/i],['Rindfleisch',/rind|entrecôte|steak/i],['Schweinefleisch',/schwein|schnitzel/i],['Lachs',/lachs/i],['Joghurt',/joghurt/i],['Käse',/käse|gouda|mozzarella|philadelphia/i],['Kaffee',/kaffee|espresso/i],['Nudeln',/nudel|pasta/i],['Pizza',/pizza|flammkuchen/i],['Brot',/\bbrot\b/i],['Wurst',/wurst|salami|schinken/i],['Mineralwasser',/mineralwasser/i],['Cola',/\bcola\b|coca.?cola|fanta|sprite/i],['Bier',/\bbier\b|pils/i],['Saft',/\bsaft\b|nektar/i]])if(r.test(n))return k;return n.replace(/\bbio\b/ig,'').slice(0,55)}
function dedupePrefix(name){const words=norm(name).split(' ');for(let k=2;k<=Math.min(8,Math.floor(words.length/2));k++){const a=words.slice(0,k).join(' ').toLowerCase(),b=words.slice(k,2*k).join(' ').toLowerCase();if(a===b)return norm(words.slice(0,k).concat(words.slice(2*k)).join(' '))}return norm(name)}
function quantity(size=''){let m=norm(size).match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=Number(m[1])*Number(m[2].replace(',','.')),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':'l'}}m=norm(size).match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);if(!m)return null;let q=Number(m[1].replace(',','.')),u=m[2].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':u==='l'||u==='ml'?'l':'st'}}
function recalc(o){const q=quantity(o.size);if(!q||!Number.isFinite(+o.price)||q.q<=0)return; o.unit=+(+o.price/q.q).toFixed(3);o.unitLabel=q.type==='kg'?'€/kg':q.type==='l'?'€/l':'€/Stk.'}

let repaired=0;const rows=[];
for(const raw of live.offers||[]){const o={...raw};let name=norm(o.name);
 const repeated=dedupePrefix(name);if(repeated!==name){name=repeated;repaired++}
 // Kaufland schreibt z.B. „je 4 St. = 240-g-Packg.“. Für Preisvergleiche zählt das Gesamtgewicht.
 const total=name.match(/\bje\s+\d+\s*St\.?\s*=\s*(\d+(?:[.,]\d+)?)\s*-?\s*g-?Packg\.?/i);
 if(total){o.size=`${total[1]} g`;name=norm(name.replace(total[0],''));repaired++;recalc(o)}
 name=name.replace(/\s+je\s+\d+\s*St\.?\s*=\s*\d+(?:[.,]\d+)?\s*-?\s*g-?Packg\.?/i,'').replace(/[,*]+$/,'').trim();
 o.name=name;o.cat=category(name,o.store,o.cat);o.icon=ICONS[o.cat]||'🛒';o.key=key(name);o.bio=/\bbio\b|bioland|naturland|demeter|öko-/i.test(name);
 rows.push(o)}
const unique=new Map();for(const o of rows){const k=[o.store,o.market,o.name.toLowerCase(),String(o.size).toLowerCase(),+o.price,!!o.app,!!o.coupon].join('|');if(!unique.has(k))unique.set(k,o)}
const offers=[...unique.values()].sort((a,b)=>String(a.key).localeCompare(String(b.key),'de')||Number(!!b.bio)-Number(!!a.bio)||+a.unit-+b.unit);offers.forEach((o,i)=>o.id=i+1);
const counts=new Map();for(const o of offers)counts.set(`${o.store}|${o.market}`,(counts.get(`${o.store}|${o.market}`)||0)+1);for(const s of live.sources||[]){const c=counts.get(`${s.store}|${s.market}`)||0;s.count=c;if(c>0){s.status='ok';s.message=`${c} qualitätsgeprüfte Angebote`;}}
live.offers=offers;live.offerCount=offers.length;live.qualityV4={at:new Date().toISOString(),before,after:offers.length,repaired};report.semanticPass={at:new Date().toISOString(),before,after:offers.length,repaired};await Promise.all([fs.writeFile(livePath,JSON.stringify(live,null,2)+'\n'),fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n')]);console.log(`Qualität V4: ${before} -> ${offers.length}; ${repaired} semantische Reparaturen.`);
