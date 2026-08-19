import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeOffer } from './product-normalizer.js';
import { semanticCompatible } from './semantic-products.js';

const dataPath = path.resolve(process.cwd(), '..', 'data', 'offers-live.json');
let raw = {offers: []};
try {
  raw = JSON.parse(await fs.readFile(dataPath, 'utf8'));
} catch {}
const offers = (raw.offers || []).filter(o => o?.name).map(normalizeOffer);

const expectedTypes = [
  [/\bwindbeutel\b|\bwindbeutelchen\b/i, 'Windbeutel'],
  [/windelbeutel/i, 'Windelbeutel'],
  [/windelcreme|wundschutz(?:creme)?/i, 'Windelcreme'],
  [/windeleimer/i, 'Windeleimer'],
  [/windelvlies/i, 'Windelvlies'],
  [/milchreis/i, 'Milchreis'],
  [/kokosmilch/i, 'Kokosmilch'],
  [/butterkeks/i, 'Butterkeks'],
  [/erdnussbutter/i, 'Erdnussbutter'],
  [/zahnbürste/i, 'Zahnbürste'],
  [/weichspüler/i, 'Weichspüler'],
  [/toilettenpapier/i, 'Toilettenpapier'],
  [/küchenpapier|küchenrolle/i, 'Küchenpapier']
];

test('bekannte zusammengesetzte Produktnamen werden im Live-Bestand semantisch korrekt erkannt', () => {
  for (const offer of offers) {
    for (const [pattern, expected] of expectedTypes) {
      if (!pattern.test(offer.name)) continue;
      assert.equal(
        offer.semanticType,
        expected,
        `Falscher Produkttyp für "${offer.name}": ${offer.semanticType} statt ${expected}`
      );
      break;
    }
  }
});

test('kein UI-Bundle enthält zwei bekannte funktional inkompatible Produkttypen', () => {
  const groups = new Map();
  for (const offer of offers) {
    const key = offer.bundleKey || offer.key || offer.canonicalProduct || offer.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(offer);
  }

  const conflicts = [];
  for (const [key, items] of groups) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (!a.semanticType || !b.semanticType) continue;
        if (!semanticCompatible(a, b)) {
          conflicts.push(`${key}: "${a.name}" (${a.semanticType}) <> "${b.name}" (${b.semanticType})`);
          if (conflicts.length >= 20) break;
        }
      }
      if (conflicts.length >= 20) break;
    }
    if (conflicts.length >= 20) break;
  }
  assert.deepEqual(conflicts, [], `Semantische Bundle-Konflikte:\n${conflicts.join('\n')}`);
});

test('Windbeutel, Windelbeutel und Windeln können nie denselben Bundle-Key erhalten', () => {
  const examples = [
    normalizeOffer({name:'Mini Windbeutel mit Sahnefüllung',size:'250 g'}),
    normalizeOffer({name:'Windelbeutel mit Frischeduft, 100 St.',size:'100 St.'}),
    normalizeOffer({name:'Windeln Größe 1, 2-5 kg',size:'24 St.'})
  ];
  assert.equal(new Set(examples.map(o => o.bundleKey)).size, 3);
});
