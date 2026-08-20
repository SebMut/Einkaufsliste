import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.css':'text/css; charset=utf-8'};
const assert=(v,m)=>{if(!v)throw new Error(m)};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1');let rel=decodeURIComponent(u.pathname);if(rel==='/')rel='/grundlebensmittel.html';const file=path.resolve(ROOT,'.'+rel);if(!file.startsWith(ROOT+path.sep))throw new Error('path traversal');const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{res.writeHead(404,{'content-type':'text/plain'});res.end('not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/grundlebensmittel.html`;
const browser=await chromium.launch({headless:true});
const results=[];
async function run(label,viewport){
  const ctx=await browser.newContext({viewport});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>/Grundlebensmitteln mit aktuellem Preis/.test(document.querySelector('#status')?.textContent||''),null,{timeout:10000});
  const defined=Number(await page.locator('#defined').textContent()),covered=Number(await page.locator('#covered').textContent()),cards=await page.locator('#grid .card').count();
  assert(defined>=10,`${label}: zu wenige definierte Grundlebensmittel (${defined})`);assert(cards===defined,`${label}: ${cards} Karten bei ${defined} aktiven Definitionen`);assert(covered>=0&&covered<=defined,`${label}: ungültige Abdeckung`);
  await page.locator('#q').fill('Andechser');await page.waitForTimeout(150);const andechser=await page.locator('#grid .card').count();assert(andechser>=2,`${label}: Andechser-Suche findet nicht beide Zielprodukte`);
  await page.locator('#q').fill('');await page.locator('[data-filter="missing"]').click();await page.waitForTimeout(100);assert(await page.locator('#grid').count()===1,`${label}: Fehlend-Filter nicht bedienbar`);
  await page.locator('[data-filter="all"]').click();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(overflow<=3,`${label}: horizontaler Überlauf ${overflow}px`);assert(errors.length===0,`${label}: JavaScript-Fehler ${errors.join(' | ')}`);
  results.push({label,viewport,defined,covered,andechser,overflow,errors});await ctx.close();
}
try{await run('Desktop',{width:1440,height:900});await run('iPhone',{width:390,height:844});console.log(JSON.stringify({status:'passed',results},null,2))}finally{await browser.close();await new Promise(r=>server.close(r))}
