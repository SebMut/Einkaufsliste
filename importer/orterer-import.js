import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { normalizeOffer } from './product-normalizer.js';
import { applyProductIdentity } from './product-identity.js';
import { isAllowedMarket } from './market-policy.js';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const livePath=path.join(DATA,'offers-live.json');
const markets=JSON.parse(await fs.readFile(path.join(DATA,'markets.json'),'utf8'));
const branch=(markets.markets||[]).find(m=>m.store==='Orterer'&&isAllowedMarket(m));
if(!branch){console.log('Orterer: keine erlaubte Filiale.');process.exit(0)}

const URL='https://www.orterer.de/';
const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const n=v=>{const x=Number(String(v??'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(x)?x:null};
function sizeInfo(text){
  let m=String(text).match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(l|ml)\b/i);
  if(m){const count=Number(m[1]),amount=n(m[2]),unit=m[3].toLowerCase();const liters=count*amount*(unit==='ml'?0.001:1);return{size:`${m[1]} x ${m[2]} ${unit}`,liters}}
  m=String(text).match(/\b(\d+(?:[.,]\d+)?)\s*(l|ml)\b/i);
  if(m){const amount=n(m[1]),unit=m[2].toLowerCase();return{size:`${m[1]} ${unit}`,liters:amount*(unit==='ml'?0.001:1)}}
  return null;
}
function baseFromText(text,price,liters){
  const m=String(text).match(/\(\s*1\s*l\s*=\s*€?\s*(\d+[.,]\d{2})\s*\)/i);
  const explicit=m?n(m[1]):null;
  if(Number.isFinite(explicit))return explicit;
  return Number.isFinite(liters)&&liters>0?+(price/liters).toFixed(2):null;
}
function fromBlock(text){
  const t=clean(text);if(t.length<12||t.length>1200)return null;
  const pm=t.match(/(?:^|\s)(\d{1,3})\s*[.,]\s*(\d{2})(?:\s|€)/);if(!pm)return null;
  const price=Number(`${pm[1]}.${pm[2]}`);if(!Number.isFinite(price)||price<0.1||price>300)return null;
  const si=sizeInfo(t);if(!si)return null;
  let name=t.slice(pm.index+pm[0].length).replace(/^€?\s*/,'');
  name=name.split(/\b(?:Dauerpreis|Pfand|\(\s*1\s*l\s*=|\d+\s*x\s*\d|\d+(?:[.,]\d+)?\s*(?:l|ml)\b)/i)[0];
  name=clean(name.replace(/^(?:Permanentes Angebot|Aktuelles Angebot|Angebot)\s*/i,''));
  if(name.length<3||name.length>180)return null;
  const dauer=/Dauerpreis|Permanentes Angebot/i.test(t);const base=baseFromText(t,price,si.liters);
  return {name,store:'Orterer',market:branch.market,address:branch.address,lat:branch.lat??null,lon:branch.lon??null,cat:'Getränke',size:si.size,price,currentPrice:price,regularPrice:dauer?price:null,offerPrice:dauer?null:price,isOffer:!dauer,advertised:!dauer,unit:Number.isFinite(base)?base:price,basePrice:Number.isFinite(base)?base:price,unitLabel:Number.isFinite(base)?'€/l':'€/Packung',sourceUrl:URL,sourceType:dauer?'official_catalog':'official_offer',sourceScope:'market',importedAt:new Date().toISOString(),activeMarket:true};
}
function parseHtml(html){
  const $=cheerio.load(html),found=[],seen=new Set();
  const selectors=['article','[class*="angebot"]','[class*="offer"]','[class*="swiper-slide"]','[class*="product"]'];
  for(const selector of selectors)$(selector).each((_,el)=>{const p=fromBlock($(el).text());if(!p)return;const k=`${p.name.toLowerCase()}|${p.price}|${p.size}`;if(!seen.has(k)){seen.add(k);found.push(p)}});
  if(found.length)return found;
  const text=clean($('body').text());
  const chunks=text.split(/(?=Permanentes Angebot|Aktuelles Angebot|\bAngebot\b)/i);
  for(const chunk of chunks){const p=fromBlock(chunk.slice(0,1000));if(!p)continue;const k=`${p.name.toLowerCase()}|${p.price}|${p.size}`;if(!seen.has(k)){seen.add(k);found.push(p)}}
  return found;
}
async function fetchStatic(){const r=await fetch(URL,{headers:{'user-agent':'Mozilla/5.0 (compatible; AngebotsRadar/5.1)','accept-language':'de-DE,de;q=0.9'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return parseHtml(await r.text())}
async function fetchBrowser(){const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({locale:'de-DE',viewport:{width:1280,height:1800}});await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});for(const label of [/Alle akzeptieren/i,/Akzeptieren/i,/Zustimmen/i]){try{const b=page.getByRole('button',{name:label}).first();if(await b.isVisible({timeout:700})){await b.click();break}}catch{}}await page.waitForTimeout(1500);return parseHtml(await page.content())}finally{await browser.close()}}

let parsed=[];try{parsed=await fetchStatic()}catch(e){console.warn('Orterer statisch:',e.message)}
if(!parsed.length){try{parsed=await fetchBrowser()}catch(e){console.warn('Orterer Browser:',e.message)}}
if(!parsed.length){console.log('Orterer: offizielle Seite erreichbar, aber keine sicher extrahierbaren Preisdatensätze; vorhandene Orterer-Daten bleiben unangetastet.');process.exit(0)}
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const normalized=parsed.map((p,i)=>({id:`orterer-${Date.now()}-${i}`,...applyProductIdentity(normalizeOffer(p)),...p}));
live.offers=[...(live.offers||[]).filter(o=>o.store!=='Orterer'),...normalized];
live.sources=[...(live.sources||[]).filter(s=>s.store!=='Orterer'),{store:'Orterer',market:branch.market,address:branch.address,url:URL,scope:'market',type:'Getränkemarkt',importStatus:'supported',catalogStatus:'offers_only',activeMarket:true}];
live.generatedAt=new Date().toISOString();
await fs.writeFile(livePath,JSON.stringify(live,null,2)+'\n');
console.log(`Orterer: ${normalized.length} sichere offizielle Preisdatensätze importiert.`);
