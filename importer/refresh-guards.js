import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const CATALOG=path.join(DATA,'catalog');

export function isSuspiciousDrop(previousCount,currentCount,{minPrevious=20,maxDropRatio=0.30}={}){
  const prev=Number(previousCount||0),cur=Number(currentCount||0);
  if(prev<minPrevious) return false;
  return cur < prev*(1-maxDropRatio);
}

async function readJson(file,fallback=null){
  try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return fallback}
}
async function exists(file){try{await fs.access(file);return true}catch{return false}}

export async function guardCatalog({previousDir=process.env.PREVIOUS_CATALOG_DIR||'/tmp/catalog-prev'}={}){
  const prevIndex=await readJson(path.join(previousDir,'index.json'),{files:[]});
  const curIndex=await readJson(path.join(CATALOG,'index.json'),{files:[]});
  const files=[...new Set([...(prevIndex.files||[]),...(curIndex.files||[])])].filter(f=>f&&f!=='index.json');
  const report=[];

  for(const filename of files){
    const prevFile=path.join(previousDir,filename),curFile=path.join(CATALOG,filename);
    const prev=await readJson(prevFile,null),cur=await readJson(curFile,null);
    const previousCount=Number(prev?.productCount??prev?.products?.length??0);
    const attemptedCount=Number(cur?.productCount??cur?.products?.length??0);
    const missing=!cur;
    const suspicious=missing||isSuspiciousDrop(previousCount,attemptedCount);
    if(suspicious&&prev){
      await fs.copyFile(prevFile,curFile);
      report.push({retailer:prev.retailer||filename,filename,status:'retained_previous',previousCount,attemptedCount,reason:missing?'new_catalog_missing':`drop_over_30_percent`});
    }else if(cur){
      const unchanged=prev&&String(prev.generatedAt||'')===String(cur.generatedAt||'');
      report.push({retailer:cur.retailer||filename,filename,status:unchanged?'unchanged':'updated',previousCount,attemptedCount});
    }
  }

  const existingRows=new Map((curIndex.retailers||[]).map(r=>[r.retailer,r]));
  const retailers=[];
  for(const filename of files){
    const c=await readJson(path.join(CATALOG,filename),null);if(!c)continue;
    const retailer=c.retailer||filename.replace(/\.json$/,'');
    const row=report.find(r=>r.filename===filename);
    retailers.push({...(existingRows.get(retailer)||{}),retailer,catalogStatus:c.catalogStatus||existingRows.get(retailer)?.catalogStatus||'partial_catalog',productCount:Number(c.productCount??c.products?.length??0),sources:c.sources||existingRows.get(retailer)?.sources||[],refreshStatus:row?.status||'unknown'});
  }
  const rebuilt={...curIndex,schema:Math.max(5,Number(curIndex.schema||0)),generatedAt:new Date().toISOString(),files:files.filter(async f=>await exists(path.join(CATALOG,f))),retailers,productCount:retailers.reduce((n,r)=>n+Number(r.productCount||0),0)};
  await fs.writeFile(path.join(CATALOG,'index.json'),JSON.stringify(rebuilt,null,2)+'\n');
  const out={schema:1,generatedAt:new Date().toISOString(),threshold:{maxDropRatio:0.30},retailers:report};
  await fs.writeFile(path.join(DATA,'catalog-refresh-report.json'),JSON.stringify(out,null,2)+'\n');
  return out;
}

export async function guardLive({previousFile=process.env.PREVIOUS_LIVE_FILE||'/tmp/offers-live.prev.json'}={}){
  const previous=await readJson(previousFile,{offers:[],sources:[]});
  const current=await readJson(path.join(DATA,'offers-live.json'),{offers:[],sources:[]});
  const byStore=(rows)=>rows.reduce((m,o)=>{const k=o.store||'Unbekannt';if(!m.has(k))m.set(k,[]);m.get(k).push(o);return m},new Map());
  const prev=byStore(previous.offers||[]),cur=byStore(current.offers||[]),stores=[...new Set([...prev.keys(),...cur.keys()])];
  let rows=[...(current.offers||[])];const report=[];
  for(const store of stores){
    const p=prev.get(store)||[],c=cur.get(store)||[];
    const suspicious=isSuspiciousDrop(p.length,c.length,{minPrevious:5,maxDropRatio:0.30});
    if(suspicious){
      rows=rows.filter(o=>o.store!==store).concat(p.map(o=>({...o,staleRetained:true})));
      report.push({retailer:store,status:'retained_previous',previousCount:p.length,attemptedCount:c.length,reason:'drop_over_30_percent'});
    }else report.push({retailer:store,status:'updated',previousCount:p.length,attemptedCount:c.length});
  }
  rows.sort((a,b)=>String(a.store).localeCompare(String(b.store),'de')||String(a.name).localeCompare(String(b.name),'de'));
  rows=rows.map((o,i)=>({...o,id:i+1}));
  const staleStores=new Set(report.filter(r=>r.status==='retained_previous').map(r=>r.retailer));
  const sources=(current.sources||[]).map(s=>staleStores.has(s.store)?{...s,freshness:'stale',refreshStatus:'retained_previous'}:s);
  const out={...current,generatedAt:new Date().toISOString(),offers:rows,sources,productCount:rows.length,offerCount:rows.filter(o=>o.isOffer).length,regularProductCount:rows.filter(o=>!o.isOffer).length,retainedPreviousRetailers:[...staleStores]};
  await fs.writeFile(path.join(DATA,'offers-live.json'),JSON.stringify(out,null,2)+'\n');
  const result={schema:1,generatedAt:new Date().toISOString(),threshold:{maxDropRatio:0.30},retailers:report};
  await fs.writeFile(path.join(DATA,'retailer-refresh-report.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}

const self=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===self){
  const mode=process.argv[2];
  if(mode==='catalog') console.log(JSON.stringify(await guardCatalog(),null,2));
  else if(mode==='live') console.log(JSON.stringify(await guardLive(),null,2));
  else throw new Error('Aufruf: node refresh-guards.js catalog|live');
}
