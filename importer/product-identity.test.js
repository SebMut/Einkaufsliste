import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, relation } from './product-normalizer.js';
import { applyProductIdentity, normalizeGtin } from './product-identity.js';

const identified=(name,extra={})=>applyProductIdentity(normalizeOffer({name,store:'REWE',market:'Feldkirchen',size:'1 l',price:1.29,unit:1.29,unitLabel:'€/l',...extra}));

test('valide EAN/GTIN wird erkannt',()=>assert.equal(normalizeGtin('4006381333931'),'4006381333931'));
test('ungültige EAN wird nicht als Identität verwendet',()=>assert.equal(normalizeGtin('4006381333932'),null));

test('identische EAN hat Vorrang und ergibt exact_match',()=>{
  const a=identified('Marken Vollmilch 3,5 %',{store:'REWE',ean:'4006381333931'});
  const b=identified('Markenmilch Vollmilch 3,5 %',{store:'EDEKA',ean:'4006381333931'});
  assert.equal(a.exactMatchKey,'gtin:4006381333931');
  assert.equal(relation(a,b),'exact_match');
});

test('Eigenmarken derselben Milchgruppe sind ohne gleiche EAN nicht exact_match',()=>{
  const a=identified('ja! Vollmilch 3,5 %',{store:'REWE'});
  const b=identified('Milsani Vollmilch 3,5 %',{store:'ALDI SÜD'});
  assert.equal(a.canonicalGroup,'Milch');
  assert.equal(b.canonicalGroup,'Milch');
  assert.notEqual(relation(a,b),'exact_match');
  assert.equal(relation(a,b),'similar_product');
});
