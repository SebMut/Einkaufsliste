import test from 'node:test';
import assert from 'node:assert/strict';
import {isSuspiciousDrop} from './refresh-guards.js';

test('mehr als 30 Prozent Einbruch wird blockiert',()=>{
  assert.equal(isSuspiciousDrop(3400,2300),true);
  assert.equal(isSuspiciousDrop(3400,2380),false);
});

test('leerer Händlerbestand ersetzt keinen guten Altbestand',()=>{
  assert.equal(isSuspiciousDrop(100,0),true);
});

test('kleine neue Quellen werden nicht vorschnell blockiert',()=>{
  assert.equal(isSuspiciousDrop(8,2),false);
});

test('Grenzwert kann für Live-Händler strenger mit Mindestbestand 5 geprüft werden',()=>{
  assert.equal(isSuspiciousDrop(10,6,{minPrevious:5,maxDropRatio:0.30}),true);
  assert.equal(isSuspiciousDrop(10,7,{minPrevious:5,maxDropRatio:0.30}),false);
});
