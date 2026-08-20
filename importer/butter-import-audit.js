import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const aldi=JSON.parse(await fs.readFile(path.join(DATA,'catalog','aldi-sued.json'),'utf8'));
const live=JSON.parse(await fs.readFile(path.join(DATA,'offers-live.json'),'utf8'));

const norm=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();

function butterRelevance(name=''){
  const n=norm(name);
  if(!n.includes('butter')) return 0;
  if(/butterkeks|butter keks|buttermilch|butter milch|butter chicken|buttergemuse|butter gemuse|butterbrezel|butter brezel|buttertoast|butter toast/.test(n)) return 20;
  if(/butterschmalz|butter schmalz|krauterbutter|krauter butter|streichbutter|streich butter|butterzubereitung|butter zubereitung/.test(n)) return 70;
  if(/\bbutter\b|markenbutter|sussrahmbutter|sauerrahmbutter|weidebutter|fassbutter|irische butter|mildgesauerte butter/.test(n)) return 100;
  return 50;
}

function row(p,store,market=''){
  const score=butterRelevance(p.name||p.originalName||'');
  if(!score) return null;
  return {
    score,
    tier: score>=100?'butter':score>=70?'butter-nah':'nur-name',
    store,
    market,
    name:p.name||p.originalName||'',
    brand:p.brand||'',
    size:p.size||'',
    price:Number(p.currentPrice??p.price??0)||null,
    bio:!!p.bio,
    isOffer:!!p.isOffer,
    url:p.productUrl||p.sourceUrl||''
  };
}

const aldiRows=(aldi.products||[]).map(p=>row(p,'ALDI SÜD')).filter(Boolean);
const reweRows=(live.offers||[])
  .filter(p=>p.store==='REWE'&&p.market==='Feldkirchen'&&String(p.address||'').includes('Kapellenstraße 16b'))
  .map(p=>row(p,'REWE','Feldkirchen'))
  .filter(Boolean);

const sortRows=rows=>rows.sort((a,b)=>b.score-a.score||Number(b.bio)-Number(a.bio)||Number(a.price??Infinity)-Number(b.price??Infinity)||a.name.localeCompare(b.name,'de'));
const summarize=rows=>({
  total:rows.length,
  butter:rows.filter(x=>x.score>=100).length,
  butterNah:rows.filter(x=>x.score>=70&&x.score<100).length,
  nurName:rows.filter(x=>x.score<70).length
});

sortRows(aldiRows);sortRows(reweRows);
const out={
  schema:1,
  generatedAt:new Date().toISOString(),
  query:'Butter',
  rankingRule:'echte Butter zuerst, butterähnliche Produkte danach, Butterkekse/Buttermilch/etc. zuletzt',
  aldi:{catalogProducts:Number(aldi.productCount||aldi.products?.length||0),summary:summarize(aldiRows),results:aldiRows},
  reweFeldkirchen:{marketId:'461761',address:'Kapellenstraße 16b, 85622 Feldkirchen',summary:summarize(reweRows),results:reweRows}
};
await fs.writeFile(path.join(DATA,'butter-import-audit.json'),JSON.stringify(out,null,2)+'\n');
console.log(`Butter-Audit: ALDI ${out.aldi.summary.total} Treffer (${out.aldi.summary.butter} echte Butter), REWE Feldkirchen ${out.reweFeldkirchen.summary.total} Treffer (${out.reweFeldkirchen.summary.butter} echte Butter).`);
if(out.aldi.summary.butter===0) throw new Error('ALDI: keine echte Butter im Vollsortiment gefunden.');
if(out.reweFeldkirchen.summary.butter===0) throw new Error('REWE Feldkirchen: keine echte Butter im filialbezogenen Sortiment gefunden.');
