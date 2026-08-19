import fs from 'node:fs/promises';

const overviewUrl='https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/de-DE';
const overview=await (await fetch(overviewUrl,{headers:{accept:'application/json','user-agent':'AngebotsRadar/1'}})).json();
const current=[];
for(const cat of overview.categories||[]) for(const sub of cat.subcategories||[]) for(const f of sub.flyers||[]) if(f.status==='current'&&/Aktionsprospekt/i.test(f.name||'')) current.push({cat:cat.name,sub:sub.name,...f});
const selected=current.find(f=>(f.regions||[]).some(r=>r.type==='national'&&String(r.code)==='0'))||current[0];
if(!selected?.flyerJson) throw new Error('Kein aktueller Lidl Aktionsprospekt mit flyerJson gefunden');
const detailRes=await fetch(selected.flyerJson,{headers:{accept:'application/json','user-agent':'AngebotsRadar/1'}});
const detailText=await detailRes.text();
let detail={};try{detail=JSON.parse(detailText)}catch{}
const keys=o=>o&&typeof o==='object'&&!Array.isArray(o)?Object.keys(o):[];
const arrInfo=[];
function walk(v,p='root',d=0){if(d>5||v==null)return;if(Array.isArray(v)){arrInfo.push({path:p,length:v.length,sampleType:typeof v[0],sampleKeys:keys(v[0])});for(const x of v.slice(0,2))walk(x,p+'[]',d+1);return}if(typeof v==='object'){for(const [k,x] of Object.entries(v))if(x&&typeof x==='object')walk(x,p+'.'+k,d+1)}}
walk(detail);
const candidates=[];
function collect(v,p='root',d=0){if(d>8||v==null)return;if(Array.isArray(v)){for(let i=0;i<Math.min(v.length,300);i++)collect(v[i],`${p}[${i}]`,d+1);return}if(typeof v!=='object')return;const flat=JSON.stringify(v);if(/price|preis|keyword|alttext|product|produkt|article|artikel/i.test(flat)&&flat.length<15000)candidates.push({path:p,keys:Object.keys(v),sample:flat.slice(0,2500)});for(const [k,x]of Object.entries(v))if(x&&typeof x==='object')collect(x,p+'.'+k,d+1)}
collect(detail);
const report={
 overview:{currentCount:current.length,current:current.map(f=>({id:f.id,title:f.title,regions:f.regions,flyerJson:f.flyerJson,pdfUrl:f.pdfUrl,flyerUrlAbsolute:f.flyerUrlAbsolute})),selected:{id:selected.id,title:selected.title,regions:selected.regions,flyerJson:selected.flyerJson}},
 detail:{http:detailRes.status,chars:detailText.length,topKeys:Object.keys(detail),arrays:arrInfo.slice(0,120),candidates:candidates.slice(0,80)}
};
await fs.writeFile('data/lidl-api-summary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({selected:report.overview.selected,http:detailRes.status,chars:detailText.length,topKeys:Object.keys(detail),arrays:arrInfo.slice(0,30)},null,2));
