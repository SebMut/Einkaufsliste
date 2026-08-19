import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, findComparison, assessPrice, relation, comparable } from './product-normalizer.js';

const offer = (name, extra = {}) => normalizeOffer({
  name, store: 'REWE', market: 'Feldkirchen', size: '1 l', price: 1.29, unit: 1.29, unitLabel: '€/l', ...extra
});

const pair = (a, b, extraA = {}, extraB = {}) => [
  normalizeOffer({name: a, store: 'dm', market: 'Aschheim', size: '1 St.', price: 1.49, unit: 1.49, unitLabel: '€/Stk.', ...extraA}),
  normalizeOffer({name: b, store: 'ROSSMANN', market: 'Kirchheim', size: '1 St.', price: 1.99, unit: 1.99, unitLabel: '€/Stk.', ...extraB})
];

test('Frische Vollmilch wird als Milch gebündelt', () => {
  const o = offer('Frische Vollmilch 3,5 %');
  assert.equal(o.canonicalGroup, 'Milch');
  assert.equal(o.key, 'Milch');
  assert.equal(o.canonicalProduct, 'Vollmilch');
});

test('Milch und Vollmilch gehören zur selben allgemeinen Produktgruppe', () => {
  const a = offer('Frische Milch 3,5 %');
  const b = offer('Frische Vollmilch 3,5 %', {store: 'EDEKA'});
  assert.equal(a.canonicalGroup, 'Milch');
  assert.equal(b.canonicalGroup, 'Milch');
  assert.equal(a.bundleKey, b.bundleKey);
});

test('Bio Vollmilch bleibt Bio und Milch', () => {
  const o = offer('Bio Vollmilch 3,8 %');
  assert.equal(o.bio, true);
  assert.equal(o.canonicalGroup, 'Milch');
  assert.equal(o.attributes.fatContent, 3.8);
});

test('Windbeutel ist eine Süßspeise und weder Windel noch Windelbeutel', () => {
  const pastry = normalizeOffer({name: 'Mini Windbeutel mit Sahnefüllung', store: 'REWE', market: 'Feldkirchen', size: '250 g', price: 2.49, unit: 9.96, unitLabel: '€/kg'});
  const disposal = normalizeOffer({name: 'babylove Windelbeutel mit Frischeduft, 100 St.', store: 'dm', market: 'Aschheim', size: '100 St.', price: 1.45, unit: .0145, unitLabel: '€/Stk.'});
  const diaper = normalizeOffer({name: 'LILLYDOO Windeln Größe 1, 2-5 kg', store: 'MÜLLER', market: 'München-Riem Arcaden', size: '24 St.', price: 3.95, unit: .1646, unitLabel: '€/Stk.'});
  assert.equal(pastry.canonicalGroup, 'Windbeutel');
  assert.equal(disposal.canonicalGroup, 'Windelbeutel');
  assert.equal(diaper.canonicalGroup, 'Windeln');
  assert.notEqual(pastry.bundleKey, disposal.bundleKey);
  assert.notEqual(pastry.bundleKey, diaper.bundleKey);
  assert.notEqual(disposal.bundleKey, diaper.bundleKey);
});

test('Windeln und Windelbeutel werden selbst bei gleicher Einheit nie preislich verglichen', () => {
  const [diaper, disposal] = pair(
    'LILLYDOO Windeln Größe 1, 2-5 kg',
    'babylove Windelbeutel mit Frischeduft, 100 St.',
    {size: '24 St.', price: 3.95, unit: .1646},
    {size: '100 St.', price: 1.45, unit: .0145}
  );
  assert.equal(relation(diaper, disposal), 'none');
  assert.equal(comparable(diaper, disposal), false);
  assert.equal(findComparison(diaper, [diaper, disposal]), null);
});

test('Windbeutel und Windeln werden selbst bei künstlich gleicher Einheit nie verglichen', () => {
  const [pastry, diaper] = pair('Windbeutel', 'Windeln Größe 4');
  assert.equal(relation(pastry, diaper), 'none');
  assert.equal(comparable(pastry, diaper), false);
  assert.equal(findComparison(pastry, [pastry, diaper]), null);
});

test('Windel-Wortfamilie bleibt funktional getrennt', () => {
  const names = ['Windeln Größe 4', 'Windelbeutel', 'Windelcreme', 'Windeleimer', 'Windelvlies'];
  const groups = names.map(name => normalizeOffer({name, store: 'dm', market: 'Aschheim', size: '1 St.', price: 1, unit: 1, unitLabel: '€/Stk.'}).canonicalGroup);
  assert.deepEqual(groups, ['Windeln', 'Windelbeutel', 'Windelcreme', 'Windeleimer', 'Windelvlies']);
  assert.equal(new Set(groups).size, groups.length);
});

test('Windelgrößen sind gleiche Obergruppe, aber nicht austauschbar', () => {
  const [a, b] = pair('Windeln Größe 1, 2-5 kg', 'Windeln Größe 6, 15-30 kg');
  assert.equal(a.canonicalGroup, 'Windeln');
  assert.equal(b.canonicalGroup, 'Windeln');
  assert.equal(relation(a, b), 'same_group');
  assert.equal(comparable(a, b), false);
});

test('Milchreis ist keine Milch', () => {
  const o = offer('Müller Milchreis Original 200 g', {size: '200 g', unitLabel: '€/kg', unit: 6.45});
  assert.equal(o.canonicalGroup, 'Milchreis');
  assert.equal(o.canonicalProduct, 'Milchreis Dessert');
  assert.notEqual(o.canonicalGroup, 'Milch');
});

test('Milchschokolade ist keine Milch', () => {
  const o = offer('Alpenmilch Vollmilchschokolade 100 g', {size: '100 g', unitLabel: '€/kg', unit: 12.9});
  assert.equal(o.canonicalGroup, 'Schokolade');
  assert.notEqual(o.canonicalGroup, 'Milch');
});

test('Kokosmilch, Babymilch, Kondensmilch und Milchpulver sind keine Trinkmilch-Gruppe', () => {
  const products = [
    offer('Kokosmilch 400 ml'),
    offer('PRE Anfangsmilch 800 g'),
    offer('Kondensmilch 7,5 % 340 g'),
    offer('Milchpulver 500 g')
  ];
  for (const p of products) assert.notEqual(p.canonicalGroup, 'Milch');
});

test('Butter und Deutsche Markenbutter gehören zusammen', () => {
  const a = offer('Butter 250 g', {size: '250 g', unitLabel: '€/kg'});
  const b = offer('Deutsche Markenbutter 250 g', {store: 'EDEKA', size: '250 g', unitLabel: '€/kg'});
  assert.equal(a.canonicalGroup, 'Butter');
  assert.equal(b.canonicalGroup, 'Butter');
  assert.equal(a.bundleKey, b.bundleKey);
});

test('Butterkeks, Erdnussbutter und Kakaobutter sind keine Butter', () => {
  for (const name of ['Butterkeks 200 g', 'Erdnussbutter 350 g', 'Kakaobutter 100 g']) {
    const o = offer(name, {unitLabel: '€/kg'});
    assert.notEqual(o.canonicalGroup, 'Butter');
  }
});

test('Zahnpasta und Zahncreme werden zusammengefasst', () => {
  const [a, b] = pair('Zahnpasta Sensitiv', 'Zahncreme Sensitiv');
  assert.equal(a.canonicalGroup, 'Zahnpasta');
  assert.equal(b.canonicalGroup, 'Zahnpasta');
  assert.ok(['exact_match', 'similar_product'].includes(relation(a, b)));
});

test('Zahnpasta und Zahnbürste bleiben getrennt', () => {
  const [a, b] = pair('Zahnpasta Sensitiv', 'Zahnbürste Sensitiv');
  assert.equal(comparable(a, b), false);
});

test('Spülmittel und Spülmaschinentabs bleiben getrennt', () => {
  const [a, b] = pair('Spülmittel Zitrone', 'Spülmaschinentabs All in 1');
  assert.equal(a.canonicalGroup, 'Spülmittel');
  assert.equal(b.canonicalGroup, 'Spülmaschinentabs');
  assert.equal(comparable(a, b), false);
});

test('Waschmittel und Weichspüler bleiben getrennt', () => {
  const [a, b] = pair('Colorwaschmittel flüssig', 'Weichspüler Frischeduft');
  assert.equal(a.canonicalGroup, 'Waschmittel');
  assert.equal(b.canonicalGroup, 'Weichspüler');
  assert.equal(comparable(a, b), false);
});

test('Toilettenpapier und Küchenpapier bleiben getrennt', () => {
  const [a, b] = pair('Toilettenpapier 4-lagig', 'Küchenpapier 3-lagig');
  assert.equal(a.canonicalGroup, 'Toilettenpapier');
  assert.equal(b.canonicalGroup, 'Küchenpapier');
  assert.equal(comparable(a, b), false);
});

test('Windeln sind weder Feuchttücher noch Wickelunterlagen', () => {
  const diaper = normalizeOffer({name: 'Windeln Größe 4', store: 'dm', market: 'Aschheim', size: '30 St.', price: 5, unit: .16, unitLabel: '€/Stk.'});
  for (const name of ['Baby Feuchttücher', 'Wickelunterlagen']) {
    const other = normalizeOffer({name, store: 'ROSSMANN', market: 'Kirchheim', size: '30 St.', price: 2, unit: .06, unitLabel: '€/Stk.'});
    assert.equal(comparable(diaper, other), false);
  }
});

test('Apfelsaft ist kein Apfel-Angebot', () => {
  const o = offer('Wolfra Apfelsaft naturtrüb', {unitLabel: '€/l'});
  assert.equal(o.canonicalGroup, 'Saft');
  assert.notEqual(o.canonicalGroup, 'Äpfel');
});

test('Sicherheits-Wattestäbchen werden Baby & Kleinkind zugeordnet', () => {
  const o = normalizeOffer({name: 'babylove Sicherheits-Wattestäbchen', store: 'dm', market: 'Aschheim', size: '72 St.', price: .75, unit: .0104, unitLabel: '€/Stk.'});
  assert.equal(o.department, 'Drogerie');
  assert.equal(o.category, 'Baby & Kleinkind');
  assert.equal(o.canonicalProduct, 'Sicherheits-Wattestäbchen');
});

test('Rinderhack und gemischtes Hack sind gleiche Gruppe, aber nicht exakt', () => {
  const a = normalizeOffer({name: 'Rinderhackfleisch', store: 'REWE', market: 'A', size: '500 g', price: 4.99, unit: 9.98, unitLabel: '€/kg'});
  const b = normalizeOffer({name: 'Hackfleisch gemischt', store: 'EDEKA', market: 'B', size: '500 g', price: 3.99, unit: 7.98, unitLabel: '€/kg'});
  assert.equal(a.canonicalGroup, 'Hackfleisch');
  assert.equal(b.canonicalGroup, 'Hackfleisch');
  assert.equal(relation(a, b), 'same_group');
});

test('Ein einzelnes Angebot vergleicht sich nicht mit sich selbst', () => {
  const a = normalizeOffer({id: 1, name: 'babylove Sicherheits-Wattestäbchen', store: 'dm', market: 'Aschheim', size: '72 St.', price: .75, unit: .0104, unitLabel: '€/Stk.'});
  assert.equal(findComparison(a, [a]), null);
});

test('Doppelter Import desselben Angebots erzeugt keinen Vergleich', () => {
  const a = normalizeOffer({id: 1, name: 'babylove Sicherheits-Wattestäbchen', store: 'dm', market: 'Aschheim', size: '72 St.', price: .75, unit: .0104, unitLabel: '€/Stk.'});
  assert.equal(findComparison(a, [a, {...a}]), null);
});

test('dm und Rossmann ergeben bei wirklich austauschbarem Produkt einen Händlervergleich', () => {
  const dm = normalizeOffer({id: 1, name: 'babylove Sicherheits-Wattestäbchen', store: 'dm', market: 'Aschheim', size: '72 St.', price: .75, unit: .0104, unitLabel: '€/Stk.'});
  const ross = normalizeOffer({id: 2, name: 'babydream Sicherheits-Wattestäbchen', store: 'ROSSMANN', market: 'Kirchheim', size: '72 St.', price: .89, unit: .0124, unitLabel: '€/Stk.'});
  const cmp = findComparison(dm, [dm, ross]);
  assert.equal(cmp.kind, 'cheapest');
  assert.equal(cmp.candidate.store, 'ROSSMANN');
  const reverse = findComparison(ross, [dm, ross]);
  assert.equal(reverse.kind, 'cheaper_elsewhere');
  assert.equal(reverse.candidate.store, 'dm');
});

test('Preisbewertung meldet deutlich günstigeren Preis', () => {
  const current = offer('Bio Vollmilch 3,5 %', {bio: true, price: 1.06, unit: 1.06});
  const values = [1.29, 1.35, 1.25, 1.29, 1.39];
  const events = values.map((v, i) => ({
    canonicalId: current.canonicalId, organic: true, baseUnit: '€/l', basePrice: v,
    firstSeen: `2026-0${4 + i}-01`, lastSeen: `2026-0${4 + i}-01`, eventId: String(i)
  }));
  const r = assessPrice(current, events, {now: new Date('2026-08-19T12:00:00Z')});
  assert.ok(['hot', 'low'].includes(r.status));
  assert.ok(r.differencePct < -10);
});
