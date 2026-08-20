import fs from 'node:fs/promises';
import path from 'node:path';
import {nextScheduledRun,formatBerlin,TARGET_HOURS,TIME_ZONE} from './refresh-schedule.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const now=new Date();
const read=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return fallback}};

const markets=await read(path.join(DATA,'markets.json'),{markets:[]});
const live=await read(path.join(DATA,'offers-live.json'),{offers:[],sources:[]});
const index=await read(path.join(DATA,'catalog','index.json'),{retailers:[]});
const catalogGuard=await read(path.join(DATA,'catalog-refresh-report.json'),{retailers:[]});
const liveGuard=await read(path.join(DATA,'retailer-refresh-report.json'),{retailers:[]});
const previous=await read(process.env.PREVIOUS_STATUS_FILE||'/tmp/import-status.prev.json',{retailers:[]});

const activeStores=[...new Set((markets.markets||[]).map(m=>m.store))].sort((a,b)=>a.localeCompare(b,'de'));
const prevMap=new Map((previous.retailers||[]).map(r=>[r.retailer,r]));
const staleStores=new Set([
  ...(catalogGuard.retailers||[]).filter(r=>r.status==='retained_previous').map(r=>r.retailer),
  ...(liveGuard.retailers||[]).filter(r=>r.status==='retained_previous').map(r=>r.retailer)
]);
const catalogMap=new Map((index.retailers||[]).map(r=>[r.retailer,r]));
const rowsByStore=(live.offers||[]).reduce((m,o)=>(m.set(o.store,(m.get(o.store)||0)+1),m),new Map());
const offersByStore=(live.offers||[]).reduce((m,o)=>(o.isOffer&&m.set(o.store,(m.get(o.store)||0)+1),m),new Map());

const retailers=activeStores.map(retailer=>{
  const rows=rowsByStore.get(retailer)||0;
  const offers=offersByStore.get(retailer)||0;
  const c=catalogMap.get(retailer)||null;
  const stale=staleStores.has(retailer);
  const hasData=rows>0;
  const status=stale?'stale':hasData?'fresh':'no_data';
  return {
    retailer,status,indicator:stale?'🟡':hasData?'🟢':'🔴',
    products:rows,offers,
    catalogStatus:c?.catalogStatus||'no_regular_catalog_import',
    catalogProducts:Number(c?.productCount||0),
    lastSuccessfulAt:stale?(prevMap.get(retailer)?.lastSuccessfulAt||null):hasData?now.toISOString():(prevMap.get(retailer)?.lastSuccessfulAt||null)
  };
});

const red=retailers.filter(r=>r.status==='no_data').length;
const stale=retailers.filter(r=>r.status==='stale').length;
const overall=red?'partial':stale?'partial':'completed';
const next=nextScheduledRun(now);
const status={
  schema:2,
  generatedAt:now.toISOString(),
  timezone:TIME_ZONE,
  schedule:{localHours:TARGET_HOURS.map(h=>`${String(h).padStart(2,'0')}:00`),nextRunAt:next.toISOString(),nextRunBerlin:formatBerlin(next)},
  lastCompletedAt:now.toISOString(),
  lastCompletedBerlin:formatBerlin(now),
  runStatus:overall,
  indicator:overall==='completed'?'🟢':'🟡',
  productsTotal:Number(live.productCount??live.offers?.length??0),
  offersTotal:Number(live.offerCount??(live.offers||[]).filter(o=>o.isOffer).length),
  regularProductsTotal:Number(live.regularProductCount??(live.offers||[]).filter(o=>!o.isOffer).length),
  activeRetailers:activeStores.length,
  staleRetailers:stale,
  retailersWithoutData:red,
  retailers,
  safeguards:{maxAcceptedDropPercent:30,catalogReport:'data/catalog-refresh-report.json',retailerReport:'data/retailer-refresh-report.json'},
  testedCommit:process.env.GITHUB_SHA||null,
  workflowRunId:process.env.GITHUB_RUN_ID||null
};
await fs.writeFile(path.join(DATA,'import-status.json'),JSON.stringify(status,null,2)+'\n');
console.log(`Refresh-Status ${status.indicator}: ${status.productsTotal} Produkte, ${status.offersTotal} Angebote, nächster Lauf ${status.schedule.nextRunBerlin}.`);
