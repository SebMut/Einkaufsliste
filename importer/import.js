import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const markets = JSON.parse(await fs.readFile(path.join(ROOT, 'data/markets.json'), 'utf8'));
const generatedAt = new Date().toISOString();

const KEY_RULES = [
  ['Butter', /\bbutter\b/i], ['Milch', /\b(vollmilch|frischmilch|h-?milch|milch\s*\d)/i],
  ['Eier', /\beier\b/i], ['Bananen', /\bbananen?\b/i], ['Äpfel', /\bäpfel|apfel\b/i],
  ['Tomaten', /\btomaten?|rispentomaten|cherrytomaten\b/i], ['Paprika', /\bpaprika\b/i],
  ['Gurken', /\bgurken?|salatgurke\b/i], ['Kartoffeln', /\bkartoffeln?\b/i], ['Zwiebeln', /\bzwiebeln?\b/i],
  ['Karotten', /\bkarotten?|möhren\b/i], ['Hackfleisch', /\bhackfleisch|rinderhack|schweinehack\b/i],
  ['Hähnchen', /\bhähnchen|huhn|chicken\b/i], ['Rindfleisch', /\brind(?:er)?|jungbullen|steak\b/i],
  ['Schweinefleisch', /\bschwein|nackensteak|schnitzel\b/i], ['Lachs', /\blachs\b/i], ['Fisch', /\bfisch|dorade|rotbarsch|forelle\b/i],
  ['Joghurt', /\bjoghurt|yoghurt|kefir\b/i], ['Quark', /\bquark\b/i], ['Käse', /\bkäse|gouda|emmentaler|mozzarella|frischkäse\b/i],
  ['Kaffee', /\bkaffee|caff[eè]|espresso\b/i], ['Tee', /\btee\b/i], ['Haferflocken', /\bhaferflocken\b/i], ['Müsli', /\bmüsli|granola\b/i],
  ['Nudeln', /\bnudeln|pasta|spaghetti|penne\b/i], ['Reis', /\breis\b/i], ['Mehl', /\bmehl\b/i], ['Zucker', /\bzucker\b/i],
  ['Öl', /\böl|olivenöl|rapsöl|sonnenblumenöl\b/i], ['Pizza', /\bpizza\b/i], ['Pommes', /\bpommes\b/i],
  ['Brot', /\bbrot\b/i], ['Brötchen', /\bbrötchen|semmel\b/i], ['Wurst', /\bwurst|salami|schinken\b/i],
  ['Mineralwasser', /\bmineralwasser|wasser\s+(?:medium|still|classic)\b/i], ['Saft', /\bsaft|orangensaft|apfelsaft\b/i],
  ['Cola', /\bcola|coca-cola|pepsi\b/i], ['Bier', /\bbier|pils|helles|weißbier\b/i],
  ['Schokolade', /\bschokolade|schoko\b/i], ['Chips', /\bchips|nicnac|snack\b/i], ['Eis', /\beiscreme|speiseeis\b/i]
];

const CAT_RULES = [
  ['Obst & Gemüse', /banane|apfel|äpfel|tomat|paprika|gurke|kartoff|zwiebel|karotte|beeren|trauben|melone|pfirsich|nektarin|avocado|mais/i],
  ['Milchprodukte', /milch|butter|joghurt|yoghurt|kefir|quark|käse|gouda|mozzarella|frischkäse|sahne/i],
  ['Fleisch & Fisch', /hack|rind|schwein|hähnchen|pute|wurst|salami|schinken|lachs|fisch|dorade|steak|schnitzel/i],
  ['Kaffee & Frühstück', /kaffee|caff|espresso|tee|haferflocken|müsli|cornflakes|marmelade|honig|eier/i],
  ['Vorrat', /nudeln|pasta|spaghetti|penne|reis|mehl|zucker|öl|konserve|sauce|pesto/i],
  ['Tiefkühl', /tiefkühl|pizza|pommes|eiscreme|speiseeis|gefroren/i],
  ['Getränke', /wasser|cola|saft|limonade|bier|wein|sekt|drink/i],
  ['Süßes & Snacks', /schokolade|keks|chips|snack|bonbon|gummibär|fruchtgummi/i],
  ['Backwaren', /brot|brötchen|semmel|baguette|croissant|breze/i]
];

const ICONS = {
  'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕',
  'Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'
};

const NON_FOOD = /werkzeug|akku|shirt|hose|socke|kleid|möbel|lampe|spielzeug|garten|bett|handtuch|elektr|bohrer|schraub|pfanne|topf|geschirr|kosmetik|shampoo|windel|tierbedarf|katzen|hunde|reiniger|waschmittel|duschgel|küchentücher|ersatzklingen/i;
const FOOD_HINT = /kg|\bg\b|liter|\bl\b|ml|stück|pack|becher|flasche|dose|obst|gemüse|fleisch|fisch|milch|käse|butter|joghurt|kefir|kaffee|nudel|reis|brot|wurst|getränk|bio|schokolade|chips|eier|pizza/i;

function norm(s='') {
  return String(s).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').trim();
}
function num(s) {
  let t=String(s).trim().replace(/\s/g,'').replace(/[*€]/g,'');
  if(t.includes(',') && t.includes('.')) {
    if(t.lastIndexOf(',') > t.lastIndexOf('.')) t=t.replace(/\./g,'').replace(',','.');
    else t=t.replace(/,/g,'');
  } else if(t.includes(',')) t=t.replace(',','.');
  return Number(t);
}
function canonicalKey(text,name) {
  for(const [k,r] of KEY_RULES) if(r.test(text)) return k;
  return name.replace(/\b(bio|aktion|knaller|superknüller|neu|versch(?:iedene)?\.?\s*sorten|je|packung)\b/ig,'').replace(/\s+/g,' ').trim().slice(0,55);
}
function category(text) {
  for(const [k,r] of CAT_RULES) if(r.test(text)) return k;
  return 'Lebensmittel';
}
function isBio(text) {
  return /\bbio\b|bioland|naturland|demeter|ökologisch|öko-/i.test(text);
}
function isFood(text) {
  if(NON_FOOD.test(text)) return false;
  if(FOOD_HINT.test(text)) return true;
  return KEY_RULES.some(([,r])=>r.test(text));
}
function extractSize(text) {
  const t=norm(text);
  const m=t.match(/(?:je\s+)?((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.|er-Pack|Pckg\.?|Packg\.?|Btl\.?|Becher|Dose|Fl\.?))/i);
  return m ? m[1].replace(/\s+/g,' ') : '';
}
function basePrice(text) {
  const t=norm(text);
  let m=t.match(/(?:1\s*)?(kg|l|Stück|St\.)\s*(?:=|:)\s*(\d+[.,]\d{2})/i);
  if(m) return {unit:num(m[2]),label:/kg/i.test(m[1])?'€/kg':/l/i.test(m[1])?'€/l':'€/Stk.'};
  m=t.match(/(\d+[.,]\d{2})\s*(?:€\s*)?[\/ ]\s*(kg|l|Stk\.?|Stück)/i);
  if(m) return {unit:num(m[1]),label:/kg/i.test(m[2])?'€/kg':/l/i.test(m[2])?'€/l':'€/Stk.'};
  return null;
}
function deriveBase(price,size) {
  if(!size) return {unit:price,label:'€/Packung'};
  let m=size.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)/i);
  if(m) {
    let q=num(m[1])*num(m[2]),u=m[3].toLowerCase();
    if(u==='g') return {unit:price/(q/1000),label:'€/kg'};
    if(u==='kg') return {unit:price/q,label:'€/kg'};
    if(u==='ml') return {unit:price/(q/1000),label:'€/l'};
    return {unit:price/q,label:'€/l'};
  }
  m=size.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.)/i);
  if(!m) return {unit:price,label:'€/Packung'};
  let q=num(m[1]),u=m[2].toLowerCase();
  if(u==='g') return {unit:price/(q/1000),label:'€/kg'};
  if(u==='kg') return {unit:price/q,label:'€/kg'};
  if(u==='ml') return {unit:price/(q/1000),label:'€/l'};
  if(u==='l') return {unit:price/q,label:'€/l'};
  return {unit:price/q,label:'€/Stk.'};
}
function cleanTitle(s='') {
  return norm(s)
    .replace(/^Angebot:\s*/i,'')
    .replace(/^(KNÜLLER|AKTION|SUPERKNÜLLER)\s+/i,'')
    .replace(/\s+je\s+.*$/i,'')
    .replace(/\s+(?:-|–)\d+%.*$/,'')
    .trim().slice(0,125);
}
function titleFromWindow(lines, idx, fallback='') {
  const skip=/^(image|filiale|aktion|knaller|superknüller|angebot|angebote|zu den angeboten|gültig|statt|uvp|app-preis|festpreis|grundpreis|preis vorwoche|spare|nur|mit kaufland card|tag:)/i;
  for(let i=idx;i>=Math.max(0,idx-9);i--) {
    const l=norm(lines[i]||'');
    if(!l || l.length<3 || l.length>150 || skip.test(l) || NON_FOOD.test(l)) continue;
    if(/^\d+[.,]\d{2}\s*[€*]?$/.test(l)) continue;
    if(/[A-Za-zÄÖÜäöüß]/.test(l) && isFood(l + ' ' + fallback)) return cleanTitle(l);
  }
  return cleanTitle(fallback);
}
function makeOffer(source,text,name,price,type='regular') {
  text=norm(text); name=cleanTitle(name);
  if(!name || !Number.isFinite(price) || price<=0.05 || price>=300 || !isFood(`${name} ${text}`)) return null;
  const size=extractSize(text);
  const bp=basePrice(text)||deriveBase(price,size);
  const cat=category(`${name} ${text}`);
  return {
    key:canonicalKey(`${name} ${text}`,name),name,store:source.store,market:source.market,address:source.address,cat,
    size:size||'Packung',price:+price.toFixed(2),unit:+bp.unit.toFixed(3),unitLabel:bp.label,icon:ICONS[cat]||'🛒',
    bio:isBio(`${name} ${text}`),app:type==='app',coupon:/coupon|kaufland card xtra|xtra rabatt/i.test(text),
    sourceUrl:source.url,sourceScope:source.scope,importedAt:generatedAt
  };
}
function addOffer(out,source,text,name,price,type='regular') {
  const o=makeOffer(source,text,name,price,type); if(o) out.push(o);
}
function dedupe(arr) {
  const map=new Map();
  for(const o of arr) {
    if(!o || !Number.isFinite(o.price) || !o.name) continue;
    const k=[o.store,o.market,o.name.toLowerCase(),o.size,o.price,o.app,o.coupon].join('|');
    if(!map.has(k)) map.set(k,o);
  }
  return [...map.values()];
}

function parseHeadingCards(source, headingCards) {
  const out=[];
  for(const card of headingCards) {
    const text=norm(card.text), title=cleanTitle(card.title);
    if(!title || !isFood(`${title} ${text}`)) continue;
    let m=text.match(/Festpreis von\s*(\d+[.,]\d{2})\s*€/i);
    if(m) addOffer(out,source,text,title,num(m[1]));
    else if((m=text.match(/(?:^|\n)(\d+[.,]\d{2})\s*€(?:\n|$)/m))) addOffer(out,source,text,title,num(m[1]));
    else if((m=text.match(/\bnur\s*(\d+[.,]\d{2})\b/i))) addOffer(out,source,text,title,num(m[1]));
    else if((m=text.match(/(?:statt|UVP)\s*(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\*?/i))) addOffer(out,source,text,title,num(m[2]));
    const app=text.match(/App-?Preis(?:\s+von)?\s*(\d+[.,]\d{2})\s*€/i);
    if(app) addOffer(out,source,text,title,num(app[1]),'app');
    const xtra=text.match(/Mit Kaufland Card XTRA[\s\S]{0,30}?(?:nur\s*)?(\d+[.,]\d{2})/i);
    if(xtra) addOffer(out,source,text,title,num(xtra[1]),'app');
  }
  return out;
}

function parseRewe(source,body,headingCards) {
  const out=parseHeadingCards(source,headingCards);
  const lines=norm(body).split('\n');
  for(let i=0;i<lines.length;i++) {
    const m=lines[i].match(/^(\d+[.,]\d{2})\s*€$/);
    if(!m) continue;
    const block=lines.slice(Math.max(0,i-7),Math.min(lines.length,i+3)).join('\n');
    if(/(?:1\s*(?:kg|l)\s*=|Pfand)/i.test(lines[i-1]||'')) continue;
    const title=titleFromWindow(lines,i-1,block);
    addOffer(out,source,block,title,num(m[1]));
  }
  return out;
}

function parseEdeka(source,body,headingCards) {
  const out=parseHeadingCards(source,headingCards);
  const lines=norm(body).split('\n');
  for(let i=0;i<lines.length;i++) {
    const reg=lines[i].match(/Festpreis von\s*(\d+[.,]\d{2})\s*€/i);
    if(reg) {
      const block=lines.slice(Math.max(0,i-10),Math.min(lines.length,i+7)).join('\n');
      const title=titleFromWindow(lines,i-1,block);
      addOffer(out,source,block,title,num(reg[1]));
      const app=block.match(/App-?Preis(?:\s+von)?\s*(\d+[.,]\d{2})\s*€/i);
      if(app) addOffer(out,source,block,title,num(app[1]),'app');
    }
  }
  return out;
}

function parseNetto(source,body,headingCards) {
  const out=parseHeadingCards(source,headingCards);
  const lines=norm(body).split('\n');
  for(let i=0;i<lines.length;i++) {
    const m=lines[i].match(/(?:statt|UVP)\s*(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\*?/i);
    if(!m) continue;
    const block=lines.slice(Math.max(0,i-7),Math.min(lines.length,i+3)).join('\n');
    const title=titleFromWindow(lines,i-1,block);
    addOffer(out,source,block,title,num(m[2]));
  }
  return out;
}

function parseNorma(source,body,headingCards) {
  const out=parseHeadingCards(source,headingCards);
  const lines=norm(body).split('\n');
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    let m=line.match(/^(.{3,180}?)\s+(\d+[.,]\d{2})\*?$/);
    if(m && isFood(m[1])) {
      addOffer(out,source,line,cleanTitle(m[1]),num(m[2]));
      continue;
    }
    m=line.match(/(\d+[.,]\d{2})\*$/);
    if(m) {
      const block=lines.slice(Math.max(0,i-5),i+1).join('\n');
      const title=titleFromWindow(lines,i-1,block);
      addOffer(out,source,block,title,num(m[1]));
    }
  }
  return out;
}

function parseKaufland(source,body,headingCards) {
  const out=parseHeadingCards(source,headingCards);
  const lines=norm(body).split('\n');
  for(const line of lines) {
    if(!isFood(line)) continue;
    let m=line.match(/^(.*?)(?:-\d+%)\s*(\d+[.,]\d{2})\s+(\d+[.,]\d{2})(?:\s|$)/);
    if(m) {
      addOffer(out,source,line,cleanTitle(m[1]),num(m[2]));
      continue;
    }
    m=line.match(/^(.*?)\bnur\s*(\d+[.,]\d{2})(?:\s|$)/i);
    if(m) {
      const title=cleanTitle(m[1]);
      addOffer(out,source,line,title,num(m[2]));
      const xtra=line.match(/Mit Kaufland Card XTRA[\s\S]*?nur\s*(\d+[.,]\d{2})/i);
      if(xtra) addOffer(out,source,line,title,num(xtra[1]),'app');
    }
  }
  return out;
}

function parseGeneric(source,body,headingCards,cards) {
  const out=parseHeadingCards(source,headingCards);
  const blocks=[...cards];
  for(const text of blocks) {
    const t=norm(text); if(!isFood(t)) continue;
    let title=cleanTitle(t.split('\n').find(x=>/[A-Za-zÄÖÜäöüß]/.test(x))||'');
    let m=t.match(/(?:^|\n)(\d+[.,]\d{2})\s*€(?:\n|$)/m);
    if(m) addOffer(out,source,t,title,num(m[1]));
    else if((m=t.match(/\bnur\s*(\d+[.,]\d{2})\b/i))) addOffer(out,source,t,title,num(m[1]));
  }
  return out;
}

function parseByStore(source,body,headingCards,cards) {
  switch(source.store) {
    case 'REWE': return parseRewe(source,body,headingCards);
    case 'EDEKA': return parseEdeka(source,body,headingCards);
    case 'Netto': return parseNetto(source,body,headingCards);
    case 'NORMA': return parseNorma(source,body,headingCards);
    case 'Kaufland': return parseKaufland(source,body,headingCards);
    default: return parseGeneric(source,body,headingCards,cards);
  }
}

async function scrape(browser,source) {
  const context=await browser.newContext({
    locale:'de-DE',timezoneId:'Europe/Berlin',
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
  });
  const page=await context.newPage();
  try {
    await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(3500);
    const body=await page.locator('body').innerText({timeout:12000});
    const extracted=await page.evaluate(()=>{
      const cardSel='article,li,[class*="offer" i],[class*="product" i],[class*="tile" i],[class*="card" i]';
      const cards=[...document.querySelectorAll(cardSel)].map(e=>e.innerText||'').filter(t=>t.length>20&&t.length<1800);
      const headingCards=[];
      for(const h of document.querySelectorAll('h2,h3,h4,h5')) {
        const title=(h.innerText||'').trim();
        if(title.length<3) continue;
        let p=h;
        for(let depth=0;depth<5 && p;depth++,p=p.parentElement) {
          const text=(p.innerText||'').trim();
          if(text.length>=title.length+4 && text.length<2200) {
            headingCards.push({title,text});
            break;
          }
        }
      }
      return {cards,headingCards};
    });
    let offers=parseByStore(source,body,extracted.headingCards,extracted.cards);
    offers=dedupe(offers).filter(o=>isFood(`${o.name} ${o.size} ${o.cat}`));
    if(offers.length>180) offers=offers.slice(0,180);
    return {
      offers,status:offers.length?'ok':'no_data',
      message:offers.length?`${offers.length} Angebote importiert`:'Seite erreichbar, aber keine strukturierten Lebensmittelangebote erkannt'
    };
  } catch(e) {
    return {offers:[],status:'error',message:String(e.message||e).slice(0,260)};
  } finally {
    await context.close();
  }
}

const browser=await chromium.launch({headless:true});
const all=[],statuses=[];
for(const source of markets.sources) {
  console.log(`Importiere ${source.store} ${source.market} ...`);
  const r=await scrape(browser,source);
  all.push(...r.offers);
  statuses.push({...source,status:r.status,count:r.offers.length,message:r.message});
  console.log(`${source.store}: ${r.status}, ${r.offers.length}`);
}
await browser.close();

const offers=dedupe(all)
  .sort((a,b)=>a.key.localeCompare(b.key,'de')||Number(b.bio)-Number(a.bio)||a.unit-b.unit)
  .map((o,i)=>({id:i+1,...o}));

const result={
  schema:2,generatedAt,center:markets.center,nearbyMarkets:markets.nearbyMarkets,
  sources:statuses,offerCount:offers.length,offers
};
await fs.writeFile(path.join(ROOT,'data/offers-live.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Fertig: ${offers.length} Live-Angebote aus ${statuses.filter(x=>x.status==='ok').length}/${statuses.length} Quellen.`);
if(!offers.length) console.warn('Keine Angebote erkannt; Statusdatei wird trotzdem veröffentlicht.');
