import fs from 'node:fs/promises';
import path from 'node:path';
import { dedupeProducts } from './product-dedupe.js';

const ROOT=path.resolve(process.cwd(),'..');
const livePath=path.join(ROOT,'data','offers-live.json');
const outPath=path.join(ROOT,'docs','duplicate-audit.json');
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const offers=Array.isArray(live.offers)?live.offers:[];
const branch=dedupeProducts(offers,{scope:'branch',report:true});
const store=dedupeProducts(offers,{scope:'store',report:true});

const sample=branch.mergedPairs.slice(0,80).map(({a,b,result})=>({
  store:result.store,market:result.market,address:result.address,
  nameA:a.name,nameB:b.name,size:result.size,bio:!!result.bio,
  gtin:result.gtin||result.ean||null,
  sourceTypes:result.sourceTypes||[result.sourceType].filter(Boolean),
  mergedPrice:result.currentPrice??result.price,
  regularPrice:result.regularPrice??null,
  isOffer:!!result.isOffer
}));

const report={
  generatedAt:new Date().toISOString(),
  inputCount:offers.length,
  branchUniqueCount:branch.products.length,
  exactBranchDuplicates:branch.removedCount,
  displayUniqueCount:store.products.length,
  crossBranchCollapses:Math.max(0,branch.products.length-store.products.length),
  sample
};
await fs.mkdir(path.dirname(outPath),{recursive:true});
await fs.writeFile(outPath,JSON.stringify(report,null,2)+'\n');
console.log(`Dubletten-Audit: ${report.inputCount} Eingaben -> ${report.branchUniqueCount} filialgenaue Produkte; ${report.exactBranchDuplicates} echte Dubletten; ${report.crossBranchCollapses} zusätzliche Filialtreffer können im UI gebündelt werden.`);
if(report.exactBranchDuplicates>0){
  throw new Error(`Dubletten-Audit fehlgeschlagen: ${report.exactBranchDuplicates} zusammenführbare Produkte sind noch mehrfach in offers-live.json enthalten.`);
}
