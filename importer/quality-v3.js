import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const file=path.join(DATA,'offers-live.json');
const reportFile=path.join(DATA,'quality-report.json');
const data=JSON.parse(await fs.readFile(file,'utf8'));
const report=JSON.parse(await fs.readFile(reportFile,'utf8').catch(()=>'{"before":0,"after":0}'));
const before=(data.offers||[]).length;
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();

const BABY=/baby|babylove|babydream|pampers|windel|pants|feuchttücher|wattepad|wattestäbchen|schnuller|säugling|beikost|anfangsmilch|folgemilch|kindermilch|\bpre\b|brei|wickel|flaschen|sauger|sonnenspray|kinder.?snack|fruchtchips|maisstangen|milchpulver/i;
const FOOD=/milch|butter|joghurt|yoghurt|käse|quark|sahne|pudding|skyr|eier|banane|apfel|äpfel|beeren|himbeer|heidelbeer|erdbeer|tomat|paprika|gurke|kartoff|zwiebel|salat|broccoli|avocado|nektarin|pfirsich|traube|gemüse|obst|mango|kiwi|melon|hack|rind|schwein|hähn|pute|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|braten|fleisch|brot|brötchen|semmel|baguette|croissant|breze|nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|pizza|flammkuchen|pommes|kaffee|espresso|müsli|cerealien|marmelade|konfitüre|honig|schokolade|riegel|haribo|chips|snack|keks|bonbon|eis|wasser|cola|fanta|sprite|pepsi|saft|nektar|bier|pils|wein|sekt|prosecco|whisky|gin|rum|energy|drink|nutella|frischkäse|aufschnitt|fruchtgummi|oliven|bohnen|hummus|antipasti|mayonnaise|senf|ketchup|gewürz|tee\b|cappuccino|kakao/i;
const FOOD_BRANDS=/philadelphia|ben\s*&\s*jerry|dr\.?\s*oetker|müller|landliebe|kerrygold|milram|babybel|exquisa|lätta|heinz|lindt|storck|radeberger|desperados|budweiser|barilla|funny-frisch|ritter sport|leerdammer|mövenpick|melitta|dallmayr|nescafé|haribo|kölln|zentis|iglo|greenforce|aoste|herta|bergader|beemster|berief|rotkäppchen|valdo|adelholzener|coca-cola|red bull|pringles|paulaner|nutella|alpro|bebivita|hipp|beba|cerelac/i;
const NONFOOD=/steckdose|steckdosen|powertec|electric|werkzeug|akku|bohrer|schraub|duschgel|shampoo|spülung|waschmittel|duftspüler|geschirrspül|toilettenpapier|küchentücher|rasierer|kosmetik|mascara|parfüm|haarfarbe|socken|shirt|hose|jacke|schuhe|möbel|lampe|leuchte|matratze|bett|pfanne|topf|geschirr|handtuch|tena|schauma|windschutzscheibe|elektrogerät|kabel|mehrfachstecker|verlängerungskabel|batterie|garten|rasen|grillzubehör|katzen|hunde|tierfutter/i;
const UI=/cookie|markt wählen|filiale wählen|filiale finden|zum inhalt|auflistung mit|newsletter|geschäftskunden|services in ihrer filiale|aktuelle filiale|prospekt|mehr anzeigen|zurücksetzen filter|günstigster preis der letzten 30 tage|preis vorwoche$/i;
const ICONS={'Baby & Kleinkind':'👶','Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};

function cleanName(value=''){
 let n=norm(value);
 const meta=n.match(/Marke:\s*([^;]{2,80});\s*Produktname:\s*([^;]{3,180});/i);if(meta)n=`${meta[1]} ${meta[2]}`;
 if(n.includes('###'))n=n.slice(n.lastIndexOf('###')+3);
 n=n
   .replace(/!\[Image\s*\d*:?\s*/gi,'')
   .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
   .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
   .replace(/\]\(https?:\/\/[^)]+\)!?/gi,' ')
   .replace(/https?:\/\/\S+/gi,' ')
   .replace(/\*\*|__|`/g,' ')
   .replace(/^\d{6,}\s+/,'')
   .replace(/^Image\s*\d*:?\s*/i,'')
   .replace(/^(?:AKTION|KNÜLLER|SUPERKNÜLLER|Angebot)\s+/i,'')
   .replace(/[\]})>*!]+\s*$/,'')
   .replace(/\s+/g,' ')
   .trim();
 // Häufig verdoppelt der Alt-Text Marke + Produktname direkt hintereinander.
 const words=n.split(' ');if(words.length>=4){const half=Math.floor(words.length/2);const a=words.slice(0,half).join(' ').toLowerCase(),b=words.slice(half,half*2).join(' ').toLowerCase();if(a===b)n=words.slice(0,half).join(' ')}
 return n;
}
function cat(n,store,old=''){
 if((store==='dm'||store==='ROSSMANN')&&BABY.test(n))return'Baby & Kleinkind';
 if(/wasser|cola|fanta|sprite|pepsi|mezzo|saft|nektar|smoothie|bier|pils|wein|sekt|prosecco|whisky|gin|rum|energy|drink/i.test(n))return'Getränke';
 if(/banane|apfel|äpfel|zwetsch|pflaum|tomat|paprika|gurke|kartoff|beeren|himbeer|heidelbeer|erdbeer|traube|avocado|kiwi|mango|melon|salat|broccoli|nektarin|pfirsich|gemüse|obst/i.test(n))return'Obst & Gemüse';
 if(/milch|butter|joghurt|yoghurt|kefir|quark|käse|gouda|mozzarella|pudding|skyr|frischkäse|philadelphia/i.test(n))return'Milchprodukte';
 if(/hack|rind|schwein|hähn|pute|wurst|salami|schinken|lachs|fisch|garnelen|steak|schnitzel|braten|fleisch|aufschnitt/i.test(n))return'Fleisch & Fisch';
 if(/kaffee|espresso|tee\b|müsli|cerealien|eier|marmelade|konfitüre|honig|cappuccino|kakao/i.test(n))return'Kaffee & Frühstück';
 if(/nudel|pasta|reis|mehl|zucker|öl|sauce|pesto|hummus|oliven|bohnen|mayonnaise|senf|ketchup|nutella/i.test(n))return'Vorrat';
 if(/pizza|flammkuchen|pinsa|pommes|tiefgefroren|speiseeis|ben\s*&\s*jerry/i.test(n))return'Tiefkühl';
 if(/schokolade|riegel|haribo|fruchtgummi|chips|snack|keks|bonbon|lindt|storck/i.test(n))return'Süßes & Snacks';
 if(/brot|brötchen|semmel|breze|baguette|croissant|wasa/i.test(n))return'Backwaren';
 return ICONS[old]?old:'Lebensmittel';
}
function key(n){const r=[['Windeln',/windel|pants/i],['Babymilch',/anfangsmilch|folgemilch|kindermilch|\bpre\b/i],['Babybrei',/brei/i],['Butter',/butter/i],['Milch',/\bmilch\b/i],['Eier',/\beier\b/i],['Äpfel',/äpfel|apfel/i],['Beeren',/beeren|himbeer|heidelbeer|erdbeer/i],['Tomaten',/tomat/i],['Kartoffeln',/kartoff/i],['Hackfleisch',/hack/i],['Hähnchen',/hähn/i],['Rindfleisch',/rind|steak/i],['Schweinefleisch',/schwein|schnitzel/i],['Lachs',/lachs/i],['Joghurt',/joghurt/i],['Käse',/käse|gouda|mozzarella|philadelphia/i],['Kaffee',/kaffee|espresso/i],['Nudeln',/nudel|pasta/i],['Pizza',/pizza|flammkuchen/i],['Brot',/brot/i],['Wurst',/wurst|salami|schinken/i],['Mineralwasser',/mineralwasser/i],['Cola',/cola|fanta|sprite/i],['Bier',/bier|pils/i],['Schokolade',/schokolade|lindt|haribo/i]];for(const[k,x]of r)if(x.test(n))return k;return n.replace(/\bbio\b/ig,'').slice(0,55)}
function isFoodEnough(o,n){if(o.store==='dm'||o.store==='ROSSMANN')return BABY.test(n);if(NONFOOD.test(n))return false;if(FOOD.test(n)||FOOD_BRANDS.test(n))return true;return o.cat&&o.cat!=='Lebensmittel'&&ICONS[o.cat];}
function rejectReason(o,n){if(!n||n.length<3||n.length>150)return'name';if(UI.test(n))return'ui';if(/https?:|\]\(|!\[|###|Image\s*\d/i.test(n))return'markdown';if(NONFOOD.test(n))return'nonfood';if(!isFoodEnough(o,n))return'not_food';if(!Number.isFinite(+o.price)||+o.price<=0.05||+o.price>150)return'price';if(!Number.isFinite(+o.unit)||+o.unit<=0||+o.unit>800)return'unit';if(!/[A-Za-zÄÖÜäöüß]{3}/.test(n))return'letters';return null}

const reasons={},examples=[];let repaired=0;const accepted=[];
for(const raw of data.offers||[]){const o={...raw};const original=norm(o.name);o.name=cleanName(original);if(o.name!==original)repaired++;o.cat=cat(o.name,o.store,o.cat);o.icon=ICONS[o.cat]||'🛒';o.key=key(o.name);o.bio=/\bbio\b|bioland|naturland|demeter|öko-/i.test(original+' '+o.name);const why=rejectReason(o,o.name);if(why){reasons[why]=(reasons[why]||0)+1;if(examples.length<60)examples.push({store:o.store,name:original,cleaned:o.name,reason:why});continue}accepted.push(o)}
const exact=new Map();for(const o of accepted){const k=[o.store,o.market,o.name.toLowerCase(),String(o.size).toLowerCase(),+o.price,!!o.app,!!o.coupon].join('|');if(exact.has(k)){reasons.duplicate=(reasons.duplicate||0)+1;continue}exact.set(k,o)}
const offers=[...exact.values()].sort((a,b)=>String(a.key).localeCompare(String(b.key),'de')||Number(!!b.bio)-Number(!!a.bio)||+a.unit-+b.unit);offers.forEach((o,i)=>o.id=i+1);
const counts=new Map();for(const o of offers)counts.set(`${o.store}|${o.market}`,(counts.get(`${o.store}|${o.market}`)||0)+1);for(const s of data.sources||[]){const c=counts.get(`${s.store}|${s.market}`)||0;s.count=c;if(c>0){s.status='ok';s.message=`${c} streng geprüfte Angebote`;}else if(s.status==='ok'){s.status='no_data';s.message='Keine Lebensmittel nach strenger Qualitätsprüfung.'}}
data.offers=offers;data.offerCount=offers.length;data.qualityV3={sanitizedAt:new Date().toISOString(),before,after:offers.length,rejected:before-offers.length,repaired,reasons};report.strictFoodPass={generatedAt:new Date().toISOString(),before,after:offers.length,rejected:before-offers.length,repaired,reasons,rejectedExamples:examples};await Promise.all([fs.writeFile(file,JSON.stringify(data,null,2)+'\n'),fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n')]);console.log(`Qualität V3: ${before} -> ${offers.length}; ${before-offers.length} verworfen; ${repaired} Namen bereinigt.`);
