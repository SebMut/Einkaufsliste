import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const DOCS=path.join(ROOT,'docs');
await fs.mkdir(DOCS,{recursive:true});

const live=JSON.parse(await fs.readFile(path.join(DATA,'offers-live.json'),'utf8'));
let catalogIndex={retailers:[]};
try{catalogIndex=JSON.parse(await fs.readFile(path.join(DATA,'catalog','index.json'),'utf8'))}catch{}

const rows=live.offers||[];
const catalogByRetailer=new Map((catalogIndex.retailers||[]).map(r=>[r.retailer,r]));
const stores=[...new Set(rows.map(o=>o.store).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));

const concreteKey=o=>o.ean?`ean:${o.ean}`:o.canonicalProductId||o.exactMatchKey||`${o.canonicalProduct||o.name}|${o.size||''}`;
const groupKey=o=>String(o.semanticType||o.canonicalGroup||o.bundleKey||o.key||'').trim();
const norm=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const isCatalog=o=>o.sourceType==='official_catalog'||o.sourceScope==='catalog';
const isOffer=o=>o.isOffer===true||o.advertised===true;

const GROUPS=[
  {name:'Milch',types:['Milch'],fallback:/\b(?:vollmilch|frischmilch|h milch|haltbare milch|milch 1 5|milch 3 5)\b/},
  {name:'Butter',types:['Butter'],fallback:/\b(?:butter|markenbutter)\b/},
  {name:'Eier',types:['Eier'],fallback:/\b(?:eier|huehnereier|huhnereier)\b/},
  {name:'Joghurt',types:['Joghurt'],fallback:/\b(?:joghurt|yoghurt)\b/},
  {name:'Käse',types:['Käse','Kaese'],fallback:/\b(?:kaese|gouda|emmentaler|mozzarella|feta)\b/},
  {name:'Nudeln',types:['Nudeln'],fallback:/\b(?:nudeln|spaghetti|penne|fusilli|pasta)\b/},
  {name:'Reis',types:['Reis'],fallback:/\b(?:reis|basmati|jasminreis)\b/},
  {name:'Mehl',types:['Mehl'],fallback:/\b(?:mehl|weizenmehl|dinkelmehl)\b/},
  {name:'Zucker',types:['Zucker'],fallback:/\b(?:zucker|rohrzucker)\b/},
  {name:'Brot',types:['Brot'],fallback:/\b(?:brot|toastbrot|vollkornbrot)\b/},
  {name:'Wasser',types:['Wasser','Mineralwasser'],fallback:/\b(?:mineralwasser|tafelwasser)\b/},
  {name:'Kaffee',types:['Kaffee'],fallback:/\b(?:kaffee|kaffeebohnen|filterkaffee)\b/},
  {name:'Windeln',types:['Windeln'],fallback:/\bwindeln\b/},
  {name:'Waschmittel',types:['Waschmittel'],fallback:/\b(?:waschmittel|vollwaschmittel|colorwaschmittel|feinwaschmittel)\b/},
  {name:'Toilettenpapier',types:['Toilettenpapier'],fallback:/\btoilettenpapier\b/}
];

function belongs(o,g){
  const type=groupKey(o);
  if(g.types.includes(type))return true;
  const text=norm(`${o.name||''} ${o.canonicalProduct||''}`);
  return g.fallback.test(text);
}
function uniqueCount(arr){return new Set(arr.map(concreteKey)).size}
function coverageFor(arr,g){
  const matches=arr.filter(o=>belongs(o,g));
  return {
    rows:matches.length,
    concreteProducts:uniqueCount(matches),
    catalogProducts:uniqueCount(matches.filter(isCatalog)),
    offerProducts:uniqueCount(matches.filter(isOffer))
  };
}

const retailers=[];
for(const store of stores){
  const r=rows.filter(o=>o.store===store);
  const catalogRows=r.filter(isCatalog), offerRows=r.filter(isOffer);
  const catalogMeta=catalogByRetailer.get(store)||null;
  const groups=Object.fromEntries(GROUPS.map(g=>[g.name,coverageFor(r,g)]));
  const coreVisible=Object.values(groups).filter(v=>v.concreteProducts>0).length;
  retailers.push({
    retailer:store,
    branches:[...new Set(r.map(o=>o.market).filter(Boolean))].length,
    rows:r.length,
    concreteProducts:uniqueCount(r),
    catalogRows:catalogRows.length,
    catalogProducts:uniqueCount(catalogRows),
    offerRows:offerRows.length,
    offerProducts:uniqueCount(offerRows),
    catalogStatus:catalogMeta?.catalogStatus||'no_regular_catalog_import',
    catalogImporterProductCount:catalogMeta?.productCount||0,
    sourceCoverage:catalogRows.length>0?'catalog_plus_offers':'offers_only',
    coreGroupsVisible:coreVisible,
    coreGroupsTotal:GROUPS.length,
    groups
  });
}

const overallGroups=Object.fromEntries(GROUPS.map(g=>[g.name,coverageFor(rows,g)]));
const supermarketLike=new Set(['REWE','EDEKA','PENNY','ALDI SÜD','Lidl','Netto Marken-Discount','NORMA','HIT','Kaufland','Alnatura','Denns BioMarkt','METRO']);
const missingRegularCatalog=retailers.filter(r=>supermarketLike.has(r.retailer)&&r.catalogProducts===0).map(r=>r.retailer);
const sparseCoreGroups=GROUPS.map(g=>({group:g.name,count:overallGroups[g.name].concreteProducts})).filter(x=>x.count<5);

const report={
  schema:1,
  generatedAt:new Date().toISOString(),
  liveGeneratedAt:live.generatedAt||null,
  liveProductRows:rows.length,
  liveConcreteProducts:uniqueCount(rows),
  catalogIndexGeneratedAt:catalogIndex.generatedAt||null,
  catalogImporterProducts:catalogIndex.productCount||0,
  importantGroups:GROUPS.map(g=>g.name),
  overallGroups,
  retailers,
  findings:{
    missingRegularCatalog,
    sparseCoreGroups,
    note:'Abdeckung misst ausschließlich die aktuell importierten Daten. Sie beweist nicht die reale Sortimentsgröße eines Händlers.'
  }
};
await fs.writeFile(path.join(DOCS,'assortment-audit.json'),JSON.stringify(report,null,2)+'\n');

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=r=>r.sourceCoverage==='catalog_plus_offers'?'🟡 Teilkatalog + Angebote':'🔴 nur Angebote';
const groupHeaders=GROUPS.map(g=>`<th>${esc(g.name)}</th>`).join('');
const retailerRows=retailers.map(r=>`<tr><td><b>${esc(r.retailer)}</b><br><small>${status(r)}</small></td><td>${r.concreteProducts}</td><td>${r.catalogProducts}</td><td>${r.offerProducts}</td>${GROUPS.map(g=>`<td>${r.groups[g.name].concreteProducts}${r.groups[g.name].catalogProducts?` <small>(${r.groups[g.name].catalogProducts} Kat.)</small>`:''}</td>`).join('')}</tr>`).join('');
const overallRows=GROUPS.map(g=>{const x=overallGroups[g.name];return`<tr><td>${esc(g.name)}</td><td>${x.concreteProducts}</td><td>${x.catalogProducts}</td><td>${x.offerProducts}</td></tr>`}).join('');
const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sortiments-Abdeckung AngebotsRadar</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f4f7f5;color:#14231d}.wrap{max-width:1500px;margin:auto;padding:24px}.hero,.card{background:white;border:1px solid #dce7e2;border-radius:18px;padding:18px;margin-bottom:14px}.hero{background:#0b6b4f;color:white}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.kpi{background:#ffffff18;border:1px solid #ffffff33;border-radius:12px;padding:12px}.kpi b{font-size:24px;display:block}table{width:100%;border-collapse:collapse;font-size:12px;min-width:1100px}th,td{border-bottom:1px solid #e5ece8;padding:8px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#eef5f1}.scroll{overflow:auto}.bad{background:#fff1f1;border-color:#efcaca}.warn{background:#fff9e9;border-color:#ead9a2}small{color:#667b72}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.wrap{padding:12px}}</style></head><body><div class="wrap"><section class="hero"><h1>Sortiments-Abdeckung</h1><p>Messung der tatsächlich importierten Produktdaten – nicht der realen Händler-Sortimentsgröße.</p><div class="grid"><div class="kpi"><b>${rows.length}</b>Live-Datensätze</div><div class="kpi"><b>${uniqueCount(rows)}</b>konkrete Produkte</div><div class="kpi"><b>${catalogIndex.productCount||0}</b>Katalogimport-Produkte</div><div class="kpi"><b>${missingRegularCatalog.length}</b>relevante Händler ohne regulären Katalog</div></div></section><section class="card ${missingRegularCatalog.length?'bad':''}"><h2>Wichtigster Befund</h2><p>Ohne regulären Katalogimport: <b>${missingRegularCatalog.length?missingRegularCatalog.map(esc).join(', '):'keine'}</b>.</p><p>Das erklärt, warum Standardprodukte wie Milch trotz vieler erlaubter Märkte nur dünn vertreten sein können: Angebotsdaten enthalten nur die gerade beworbenen Artikel.</p></section><section class="card"><h2>Wichtige Produktgruppen gesamt</h2><table><thead><tr><th>Gruppe</th><th>Konkrete Produkte</th><th>davon Katalog</th><th>davon Angebote</th></tr></thead><tbody>${overallRows}</tbody></table></section><section class="card"><h2>Abdeckung je Händler</h2><div class="scroll"><table><thead><tr><th>Händler</th><th>Produkte</th><th>Katalog</th><th>Angebote</th>${groupHeaders}</tr></thead><tbody>${retailerRows}</tbody></table></div></section><section class="card warn"><h2>Interpretation</h2><p>🟡 Teilkatalog + Angebote bedeutet: Es existiert ein regulärer Katalogimport, aber er ist ausdrücklich nicht als Vollsortiment verifiziert. 🔴 nur Angebote bedeutet: Für diesen Händler stammt die aktuelle Abdeckung im Wesentlichen aus Angebotsquellen; daraus darf keine Aussage über das reale Sortiment abgeleitet werden.</p><p>Erzeugt: ${esc(report.generatedAt)}</p></section></div></body></html>`;
await fs.writeFile(path.join(DOCS,'assortment-audit.html'),html);

console.log(`Sortiments-Audit: ${rows.length} Datensätze, ${uniqueCount(rows)} konkrete Produkte.`);
console.log(`Milch: ${overallGroups.Milch.concreteProducts} konkrete Produkte, davon ${overallGroups.Milch.catalogProducts} aus regulären Katalogquellen.`);
console.log(`Ohne regulären Katalogimport: ${missingRegularCatalog.join(', ')||'keine'}`);
