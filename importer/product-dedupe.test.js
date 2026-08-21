import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeProducts, collapseProductsForDisplay, likelySameProduct } from './product-dedupe.js';

const base = (extra={}) => ({
  store:'ALDI SÜD', market:'Aschheim', address:'Ludwig-Thoma-Straße 2', name:'MILSANI Deutsche Markenbutter', brand:'MILSANI', size:'250 g', price:1.99,currentPrice:1.99,bio:false,canonicalGroup:'Butter',comparisonKey:'butter', ...extra
});

test('gleiche GTIN in derselben Filiale wird zusammengeführt',()=>{
  const rows=dedupeProducts([base({ean:'4006381333931'}),base({gtin:'4006381333931',sourceType:'official_catalog'})]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].mergedFromCount,2);
});

test('Katalogpreis und Angebot desselben Produkts werden eine Karte',()=>{
  const regular=base({price:2.29,currentPrice:2.29,regularPrice:2.29,isOffer:false,sourceType:'official_catalog'});
  const offer=base({name:'Deutsche Markenbutter MILSANI',price:1.79,currentPrice:1.79,offerPrice:1.79,regularPrice:2.29,isOffer:true,sourceType:'official_offer'});
  const rows=dedupeProducts([regular,offer]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].isOffer,true);
  assert.equal(rows[0].currentPrice,1.79);
  assert.equal(rows[0].regularPrice,2.29);
});

test('Milch 1,5 % und 3,5 % bleiben getrennt',()=>{
  const a=base({name:'MILSANI Milch 1,5 %',size:'1 l',canonicalGroup:'Milch',comparisonKey:'milch'});
  const b=base({name:'MILSANI Milch 3,5 %',size:'1 l',canonicalGroup:'Milch',comparisonKey:'milch'});
  assert.equal(likelySameProduct(a,b),false);
  assert.equal(dedupeProducts([a,b]).length,2);
});

test('Butter 250 g und 500 g bleiben getrennt',()=>{
  assert.equal(dedupeProducts([base({size:'250 g'}),base({size:'500 g'})]).length,2);
});

test('Bio und konventionell bleiben getrennt',()=>{
  assert.equal(dedupeProducts([base({bio:false}),base({bio:true,name:'MILSANI Bio Deutsche Markenbutter'})]).length,2);
});

test('Datenebene behält verschiedene Filialen getrennt, UI fasst sie zusammen',()=>{
  const a=base({market:'Aschheim',address:'Ludwig-Thoma-Straße 2'});
  const b=base({market:'München-Riem Arcaden',address:'Willy-Brandt-Platz 5'});
  assert.equal(dedupeProducts([a,b],{scope:'branch'}).length,2);
  const ui=collapseProductsForDisplay([a,b]);
  assert.equal(ui.length,1);
  assert.equal(ui[0].branchCount,2);
});
