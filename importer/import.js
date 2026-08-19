import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const markets = JSON.parse(await fs.readFile(path.join(ROOT, 'data/markets.json'), 'utf8'));
const generatedAt = new Date().toISOString();

const KEY_RULES = [
  ['Windelbeutel', /\bwindelbeutel\b/i],
  ['Windeln', /\bwindeln?\b|windelhose|\bpants\b|pull[- ]?ups?\b/i],
  ['Feuchttücher', /feucht(?:e)?tücher|feuchte waschlappen|wipes\b/i],
  ['Babymilch', /\b(?:pre|anfangs|folge|kinder)milch\b|säuglings(?:anfangs|folge)nahrung|milchnahrung/i],
  ['Babybrei', /\bbabybrei\b|\bbrei\b.*(?:monat|baby|kind)|getreidebrei|milchbrei/i],
  ['Babygläschen', /babygläschen|gläschen|beikost|menü.*monat/i],
  ['Quetschies', /quetsch(?:ie|ies)|fruchtmus/i],
  ['Baby-Snacks', /baby.?snack|kinder.?snack|maisstangen|früchteriegel|kinderkeks/i],
  ['Babypflege', /babypflege|babyöl|babycreme|wundschutz|pflegecreme|babyshampoo|waschgel.*baby|badezusatz.*baby/i],
  ['Schnuller & Flaschen', /schnuller|babyflasche|trinklern|sauger|fläschchen/i],
  ['Wickeln', /wickel(?:unterlage|zubehör)|windelcreme/i],
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

const BABY_HINT = /\bbaby|babylove|babydream|pampers|windel|pants|feuchttücher|wickel|schnuller|fläschchen|babyflasche|säugling|beikost|anfangsmilch|folgemilch|kindermilch|pre\b|babybrei|gläschen|quetsch|kinderkeks|maisstangen|früchteriegel|wundschutz/i;
const FOOD_HINT = /kg|\bg\b|liter|\bl\b|ml|stück|pack|becher|flasche|dose|obst|gemüse|fleisch|fisch|milch|käse|butter|joghurt|kefir|kaffee|nudel|reis|brot|wurst|getränk|bio|schokolade|chips|eier|pizza/i;
const NON_RELEVANT = /werkzeug|akku|shirt|hose|socke|kleid|möbel|lampe|garten|bett|handtuch|bohrer|schraub|pfanne|topf|geschirr|make-?up|mascara|parfüm|haarfarbe|katzen|hunde|waschmittel|küchentücher|ersatzklingen/i;

const CAT_RULES = [
  ['Baby & Kleinkind', BABY_HINT],
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
  'Baby & Kleinkind':'👶','Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩',
  'Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤',
  'Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'
};

function norm(s='') {
  return String(s).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').trim();
}
function num(v) {
  if (typeof v === 'number') return v;
  let t=String(v ?? '').trim().replace(/\s/g,'').replace(/[€*]/g,'');
  if (!t) return NaN;
  if (t.includes(',') && t.includes('.')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t=t.replace(/\./g,'').replace(',','.');
    else t=t.replace(/,/g,'');
  } else if (t.includes(',')) t=t.replace(',','.');
  return Number(t);
}
function canonicalKey(text,name) {
  for (const [k,r] of KEY_RULES) if (r.test(text)) return k;
  return name.replace(/\b(bio|aktion|knaller|superknüller|neu|versch(?:iedene)?\.?\s*sorten|je|packung)\b/ig,'').replace(/\s+/g,' ').trim().slice(0,55);
}
function category(text, source) {
  if (source?.mode === 'baby' && BABY_HINT.test(text)) return 'Baby & Kleinkind';
  for (const [k,r] of CAT_RULES) if (r.test(text)) return k;
  return 'Lebensmittel';
}
function isBio(text) {
  return /\bbio\b|bioland|naturland|demeter|ökologisch|öko-/i.test(text);
}
function isRelevant(text, source) {
  const t=norm(text);
  if (!t) return false;
  if (source?.mode === 'baby') return BABY_HINT.test(t);
  if (NON_RELEVANT.test(t) && !BABY_HINT.test(t)) return false;
  return BABY_HINT.test(t) || FOOD_HINT.test(t) || KEY_RULES.some(([,r])=>r.test(t));
}
function cleanTitle(s='') {
  return norm(s)
    .replace(/^Angebot:\s*/i,'')
    .replace(/^(KNÜLLER|AKTION|SUPERKNÜLLER|NEU)\s+/i,'')
    .replace(/\s+(?:-|–)\d+%.*$/,'')
    .replace(/\s+Artikelpreis.*$/i,'')
    .replace(/\s+Aktueller Artikelpreis.*$/i,'')
    .trim().slice(0,140);
}
function validTitle(name='') {
  const n=cleanTitle(name);
  if (n.length<3 || n.length>140 || !/[A-Za-zÄÖÜäöüß]{3}/.test(n)) return false;
  if (/^(bio|aktion|knaller|superknüller|filiale|angebot|angebote|grundpreis|hinweise|lieferbar|gesponsert|neu)$/i.test(n)) return false;
  if (/^\(?\s*\d+[.,]\d+\s*(?:€|\/|kg|g|l|ml|st)/i.test(n)) return false;
  if (/weitere informationen|verfügbarkeit|bedingungen der coupons|hilfe von ki|datenschutz|rechtliche hinweise|prospekt|newsletter|filiale wählen|anzahl \d/i.test(n)) return false;
  return true;
}
function extractSize(text) {
  const t=norm(text);
  const patterns=[
    /(?:je\s+)?((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?|er-Pack|Pckg\.?|Packg\.?|Becher|Dose|Fl\.?))/i,
    /(\d+\s*(?:Stück|St)\s*\(\s*\d+\s*Stück\s*=)/i
  ];
  for (const p of patterns) {
    const m=t.match(p); if (m) return m[1].replace(/\s+/g,' ');
  }
  return '';
}
function basePrice(text) {
  const t=norm(text);
  let m=t.match(/(?:1\s*)?(kg|l|Stück|St\.?)\s*(?:=|:)\s*(\d+[.,]\d{2})\s*€?/i);
  if(m) return {unit:num(m[2]),label:/kg/i.test(m[1])?'€/kg':/l/i.test(m[1])?'€/l':'€/Stk.'};
  m=t.match(/\((\d+[.,]\d{2})\s*€\s*je\s*1\s*(kg|l|St(?:ück)?)\)/i);
  if(m) return {unit:num(m[1]),label:/kg/i.test(m[2])?'€/kg':/l/i.test(m[2])?'€/l':'€/Stk.'};
  m=t.match(/(\d+[.,]\d{2})\s*(?:€\s*)?[\/ ]\s*(kg|l|Stk\.?|Stück)/i);
  if(m) return {unit:num(m[1]),label:/kg/i.test(m[2])?'€/kg':/l/i.test(m[2])?'€/l':'€/Stk.'};
  m=t.match(/(?:10|100)\s*Stück\s*=\s*(\d+[.,]\d{2})\s*€/i);
  if(m) {
    const factor=/100\s*Stück/i.test(m[0])?100:10;
    return {unit:num(m[1])/factor,label:'€/Stk.'};
  }
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
  m=size.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);
  if(!m) return {unit:price,label:'€/Packung'};
  let q=num(m[1]),u=m[2].toLowerCase();
  if(u==='g') return {unit:price/(q/1000),label:'€/kg'};
  if(u==='kg') return {unit:price/q,label:'€/kg'};
  if(u==='ml') return {unit:price/(q/1000),label:'€/l'};
  if(u==='l') return {unit:price/q,label:'€/l'};
  return {unit:price/q,label:'€/Stk.'};
}
function makeOffer(source,text,name,price,extra={}) {
  text=norm(text); name=cleanTitle(name); price=num(price);
  if(!validTitle(name) || !Number.isFinite(price) || price<=0.05 || price>=500) return null;
  if(!isRelevant(`${name}\n${text}`,source)) return null;
  const size=extra.size || extractSize(text);
  const bp=extra.base || basePrice(text) || deriveBase(price,size);
  const cat=category(`${name} ${text}`,source);
  return {
    key:canonicalKey(`${name} ${text}`,name),
    name,store:source.store,market:source.market,address:source.address,cat,
    size:size||'Packung',price:+price.toFixed(2),unit:+Number(bp.unit).toFixed(3),unitLabel:bp.label,
    icon:ICONS[cat]||'🛒',bio:isBio(`${name} ${text}`),
    app:!!extra.app,coupon:!!extra.coupon,
    advertised:!!extra.advertised || /aus der werbung|angebot|aktion|knüller|prospekt/i.test(text),
    sourceUrl:source.url,sourceScope:source.scope,importedAt:generatedAt
  };
}
function addOffer(out,source,text,name,price,extra={}) {
  const o=makeOffer(source,text,name,price,extra); if(o) out.push(o);
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
function titleFromWindow(lines, idx, fallback='', source=null) {
  const skip=/^(image|filiale|aktion|knaller|superknüller|angebot|angebote|zu den angeboten|gültig|statt|uvp|app-preis|festpreis|grundpreis|preis vorwoche|spare|nur|mit kaufland card|tag:|hinweise|lieferbar|anzahl|gesponsert|neu|aus der werbung)/i;
  for(let i=idx;i>=Math.max(0,idx-10);i--) {
    const l=norm(lines[i]||'');
    if(!l || skip.test(l) || !validTitle(l)) continue;
    if(isRelevant(l+' '+fallback,source)) return cleanTitle(l);
  }
  return cleanTitle(fallback);
}

function parseDm(source,text) {
  const out=[];
  const t=norm(text);
  const re=/Marke:\s*([^;\n]{2,80});\s*Produktname:\s*([^;\n]{3,180});([\s\S]{0,500}?)Preis:\s*(\d+[.,]\d{2})\s*€;([\s\S]{0,250}?)(?=Marke:|$)/gi;
  let m;
  while((m=re.exec(t))) {
    const name=`${m[1]} ${m[2]}`;
    const block=`${m[0]}`;
    addOffer(out,source,block,name,m[4],{advertised:/aktion|angebot|coupon/i.test(block)});
  }
  return out;
}

function parseRossmann(source,cards,text) {
  const out=[];
  const blocks=[...cards];
  const lines=norm(text).split('\n');
  for(let i=0;i<lines.length;i++) {
    if(/Artikelpreis|Aktueller Artikelpreis/i.test(lines[i])) {
      const m=lines[i].match(/(\d+[.,]\d{2})\s*€/);
      if(m) blocks.push(lines.slice(Math.max(0,i-10),Math.min(lines.length,i+3)).join('\n'));
    }
  }
  for(const b of blocks) {
    const t=norm(b);
    if(!/Artikelpreis|Aktueller Artikelpreis|Aus der Werbung/i.test(t) || !BABY_HINT.test(t)) continue;
    let p=(t.match(/Aktueller Artikelpreis:?\s*(\d+[.,]\d{2})\s*€/i)||[])[1];
    if(!p) p=(t.match(/Artikelpreis\s*(\d+[.,]\d{2})\s*€/i)||[])[1];
    if(!p) {
      const ps=[...t.matchAll(/(\d+[.,]\d{2})\s*€/g)].map(x=>x[1]);
      if(ps.length) p=ps.at(-1);
    }
    if(!p) continue;
    const ls=t.split('\n').map(norm).filter(Boolean);
    const name=ls.find(x=>validTitle(x) && BABY_HINT.test(x) && !/^(Baby &|Windeln &|Kategorien|Sortieren)/i.test(x))
      || titleFromWindow(ls,ls.length-1,t,source);
    addOffer(out,source,t,name,p,{advertised:/Aus der Werbung/i.test(t)});
  }
  return out;
}

function parseTextBlocks(source,text,cards,headingCards) {
  const out=[];
  const blocks=[...cards,...headingCards.map(x=>`${x.title}\n${x.text}`)];
  const lines=norm(text).split('\n');
  for(let i=0;i<lines.length;i++) {
    if(/(?:\d+[.,]\d{2})\s*€|Festpreis von|App-?Preis|Aktionspreis|\bnur\s+\d+[.,]\d{2}|UVP/i.test(lines[i])) {
      blocks.push(lines.slice(Math.max(0,i-9),Math.min(lines.length,i+6)).join('\n'));
    }
  }
  for(const b of blocks) {
    const t=norm(b);
    if(!isRelevant(t,source)) continue;
    let p=null, extra={};
    let m=t.match(/App-?Preis(?:\s+von)?\s*(\d+[.,]\d{2})\s*€/i);
    if(m){p=m[1];extra.app=true;}
    if(!p && (m=t.match(/(?:Festpreis von|Aktionspreis|Angebotspreis|Aktueller Artikelpreis:?)\s*(\d+[.,]\d{2})\s*€/i))) p=m[1];
    if(!p && (m=t.match(/\bnur\s*(\d+[.,]\d{2})\b/i))) p=m[1];
    if(!p && (m=t.match(/(?:^|\n)(\d+[.,]\d{2})\s*€(?:\n|$)/m))) p=m[1];
    if(!p && (m=t.match(/(?:statt|UVP)\s*(\d+[.,]\d{2})[^\d]{0,12}(\d+[.,]\d{2})/i))) p=m[2];
    if(!p) {
      const ps=[...t.matchAll(/(\d+[.,]\d{2})\s*€/g)].map(x=>x[1]);
      if(ps.length) p=ps[0];
    }
    if(!p) continue;
    const ls=t.split('\n').map(norm).filter(Boolean);
    const priceIdx=ls.findIndex(x=>x.includes(String(p)));
    const name=titleFromWindow(ls,priceIdx>=0?priceIdx-1:ls.length-1,t,source);
    extra.coupon=/coupon|kaufland card xtra|xtra rabatt/i.test(t);
    extra.advertised=/aus der werbung|angebot|aktion|knüller|prospekt/i.test(t);
    addOffer(out,source,t,name,p,extra);
  }
  return out;
}

function primitivePrice(v) {
  if(typeof v==='number') return v;
  if(typeof v==='string' && /^\s*\d{1,3}(?:[.,]\d{1,2})?\s*$/.test(v)) return num(v);
  return NaN;
}
function pick(obj, names) {
  for(const n of names) {
    if(obj && Object.prototype.hasOwnProperty.call(obj,n) && obj[n] != null) return obj[n];
  }
}
function priceFromObject(obj) {
  const direct=pick(obj,['offerPrice','salesPrice','salePrice','currentPrice','discountPrice','discountedPrice','promoPrice','promotionalPrice','price']);
  if(typeof direct==='object' && direct) {
    const nested=pick(direct,['value','amount','gross','current','price']);
    const p=primitivePrice(nested); if(Number.isFinite(p)) return p;
  }
  const p=primitivePrice(direct); if(Number.isFinite(p)) return p;
  return NaN;
}
function stringFrom(obj,names) {
  const v=pick(obj,names);
  return typeof v==='string'?norm(v):'';
}
function walkJson(node, source, out, depth=0) {
  if(depth>10 || node==null) return;
  if(Array.isArray(node)) {
    for(const x of node.slice(0,800)) walkJson(x,source,out,depth+1);
    return;
  }
  if(typeof node!=='object') return;
  const name=stringFrom(node,['productName','displayName','name','title','shortDescription','description']);
  const price=priceFromObject(node);
  if(name && Number.isFinite(price) && validTitle(name) && isRelevant(name+' '+JSON.stringify(node).slice(0,1800),source)) {
    const raw=JSON.stringify(node).slice(0,5000);
    const size=stringFrom(node,['contentSize','size','quantityText','netContent','packageSize']);
    addOffer(out,source,raw,name,price,{size,advertised:/promo|offer|aktion|advert/i.test(raw)});
  }
  for(const v of Object.values(node)) if(typeof v==='object' && v) walkJson(v,source,out,depth+1);
}

async function acceptCookies(page) {
  const labels=['Alle akzeptieren','Akzeptieren','Zustimmen','Alle Cookies akzeptieren','OK'];
  for(const label of labels) {
    try {
      const btn=page.getByRole('button',{name:new RegExp(`^${label}$`,'i')}).first();
      if(await btn.isVisible({timeout:350})) { await btn.click({timeout:800}); break; }
    } catch {}
  }
}
async function autoScroll(page) {
  for(let i=0;i<7;i++) {
    await page.evaluate(()=>window.scrollBy(0,Math.max(window.innerHeight*1.2,800)));
    await page.waitForTimeout(450);
  }
  await page.evaluate(()=>window.scrollTo(0,0));
}
async function scrape(browser,source) {
  const context=await browser.newContext({
    locale:'de-DE',timezoneId:'Europe/Berlin',
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
  });
  const page=await context.newPage();
  const jsonPayloads=[];
  page.on('response', async response=>{
    try{
      const ct=(response.headers()['content-type']||'').toLowerCase();
      if(!ct.includes('json')) return;
      const url=response.url();
      if(!/product|offer|article|search|catalog|assort|promotion|prospekt|deal|market|store/i.test(url)) return;
      const text=await response.text();
      if(text.length>2_500_000) return;
      jsonPayloads.push(JSON.parse(text));
    }catch{}
  });
  try {
    await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:65000});
    await acceptCookies(page);
    await page.waitForTimeout(1800);
    await autoScroll(page);
    await page.waitForTimeout(1000);

    const extracted=await page.evaluate(()=>{
      const bodyVisible=document.body?.innerText||'';
      const bodyAll=document.body?.textContent||'';
      const cardSel='article,li,[data-testid*="product" i],[data-testid*="offer" i],[class*="offer" i],[class*="product" i],[class*="tile" i],[class*="card" i]';
      const cards=[...document.querySelectorAll(cardSel)].map(e=>(e.innerText||e.textContent||'').trim()).filter(t=>t.length>20&&t.length<3500);
      const headingCards=[];
      for(const h of document.querySelectorAll('h2,h3,h4,h5,[role="heading"]')) {
        const title=(h.innerText||h.textContent||'').trim();
        if(title.length<3) continue;
        let p=h;
        for(let depth=0;depth<6 && p;depth++,p=p.parentElement) {
          const text=(p.innerText||p.textContent||'').trim();
          if(text.length>=title.length+4 && text.length<3500) {headingCards.push({title,text});break;}
        }
      }
      const scripts=[...document.querySelectorAll('script[type="application/ld+json"],script[id*="__NEXT_DATA__"],script[type="application/json"]')]
        .map(s=>s.textContent||'').filter(Boolean).slice(0,80);
      return {bodyVisible,bodyAll,cards,headingCards,scripts};
    });

    const offers=[];
    if(source.store==='dm') offers.push(...parseDm(source,extracted.bodyAll));
    if(source.store==='ROSSMANN') offers.push(...parseRossmann(source,extracted.cards,extracted.bodyAll));
    offers.push(...parseTextBlocks(source,`${extracted.bodyVisible}\n${extracted.bodyAll}`,extracted.cards,extracted.headingCards));

    for(const s of extracted.scripts) {
      try{walkJson(JSON.parse(s),source,offers);}catch{}
    }
    for(const payload of jsonPayloads.slice(0,120)) walkJson(payload,source,offers);

    let clean=dedupe(offers).filter(o=>validTitle(o.name) && isRelevant(`${o.name} ${o.cat}`,source));
    if(source.mode==='baby') clean=clean.filter(o=>o.cat==='Baby & Kleinkind');
    if(clean.length>250) clean=clean.slice(0,250);

    return {
      offers:clean,status:clean.length?'ok':'no_data',
      message:clean.length?`${clean.length} Angebote importiert`:`Seite erreichbar, aber keine relevanten Angebote erkannt (DOM ${extracted.cards.length} Karten / ${jsonPayloads.length} JSON-Antworten)`
    };
  } catch(e) {
    return {offers:[],status:'error',message:String(e.message||e).slice(0,300)};
  } finally {
    await context.close();
  }
}

const browser=await chromium.launch({headless:true});
const all=[],statuses=[];
for(const source of markets.sources) {
  console.log(`Importiere ${source.store} ${source.market} ...`);
  const start=Date.now();
  const r=await scrape(browser,source);
  all.push(...r.offers);
  statuses.push({...source,status:r.status,count:r.offers.length,message:r.message,durationMs:Date.now()-start});
  console.log(`${source.store}: ${r.status}, ${r.offers.length} (${Date.now()-start} ms)`);
}
await browser.close();

const offers=dedupe(all)
  .sort((a,b)=>a.key.localeCompare(b.key,'de')||Number(b.bio)-Number(a.bio)||a.unit-b.unit)
  .map((o,i)=>({id:i+1,...o}));

const result={
  schema:3,generatedAt,center:markets.center,nearbyMarkets:markets.nearbyMarkets,
  sources:statuses,offerCount:offers.length,offers
};
await fs.writeFile(path.join(ROOT,'data/offers-live.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Fertig: ${offers.length} Live-Angebote aus ${statuses.filter(x=>x.status==='ok').length}/${statuses.length} Quellen.`);
if(!offers.length) console.warn('Keine Angebote erkannt; Statusdatei wird trotzdem veröffentlicht.');
