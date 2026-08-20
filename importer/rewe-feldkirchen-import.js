import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const marketsPath=path.join(ROOT,'data','markets.json');
const originalText=await fs.readFile(marketsPath,'utf8');
const markets=JSON.parse(originalText);
const all=markets.markets||markets.nearbyMarkets||[];
const target=all.find(m=>m.store==='REWE'&&String(m.offerUrl||m.sourceUrl||'').includes('/461761/'));
if(!target) throw new Error('REWE Feldkirchen 461761 ist nicht in data/markets.json hinterlegt.');

const filtered={...markets,markets:[target],nearbyMarkets:[target]};
await fs.writeFile(marketsPath,JSON.stringify(filtered,null,2)+'\n');
try{
  await import('./rewe-market-catalog-import.js');
} finally {
  await fs.writeFile(marketsPath,originalText);
}

const live=JSON.parse(await fs.readFile(path.join(ROOT,'data','offers-live.json'),'utf8'));
const rows=(live.offers||[]).filter(o=>o.store==='REWE'&&o.market===target.market&&String(o.address||'').includes('Kapellenstraße 16b'));
console.log(`REWE Feldkirchen 461761 gezielt importiert: ${rows.length} Produkte.`);
if(rows.length===0) throw new Error('REWE Feldkirchen 461761 lieferte nach dem Import keine Produkte.');
