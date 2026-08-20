import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchStaple,chooseStapleResult,evaluateStaples} from './staples-matcher.js';

const config=JSON.parse(fs.readFileSync(new URL('../data/staples.json',import.meta.url),'utf8'));
const byId=id=>config.items.find(x=>x.id===id);
const offer=(x={})=>({id:Math.random(),store:'REWE',market:'Feldkirchen',price:2.49,unit:2.49,unitLabel:'€/l',activeMarket:true,...x});

test('Andechser Bio-Milch matcht nur passendes Markenprodukt in Glas/Mehrweg',()=>{
  const s=byId('andechser-bio-milch-glas');
  assert.equal(matchStaple(s,offer({name:'Andechser Natur Bio Vollmilch 3,5% Glasflasche',brand:'Andechser',semanticType:'Milch',canonicalGroup:'Milch',bio:true})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Andechser Natur Bio Vollmilch 3,5% Mehrweg',brand:'Andechser',semanticType:'Milch',canonicalGroup:'Milch',bio:true})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Andechser Natur Bio Vollmilch 3,5% Karton',brand:'Andechser',semanticType:'Milch',canonicalGroup:'Milch',bio:true})).matches,false);
  assert.equal(matchStaple(s,offer({name:'Andechser Bio Naturjoghurt Glas',brand:'Andechser',semanticType:'Joghurt',canonicalGroup:'Joghurt',bio:true})).matches,false);
  assert.equal(matchStaple(s,offer({name:'Milchreis klassisch Glas',brand:'Andechser',semanticType:'Milchreis',canonicalGroup:'Milchreis',bio:true})).matches,false);
  assert.equal(matchStaple(s,offer({name:'Bio Vollmilch Glasflasche',brand:'Berchtesgadener Land',semanticType:'Milch',canonicalGroup:'Milch',bio:true})).matches,false);
});

test('Andechser Butter verwechselt Butter nicht mit Butterkeks',()=>{
  const s=byId('andechser-butter');
  assert.equal(matchStaple(s,offer({name:'Andechser Bio Almbutter',brand:'Andechser',semanticType:'Butter',canonicalGroup:'Butter'})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Andechser Butterkeks',brand:'Andechser',semanticType:'Keks',canonicalGroup:'Kekse'})).matches,false);
});

test('Adelholzener Mineralwasser schließt Schorle aus',()=>{
  const s=byId('adelholzener-wasser');
  assert.equal(matchStaple(s,offer({name:'Adelholzener Classic Mineralwasser',brand:'Adelholzener',semanticType:'Mineralwasser',canonicalGroup:'Wasser'})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Adelholzener Bio Apfelschorle',brand:'Adelholzener',semanticType:'Schorle',canonicalGroup:'Schorle'})).matches,false);
});

test('Alkoholfreies Bier verlangt alkoholfrei/0,0 und Bierbezug',()=>{
  const s=byId('alkoholfreies-bier');
  assert.equal(matchStaple(s,offer({name:'Paulaner Münchner Hell alkoholfrei Bier',semanticType:'Bier',canonicalGroup:'Alkoholfreies Bier'})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Bayerisches Helles 0,0 Bier',semanticType:'Bier',canonicalGroup:'Bier'})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Paulaner Münchner Hell Bier',semanticType:'Bier',canonicalGroup:'Bier'})).matches,false);
  assert.equal(matchStaple(s,offer({name:'Alkoholfreier Sekt',semanticType:'Sekt',canonicalGroup:'Sekt'})).matches,false);
  assert.equal(matchStaple(s,offer({name:'Alkoholfreies Radler Bier',semanticType:'Bier',canonicalGroup:'Bier'})).matches,false);
});

test('Halloumi ist nicht automatisch jeder Grillkäse',()=>{
  const s=byId('halloumi');
  assert.equal(matchStaple(s,offer({name:'Bio Halloumi Grillkäse',semanticType:'Käse',canonicalGroup:'Käse'})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Bio Grillkäse Kräuter',semanticType:'Käse',canonicalGroup:'Käse'})).matches,false);
  assert.equal(matchStaple(s,offer({name:'Gouda jung',semanticType:'Käse',canonicalGroup:'Käse'})).matches,false);
});

test('Bio-Obst und Bio-Gemüse werden bis zur Sortendefinition nicht pauschal verglichen',()=>{
  const obst=byId('bio-obst'),gemuese=byId('bio-gemuese');
  assert.equal(obst.needsDefinition,true);
  assert.equal(gemuese.needsDefinition,true);
  assert.equal(matchStaple(obst,offer({name:'Bio Banane',category:'Obst & Gemüse',bio:true})).matches,false);
  assert.equal(matchStaple(gemuese,offer({name:'Bio Gurke',category:'Obst & Gemüse',bio:true})).matches,false);
});

test('Reis schließt Milchreis und Reiswaffeln aus',()=>{
  const s=byId('reis');
  assert.equal(matchStaple(s,offer({name:'Basmati Reis',semanticType:'Reis',canonicalGroup:'Reis'})).matches,true);
  assert.equal(matchStaple(s,offer({name:'Milchreis klassisch',semanticType:'Milchreis',canonicalGroup:'Milchreis'})).matches,false);
  assert.equal(matchStaple(s,offer({name:'Reiswaffeln',semanticType:'Reiswaffeln',canonicalGroup:'Snacks'})).matches,false);
});

test('Live-Regressionsfall: RAMA Brotaufstrich ist kein Brot',()=>{
  const s=byId('brot');
  const x=offer({name:'RAMA Brot­aufstrich',semanticType:'Brot',canonicalGroup:'Brot',store:'PENNY',price:1.29,unit:3.23,unitLabel:'€/kg'});
  assert.equal(matchStaple(s,x).matches,false);
});

test('Live-Regressionsfall: Hunde-Reis-Sticks sind kein Reis-Grundlebensmittel',()=>{
  const s=byId('reis');
  const x=offer({
    name:'Marke: Good Boy; Produktname: Hundeleckerli Hähnchen Reis-Sticks, Adult, 90 g; Rechtliche Kategorie: Ergänzungsfuttermittel;',
    semanticType:'Reis',canonicalGroup:'Reis',category:'Tierbedarf',store:'dm',price:1.95,unit:21.67,unitLabel:'€/kg'
  });
  assert.equal(matchStaple(s,x).matches,false);
});

test('Gruppenvergleich nutzt bei mehreren Produkten den Grundpreis',()=>{
  const s=byId('nudeln');
  const result=chooseStapleResult(s,[
    offer({id:'a',name:'Spaghetti 500 g',semanticType:'Nudeln',canonicalGroup:'Nudeln',store:'REWE',price:1.49,unit:2.98,unitLabel:'€/kg'}),
    offer({id:'b',name:'Penne 1 kg',semanticType:'Nudeln',canonicalGroup:'Nudeln',store:'EDEKA',price:2.49,unit:2.49,unitLabel:'€/kg'})
  ]);
  assert.equal(result.best.id,'b');
  assert.equal(result.comparisonBasis,'unit');
  assert.equal(result.sellerCount,2);
  assert.equal(result.second.id,'a');
});

test('Bei nur einem Händler wird kein zweiter Händler erfunden',()=>{
  const s=byId('eier');
  const result=chooseStapleResult(s,[
    offer({id:'a',name:'Bio Eier 10 Stück',semanticType:'Eier',canonicalGroup:'Eier',store:'REWE',market:'Feldkirchen',bio:true,price:3.99,unit:0.399,unitLabel:'€/St'}),
    offer({id:'b',name:'Bio Eier 6 Stück',semanticType:'Eier',canonicalGroup:'Eier',store:'REWE',market:'Feldkirchen',bio:true,price:2.79,unit:0.465,unitLabel:'€/St'})
  ]);
  assert.equal(result.sellerCount,1);
  assert.equal(result.second,null);
});

test('Bio-Priorität gewinnt gegen billigere konventionelle Ware',()=>{
  const s=byId('eier');
  const result=chooseStapleResult(s,[
    offer({id:'bio',name:'Bio Eier 10 Stück',semanticType:'Eier',canonicalGroup:'Eier',store:'REWE',bio:true,price:4.49,unit:0.449,unitLabel:'€/St'}),
    offer({id:'conv',name:'Eier 10 Stück',semanticType:'Eier',canonicalGroup:'Eier',store:'EDEKA',bio:false,price:2.49,unit:0.249,unitLabel:'€/St'})
  ]);
  assert.equal(result.best.id,'bio');
  assert.equal(result.conventional.id,'conv');
});

test('Noch zu definierende Produkte werden nicht ausgewertet',()=>{
  const rows=evaluateStaples([
    byId('kaese-definieren'),byId('bio-obst'),byId('bio-gemuese')
  ],[offer({name:'Gouda',semanticType:'Käse',canonicalGroup:'Käse'})]);
  assert.equal(rows.length,3);
  assert.ok(rows.every(r=>r.best===null));
});
