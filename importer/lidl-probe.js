import fs from 'node:fs/promises';
const urls=['https://www.lidl.de/c/online-prospekte/s10005610','https://www.lidl.de/c/online-prospekte','https://www.lidl.de/c/indexangebote'];
async function get(url){const r=await fetch('https://r.jina.ai/'+url,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-Lidl-Probe/1'}});return{status:r.status,text:await r.text()}}
const out=[];
for(const url of urls){const r=await get(url);const t=r.text;out.push(`\n=== ${url} HTTP=${r.status} chars=${t.length} ===`);const lines=t.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);out.push('--- Prospektzeilen ---');out.push(...lines.filter(x=>/Aktionsprospekt|Prospekt|Diese Woche|Nächste Woche|17\.08|22\.08|24\.08|29\.08/i.test(x)).slice(0,100));const links=[...t.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m=>({label:m[1].replace(/\s+/g,' ').trim(),href:m[2]})).filter(x=>/prospekt|angebot|leaflet|brochure|katalog|aktions/i.test(x.label+' '+x.href));out.push('--- Links ---');out.push(...links.slice(0,100).map(x=>`${x.label} => ${x.href}`));}
await fs.writeFile('../data/lidl-probe.log',out.join('\n')+'\n');
console.log(out.join('\n'));
