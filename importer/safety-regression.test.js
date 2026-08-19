import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, relation, assessPrice } from './product-normalizer.js';
import { applyProductIdentity } from './product-identity.js';

const concrete = (name, brand, gtin) => applyProductIdentity(normalizeOffer({
  name, brand, gtin, store:brand, market:brand, size:'1 l', price:1.29, unit:1.29, unitLabel:'€/l'
}));

test('ungültige gleiche GTIN erzeugt niemals ein exact_match', () => {
  const a=concrete('Frische Vollmilch 3,5 %','Marke A','4006381333932');
  const b=concrete('Frische Vollmilch 3,5 %','Marke B','4006381333932');
  assert.equal(a.gtin, null);
  assert.equal(b.gtin, null);
  assert.notEqual(a.canonicalProductId,b.canonicalProductId);
  assert.notEqual(relation(a,b),'exact_match');
});

test('valide gleiche GTIN bleibt stärkste konkrete Produktidentität', () => {
  const a=concrete('Markenprodukt Vollmilch','Marke A','4006381333931');
  const b=concrete('Markenprodukt Vollmilch','Marke A','4006381333931');
  b.store='Anderer Händler';
  b.market='Andere Filiale';
  assert.equal(a.gtin,'4006381333931');
  assert.equal(b.gtin,'4006381333931');
  assert.equal(relation(a,b),'exact_match');
});

test('Preisbewertung mischt andere konkrete Produkte derselben Gruppe nicht ein', () => {
  const current={
    canonicalProductId:'marke-a-vollmilch', canonicalId:'milch-35', bio:false,
    price:1.00, unit:1.00, unitLabel:'€/l'
  };
  const event=(id,price,day)=>({
    canonicalProductId:id, canonicalId:'milch-35', organic:false, baseUnit:'€/l',
    basePrice:price, lastSeen:`2026-08-${String(day).padStart(2,'0')}T10:00:00Z`
  });
  const events=[
    event('marke-a-vollmilch',1.29,1),
    event('marke-b-vollmilch',1.49,2),
    event('marke-b-vollmilch',1.59,3),
    event('marke-b-vollmilch',1.69,4),
    event('marke-b-vollmilch',1.79,5)
  ];
  const result=assessPrice(current,events,{minObservations:4,now:new Date('2026-08-19T12:00:00Z')});
  assert.equal(result.status,'insufficient');
  assert.equal(result.observations,1);
});
