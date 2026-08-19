import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const markets = JSON.parse(await fs.readFile(path.join(ROOT, 'data/markets.json'), 'utf8'));
const generatedAt = new Date().toISOString();

const KEY_RULES = [
  ['Butter', /\bbutter\b/i], ['Milch', /\b(vollmilch|frischmilch|h-?milch|milch\s*3[,\.]?[58]?\s*%?)\b/i],
  ['Eier', /\beier\b|\bei\s*(?:m|l|xl)\b/i], ['Bananen', /\bbananen?\b/i], ['Äpfel', /\bäpfel|apfel\b/i],
  ['Tomaten', /\btomaten?|rispentomaten|cherrytomaten\b/i], ['Paprika', /\bpaprika\b/i], ['Gurken', /\bgurken?|salatgurke\b/i],
  ['Kartoffeln', /\bkartoffeln?\b/i], ['Zwiebeln', /\bzwiebeln?\b/i], ['Karotten', /\bkarotten?|möhren\b/i],
  ['Hackfleisch', /\bhackfleisch|rinderhack|schweinehack\b/i], ['Hähnchen', /\bhähnchen|huhn|chicken\b/i], ['Rindfleisch', /\brind(?:er)?|jungbullen|steak\b/i],
  ['Schweinefleisch', /\bschwein|nackensteak|schnitzel\b/i], ['Lachs', /\blachs\b/i], ['Fisch', /\bfisch|dorade|rotbarsch|forelle\b/i],
  ['Joghurt', /\bjoghurt|yoghurt\b/i], ['Quark', /\bquark\b/i], ['Käse', /\bkäse|gouda|emmentaler|mozzarella|frischkäse\b/i],
  ['Kaffee', /\bkaffee|caff[eè]|espresso\b/i], ['Tee', /\btee\b/i], ['Haferflocken', /\bhaferflocken\b/i], ['Müsli', /\bmüsli|granola\b/i],
  ['Nudeln', /\bnudeln|pasta|spaghetti|penne\b/i], ['Reis', /\breis\b/i], ['Mehl', /\bmehl\b/i], ['Zucker', /\bzucker\b/i],
  ['Öl', /\böl|olivenöl|rapsöl|sonnenblumenöl\b/i], ['Pizza', /\bpizza\b/i], ['Pommes', /\bpommes\b/i],
  ['Brot', /\bbrot\b/i], ['Brötchen', /\bbrötchen|semmel\b/i], ['Wurst', /\bwurst|salami|schinken\b/i],
  ['Mineralwasser', /\bmineralwasser|wasser\s+(?:medium|still|classic)\b/i], ['Saft', /\bsaft|orangensaft|apfelsaft\b/i],
  ['Cola', /\bcola|coca-cola|pepsi\b/i], ['Bier', /\bbier|pils|helles|weißbier\b/i],
  ['Schokolade', /\bschokolade|schoko\b/i], ['Chips', /\bchips|nicnac|snack\b/i], ['Eis', /\beiscreme|speiseeis\b/i]
];
const CAT_RULES = [
  ['Obst & Gemüse', /banane|apfel|äpfel|tomat|paprika|gurke|kartoff|zwiebel|karotte|beeren|heidelbeer|himbeer|trauben|melone|pfirsich|nektarin|avocado|mais/i],
  ['Milchprodukte', /milch|butter|joghurt|yoghurt|quark|käse|gouda|mozzarella|frischkäse|sahne/i],
  ['Fleisch & Fisch', /hack|rind|schwein|hähnchen|pute|wurst|salami|schinken|lachs|fisch|dorade|steak|schnitzel/i],
  ['Kaffee & Frühstück', /kaffee|caff|espresso|tee|haferflocken|müsli|cornflakes|marmelade|honig|eier/i],
  ['Vorrat', /nudeln|pasta|spaghetti|penne|reis|mehl|zucker|öl|konserve|sauce|pesto/i],
  ['Tiefkühl', /tiefkühl|pizza|pommes|eiscreme|speiseeis/i],
  ['Getränke', /wasser|cola|saft|limonade|bier|wein|sekt|drink/i],
  ['Süßes & Snacks', /schokolade|keks|chips|snack|bonbon|gummibär/i],
  ['Backwaren', /brot|brötchen|semmel|baguette|croissant/i]
];
const ICONS = {'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};
const NON_FOOD = /werkzeug|akku|shirt|hose|socke|kleid|möbel|lampe|spielzeug|garten|bett|handtuch|elektr|bohrer|schraub|pfanne|topf|geschirr|kosmetik|shampoo|windel|tierbedarf|katzen|hunde|reiniger|waschmittel/i;
const FOOD_HINT = /kg|\bg\b|liter|\bl\b|ml|stück|packung|becher|flasche|dose|obst|gemüse|fleisch|fisch|milch|käse|butter|joghurt|kaffee|nudel|reis|brot|wurst|getränk|bio/i;

function norm(s=''){return s.replace(/\u00a0/g,' ').replace(/(\d+)\s*[.]\s*(\d{2})(?=\D|$)/g,'$1.$2').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').trim()}
function num(s){let t=String(s).trim().replace(/\s/g,'');if(t.includes(',')&&t.includes('.')){if(t.lastIndexOf(',')>t.lastIndexOf('.'))t=t.replace(/\./g,'').replace(',','.');else t=t.replace(/,/g,'')}else if(t.includes(','))t=t.replace(',','.');return Number(t)}
function canonicalKey(text,name){for(const [k,r] of KEY_RULES) if(r.test(text)) return k; return name.replace(/\b(bio|aktion|neu|versch(?:iedene)?\.?\s*sorten|je|packung)\b/ig,'').replace(/\s+/g,' ').trim().slice(0,55)}
function category(text){for(const [k,r] of CAT_RULES) if(r.test(text)) return k; return 'Lebensmittel'}
function isBio(text){return /\bbio\b|bioland|naturland|demeter|ökologisch|öko-/i.test(text)}
function priceCandidates(text){
  const t=norm(text), out=[];
  const push=(v,type='regular')=>{v=num(v);if(v>0.05&&v<300)out.push({value:v,type})};
  for(const m of t.matchAll(/App-?preis\s*(?:von\s*)?(\d+[.,]\d{2})/gi)) push(m[1],'app');
  for(const m of t.matchAll(/(?:Angebotspreis|Festpreis von|Aktionspreis)\s*(\d+[.,]\d{2})/gi)) push(m[1],'regular');
  for(const m of t.matchAll(/(?:statt|UVP|Preis Vorwoche)[^\n]{0,18}?(\d+[.,]\d{2})/gi)) out.push({value:num(m[1]),type:'old'});
  for(const m of t.matchAll(/(\d+[.,]\d{2})\s*\*?\s*€/g)) push(m[1],'regular');
  return out;
}
function extractSize(text){
  const t=norm(text);
  const m=t.match(/(?:je\s+)?((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.|er-Pack))/i);
  return m?m[1].replace(/\s+/g,' '):'';
}
function basePrice(text){
  const t=norm(text);
  let m=t.match(/(?:1\s*)?(kg|l|Stück|St\.)\s*(?:=|:)\s*(\d+[.,]\d{2})/i);
  if(m)return{unit:num(m[2]),label:/kg/i.test(m[1])?'€/kg':/l/i.test(m[1])?'€/l':'€/Stk.'};
  m=t.match(/(\d+[.,]\d{2})\s*(?:€\s*)?[\/ ]\s*(kg|l|Stk\.?|Stück)/i);
  if(m)return{unit:num(m[1]),label:/kg/i.test(m[2])?'€/kg':/l/i.test(m[2])?'€/l':'€/Stk.'};
  return null;
}
function deriveBase(price,size){
  if(!size)return{unit:price,label:'€/Packung'};
  let m=size.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)/i);
  if(m){let q=num(m[1])*num(m[2]),u=m[3].toLowerCase();if(u==='g')return{unit:price/(q/1000),label:'€/kg'};if(u==='kg')return{unit:price/q,label:'€/kg'};if(u==='ml')return{unit:price/(q/1000),label:'€/l'};return{unit:price/q,label:'€/l'}}
  m=size.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.)/i);if(!m)return{unit:price,label:'€/Packung'};
  let q=num(m[1]),u=m[2].toLowerCase();if(u==='g')return{unit:price/(q/1000),label:'€/kg'};if(u==='kg')return{unit:price/q,label:'€/kg'};if(u==='ml')return{unit:price/(q/1000),label:'€/l'};if(u==='l')return{unit:price/q,label:'€/l'};return{unit:price/q,label:'€/Stk.'}
}
function titleFrom(text){
  const lines=norm(text).split('\n').map(x=>x.trim()).filter(Boolean);
  const skip=/^(image|filiale|aktion|angebot|top angebote|zu den angeboten|gültig|statt|uvp|app-preis|angebotspreis|preis vorwoche|spare|[-+]?\d+\s*%)/i;
  for(const l of lines){if(l.length<3||l.length>125||skip.test(l)||/^\d+[.,]\d{2}/.test(l)||NON_FOOD.test(l))continue;if(/[a-zA-ZÄÖÜäöüß]/.test(l))return l.replace(/^Angebot:\s*/i,'').trim()}
  return '';
}
function makeOffer(source,text,forcedName=null,forcedPrice=null,forcedType='regular'){
  text=norm(text); if(!text||NON_FOOD.test(text)||!FOOD_HINT.test(text))return null;
  const name=forcedName||titleFrom(text);if(!name||name.length<3)return null;
  let pcs=priceCandidates(text).filter(p=>p.type!=='old');let pc=forcedPrice?{value:forcedPrice,type:forcedType}:pcs.find(p=>p.type==='regular')||pcs[0];if(!pc)return null;
  const size=extractSize(text), bp=basePrice(text)||deriveBase(pc.value,size),cat=category(`${name} ${text}`), key=canonicalKey(`${name} ${text}`,name);
  return {key,name,store:source.store,market:source.market,address:source.address,cat,size:size||'Packung',price:+pc.value.toFixed(2),unit:+bp.unit.toFixed(3),unitLabel:bp.label,icon:ICONS[cat]||'🛒',bio:isBio(`${name} ${text}`),app:pc.type==='app',coupon:/coupon/i.test(text),sourceUrl:source.url,sourceScope:source.scope,importedAt:generatedAt};
}
function candidatesFromBody(text){
  const lines=norm(text).split('\n').filter(Boolean), out=[];
  for(let i=0;i<lines.length;i++) if(/\d+[.,]\d{2}\s*€|App-?preis|Festpreis von|Angebotspreis|\bUVP\b|\bstatt\b/i.test(lines[i])) out.push(lines.slice(Math.max(0,i-5),Math.min(lines.length,i+7)).join('\n'));
  return out;
}
function parseEdeka(source,body){
  const out=[];const re=/Angebot:\s*([^\n]+)([\s\S]{0,900}?)(?=\n\s*(?:Angebot:|### Angebot:)|$)/gi;let m;
  while((m=re.exec(body))){const p=(m[2].match(/Festpreis von\s*(\d+[.,]\d{2})\s*€/i)||[])[1];if(p){const o=makeOffer(source,`${m[1]}\n${m[2]}`,m[1],num(p));if(o)out.push(o)}}return out;
}
function addAppVariants(source,text,base){
  const out=[];if(base)out.push(base);const m=norm(text).match(/App-?preis\s*(\d+[.,]\d{2})/i);if(m&&base){const app={...base,id:undefined,price:num(m[1]),app:true};const bp=basePrice(text)||deriveBase(app.price,app.size);app.unit=+bp.unit.toFixed(3);out.push(app)}return out;
}
function dedupe(arr){const map=new Map();for(const o of arr){if(!o||!Number.isFinite(o.price)||!o.name)continue;const k=[o.store,o.market,o.name.toLowerCase(),o.size,o.price,o.app].join('|');if(!map.has(k))map.set(k,o)}return [...map.values()]}
async function scrape(browser,source){
  const context=await browser.newContext({locale:'de-DE',timezoneId:'Europe/Berlin',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'});const page=await context.newPage();
  try{
    await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(2500);
    const body=await page.locator('body').innerText({timeout:10000});
    const cards=await page.evaluate(()=>{const sels='article,li,[class*="offer" i],[class*="product" i],[class*="tile" i],[class*="card" i]';return [...document.querySelectorAll(sels)].map(e=>e.innerText||'').filter(t=>t.length>20&&t.length<1400)});
    let offers=source.store==='EDEKA'?parseEdeka(source,body):[];
    const blocks=[...cards,...candidatesFromBody(body)];
    for(const b of blocks){const base=makeOffer(source,b);offers.push(...addAppVariants(source,b,base))}
    offers=dedupe(offers).filter(o=>o.cat!=='Lebensmittel'||FOOD_HINT.test(`${o.name} ${o.size}`));
    if(offers.length>120)offers=offers.slice(0,120);
    return {offers,status:offers.length?'ok':'no_data',message:offers.length?`${offers.length} Angebote importiert`:'Seite erreichbar, aber keine strukturierten Lebensmittelangebote erkannt'};
  }catch(e){return{offers:[],status:'error',message:String(e.message||e).slice(0,220)}}finally{await context.close()}
}

const browser=await chromium.launch({headless:true});const all=[],statuses=[];
for(const source of markets.sources){
  console.log(`Importiere ${source.store} ${source.market} ...`);const r=await scrape(browser,source);all.push(...r.offers);statuses.push({...source,status:r.status,count:r.offers.length,message:r.message});console.log(`${source.store}: ${r.status}, ${r.offers.length}`)
}
await browser.close();
const offers=dedupe(all).sort((a,b)=>a.key.localeCompare(b.key,'de')||Number(b.bio)-Number(a.bio)||a.unit-b.unit).map((o,i)=>({id:i+1,...o}));
const result={schema:1,generatedAt,center:markets.center,nearbyMarkets:markets.nearbyMarkets,sources:statuses,offerCount:offers.length,offers};
await fs.writeFile(path.join(ROOT,'data/offers-live.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Fertig: ${offers.length} Live-Angebote aus ${statuses.filter(x=>x.status==='ok').length}/${statuses.length} Quellen.`);
if(!offers.length)console.warn('Keine Angebote erkannt; Statusdatei wird trotzdem veröffentlicht.');
