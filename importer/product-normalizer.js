const norm = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const lower = value => norm(value).toLocaleLowerCase('de-DE');
const slug = value => lower(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);

const BIO_RE = /\bbio\b|bioland|naturland|demeter|öko[- ]?/i;
const CATEGORY_ICONS = {
  'Baby & Kleinkind': '👶', 'Obst & Gemüse': '🥦', 'Milchprodukte': '🥛',
  'Fleisch & Fisch': '🥩', 'Kaffee & Frühstück': '☕', 'Vorrat': '🍝',
  'Tiefkühl': '🧊', 'Getränke': '🥤', 'Süßes & Snacks': '🍫',
  'Backwaren': '🥖', 'Haushalt & Drogerie': '🧴', 'Lebensmittel': '🛒'
};

function numberFrom(text) {
  const n = Number(String(text ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseAttributes(name = '', size = '') {
  const text = `${norm(name)} ${norm(size)}`;
  const fat = text.match(/\b(0[,.]\d|1[,.]\d|3[,.]\d|3[,.]5|3[,.]8|3[,.]9)\s*%/i);
  const diaper = text.match(/(?:gr(?:öße|\.)?\s*|size\s*)([0-9]{1,2})\b/i);
  const count = text.match(/\b(\d{1,4})\s*(?:stück|st\.?)(?:\b|$)/i);
  return {
    fatContent: fat ? numberFrom(fat[1]) : null,
    diaperSize: diaper ? diaper[1] : null,
    packageCount: count ? Number(count[1]) : null,
    processing: /\bh-?milch\b|haltbar/i.test(text) ? 'haltbar' : /frisch(?:e|er|es)?\s+(?:voll)?milch|frischmilch/i.test(text) ? 'frisch' : null,
    form: /\bpants\b|windelhose/i.test(text) ? 'Pants' : /windel/i.test(text) ? 'Windeln' : null
  };
}

function fallbackName(input) {
  const existing = norm(input.key);
  if (existing && existing.length >= 2 && existing.length <= 60) return existing;
  return norm(input.name).replace(/\b(?:bio|aktion|angebot|knaller|superknüller)\b/ig, '').replace(/\s+/g, ' ').trim().slice(0, 55) || 'Sonstiges';
}

function classify(name = '', currentCat = '', store = '') {
  const n = lower(name);
  const attrs = parseAttributes(name);
  const result = {
    department: 'Lebensmittel', category: currentCat || 'Lebensmittel', subcategory: '',
    canonicalGroup: '', canonicalProduct: '', marketSection: '', confidence: 0.72
  };
  const set = (department, category, subcategory, group, product, section, confidence = 0.96) =>
    Object.assign(result, { department, category, subcategory, canonicalGroup: group, canonicalProduct: product, marketSection: section, confidence });

  if (/sicherheits[- ]?wattestäbchen|baby[- ]?wattestäbchen/.test(n)) set('Drogerie', 'Baby & Kleinkind', 'Pflege', 'Sicherheits-Wattestäbchen', 'Sicherheits-Wattestäbchen', 'Baby & Kleinkind', 0.99);
  else if (/feuchttücher|baby\s*wipes|babytücher/.test(n)) set('Drogerie', 'Baby & Kleinkind', 'Wickeln', 'Feuchttücher', 'Feuchttücher', 'Baby & Kleinkind', 0.99);
  else if (/windeln?|windelhose|\bpants\b/.test(n)) {
    const suffix = attrs.diaperSize ? ` Gr. ${attrs.diaperSize}` : '';
    const type = attrs.form || 'Windeln';
    set('Drogerie', 'Baby & Kleinkind', 'Wickeln', 'Windeln', `${type}${suffix}`, 'Baby & Kleinkind', 0.99);
  }
  else if (/anfangsmilch|folgemilch|kindermilch|säuglingsnahrung|milchnahrung|\bpre\s*(?:nahrung|milch)?\b/.test(n)) set('Lebensmittel', 'Baby & Kleinkind', 'Babynahrung', 'Babymilch', /folgemilch/.test(n) ? 'Folgemilch' : /kindermilch/.test(n) ? 'Kindermilch' : 'Pre-/Anfangsmilch', 'Baby & Kleinkind', 0.98);
  else if (/babybrei|getreidebrei|milchbrei/.test(n)) set('Lebensmittel', 'Baby & Kleinkind', 'Babynahrung', 'Babybrei', /milchbrei/.test(n) ? 'Milchbrei' : 'Babybrei', 'Baby & Kleinkind', 0.97);
  else if (/babygläschen|gläschen|beikost/.test(n)) set('Lebensmittel', 'Baby & Kleinkind', 'Babynahrung', 'Babygläschen', 'Babygläschen', 'Baby & Kleinkind', 0.95);
  else if (/waschmittel|vollwaschmittel|colorwaschmittel|feinwaschmittel|waschpulver|waschgel|waschcaps|waschpods/.test(n)) set('Drogerie', 'Haushalt & Drogerie', 'Waschen', 'Waschmittel', /color/.test(n) ? 'Colorwaschmittel' : /fein/.test(n) ? 'Feinwaschmittel' : 'Vollwaschmittel', 'Drogerie / Haushalt', 0.97);
  else if (/toilettenpapier/.test(n)) set('Drogerie', 'Haushalt & Drogerie', 'Papier', 'Toilettenpapier', 'Toilettenpapier', 'Drogerie / Haushalt', 0.99);
  else if (/milchreis/.test(n)) {
    const ready = /müller|dessert|becher|fertig|vanille|zimt|schoko|original/.test(n);
    set('Lebensmittel', ready ? 'Milchprodukte' : 'Vorrat', ready ? 'Desserts' : 'Reis & Getreide', 'Milchreis', ready ? 'Milchreis Dessert' : 'Milchreis (trocken)', ready ? 'Kühlregal' : 'Trockenwaren', 0.99);
  }
  else if (/milchschokolade|schokomilch/.test(n)) set('Lebensmittel', 'Süßes & Snacks', 'Schokolade', 'Schokolade', 'Milchschokolade', 'Süßes & Snacks', 0.99);
  else if (/milchbrötchen/.test(n)) set('Lebensmittel', 'Backwaren', 'Backwaren', 'Brötchen', 'Milchbrötchen', 'Backwaren', 0.99);
  else if (/kokosmilch/.test(n)) set('Lebensmittel', 'Vorrat', 'Kochzutaten', 'Kokosmilch', 'Kokosmilch', 'Trockenwaren', 0.99);
  else if (/haferdrink|sojadrink|soya.?drink|mandeldrink|this is not milk|pflanzendrink/.test(n)) set('Lebensmittel', 'Getränke', 'Pflanzliche Drinks', 'Pflanzengetränke', /hafer/.test(n) ? 'Haferdrink' : /soja|soya/.test(n) ? 'Sojadrink' : /mandel/.test(n) ? 'Mandeldrink' : 'Pflanzendrink', 'Getränke', 0.98);
  else if (/milchpulver/.test(n)) set('Lebensmittel', 'Vorrat', 'Milchpulver', 'Milchpulver', 'Milchpulver', 'Trockenwaren', 0.97);
  else if (/\bvollmilch\b|\bfrischmilch\b|\bh-?milch\b|\bhaltbare?\s+(?:voll)?milch\b|\bberg(?:bauern)?milch\b|\bweidemilch\b|\blandmilch\b|\bfrische?\s+milch\b|\balpenmilch\b/.test(n) || (/\bmilch\b/.test(n) && !/reis|schokolade|brötchen|pulver|brei|kaffee|shake|drink/.test(n))) {
    const product = /fettarm|1[,.]5\s*%/.test(n) ? 'Fettarme Milch' : /\bh-?milch\b|haltbar/.test(n) ? 'H-Milch' : 'Vollmilch';
    set('Lebensmittel', 'Milchprodukte', 'Milchprodukte', 'Milch', product, 'Kühlregal', 0.98);
  }
  else if (/erdnussbutter/.test(n)) set('Lebensmittel', 'Kaffee & Frühstück', 'Aufstriche', 'Erdnussbutter', 'Erdnussbutter', 'Trockenwaren', 0.99);
  else if (/kräuterbutter/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Butter & Fette', 'Kräuterbutter', 'Kräuterbutter', 'Kühlregal', 0.99);
  else if (/butterschmalz/.test(n)) set('Lebensmittel', 'Vorrat', 'Fette & Öle', 'Butterschmalz', 'Butterschmalz', 'Trockenwaren', 0.99);
  else if (/butterkeks/.test(n)) set('Lebensmittel', 'Süßes & Snacks', 'Kekse', 'Kekse', 'Butterkeks', 'Süßes & Snacks', 0.99);
  else if (/\bbutter\b|streichzart/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Butter & Fette', 'Butter', /süßrahm/.test(n) ? 'Süßrahmbutter' : /sauerrahm/.test(n) ? 'Sauerrahmbutter' : 'Butter', 'Kühlregal', 0.98);
  else if (/\beier\b|hühnereier|freilandeier/.test(n)) set('Lebensmittel', 'Kaffee & Frühstück', 'Eier', 'Eier', 'Eier', 'Eier / Kühlbereich', 0.98);
  else if (/apfelsaft|apfelnektar/.test(n)) set('Lebensmittel', 'Getränke', 'Säfte', 'Saft', 'Apfelsaft', 'Getränke', 0.99);
  else if (/\bäpfel\b|\bapfel\b/.test(n)) set('Lebensmittel', 'Obst & Gemüse', 'Obst', 'Äpfel', 'Äpfel', 'Obst & Gemüse', 0.98);
  else if (/bananen?/.test(n)) set('Lebensmittel', 'Obst & Gemüse', 'Obst', 'Bananen', 'Bananen', 'Obst & Gemüse', 0.98);
  else if (/tomaten?|rispentomaten/.test(n)) set('Lebensmittel', 'Obst & Gemüse', 'Gemüse', 'Tomaten', 'Tomaten', 'Obst & Gemüse', 0.98);
  else if (/kartoffeln?/.test(n)) set('Lebensmittel', 'Obst & Gemüse', 'Gemüse', 'Kartoffeln', 'Kartoffeln', 'Obst & Gemüse', 0.98);
  else if (/rinderhack|hackfleisch|schweinehack|hack\s+gemischt|gemischtes?\s+hack/.test(n)) set('Lebensmittel', 'Fleisch & Fisch', 'Frischfleisch', 'Hackfleisch', /rinderhack/.test(n) ? 'Rinderhack' : /schweinehack/.test(n) ? 'Schweinehack' : /gemischt/.test(n) ? 'Gemischtes Hackfleisch' : 'Hackfleisch', 'Fleisch & Wurst', 0.98);
  else if (/hähnchen|huhn|chicken/.test(n)) set('Lebensmittel', 'Fleisch & Fisch', 'Geflügel', 'Hähnchen', 'Hähnchen', 'Fleisch & Wurst', 0.94);
  else if (/\blachs\b/.test(n)) set('Lebensmittel', 'Fleisch & Fisch', 'Fisch', 'Lachs', 'Lachs', 'Fleisch & Fisch', 0.98);
  else if (/joghurt|yoghurt|fruchtigurt|\bskyr\b/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Joghurt', 'Joghurt', /griechisch/.test(n) ? 'Griechischer Joghurt' : /frucht/.test(n) ? 'Fruchtjoghurt' : /skyr/.test(n) ? 'Skyr' : 'Naturjoghurt', 'Kühlregal', 0.96);
  else if (/parmesan|parmigiano/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Käse', 'Käse', 'Parmesan', 'Kühlregal', 0.99);
  else if (/mozzarella/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Käse', 'Käse', 'Mozzarella', 'Kühlregal', 0.99);
  else if (/gouda/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Käse', 'Käse', 'Gouda', 'Kühlregal', 0.99);
  else if (/emmentaler/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Käse', 'Käse', 'Emmentaler', 'Kühlregal', 0.99);
  else if (/frischkäse|philadelphia/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Käse', 'Käse', 'Frischkäse', 'Kühlregal', 0.98);
  else if (/\bkäse\b|schnittkäse|weichkäse|hartkäse/.test(n)) set('Lebensmittel', 'Milchprodukte', 'Käse', 'Käse', 'Käse', 'Kühlregal', 0.88);
  else if (/nudeln|pasta|spaghetti|penne/.test(n)) set('Lebensmittel', 'Vorrat', 'Nudeln', 'Nudeln', /spaghetti/.test(n) ? 'Spaghetti' : /penne/.test(n) ? 'Penne' : 'Nudeln', 'Trockenwaren', 0.96);
  else if (/\breis\b/.test(n)) set('Lebensmittel', 'Vorrat', 'Reis & Getreide', 'Reis', 'Reis', 'Trockenwaren', 0.93);
  else if (/kaffee|espresso/.test(n)) set('Lebensmittel', 'Kaffee & Frühstück', 'Kaffee', 'Kaffee', /espresso/.test(n) ? 'Espresso' : 'Kaffee', 'Trockenwaren', 0.94);
  else if (/mineralwasser|\bwasser\s+(?:medium|still|classic)\b/.test(n)) set('Lebensmittel', 'Getränke', 'Wasser', 'Mineralwasser', 'Mineralwasser', 'Getränke', 0.98);
  else if (/\bsaft\b|nektar/.test(n)) set('Lebensmittel', 'Getränke', 'Säfte', 'Saft', 'Saft', 'Getränke', 0.9);
  else if (/coca.?cola|\bcola\b|pepsi|fanta|sprite|mezzo/.test(n)) set('Lebensmittel', 'Getränke', 'Erfrischungsgetränke', 'Cola & Limonade', 'Cola & Limonade', 'Getränke', 0.96);
  else if (/\bbier\b|pils|helles|weißbier/.test(n)) set('Lebensmittel', 'Getränke', 'Bier', 'Bier', 'Bier', 'Getränke', 0.94);
  else if (/pizza|pinsa|flammkuchen/.test(n)) set('Lebensmittel', 'Tiefkühl', 'Pizza', 'Pizza', 'Pizza', 'Tiefkühl', 0.96);
  else if (/schokolade|schoko|duplo|kinder riegel/.test(n)) set('Lebensmittel', 'Süßes & Snacks', 'Schokolade', 'Schokolade', 'Schokolade', 'Süßes & Snacks', 0.94);
  else if (/\bbrot\b/.test(n)) set('Lebensmittel', 'Backwaren', 'Brot', 'Brot', 'Brot', 'Backwaren', 0.94);
  else if (/brötchen|semmel|breze/.test(n)) set('Lebensmittel', 'Backwaren', 'Brötchen', 'Brötchen', 'Brötchen', 'Backwaren', 0.94);
  else if (/wurst|salami|schinken|bratwurst/.test(n)) set('Lebensmittel', 'Fleisch & Fisch', 'Wurst & Aufschnitt', 'Wurst', /salami/.test(n) ? 'Salami' : /schinken/.test(n) ? 'Schinken' : /bratwurst/.test(n) ? 'Bratwurst' : 'Wurst', 'Fleisch & Wurst', 0.92);
  else {
    const fallback = fallbackName({ name, key: '' });
    const cat = currentCat && CATEGORY_ICONS[currentCat] ? currentCat : 'Lebensmittel';
    Object.assign(result, { department: cat === 'Haushalt & Drogerie' ? 'Drogerie' : 'Lebensmittel', category: cat, subcategory: cat, canonicalGroup: fallback, canonicalProduct: fallback, marketSection: cat, confidence: 0.58 });
  }
  return result;
}

function meaningfulBundleKey(classification) {
  if (['Milch', 'Butter', 'Eier', 'Joghurt', 'Milchreis'].includes(classification.canonicalGroup)) return classification.canonicalGroup;
  return classification.canonicalProduct || classification.canonicalGroup;
}

export function normalizeOffer(input = {}) {
  const name = norm(input.name);
  const attributes = { ...parseAttributes(name, input.size), ...(input.attributes || {}) };
  const c = classify(name, input.cat, input.store);
  const organic = BIO_RE.test(`${name} ${input.key || ''}`) || input.bio === true;
  const fatPart = attributes.fatContent != null && c.canonicalGroup === 'Milch' ? `|fat:${attributes.fatContent}` : '';
  const diaperPart = attributes.diaperSize ? `|size:${attributes.diaperSize}` : '';
  const formPart = attributes.form && c.canonicalGroup === 'Windeln' ? `|form:${attributes.form}` : '';
  const similarityKey = `${c.canonicalGroup}|${c.canonicalProduct}`;
  const exactMatchKey = `${similarityKey}${fatPart}${diaperPart}${formPart}`;
  const canonicalId = slug(exactMatchKey) || slug(name) || 'produkt';
  const bundleKey = meaningfulBundleKey(c);
  return {
    ...input,
    originalName: input.originalName || name,
    department: c.department,
    category: c.category,
    subcategory: c.subcategory,
    cat: c.category,
    canonicalGroup: c.canonicalGroup,
    canonicalProduct: c.canonicalProduct,
    canonicalId,
    bundleKey,
    key: bundleKey,
    similarityKey,
    exactMatchKey,
    organic,
    bio: organic,
    variant: input.variant || attributes.processing || attributes.form || '',
    attributes,
    marketSection: c.marketSection,
    confidence: c.confidence,
    icon: CATEGORY_ICONS[c.category] || input.icon || '🛒'
  };
}

export function unitLabel(offer = {}) {
  return norm(offer.unitLabel || offer.baseUnit || '€/Packung');
}

export function priceMetric(offer = {}) {
  const unit = Number(offer.unit ?? offer.basePrice);
  return Number.isFinite(unit) && unit > 0 ? unit : Number(offer.price);
}

export function sameOffer(a, b) {
  if (!a || !b) return false;
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  return [a.store, a.market, lower(a.name), lower(a.size), Number(a.price), !!a.app, !!a.coupon].join('|') ===
    [b.store, b.market, lower(b.name), lower(b.size), Number(b.price), !!b.app, !!b.coupon].join('|');
}

export function relation(a, b) {
  if (!a || !b) return 'none';
  if (a.exactMatchKey && a.exactMatchKey === b.exactMatchKey) {
    if (!!a.bio !== !!b.bio) return a.bio ? 'conventional_alternative' : 'organic_alternative';
    return 'exact_match';
  }
  if (a.similarityKey && a.similarityKey === b.similarityKey) return 'similar_product';
  if (a.canonicalGroup && a.canonicalGroup === b.canonicalGroup) return 'same_group';
  return 'none';
}

export function comparable(a, b) {
  if (!a || !b || sameOffer(a, b)) return false;
  if (unitLabel(a) !== unitLabel(b)) return false;
  return ['exact_match', 'similar_product', 'organic_alternative', 'conventional_alternative'].includes(relation(a, b));
}

export function findComparison(main, allOffers = []) {
  if (!main) return null;
  const base = allOffers.filter(o => !sameOffer(main, o) && o.store !== main.store && comparable(main, o));
  const ranked = [...base].sort((a, b) => {
    const ar = relation(main, a) === 'exact_match' || relation(main, a).includes('_alternative') ? 0 : 1;
    const br = relation(main, b) === 'exact_match' || relation(main, b).includes('_alternative') ? 0 : 1;
    return ar - br || priceMetric(a) - priceMetric(b) || Number(a.price) - Number(b.price);
  });
  if (main.bio) {
    const conv = ranked.find(o => !o.bio);
    return conv ? { kind: 'conventional', candidate: conv, relation: relation(main, conv) } : null;
  }
  const sameBio = ranked.filter(o => !!o.bio === !!main.bio);
  if (!sameBio.length) return null;
  const candidate = sameBio[0];
  const currentMetric = priceMetric(main), candidateMetric = priceMetric(candidate);
  if (!Number.isFinite(currentMetric) || !Number.isFinite(candidateMetric)) return null;
  return candidateMetric < currentMetric - 1e-9
    ? { kind: 'cheaper_elsewhere', candidate, relation: relation(main, candidate) }
    : { kind: 'cheapest', candidate, relation: relation(main, candidate) };
}

export function median(values = []) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const m = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2;
}

function filteredValues(values) {
  const nums = values.map(Number).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (nums.length < 5) return nums;
  const q1 = median(nums.slice(0, Math.floor(nums.length / 2)));
  const q3 = median(nums.slice(Math.ceil(nums.length / 2)));
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr <= 0) return nums;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  return nums.filter(v => v >= lo && v <= hi);
}

export function assessPrice(currentOffer, events = [], { minObservations = 4, now = new Date() } = {}) {
  if (!currentOffer) return { status: 'insufficient', label: '🆕 Noch nicht genug Preisdaten', observations: 0 };
  const baseUnit = unitLabel(currentOffer);
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6);
  const matching = events.filter(e =>
    e.canonicalId === currentOffer.canonicalId &&
    !!e.organic === !!currentOffer.bio &&
    norm(e.baseUnit || '€/Packung') === baseUnit
  );
  const dated = matching.filter(e => {
    const d = new Date(e.lastSeen || e.validTo || e.validFrom || e.firstSeen || 0);
    return Number.isFinite(d.getTime()) && d >= cutoff;
  });
  const pool = dated.length >= minObservations ? dated : matching;
  const valueOf = e => Number(e.basePrice ?? e.price);
  const values = filteredValues(pool.map(valueOf));
  if (values.length < minObservations) return { status: 'insufficient', label: '🆕 Noch nicht genug Preisdaten', observations: values.length };
  const typical = median(values);
  const current = priceMetric(currentOffer);
  const min = Math.min(...values), max = Math.max(...values);
  if (!Number.isFinite(current) || !Number.isFinite(typical) || typical <= 0) return { status: 'insufficient', label: '🆕 Noch nicht genug Preisdaten', observations: values.length };
  const pct = (current / typical - 1) * 100;
  const historicalLow = max - min > 0.005 && current <= min + 0.005;
  if (historicalLow) return { status: 'low', label: '🏆 Historischer Tiefstpreis', observations: values.length, typical, current, min, max, differencePct: pct };
  if (pct <= -15) return { status: 'hot', label: `🔥 ${Math.round(Math.abs(pct))} % günstiger als üblich`, observations: values.length, typical, current, min, max, differencePct: pct };
  if (pct <= -5) return { status: 'good', label: `👍 ${Math.round(Math.abs(pct))} % günstiger als üblich`, observations: values.length, typical, current, min, max, differencePct: pct };
  if (pct > 5) return { status: 'high', label: `⚠️ ${Math.round(pct)} % teurer als üblich`, observations: values.length, typical, current, min, max, differencePct: pct };
  return { status: 'normal', label: '➖ Preis im normalen Bereich', observations: values.length, typical, current, min, max, differencePct: pct };
}

export { CATEGORY_ICONS, slug, norm };
