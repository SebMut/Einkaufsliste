import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
const execFileAsync=promisify(execFile);
const ROOT=path.resolve(process.cwd(),'..');
const OUT=path.join(ROOT,'data','metro-bbox-debug.json');
function pad(n){return String(n).padStart(2,'0')}
function slugFor(date=new Date()){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));const mo=new Date(d);mo.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const sa=new Date(mo);sa.setUTCDate(mo.getUTCDate()+5);const f=x=>`${pad(x.getUTCDate())}${pad(x.getUTCMonth()+1)}${String(x.getUTCFullYear()).slice(-2)}`;return`wochen-angebote-${f(mo)}-${f(sa)}`}
function decode(s){return s.replace(/\\u0026/g,'&').replace(/\\u0027/g,"'").replace(/\\\//g,'/').replace(/&amp;/g,'&')}
const slug=slugFor(), landing=`https://prospekte.metro.de/${slug}/page/1`;
const h=await (await fetch(landing,{headers:{'user-agent':'Mozilla/5.0 Chrome/149'}})).text();const m=h.match(/\\?"downloadPdfUrl\\?"\s*:\s*\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/);if(!m)throw new Error('PDF URL fehlt');const url=decode(m[1]);const b=Buffer.from(await (await fetch(url,{headers:{'user-agent':'Mozilla/5.0 Chrome/149'}})).arrayBuffer());const tmp=path.join(os.tmpdir(),'metro-bbox.pdf');await fs.writeFile(tmp,b);
const {stdout}=await execFileAsync('pdftotext',['-f','1','-l','12','-bbox-layout',tmp,'-'],{maxBuffer:40*1024*1024});const $=cheerio.load(stdout,{xmlMode:true});const pages=[];
$('page').each((pi,pel)=>{const page={page:pi+1,width:Number($(pel).attr('width')),height:Number($(pel).attr('height')),priceBlocks:[]};const blocks=[];$(pel).find('block').each((bi,bel)=>{const words=[];$(bel).find('word').each((_,w)=>words.push({t:$(w).text(),x1:Number($(w).attr('xMin')),y1:Number($(w).attr('yMin')),x2:Number($(w).attr('xMax')),y2:Number($(w).attr('yMax'))}));if(!words.length)return;blocks.push({i:bi,x1:Math.min(...words.map(w=>w.x1)),y1:Math.min(...words.map(w=>w.y1)),x2:Math.max(...words.map(w=>w.x2)),y2:Math.max(...words.map(w=>w.y2)),text:words.map(w=>w.t).join(' '),words});});
 for(const block of blocks){if(!/\d{1,3}[,.]\d{2}\*?\s*\(\d{1,3}[,.]\d{2}\)/.test(block.text))continue;const cx=(block.x1+block.x2)/2;const near=blocks.filter(b=>b.i!==block.i&&b.y2<=block.y2+5&&b.y1>=block.y1-180&&Math.max(0,Math.min(block.x2,b.x2)-Math.max(block.x1,b.x1))>0).sort((a,b)=>b.y2-a.y2).slice(0,12).map(b=>({i:b.i,x1:+b.x1.toFixed(1),y1:+b.y1.toFixed(1),x2:+b.x2.toFixed(1),y2:+b.y2.toFixed(1),text:b.text.slice(0,300)}));page.priceBlocks.push({block:{i:block.i,x1:+block.x1.toFixed(1),y1:+block.y1.toFixed(1),x2:+block.x2.toFixed(1),y2:+block.y2.toFixed(1),text:block.text.slice(0,500)},near});if(page.priceBlocks.length>=20)break;}pages.push(page)});
await fs.writeFile(OUT,JSON.stringify({at:new Date().toISOString(),slug,landing,pages},null,2)+'\n');console.log(`BBox Debug: ${pages.reduce((s,p)=>s+p.priceBlocks.length,0)} Preisblöcke auf ${pages.length} Seiten.`);
