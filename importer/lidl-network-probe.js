import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const indexUrl='https://www.lidl.de/c/online-prospekte/s10005610';
const indexRes=await fetch('https://r.jina.ai/'+indexUrl,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-Lidl-Network/1'}});
const index=await indexRes.text();
const match=index.match(/\]\((https:\/\/www\.lidl\.de\/l\/prospekte\/aktionsprospekt-17-08-2026-22-08-2026-[^)]+)\)/i)
  || index.match(/\]\((https:\/\/www\.lidl\.de\/l\/prospekte\/aktionsprospekt-[^)]+)\)/i);
if(!match)throw new Error('Kein Lidl Aktionsprospekt-Link gefunden');
const prospect=match[1];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'de-DE',timezoneId:'Europe/Berlin',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36'});
const page=await context.newPage();
const responses=[];
page.on('response',async r=>{
 try{
  const url=r.url(),ct=(r.headers()['content-type']||'').toLowerCase();
  if(!/leaflet|prospekt|brochure|catalog|api|json|manifest|page|product|schwarz/i.test(url))return;
  let sample='',len=null;
  if(ct.includes('json')||ct.includes('text')){const body=await r.text();len=body.length;sample=body.slice(0,500).replace(/\s+/g,' ')}
  responses.push({status:r.status(),ct,url,len,sample});
 }catch{}
});
let error='';
try{
 await page.goto(prospect,{waitUntil:'domcontentloaded',timeout:70000});
 await page.waitForTimeout(8000);
 for(let i=0;i<8;i++){await page.mouse.wheel(0,900);await page.waitForTimeout(400)}
}catch(e){error=String(e.message||e)}
const info=await page.evaluate(()=>({
 title:document.title,
 href:location.href,
 text:(document.body?.innerText||'').slice(0,4000),
 scripts:[...document.scripts].map(s=>s.src).filter(Boolean),
 iframes:[...document.querySelectorAll('iframe')].map(x=>x.src).filter(Boolean),
 resources:performance.getEntriesByType('resource').map(x=>x.name).filter(x=>/leaflet|prospekt|brochure|catalog|api|json|manifest|page|product|schwarz/i.test(x)).slice(0,300)
})).catch(()=>({}));
await context.close();await browser.close();
const lines=[`prospect=${prospect}`,`error=${error}`,`title=${info.title||''}`,`href=${info.href||''}`,'','--- BODY TEXT ---',info.text||'','',`--- RESPONSES ${responses.length} ---`,...responses.map(x=>`${x.status} ${x.ct} ${x.url} len=${x.len??'-'} sample=${x.sample}`),'','--- SCRIPTS ---',...(info.scripts||[]),'','--- IFRAMES ---',...(info.iframes||[]),'','--- RESOURCES ---',...(info.resources||[])];
await fs.writeFile('../data/lidl-network.log',lines.join('\n')+'\n');
console.log(lines.join('\n'));
