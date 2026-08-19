import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const html=await fs.readFile(path.resolve(process.cwd(),'..','index.html'),'utf8');

test('UI nennt keine alte 15-km-Logik mehr',()=>{
  assert.equal(/15[- ]?km|15-km-radius/i.test(html),false);
  assert.match(html,/Feldkirchen · Heimstetten · Aschheim · Kirchheim · Riem Arcaden/);
});

test('UI unterscheidet Produkte, Angebote und reguläre Preise',()=>{
  assert.match(html,/>Alle Produkte</);
  assert.match(html,/Regulär/);
  assert.match(html,/ANGEBOT/);
  assert.match(html,/regularPrice/);
  assert.match(html,/isOffer/);
});

test('Frontend verwendet die semantische Vergleichsprüfung',()=>{
  assert.match(html,/\bcomparable\b/);
  assert.match(html,/comparisonCandidates\(main,all\)[\s\S]*comparable\(main,o\)/);
});

test('Preisbewertung nutzt ausschließlich konkrete Produkthistorie',()=>{
  assert.match(html,/ratingBtn/);
  assert.match(html,/canonicalProductId/);
  assert.match(html,/minObservationsForRating/);
  assert.match(html,/1M','3M','6M','1J','Alles/);
  assert.match(html,/function historyKey\(o\)\{const id=o\.canonicalProductId/);
  assert.equal(/historyGroup/.test(html),false);
});

test('mobile CSS bleibt vorhanden',()=>assert.match(html,/@media\(max-width:640px\)/));

test('Inline-JavaScript ist syntaktisch gültig',async()=>{
  const m=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m?.[1],'Modul-Script fehlt');
  const file=path.join(os.tmpdir(),`angebotsradar-${process.pid}.mjs`);
  await fs.writeFile(file,m[1]);
  try{execFileSync(process.execPath,['--check',file],{stdio:'pipe'})}finally{await fs.unlink(file).catch(()=>{})}
});
