import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT=path.resolve(process.cwd(),'..'),OUT=path.join(ROOT,'docs','rossmann-browser-probe.json');
const browser=await chromium.launch({headless:true});const result={generatedAt:new Date().toISOString(),pages:{},navigation:[],apiHints:[]};
const start='https://www.rossmann.de/de/';
const ctx=await browser.newContext({locale:'de-DE',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'}),page=await ctx.newPage();const responses=[];
page.on('response',r=>{const u=r.url();if(/rossmann\.de/i.test(u))responses.push({url:u,status:r.status(),contentType:r.headers()['content-type']||''})});
await page.goto(start,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(4500);
result.navigation=await page.evaluate(()=>[...new Map([...document.querySelectorAll('a[href]')].map(a=>[a.href,{text:(a.innerText||a.textContent||'').replace(/\s+/g,' ').trim().slice(0,100),href:a.href}])).values()].filter(x=>/\/c\//.test(x.href)).slice(0,300));
const categoryLinks=result.navigation.filter(x=>/Make-Up|Pflege|Baby|Haushalt|Tier|Gesundheit|Ernährung|Lebensmittel/i.test(x.text));
await ctx.close();
for(const nav of categoryLinks.slice(0,12)){const c=await browser.newContext({locale:'de-DE',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'}),p=await c.newPage();const res=[];p.on('response',r=>{const u=r.url();if(/rossmann\.de/i.test(u)&&(/json|api|search|product|category|_next/i.test(u)))res.push({url:u,status:r.status(),contentType:r.headers()['content-type']||''})});try{await p.goto(nav.href,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForTimeout(4500);for(let i=0;i<3;i++){await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(700)}const x=await p.evaluate(()=>{const body=(document.body?.innerText||'').replace(/\s+/g,' '),prod=[...new Map([...document.querySelectorAll('a[href*="/p/"]')].map(a=>[a.href,{href:a.href,text:(a.innerText||a.textContent||'').replace(/\s+/g,' ').trim().slice(0,200)}])).values()];return{title:document.title,bodyChars:body.length,productLinks:prod.length,products:prod.slice(0,10),bodySample:body.slice(0,1400)}});result.pages[nav.href]={navText:nav.text,...x,responses:res.slice(-80)}}catch(e){result.pages[nav.href]={navText:nav.text,status:'error',message:String(e?.message||e),responses:res.slice(-80)}}finally{await c.close()}}
const chunks=[...new Set(responses.filter(x=>/_next\/static\/chunks/.test(x.url)&&x.status===200).map(x=>x.url))].slice(0,25);
for(const u of chunks){try{const r=await fetch(u),text=await r.text();const hints=[...new Set([...text.matchAll(/https?:\\?\/\\?\/[^"'`\\\s]{8,240}|\/[A-Za-z0-9_./?=&%:-]{3,200}(?:api|search|product|category)[A-Za-z0-9_./?=&%:-]*/gi)].map(m=>m[0].replace(/\\\//g,'/')).filter(x=>/api|search|product|category/i.test(x)))].slice(0,80);if(hints.length)result.apiHints.push({chunk:u,hints})}catch{}}
await browser.close();await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
