import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const file = path.join(ROOT, 'data', 'offers-live.json');
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const before = Array.isArray(data.offers) ? data.offers.length : 0;

function validName(name='') {
  const n = String(name).trim();
  if (n.length < 3 || n.length > 125) return false;
  if (!/[A-Za-zÄÖÜäöüß]{3}/.test(n)) return false;
  if (/^(bio|aktion|knaller|superknüller|filiale|angebot|angebote|grundpreis)$/i.test(n)) return false;
  if (/^\(?\s*\d+[.,]\d+/i.test(n)) return false;
  if (/€\s*\/\s*(?:1\s*)?(?:kg|l|st)/i.test(n)) return false;
  if (/^\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|st(?:ück)?\.?)$/i.test(n)) return false;
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
for (const offer of data.offers || []) {
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
  rejected: before - offers.length
};

await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
console.log(`Qualitätsfilter: ${before} -> ${offers.length} Angebote (${before-offers.length} verworfen).`);
