import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeOffer, norm } from './product-normalizer.js';

const ROOT = path.resolve(process.cwd(), '..');
const livePath = path.join(ROOT, 'data/offers-live.json');
const reportPath = path.join(ROOT, 'data/quality-report.json');
const live = JSON.parse(await fs.readFile(livePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8').catch(() => '{}'));
const before = (live.offers || []).length;

function dedupePrefix(name) {
  const words = norm(name).split(' ');
  for (let k = 2; k <= Math.min(8, Math.floor(words.length / 2)); k++) {
    const a = words.slice(0, k).join(' ').toLowerCase();
    const b = words.slice(k, 2 * k).join(' ').toLowerCase();
    if (a === b) return norm(words.slice(0, k).concat(words.slice(2 * k)).join(' '));
  }
  return norm(name);
}

function quantity(size = '') {
  let m = norm(size).match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);
  if (m) {
    let q = Number(m[1]) * Number(m[2].replace(',', '.'));
    const u = m[3].toLowerCase();
    if (u === 'g' || u === 'ml') q /= 1000;
    return { q, type: u === 'g' || u === 'kg' ? 'kg' : 'l' };
  }
  m = norm(size).match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);
  if (!m) return null;
  let q = Number(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'g' || u === 'ml') q /= 1000;
  return { q, type: u === 'g' || u === 'kg' ? 'kg' : u === 'l' || u === 'ml' ? 'l' : 'st' };
}

function recalc(o) {
  const q = quantity(o.size);
  if (!q || !Number.isFinite(+o.price) || q.q <= 0) return;
  o.unit = +(+o.price / q.q).toFixed(3);
  o.unitLabel = q.type === 'kg' ? '€/kg' : q.type === 'l' ? '€/l' : '€/Stk.';
}

let repaired = 0;
const rows = [];
for (const raw of live.offers || []) {
  const o = { ...raw };
  let name = norm(o.name);
  const repeated = dedupePrefix(name);
  if (repeated !== name) { name = repeated; repaired++; }

  const total = name.match(/\bje\s+\d+\s*St\.?\s*=\s*(\d+(?:[.,]\d+)?)\s*-?\s*g-?Packg\.?/i);
  if (total) {
    o.size = `${total[1]} g`;
    name = norm(name.replace(total[0], ''));
    repaired++;
    recalc(o);
  }
  name = name.replace(/\s+je\s+\d+\s*St\.?\s*=\s*\d+(?:[.,]\d+)?\s*-?\s*g-?Packg\.?/i, '').replace(/[,*]+$/, '').trim();
  o.name = name;

  const normalized = normalizeOffer(o);
  normalized.normalizedAt = new Date().toISOString();
  rows.push(normalized);
}

const unique = new Map();
for (const o of rows) {
  const k = [o.store, o.market, String(o.name).toLowerCase(), String(o.size).toLowerCase(), +o.price, !!o.app, !!o.coupon].join('|');
  if (!unique.has(k)) unique.set(k, o);
}
const offers = [...unique.values()].sort((a, b) =>
  String(a.bundleKey || a.key).localeCompare(String(b.bundleKey || b.key), 'de') ||
  Number(!!b.bio) - Number(!!a.bio) || Number(a.unit) - Number(b.unit)
);
offers.forEach((o, i) => o.id = i + 1);

const counts = new Map();
for (const o of offers) counts.set(`${o.store}|${o.market}`, (counts.get(`${o.store}|${o.market}`) || 0) + 1);
for (const s of live.sources || []) {
  const c = counts.get(`${s.store}|${s.market}`) || 0;
  s.count = c;
  if (c > 0) { s.status = 'ok'; s.message = `${c} qualitätsgeprüfte Angebote`; }
}

live.schema = Math.max(Number(live.schema) || 0, 4);
live.offers = offers;
live.offerCount = offers.length;
live.normalization = {
  version: 1,
  at: new Date().toISOString(),
  taxonomy: 'semantic-hybrid',
  fields: ['department','category','subcategory','canonicalGroup','canonicalProduct','canonicalId','bundleKey','similarityKey','exactMatchKey','marketSection','confidence']
};
live.qualityV4 = { at: new Date().toISOString(), before, after: offers.length, repaired };
report.semanticPass = { at: new Date().toISOString(), before, after: offers.length, repaired, normalizer: 'product-normalizer-v1' };

await Promise.all([
  fs.writeFile(livePath, JSON.stringify(live, null, 2) + '\n'),
  fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
]);
console.log(`Qualität V4: ${before} -> ${offers.length}; ${repaired} semantische Reparaturen; Produktnormalisierung V1 aktiv.`);
