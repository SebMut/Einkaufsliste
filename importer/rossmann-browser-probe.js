import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT=path.resolve(process.cwd(),'..');
const OUT=path.join(ROOT,'docs','rossmann-browser-probe.json');
const browser=await chromium.launch({headless:true});
const result={generatedAt:new Date().toISOString(),pages:{}};
const urls=[
 'https://www.rossmann.de/de/haushalt/c/olcat1_3/?pageIndex=0',
 'https://www.rossmann.de/de/haushalt/c/olcat1_3/?pageIndex=1',
 'https://www.rossmann.de/de/pflege-und-duft/c/olcat1_1?pageIndex=0',
 'https://www.rossmann.de/de/baby-und-spielzeug/c/olcat1_2?pageIndex=0',
 'https://www.rossmann.de/de/gesundheit/c/olcat1_4?pageIndex=0',
 'https://www.rossmann.de/de/ernaehrung/c/olcat1_5?pageIndex=0',
 'https://www.rossmann.de/de/tier/c/olcat1_6?pageIndex=0'
];
for(const url of urls){const ctx=await browser.newContext({locale:'de-DE',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'});const page=await ctx.newPage();const responses=[];page.on('response',r=>{const u=r.url();if(/product|search|category|catalog/i.test(u))responses.push({url:u,status:r.status(),contentType:r.headers()['content-type']||''})});try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(3500);for(const label of [/Alle akzeptieren/i,/Akzeptieren/i,/Zustimmen/i]){try{const b=page.getByRole('button',{name:label}).first();if(await b.isVisible({timeout:500})){await b.click();break}}catch{}}for(let i=0;i<4;i++){await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(900)}const x=await page.evaluate(()=>{const links=[...document.querySelectorAll('a[href*="/p/"]')].map(a=>({href:a.href,text:(a.innerText||a.textContent||'').replace(/\s+/g,' ').trim().slice(0,240)}));const uniq=[...new Map(links.map(x=>[x.href,x])).values()];const body=(document.body?.innerText||'').replace(/\s+/g,' ');return{title:document.title,links:uniq.slice(0,10),productLinks:uniq.length,bodyChars:body.length,countHints:[...body.matchAll(/(?:von|insgesamt)\s+([\d.]{2,})\s+(?:Produkte|Artikel)/gi)].slice(0,10).map(m=>m[1]),bodySample:body.slice(0,1000)}});result.pages[url]={status:'ok',...x,responses:responses.slice(-30)}}catch(e){result.pages[url]={status:'error',message:String(e?.message||e),responses:responses.slice(-30)}}finally{await ctx.close()}}
await browser.close();await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
