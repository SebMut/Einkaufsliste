import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const file = path.join(ROOT, 'data', 'offers-live.json');
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const before = Array.isArray(data.offers) ? data.offers.length : 0;
let repaired = 0;

function cleanMarkdown(value='') {
  return String(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^Angebot:\s*/i, '')
    .replace(/^Image:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function quantityForUnit(size='', label='') {
  const s = String(size);
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

function repairOffer(input) {
  const o = {...input};
  const cleaned = cleanMarkdown(o.name);
  if (cleaned !== o.name) { o.name = cleaned; repaired++; }

  if (!o.key || /https?:|javascript:|\]\(/i.test(String(o.key)) || String(o.key).length > 80) {
    o.key = cleaned.slice(0,55);
    repaired++;
  }

  const price = Number(o.price), unit = Number(o.unit);
  const q = quantityForUnit(o.size, o.unitLabel);
  // Typischer Parserfehler: Grundpreis landete als Packungspreis und die
  // Packungsmenge (z.B. 0,24 kg) als unit. Daraus lässt sich der korrekte
  // Packungspreis verlustfrei rekonstruieren.
  if (Number.isFinite(price) && Number.isFinite(unit) && q && q > 0) {
    const tolerance = Math.max(0.015, q * 0.06);
    if (Math.abs(unit - q) <= tolerance && price > 0.3) {
      o.price = +(price * q).toFixed(2);
      o.unit = +price.toFixed(3);
      repaired++;
    }
  }
  return o;
}

function validName(name='') {
  const n = String(name).trim();
  if (n.length < 3 || n.length > 140) return false;
  if (!/[A-Za-zÄÖÜäöüß]{3}/.test(n)) return false;
  if (/^(bio|aktion|knaller|superknüller|filiale|angebot|angebote|grundpreis|image)$/i.test(n)) return false;
  if (/^\(?\s*\d+[.,]\d+/i.test(n)) return false;
  if (/^(?:je\s+)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|st(?:ück)?\.?|er[- ]?pack|packg\.?|pckg\.?|schale)/i.test(n)) return false;
  if (/^je\s+.*(?:packg\.?|pckg\.?|packung|schale|becher|stück|st\.?)$/i.test(n)) return false;
  if (/^\(?\s*(?:pro|je)\s+(?:stück|kg|l)\s*=/i.test(n)) return false;
  if (/€\s*\/\s*(?:1\s*)?(?:kg|l|st)/i.test(n)) return false;
  if (/weitere informationen|verfügbarkeit|bedingungen der coupons|hilfe von ki|datenschutz|fußnoten|rechtliche hinweise|prospekt|newsletter|filiale wählen/i.test(n)) return false;
  return true;
}

function validOffer(o) {
  if (!o || !validName(o.name)) return false;
  if (!o.key || !String(o.key).trim()) return false;
  if (!Number.isFinite(Number(o.price)) || Number(o.price) <= 0.05 || Number(o.price) >= 300) return false;
  if (!Number.isFinite(Number(o.unit)) || Number(o.unit) <= 0) return false;
  if (!o.store || !o.market) return false;
  return true;
}

const seen = new Set();
const offers = [];
for (const raw of data.offers || []) {
  const offer = repairOffer(raw);
  if (!validOffer(offer)) continue;
  const key = [offer.store, offer.market, offer.name.toLowerCase(), offer.size, offer.price, !!offer.app, !!offer.coupon].join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  offers.push(offer);
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

await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
console.log(`Qualitätsfilter: ${before} -> ${offers.length} Angebote (${before-offers.length} verworfen, ${repaired} repariert).`);
