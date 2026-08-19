import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, findComparison, assessPrice, relation } from './product-normalizer.js';

const offer = (name, extra={}) => normalizeOffer({name, store:'REWE', market:'Feldkirchen', size:'1 l', price:1.29, unit:1.29, unitLabel:'€/l', ...extra});

test('Frische Vollmilch wird als Milch gebündelt', () => {
  const o = offer('Frische Vollmilch 3,5 %');
  assert.equal(o.canonicalGroup, 'Milch');
  assert.equal(o.key, 'Milch');
  assert.equal(o.canonicalProduct, 'Vollmilch');
});

test('Bio Vollmilch bleibt Bio und Milch', () => {
  const o = offer('Bio Vollmilch 3,8 %');
  assert.equal(o.bio, true);
  assert.equal(o.canonicalGroup, 'Milch');
  assert.equal(o.attributes.fatContent, 3.8);
});

test('Milchreis ist keine Milch', () => {
  const o = offer('Müller Milchreis Original 200 g', {size:'200 g', unitLabel:'€/kg', unit:6.45});
  assert.equal(o.canonicalGroup, 'Milchreis');
  assert.equal(o.canonicalProduct, 'Milchreis Dessert');
  assert.notEqual(o.canonicalGroup, 'Milch');
});

test('Milchschokolade ist keine Milch', () => {
  const o = offer('Alpenmilch Vollmilchschokolade 100 g', {size:'100 g', unitLabel:'€/kg', unit:12.9});
  assert.equal(o.canonicalGroup, 'Schokolade');
  assert.notEqual(o.canonicalGroup, 'Milch');
});

test('Butterkeks ist keine Butter', () => {
  const o = offer('Butterkeks 200 g', {size:'200 g', unitLabel:'€/kg', unit:7.45});
  assert.equal(o.canonicalGroup, 'Kekse');
  assert.notEqual(o.canonicalGroup, 'Butter');
});

test('Apfelsaft ist kein Apfel-Angebot', () => {
  const o = offer('Wolfra Apfelsaft naturtrüb', {unitLabel:'€/l'});
  assert.equal(o.canonicalGroup, 'Saft');
  assert.notEqual(o.canonicalGroup, 'Äpfel');
});

test('Sicherheits-Wattestäbchen werden Baby & Kleinkind zugeordnet', () => {
  const o = normalizeOffer({name:'babylove Sicherheits-Wattestäbchen',store:'dm',market:'Region Feldkirchen',size:'72 St.',price:.75,unit:.0104,unitLabel:'€/Stk.'});
  assert.equal(o.department, 'Drogerie');
  assert.equal(o.category, 'Baby & Kleinkind');
  assert.equal(o.canonicalProduct, 'Sicherheits-Wattestäbchen');
});

test('Rinderhack und gemischtes Hack sind gleiche Gruppe, aber nicht exakt', () => {
  const a = normalizeOffer({name:'Rinderhackfleisch',store:'REWE',market:'A',size:'500 g',price:4.99,unit:9.98,unitLabel:'€/kg'});
  const b = normalizeOffer({name:'Hackfleisch gemischt',store:'EDEKA',market:'B',size:'500 g',price:3.99,unit:7.98,unitLabel:'€/kg'});
  assert.equal(a.canonicalGroup, 'Hackfleisch');
  assert.equal(b.canonicalGroup, 'Hackfleisch');
  assert.equal(relation(a,b), 'same_group');
});

test('Ein einzelnes Angebot vergleicht sich nicht mit sich selbst', () => {
  const a = normalizeOffer({id:1,name:'babylove Sicherheits-Wattestäbchen',store:'dm',market:'Region Feldkirchen',size:'72 St.',price:.75,unit:.0104,unitLabel:'€/Stk.'});
  assert.equal(findComparison(a,[a]), null);
});

test('Doppelter Import desselben Angebots erzeugt keinen Vergleich', () => {
  const a = normalizeOffer({id:1,name:'babylove Sicherheits-Wattestäbchen',store:'dm',market:'Region Feldkirchen',size:'72 St.',price:.75,unit:.0104,unitLabel:'€/Stk.'});
  const dup = {...a,id:1};
  assert.equal(findComparison(a,[a,dup]), null);
});

test('dm und Rossmann ergeben einen echten Händlervergleich', () => {
  const dm = normalizeOffer({id:1,name:'babylove Sicherheits-Wattestäbchen',store:'dm',market:'Region Feldkirchen',size:'72 St.',price:.75,unit:.0104,unitLabel:'€/Stk.'});
  const ross = normalizeOffer({id:2,name:'babydream Sicherheits-Wattestäbchen',store:'ROSSMANN',market:'Region Feldkirchen',size:'72 St.',price:.89,unit:.0124,unitLabel:'€/Stk.'});
  const cmp = findComparison(dm,[dm,ross]);
  assert.equal(cmp.kind, 'cheapest');
  assert.equal(cmp.candidate.store, 'ROSSMANN');
  const reverse = findComparison(ross,[dm,ross]);
  assert.equal(reverse.kind, 'cheaper_elsewhere');
  assert.equal(reverse.candidate.store, 'dm');
});

test('Preisbewertung meldet deutlich günstigeren Preis', () => {
  const current = offer('Bio Vollmilch 3,5 %',{bio:true,price:1.06,unit:1.06});
  const values=[1.29,1.35,1.25,1.29,1.39];
  const events=values.map((v,i)=>({canonicalId:current.canonicalId,organic:true,baseUnit:'€/l',basePrice:v,firstSeen:`2026-0${4+i}-01`,lastSeen:`2026-0${4+i}-01`,eventId:String(i)}));
  const r=assessPrice(current,events,{now:new Date('2026-08-19T12:00:00Z')});
  assert.ok(['hot','low'].includes(r.status));
  assert.ok(r.differencePct < -10);
});
