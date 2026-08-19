import fs from 'node:fs/promises';
const urls=[
 'https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/de-DE',
 'https://endpoints.leaflets.schwarz/v4/flyer?version=4&flyer_identifier=aktionsprospekt-17-08-2026-22-08-2026-799968&client=lidl',
 'https://endpoints.leaflets.schwarz/v4/flyer?version=4&flyer_identifier=aktionsprospekt-17-08-2026-22-08-2026-799968&client=lidl&region_id=0&region_code=0'
];
const out=[];
for(const url of urls){try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':'Mozilla/5.0 AngebotsRadar/1'}});const text=await r.text();out.push(`\n=== ${url} ===\nHTTP=${r.status} type=${r.headers.get('content-type')} chars=${text.length}\n${text.slice(0,12000)}`)}catch(e){out.push(`\n=== ${url} ===\nERROR ${e.stack||e.message}`)}}
await fs.writeFile('../data/lidl-api-probe.log',out.join('\n')+'\n');console.log(out.join('\n'));
