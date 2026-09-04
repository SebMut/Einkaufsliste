import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root=path.resolve(process.cwd(),'..');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const appJs=await fs.readFile(path.join(root,'app.js'),'utf8');
const appCss=await fs.readFile(path.join(root,'app.css'),'utf8');
const staplesHtml=await fs.readFile(path.join(root,'grundlebensmittel.html'),'utf8');
const staplesConfig=JSON.parse(await fs.readFile(path.join(root,'data','staples.json'),'utf8'));
const live=JSON.parse(await fs.readFile(path.join(root,'data','offers-live.json'),'utf8'));

test('UI nennt keine alte 15-km-Logik mehr',()=>{
  assert.equal(/15[- ]?km|15-km-radius/i.test(html),false);
  assert.match(html,/Feldkirchen · Heimstetten · Aschheim · Kirchheim · Riem Arcaden/);
});

test('Homepage nutzt die ausgelagerte V9-Struktur',()=>{
  assert.match(html,/href="\.\/app\.css"/);
  assert.match(html,/src="\.\/app\.js"/);
  assert.match(html,/id="q"/);
  assert.match(html,/id="filterBtn"/);
  assert.match(html,/id="openList"/);
  assert.match(html,/id="commitBadge"/);
});

test('UI unterscheidet Angebote, reguläre Preise und Grundpreise',()=>{
  assert.match(html,/Angebote/);
  assert.match(html,/Reguläre Preise/);
  assert.match(appJs,/regularPrice/);
  assert.match(appJs,/isOffer/);
  assert.match(appJs,/Grundpreis/);
});

test('Frontend bündelt Dubletten und Filialtreffer über die Produktlogik',()=>{
  assert.match(appJs,/collapseProductsForDisplay/);
  assert.match(appJs,/displayOffers=collapseProductsForDisplay\(rawOffers\)/);
  assert.match(appJs,/branchMode:'collapsed'/);
  assert.match(appJs,/canonicalProductId/);
  assert.match(appJs,/exactMatchKey/);
});

test('Buttersuche priorisiert echte Butter und stuft Wort-Nebentreffer ab',()=>{
  assert.match(appJs,/function searchRank\(o,query\)/);
  assert.match(appJs,/q==='butter'/);
  assert.match(appJs,/butterkeks\|buttermilch\|butter chicken/);
  assert.match(appJs,/markenbutter\|sussrahmbutter\|weidebutter/);
});

test('Mobile CSS für iPhone und kleinere Displays bleibt vorhanden',()=>{
  assert.match(appCss,/@media\(max-width:760px\)/);
  assert.match(appCss,/@media\(max-width:390px\)/);
});

test('Externes Frontend-JavaScript ist syntaktisch gültig',()=>{
  execFileSync(process.execPath,['--check',path.join(root,'app.js')],{stdio:'pipe'});
});

test('Live-Daten enthalten mehrere konkrete Milchprodukte',()=>{
  const rows=(live.offers||[]).filter(o=>o.semanticType==='Milch'||o.canonicalGroup==='Milch'||o.bundleKey==='Milch'||o.key==='Milch');
  const ids=new Set(rows.map(o=>o.canonicalProductId||o.exactMatchKey||`${o.canonicalProduct||o.name}|${o.size||''}`));
  const names=new Set(rows.map(o=>o.name).filter(Boolean));
  console.log(`# Milch-Audit: ${rows.length} Datensaetze, ${ids.size} konkrete Produkte, ${names.size} Produktnamen`);
  assert.ok(rows.length>1,`Nur ${rows.length} Milch-Datensatz vorhanden`);
  assert.ok(ids.size>1,`Nur ${ids.size} konkretes Milchprodukt vorhanden`);
});

test('Startseite verlinkt die Grundlebensmittel-Seite',()=>{
  assert.match(html,/href="\.\/grundlebensmittel\.html"/);
  assert.match(html,/Grundlebensmittel/);
});

test('Grundlebensmittel-Seite nutzt Live-Angebote, Prospekte und konkrete Historie',()=>{
  assert.match(staplesHtml,/Unsere Grundlebensmittel/);
  assert.match(staplesHtml,/data\/staples\.json/);
  assert.match(staplesHtml,/data\/offers-live\.json/);
  assert.match(staplesHtml,/data\/price-history\.json/);
  assert.match(staplesHtml,/staples-matcher\.js/);
  assert.match(staplesHtml,/Nur ein belastbarer Händlerpreis/);
  assert.match(staplesHtml,/ANGEBOT/);
  assert.match(staplesHtml,/canonicalProductId/);
});

test('Breite Bio-Obst- und Gemüsegruppen werden bis zur Sortendefinition nicht pauschal bepreist',()=>{
  for(const id of ['bio-obst','bio-gemuese']){
    const item=staplesConfig.items.find(x=>x.id===id);
    assert.ok(item,`${id} fehlt`);
    assert.equal(item.needsDefinition,true);
    assert.equal(item.active,false);
  }
});

test('Grundlebensmittel-Inline-JavaScript ist syntaktisch gültig',async()=>{
  const m=staplesHtml.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m?.[1],'Grundlebensmittel-Modul-Script fehlt');
  const file=path.join(process.cwd(),`.grundlebensmittel-${process.pid}.mjs`);
  await fs.writeFile(file,m[1]);
  try{execFileSync(process.execPath,['--check',file],{stdio:'pipe'})}finally{await fs.unlink(file).catch(()=>{})}
});
