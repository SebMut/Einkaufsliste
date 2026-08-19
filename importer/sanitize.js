import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const DATA = path.join(ROOT, 'data');
const file = path.join(DATA, 'offers-live.json');
const reportFile = path.join(DATA, 'quality-report.json');
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const rawOffers = Array.isArray(data.offers) ? data.offers : [];
const before = rawOffers.length;
let repaired = 0;

const KEY_RULES = [
  ['Windeln', /\b(?:windeln?|windelhose|pants)\b/i],
  ['Feuchttücher', /feuchttücher|wipes\b/i],
  ['Babymilch', /\b(?:pre|anfangs|folge|kinder)milch\b|säuglingsnahrung|milchnahrung/i],
  ['Babybrei', /babybrei|getreidebrei|milchbrei/i],
  ['Babygläschen', /babygläschen|gläschen|beikost/i],
  ['Butter', /\bbutter\b|streichzart/i],
  ['Milch', /\b(?:vollmilch|frischmilch|h-?milch|berg(?:bauern)?milch)\b/i],
  ['Eier', /\beier\b/i],
  ['Bananen', /\bbananen?\b/i],
  ['Äpfel', /\bäpfel|apfel\b/i],
  ['Beeren', /heidelbeer|himbeer|erdbeer|brombeer/i],
  ['Zwetschgen', /zwetschgen?|pflaumen?/i],
  ['Tomaten', /tomaten?|rispentomaten/i],
  ['Paprika', /\bpaprika\b/i],
  ['Gurken', /gurken?|salatgurke/i],
  ['Kartoffeln', /kartoffeln?/i],
  ['Avocado', /avocado/i],
  ['Hackfleisch', /hackfleisch|rinderhack|schweinehack/i],
  ['Hähnchen', /hähnchen|huhn|chicken/i],
  ['Rindfleisch', /rind(?:er)?|jungbullen|steak/i],
  ['Schweinefleisch', /schwein|schnitzel/i],
  ['Lachs', /\blachs\b/i],
  ['Fisch', /fisch|dorade|forelle|garnelen/i],
  ['Joghurt', /joghurt|yoghurt|kefir|fruchtigurt/i],
  ['Frischkäse', /frischkäse/i],
  ['Käse', /käse|gouda|emmentaler|mozzarella/i],
  ['Kaffee', /kaffee|caff[eè]|espresso/i],
  ['Nudeln', /nudeln|pasta|spaghetti|penne/i],
  ['Reis', /\breis\b/i],
  ['Mehl', /\bmehl\b/i],
  ['Öl', /öl|olivenöl|rapsöl|sonnenblumenöl/i],
  ['Pizza', /\bpizza\b|pinsa/i],
  ['Brot', /\bbrot\b/i],
  ['Brötchen', /brötchen|semmel|breze/i],
  ['Wurst', /wurst|salami|schinken|bratwurst/i],
  ['Mineralwasser', /mineralwasser|wasser\s+(?:medium|still|classic)/i],
  ['Saft', /saft|nektar/i],
  ['Cola', /cola|coca-cola|pepsi|fanta|sprite|mezzo/i],
  ['Bier', /bier|pils|helles|weißbier/i],
  ['Schokolade', /schokolade|schoko|duplo|kinder riegel|knoppers|lachgummi|haribo/i],
  ['Chips', /chips|snack/i],
  ['Eis', /eiscreme|speiseeis/i]
];

const ICONS = {
  'Baby & Kleinkind':'👶','Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩',
  'Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤',
  'Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'
};

const REJECT_NAME = /(?:alle\s+(?:dm|rossmann)[- ]?märkte|online verfügbar|markt auswählen|filiale auswählen|filiale wählen|mehr anzeigen|mehr erfahren|weitere informationen|verfügbarkeit prüfen|bedingungen der coupons|hilfe von ki|datenschutz|fußnoten|rechtliche hinweise|newsletter|öffnungszeiten|zum prospekt|prospekt öffnen|preise anzeigen)/i;

function norm(value='') {
  return String(value).replace(/\u00a0/g,' ').replace(/\r/g,' ').replace(/\s+/g,' ').trim();
}

function cleanMarkdown(value='') {
  return norm(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/, '')
    .replace(/^Angebot:\s*/i, '')
    .replace(/^Image:\s*/i, '')
    .trim();
}

function inferSize(text='', current='') {
  const existing = norm(current);
  if (existing && !/^(?:packung|stück|st\.?|angebot)$/i.test(existing)) return existing;
  const t = norm(text);
  let m = t.match(/(?:je\s+)?((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?)(?:[- ]?(?:Packung|Packg\.?|Pckg\.?|Becher|Flasche|Dose|Schale|Netz|Kasten|Träger))?)/i);
  if (m) return norm(m[1]);
  return existing || 'Packung';
}

function cleanProductName(value='', size='') {
  let n = cleanMarkdown(value);

  // Preis-/UI-Präfixe aus Universal-Parsern entfernen.
  n = n
    .replace(/^(?:Angebotspreis|Aktionspreis|App-Preis|Couponpreis|Preis)\s*[:=-]?\s*\d+[.,]\d{2}\s*€?\s*(?:\d+[.,]\d{2})?\s*/i, '')
    .replace(/^\d+[.,]\d{2}\s*€\s*\d+[.,]\d{2}\s*/i, '')
    .replace(/^(?:AKTION|KNALLER|SUPERKNÜLLER|ANGEBOT)\s+/i, '')
    .replace(/^je\s+(?=[A-Za-zÄÖÜäöüß])/i, '')
    .trim();

  // Mengen-/Grundpreis-Suffixe gehören in size/unit, nicht in den Produktnamen.
  n = n
    .replace(/\s+(?:je\s+)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?)\s*(?:[- ]?(?:Packung|Packg\.?|Pckg\.?|Becher|Flasche|Dose|Schale|Netz|Kasten|Träger))?\s*(?:\([^)]*(?:kg|l|Stück)[^)]*\))?\s*$/i, '')
    .replace(/\s*\((?:1\s*)?(?:kg|l|Stück)\s*=\s*[^)]+\)\s*$/i, '')
    .replace(/\*+\s*$/, '')
    .trim();

  // Wenn die exakt gleiche Größenangabe noch am Ende hängt, ebenfalls entfernen.
  const escapedSize = norm(size).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (escapedSize && !/^packung$/i.test(size)) n = n.replace(new RegExp(`\\s+${escapedSize}\\s*$`, 'i'), '').trim();

  return norm(n);
}

function canonicalKey(name='') {
  for (const [key, re] of KEY_RULES) if (re.test(name)) return key;
  return norm(name)
    .replace(/\b(?:bio|aktion|knaller|superknüller|angebot|je|packung)\b/ig,'')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,55);
}

function categoryFor(name='', current='') {
  const t = norm(name);
  if (/baby|pampers|windel|pants|feuchttücher|wipes|wickel|schnuller|säugling|beikost|anfangsmilch|folgemilch|\bpre\b|gläschen|babynahrung|kindermilch/i.test(t)) return 'Baby & Kleinkind';
  if (/banane|apfel|äpfel|zwetsch|pflaum|tomat|paprika|gurke|kartoff|zwiebel|möhre|karotte|beeren|heidelbeer|himbeer|erdbeer|trauben|avocado|zitrone|limette/i.test(t)) return 'Obst & Gemüse';
  if (/milch|butter|streichzart|joghurt|yoghurt|kefir|fruchtigurt|quark|käse|gouda|mozzarella|sahne|frischkäse|pudding|milchreis/i.test(t)) return 'Milchprodukte';
  if (/hack|rind|schwein|hähnchen|pute|wurst|salami|schinken|bratwurst|lachs|fisch|garnelen|steak|schnitzel/i.test(t)) return 'Fleisch & Fisch';
  if (/kaffee|espresso|tee|haferflocken|müsli|eier/i.test(t)) return 'Kaffee & Frühstück';
  if (/nudel|pasta|reis|mehl|zucker|öl|pesto|sauce|hummus|konserve/i.test(t)) return 'Vorrat';
  if (/tiefkühl|gefroren|pizza|pinsa|pommes|eiscreme|speiseeis/i.test(t)) return 'Tiefkühl';
  if (/wasser|cola|coca-cola|pepsi|fanta|sprite|mezzo|saft|nektar|limonade|bier|wein|sekt|energy|whiskey|whisky/i.test(t)) return 'Getränke';
  if (/schokolade|duplo|kinder riegel|knoppers|lachgummi|haribo|keks|chips|snack|bonbon|fruchtgummi/i.test(t)) return 'Süßes & Snacks';
  if (/brot|brötchen|semmel|breze|baguette/i.test(t)) return 'Backwaren';
  return current && ICONS[current] ? current : 'Lebensmittel';
}

function quantityForUnit(size='', label='') {
  const s = norm(size);
  if (/[\/–-]/.test(s) && /\d\s*[\/–-]\s*\d/.test(s)) return null;
  let m = s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);
  if (m) {
    let q = Number(m[1]) * Number(m[2].replace(',','.'));
    const u = m[3].toLowerCase();
    if (u === 'g' || u === 'ml') q /= 1000;
    if ((/kg/i.test(label) && (u === 'g' || u === 'kg')) || (/\/l/i.test(label) && (u === 'ml' || u === 'l'))) return q;
    return null;
  }
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);
  if (!m) return null;
  let q = Number(m[1].replace(',','.'));
  const u = m[2].toLowerCase();
  if (u === 'g' || u === 'ml') q /= 1000;
  if (/kg/i.test(label) && (u === 'g' || u === 'kg')) return q;
  if (/\/l/i.test(label) && (u === 'ml' || u === 'l')) return q;
  if (/Stk/i.test(label) && /^st/i.test(u)) return q;
  return null;
}

function deriveUnit(price, size='') {
  const s = norm(size);
  if (/[\/–-]/.test(s) && /\d\s*[\/–-]\s*\d/.test(s)) return null;
  let m = s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);
  if (m) {
    let q = Number(m[1]) * Number(m[2].replace(',','.'));
    const u = m[3].toLowerCase();
    if (u === 'g') return {unit: price/(q/1000), unitLabel:'€/kg'};
    if (u === 'kg') return {unit: price/q, unitLabel:'€/kg'};
    if (u === 'ml') return {unit: price/(q/1000), unitLabel:'€/l'};
    if (u === 'l') return {unit: price/q, unitLabel:'€/l'};
  }
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);
  if (!m) return null;
  const q = Number(m[1].replace(',','.'));
  const u = m[2].toLowerCase();
  if (!Number.isFinite(q) || q <= 0) return null;
  if (u === 'g') return {unit: price/(q/1000), unitLabel:'€/kg'};
  if (u === 'kg') return {unit: price/q, unitLabel:'€/kg'};
  if (u === 'ml') return {unit: price/(q/1000), unitLabel:'€/l'};
  if (u === 'l') return {unit: price/q, unitLabel:'€/l'};
  return {unit: price/q, unitLabel:'€/Stk.'};
}

function repairOffer(input) {
  const o = {...input};
  const rawName = cleanMarkdown(o.name);
  const size = inferSize(rawName, o.size);
  const cleaned = cleanProductName(rawName, size);

  if (cleaned !== o.name) { o.name = cleaned; repaired++; }
  if (size !== o.size) { o.size = size; repaired++; }

  const key = canonicalKey(o.name);
  if (key !== o.key) { o.key = key; repaired++; }

  const cat = categoryFor(o.name, o.cat);
  if (cat !== o.cat) { o.cat = cat; repaired++; }
  const icon = ICONS[cat] || '🛒';
  if (icon !== o.icon) { o.icon = icon; repaired++; }

  const bio = /\bbio\b|bioland|naturland|demeter|öko-/i.test(`${rawName} ${o.name}`);
  if (bio !== !!o.bio) { o.bio = bio; repaired++; }

  const price = Number(o.price);
  const unit = Number(o.unit);

  // Bekannter Parserfehler: Grundpreis landete als Preis und die Packungsmenge als unit.
  const qForCurrent = quantityForUnit(o.size, o.unitLabel);
  if (Number.isFinite(price) && Number.isFinite(unit) && qForCurrent && qForCurrent > 0) {
    const tolerance = Math.max(0.015, qForCurrent * 0.06);
    if (Math.abs(unit - qForCurrent) <= tolerance && price > 0.3) {
      o.price = +(price * qForCurrent).toFixed(2);
      o.unit = +price.toFixed(3);
      repaired++;
    }
  }

  // Für eindeutige Packungsgrößen ist der mathematische Grundpreis belastbarer als ein Universalparser.
  const derived = deriveUnit(Number(o.price), o.size);
  if (derived && Number.isFinite(derived.unit) && derived.unit > 0) {
    const current = Number(o.unit);
    const shouldRepair = !Number.isFinite(current) || current <= 0 || !o.unitLabel ||
      (o.unitLabel === '€/Packung') ||
      (String(o.unitLabel) === derived.unitLabel && Math.abs(current-derived.unit)/Math.max(derived.unit,0.01) > 0.08);
    if (shouldRepair) {
      o.unit = +derived.unit.toFixed(3);
      o.unitLabel = derived.unitLabel;
      repaired++;
    }
  }

  return o;
}

function invalidReason(o) {
  if (!o) return 'empty';
  const n = norm(o.name);
  if (n.length < 3 || n.length > 140) return 'name_length';
  if (!/[A-Za-zÄÖÜäöüß]{3}/.test(n)) return 'name_no_letters';
  if (REJECT_NAME.test(n)) return 'navigation_or_ui';
  if (/^(?:bio|aktion|knaller|superknüller|filiale|angebot|angebote|grundpreis|image|packung|stück)$/i.test(n)) return 'generic_name';
  if (/^(?:Angebotspreis|Aktionspreis|App-Preis|Couponpreis|Preis)\b/i.test(n)) return 'price_as_name';
  if (/^\(?\s*\d+[.,]\d+/i.test(n)) return 'number_as_name';
  if (/^(?:je\s+)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|st(?:ück)?\.?|er[- ]?pack|packg\.?|pckg\.?|schale)/i.test(n)) return 'quantity_as_name';
  if (/^je\s+.*(?:packg\.?|pckg\.?|packung|schale|becher|stück|st\.?)$/i.test(n)) return 'quantity_as_name';
  if (/^\(?\s*(?:pro|je)\s+(?:stück|kg|l)\s*=/i.test(n)) return 'baseprice_as_name';
  if (/€\s*\/\s*(?:1\s*)?(?:kg|l|st)/i.test(n)) return 'baseprice_as_name';
  if (!o.key || !norm(o.key)) return 'missing_key';
  if (!Number.isFinite(Number(o.price)) || Number(o.price) <= 0.05 || Number(o.price) >= 300) return 'invalid_price';
  if (!Number.isFinite(Number(o.unit)) || Number(o.unit) <= 0 || Number(o.unit) >= 2000) return 'invalid_unit';
  if (!o.store || !o.market) return 'missing_store';
  return null;
}

const rejectedReasons = {};
const rejectedExamples = [];
const storeBefore = {};
const storeAfter = {};
const seen = new Set();
const offers = [];

for (const raw of rawOffers) {
  const store = String(raw?.store || 'unknown');
  storeBefore[store] = (storeBefore[store] || 0) + 1;
  const offer = repairOffer(raw);
  const reason = invalidReason(offer);
  if (reason) {
    rejectedReasons[reason] = (rejectedReasons[reason] || 0) + 1;
    if (rejectedExamples.length < 30) rejectedExamples.push({store, name: raw?.name ?? null, reason});
    continue;
  }

  const key = [offer.store, offer.market, offer.key, offer.name.toLowerCase(), offer.size, offer.price, !!offer.app, !!offer.coupon].join('|');
  if (seen.has(key)) {
    rejectedReasons.duplicate = (rejectedReasons.duplicate || 0) + 1;
    continue;
  }
  seen.add(key);
  offers.push(offer);
  storeAfter[store] = (storeAfter[store] || 0) + 1;
}

offers.sort((a,b) => String(a.key).localeCompare(String(b.key),'de') || Number(!!b.bio)-Number(!!a.bio) || Number(a.unit)-Number(b.unit));
offers.forEach((o,i) => o.id=i+1);

const counts = new Map();
for (const o of offers) counts.set(`${o.store}|${o.market}`, (counts.get(`${o.store}|${o.market}`)||0)+1);
for (const s of data.sources || []) {
  const count = counts.get(`${s.store}|${s.market}`) || 0;
  s.count = count;
  if (count === 0 && s.status === 'ok') {
    s.status = 'no_data';
    s.message = 'Keine validen Lebensmittelangebote nach Qualitätsprüfung.';
  } else if (count > 0) {
    s.status = 'ok';
    s.message = `${count} valide Angebote importiert`;
  }
}

data.offers = offers;
data.offerCount = offers.length;
data.quality = {
  sanitizedAt: new Date().toISOString(),
  before,
  after: offers.length,
  rejected: before - offers.length,
  repaired
};

const report = {
  generatedAt: new Date().toISOString(),
  before,
  after: offers.length,
  rejected: before - offers.length,
  repaired,
  rejectedReasons,
  storeBefore,
  storeAfter,
  rejectedExamples
};

await Promise.all([
  fs.writeFile(file, JSON.stringify(data, null, 2) + '\n'),
  fs.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n')
]);
console.log(`Qualitätsfilter: ${before} -> ${offers.length} Angebote (${before-offers.length} verworfen, ${repaired} Reparaturen).`);
