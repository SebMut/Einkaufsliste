import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeOffer, norm } from './product-normalizer.js';

const ROOT = path.resolve(process.cwd(), '..');
const DATA = path.join(ROOT, 'data');
const livePath = path.join(DATA, 'offers-live.json');
const historyPath = path.join(DATA, 'price-history.json');

const live = JSON.parse(await fs.readFile(livePath, 'utf8'));
let history = { schema: 1, updatedAt: null, minObservationsForRating: 4, events: [] };
try {
  const existing = JSON.parse(await fs.readFile(historyPath, 'utf8'));
  if (existing && Array.isArray(existing.events)) history = { ...history, ...existing };
} catch {}

const now = new Date(live.generatedAt || Date.now());
const nowIso = Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString();
const day = iso => {
  const d = new Date(iso || nowIso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : nowIso.slice(0, 10);
};
const value = (o, ...keys) => keys.map(k => o?.[k]).find(v => v != null && String(v).trim() !== '');
const eventMetric = o => Number.isFinite(Number(o.unit)) && Number(o.unit) > 0 ? Number(o.unit) : Number(o.price);
const round = n => Number.isFinite(Number(n)) ? +Number(n).toFixed(4) : null;
const explicitFrom = o => value(o, 'validFrom', 'valid_from', 'offerValidFrom', 'validityFrom');
const explicitTo = o => value(o, 'validTo', 'valid_to', 'offerValidTo', 'validityTo');
const imported = o => value(o, 'importedAt', 'import_timestamp') || live.generatedAt || nowIso;
const identity = e => [e.canonicalId, e.organic ? 'bio' : 'conv', e.store, e.market, e.baseUnit, e.price, e.basePrice, e.validFrom || '', e.validTo || ''].join('|');
const samePriceIdentity = (a, b) => [a.canonicalId, !!a.organic, a.store, a.market, a.baseUnit, a.price, a.basePrice].join('|') === [b.canonicalId, !!b.organic, b.store, b.market, b.baseUnit, b.price, b.basePrice].join('|');
const daysBetween = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;

const existingByIdentity = new Map(history.events.map(e => [identity(e), e]));
let inserted = 0, extended = 0;

for (const raw of live.offers || []) {
  const o = normalizeOffer(raw);
  const seenAt = imported(o);
  const fromRaw = explicitFrom(o);
  const toRaw = explicitTo(o);
  const validFrom = fromRaw ? day(fromRaw) : null;
  const validTo = toRaw ? day(toRaw) : null;
  const candidate = {
    canonicalId: o.canonicalId,
    canonicalGroup: o.canonicalGroup,
    canonicalProduct: o.canonicalProduct,
    bundleKey: o.bundleKey,
    exactMatchKey: o.exactMatchKey,
    similarityKey: o.similarityKey,
    organic: !!o.bio,
    store: norm(o.store),
    market: norm(o.market),
    name: norm(o.name),
    size: norm(o.size),
    price: round(o.price),
    regularPrice: round(value(o, 'regularPrice', 'regular_price')),
    offerPrice: round(value(o, 'offerPrice', 'offer_price') ?? o.price),
    basePrice: round(eventMetric(o)),
    baseUnit: norm(o.unitLabel || '€/Packung'),
    quantity: value(o, 'quantity') ?? null,
    unit: norm(value(o, 'measureUnit', 'quantityUnit') || ''),
    isOffer: o.advertised !== false,
    source: norm(o.sourceUrl || ''),
    validFrom,
    validTo,
    firstSeen: new Date(seenAt).toISOString(),
    lastSeen: new Date(seenAt).toISOString()
  };
  if (!candidate.canonicalId || !candidate.store || !Number.isFinite(candidate.price) || !Number.isFinite(candidate.basePrice)) continue;

  const exact = existingByIdentity.get(identity(candidate));
  if (exact) {
    if (new Date(candidate.lastSeen) > new Date(exact.lastSeen || exact.firstSeen)) exact.lastSeen = candidate.lastSeen;
    extended++;
    continue;
  }

  if (!candidate.validFrom && !candidate.validTo) {
    const previous = [...history.events].reverse().find(e => samePriceIdentity(e, candidate) && daysBetween(e.lastSeen || e.firstSeen, candidate.firstSeen) <= 8);
    if (previous) {
      previous.lastSeen = candidate.lastSeen;
      extended++;
      continue;
    }
  }

  candidate.eventId = `${candidate.canonicalId}-${candidate.organic ? 'bio' : 'conv'}-${Date.parse(candidate.firstSeen)}-${inserted}`;
  history.events.push(candidate);
  existingByIdentity.set(identity(candidate), candidate);
  inserted++;
}

history.events = history.events
  .filter(e => e && e.canonicalId && Number.isFinite(Number(e.price)) && Number.isFinite(Number(e.basePrice)))
  .sort((a, b) => new Date(a.firstSeen) - new Date(b.firstSeen));
history.schema = 1;
history.updatedAt = nowIso;
history.minObservationsForRating = 4;
history.eventCount = history.events.length;
history.productCount = new Set(history.events.map(e => `${e.canonicalId}|${!!e.organic}`)).size;

await fs.writeFile(historyPath, JSON.stringify(history, null, 2) + '\n');
console.log(`Preishistorie: ${inserted} neue Preisereignisse, ${extended} fortgeschrieben, ${history.events.length} gesamt.`);
