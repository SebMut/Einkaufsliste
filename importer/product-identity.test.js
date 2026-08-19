import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, relation } from './product-normalizer.js';
import { applyProductIdentity, normalizeGtin } from './product-identity.js';

const identified = (name, extra = {}) => applyProductIdentity(normalizeOffer({
  name, store: 'REWE', market: 'Feldkirchen', size: '1 l', price: 1.29, unit: 1.29, unitLabel: '€/l', ...extra
}));

test('valide EAN/GTIN wird erkannt', () => assert.equal(normalizeGtin('4006381333931'), '4006381333931'));
test('ungültige EAN wird nicht als Identität verwendet', () => assert.equal(normalizeGtin('4006381333932'), null));

test('identische EAN hat Vorrang und ergibt exact_match', () => {
  const a = identified('Marken Vollmilch 3,5 %', {store: 'REWE', ean: '4006381333931'});
  const b = identified('Markenmilch Vollmilch 3,5 %', {store: 'EDEKA', ean: '4006381333931'});
  assert.equal(a.exactMatchKey, 'gtin:4006381333931');
  assert.equal(a.canonicalProductId, b.canonicalProductId);
  assert.equal(relation(a, b), 'exact_match');
});

test('Eigenmarken derselben Milchgruppe bleiben konkrete unterschiedliche Produkte', () => {
  const a = identified('ja! Vollmilch 3,5 %', {store: 'REWE', brand: 'ja!'});
  const b = identified('Milsani Vollmilch 3,5 %', {store: 'ALDI SÜD', brand: 'Milsani'});
  assert.equal(a.canonicalGroup, 'Milch');
  assert.equal(b.canonicalGroup, 'Milch');
  assert.notEqual(a.canonicalProductId, b.canonicalProductId);
  assert.notEqual(relation(a, b), 'exact_match');
  assert.ok(['similar_product', 'same_group'].includes(relation(a, b)));
});

test('gleiches Markenprodukt bei zwei Händlern erhält dieselbe konkrete Produkt-ID', () => {
  const a = identified('Pampers Baby-Dry Windeln Größe 4, 9-14 kg', {
    store: 'dm', brand: 'Pampers', size: '30 St.', unitLabel: '€/Stk.'
  });
  const b = identified('Pampers Baby-Dry Windeln Größe 4, 9-14 kg', {
    store: 'MÜLLER', brand: 'Pampers', size: '30 St.', unitLabel: '€/Stk.'
  });
  assert.equal(a.canonicalProductId, b.canonicalProductId);
});

test('Windbeutel, Windelbeutel und Windeln erhalten verschiedene konkrete IDs', () => {
  const pastry = identified('Mini Windbeutel mit Sahnefüllung', {brand: 'Coppenrath', size: '250 g', unitLabel: '€/kg'});
  const bags = identified('Windelbeutel mit Frischeduft', {brand: 'babylove', size: '100 St.', unitLabel: '€/Stk.'});
  const diapers = identified('Windeln Größe 1, 2-5 kg', {brand: 'LILLYDOO', size: '24 St.', unitLabel: '€/Stk.'});
  assert.equal(new Set([pastry.canonicalProductId, bags.canonicalProductId, diapers.canonicalProductId]).size, 3);
});
