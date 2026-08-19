import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const out=path.join(ROOT,'data','metro-prospekt-debug.json');

function pad(n){return String(n).padStart(2,'0')}
function slugFor(date=new Date()){
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  const day=d.getUTCDay();
  const monday=new Date(d); monday.setUTCDate(d.getUTCDate()-((day+6)%7));
  const saturday=new Date(monday); saturday.setUTCDate(monday.getUTCDate()+5);
  const f=x=>`${pad(x.getUTCDate())}${pad(x.getUTCMonth()+1)}${String(x.getUTCFullYear()).slice(-2)}`;
  return `wochen-angebote-${f(monday)}-${f(saturday)}`;
}

const slug=slugFor();
const url=`https://prospekte.metro.de/${slug}/page/1`;
const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'de-DE,de;q=0.9'}});
const html=await r.text();
const $=cheerio.load(html);
const classes=new Map();
$('*').each((_,el)=>{for(const c of String($(el).attr('class')||'').split(/\s+/).filter(Boolean))classes.set(c,(classes.get(c)||0)+1)});
const textFragments=[];
$('span,p,a,div,h1,h2,h3,h4,img').each((_,el)=>{
  let t=$(el).text().replace(/\s+/g,' ').trim();
  if(el.tagName==='img') t=$(el).attr('alt')||'';
  if(t.length>=2&&t.length<500) textFragments.push({tag:el.tagName,cls:$(el).attr('class')||'',text:t.slice(0,480)});
});
const scripts=[];
$('script').each((_,el)=>{const src=$(el).attr('src');const txt=$(el).html()||'';if(src||txt.trim())scripts.push({src:src||null,text:src?null:txt.trim().slice(0,1000)})});
const diag={at:new Date().toISOString(),slug,url,status:r.status,finalUrl:r.url,htmlBytes:html.length,title:$('title').text(),topClasses:[...classes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,80),textFragments:textFragments.slice(0,200),scripts:scripts.slice(0,40),bodyText:$('body').text().replace(/\s+/g,' ').trim().slice(0,12000)};
await fs.writeFile(out,JSON.stringify(diag,null,2)+'\n');
console.log(`METRO Prospekt Debug: ${r.status}, ${html.length} Bytes, ${url}`);
