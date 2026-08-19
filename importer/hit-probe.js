import fs from 'node:fs/promises';
const url='https://www.hit.de/maerkte/parsdorf/angebote';
const r=await fetch('https://r.jina.ai/'+url,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-HIT-Probe/2'}});
const md=await r.text();
const spaced=s=>String(s).replace(/(\d{1,3})\.\s+(\d{2})(?!\d)/g,'$1.$2').replace(/(\d{1,3}),\s+(\d{2})(?!\d)/g,'$1,$2');
const lines=md.split(/\r?\n/).map(x=>spaced(x.replace(/^[-*#> ]+/,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim())).filter(Boolean);
const action=lines.filter(x=>/AKTION|DISCOUNT|Preis Vorwoche|\-\d+%|App Preis|App-Preis/i.test(x));
const priced=lines.filter(x=>/\d+[.,]\d{2}/.test(x));
const links=[...md.matchAll(/\[([^\]]{3,1200})\]\([^)]+\)/g)].map(m=>spaced(m[1].replace(/\s+/g,' ').trim())).filter(x=>/\d/.test(x));
const exact=[...md.matchAll(/!\[Image\s+\d+:\s*([^\]]+?)\]/gi)];
const loose=[...md.matchAll(/Image\s*\d*\s*:/gi)];
const idx=md.search(/Image\s*\d*\s*:/i);
const around=idx>=0?md.slice(Math.max(0,idx-30),idx+220):md.slice(0,220);
const codes=[...around.slice(0,100)].map(c=>`${c}:${c.codePointAt(0)}`).join(' | ');
const out=[
 `HTTP=${r.status} chars=${md.length} lines=${lines.length} action=${action.length} priced=${priced.length} links=${links.length}`,
 `exactImageBlocks=${exact.length} looseImageMarkers=${loose.length} firstImageIndex=${idx}`,
 `around=${JSON.stringify(around)}`,
 `codes=${codes}`,
 '',
 '--- EXACT BLOCK SAMPLE ---',
 ...exact.slice(0,8).map(x=>x[1]),
 '',
 '--- ACTION SAMPLE ---',...action.slice(0,20),
 '',
 '--- LINK SAMPLE ---',...links.slice(0,20)
].join('\n');
await fs.writeFile('../data/hit-probe.log',out+'\n');
console.log(out);
