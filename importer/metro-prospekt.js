import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(process.cwd(), '..');
const LIVE_FILE = path.join(ROOT, 'data', 'offers-live.json');
const PREVIEW_FILE = path.join(ROOT, 'data', 'metro-prospekt-preview.json');
const PREVIEW = process.env.METRO_PREVIEW === '1';
const now = new Date().toISOString();

const FOOD = /\b(?:rind\w*|kalb\w*|schwein\w*|hähn\w*|pute\w*|lamm\w*|ente\w*|fleisch\w*|steak\w*|roastbeef|entrec[oô]te\w*|filet\w*|schnitzel\w*|wurst\w*|salami\w*|schinken\w*|fisch\w*|lachs\w*|thunfisch\w*|garnelen\w*|forelle\w*|dorade\w*|milch\w*|butter\w*|joghurt\w*|quark\w*|käse\w*|sahne\w*|eier\w*|zwetschgen?\w*|pflaumen?\w*|nektarinen?\w*|feigen?\w*|äpfel\w*|apfel\w*|bananen?\w*|tomaten?\w*|paprika\w*|gurken?\w*|kartoffeln?\w*|zwiebeln?\w*|möhren?\w*|karotten?\w*|beeren\w*|trauben\w*|avocado\w*|pommes\w*|fries|pizza\w*|brot\w*|brötchen\w*|semmel\w*|baguette\w*|nudeln?\w*|pasta\w*|reis\w*|mehl\w*|zucker\w*|öl\w*|kaffee\w*|espresso\w*|tee\w*|wasser\w*|saft\w*|cola\w*|limonade\w*|bier\w*|wein\w*|sekt\w*|schokolade\w*|keks\w*|chips\w*|snack\w*|eis|eiscreme\w*|speiseeis\w*|hummus\w*|frucht\w*|gemüse\w*|obst\w*)\b/i;
const REJECT = /weitere infos|metro\.de|gültigkeitszeitraum|gewerbetreib|wiederverkauf|verfügbarkeit|preise ohne|mehrwertsteuer|frische\s*&?\s*basics|getränke\s*&?\s*snacks|nonfood|hygiene|bild ki|klasse i|herkunft|vorgereift|vak\.?-?verp|zertifiziert|qualität|tiefpreis|angebot|abgabe nur|deutschland gmbh|anwendungsbeispiel|leistung|grillpfanne|pfanne|geschirr|messer|gerät|maschine|besteck/i;
const ICONS = {'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};

function pad(n){ return String(n).padStart(2,'0'); }
function weekInfo(date=new Date()){
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  const saturday = new Date(monday); saturday.setUTCDate(monday.getUTCDate()+5);
  const f = x => `${pad(x.getUTCDate())}${pad(x.getUTCMonth()+1)}${String(x.getUTCFullYear()).slice(-2)}`;
  return {slug:`wochen-angebote-${f(monday)}-${f(saturday)}`, validFrom:monday.toISOString().slice(0,10), validTo:saturday.toISOString().slice(0,10)};
}
function clean(s=''){ return String(s).replace(/[\u00ad\uFEFF]/g,'').replace(/\s+/g,' ').trim(); }
function num(s){ return Number(String(s).replace('.','').replace(',','.').replace(/[^0-9.]/g,'')); }
function decodeJsString(s){ return s.replace(/\\u0026/g,'&').replace(/\\u0027/g,"'").replace(/\\\//g,'/').replace(/&amp;/g,'&'); }
function category(t){
  if(/zwetsch|pflaum|nektarin|feigen|apfel|äpfel|banane|tomat|paprika|gurke|kartoff|zwiebel|möhre|karotte|beeren|trauben|avocado|obst|gemüse/i.test(t)) return 'Obst & Gemüse';
  if(/milch|butter|joghurt|quark|käse|sahne/i.test(t)) return 'Milchprodukte';
  if(/pommes|fries|tiefkühl|pizza|eiscreme|speiseeis|\beis\b/i.test(t)) return 'Tiefkühl';
  if(/rind|kalb|schwein|hähn|pute|lamm|ente|fleisch|steak|roastbeef|entrec|filet|schnitzel|wurst|salami|schinken|fisch|lachs|thunfisch|garnelen|forelle|dorade/i.test(t)) return 'Fleisch & Fisch';
  if(/kaffee|espresso|tee|müsli|eier/i.test(t)) return 'Kaffee & Frühstück';
  if(/nudel|pasta|reis|mehl|zucker|öl|hummus/i.test(t)) return 'Vorrat';
  if(/wasser|saft|cola|limonade|bier|wein|sekt/i.test(t)) return 'Getränke';
  if(/schokolade|keks|chips|snack|bonbon/i.test(t)) return 'Süßes & Snacks';
  if(/brot|brötchen|semmel|baguette/i.test(t)) return 'Backwaren';
  return 'Lebensmittel';
}
function titleFromBlock(text=''){
  let t = clean(text);
  t = t.split('•')[0].trim();
  t = t.replace(/\b(?:TIEFPREIS|ANGEBOT)\b.*$/i,'').trim();
  t = t.replace(/^\s*(?:ab\s+\d+(?:[.,]\d+)?\s*(?:kg|Packungen?|Kartons?|Beutel|Stück|Säcke?)\s*)+/i,'');
  t = t.replace(/\bab\s+\d+(?:[.,]\d+)?\s*(?:kg|Packungen?|Kartons?|Beutel|Stück|Säcke?)\b/ig,' ');
  t = t.replace(/^Packungen?\s+/i,'').replace(/\s+Packungen?$/i,'');
  t = t.replace(/\s+-\s+/g,'-').replace(/-\s+/g,'-').replace(/\s+/g,' ').trim();
  if(t.length<3 || t.length>120 || !/[A-Za-zÄÖÜäöüß]{3}/.test(t)) return '';
  if(REJECT.test(t) || /^\d|^(?:ab|ca\.?|je|pro|stück|stücke|packung|karton|beutel|schale|sack|säcke)\b/i.test(t)) return '';
  if(/\d+[,.]\d{2}\*?/.test(t)) return '';
  if(!FOOD.test(t)) return '';
  return t;
}
function blockDistance(price,b){
  const pcx=(price.x1+price.x2)/2, bcx=(b.x1+b.x2)/2;
  const verticalGap = b.y2 < price.y1 ? price.y1-b.y2 : Math.abs(((b.y1+b.y2)/2)-((price.y1+price.y2)/2))*0.45;
  const targetX = pcx-95;
  const dx=Math.abs(targetX-bcx);
  const leftBonus = b.x2 <= price.x1+15 ? -18 : 0;
  return verticalGap*1.25 + dx*.38 + leftBonus;
}
function unitFor(price,blocks){
  const near=blocks.filter(b=>b.y1>=price.y1-22&&b.y2<=price.y2+30&&b.x1>=price.x1-60&&b.x2<=price.x2+45).map(b=>clean(b.text)).join(' ');
  if(/je\s*kg/i.test(near)) return '€/kg';
  if(/je\s*(?:l|Liter)\b/i.test(near)) return '€/l';
  return '€/Packung';
}
function conditionFor(price,blocks){
  const c=blocks.filter(b=>b.y1>=price.y1-28&&b.y2<=price.y2+30&&b.x1>=price.x1-110&&b.x2<=price.x1+15).map(b=>clean(b.text)).join(' ');
  const m=c.match(/ab\s+(?:ca\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:kg|Karton|Kartons|Beutel|Packungen?|Stück|Sack|Säcke))/i);
  return m?`ab ${m[1]}`:null;
}
function contextFor(title,price,blocks){
  return clean(blocks.filter(b=>b.y1>=Math.max(0,title.y1-5)&&b.y2<=price.y2+55&&b.x1>=Math.max(0,title.x1-18)&&b.x2<=price.x2+45).map(b=>b.text).join(' '));
}
function sizeFrom(ctx,unitLabel){
  if(unitLabel==='€/kg') return '1 kg';
  if(unitLabel==='€/l') return '1 l';
  let m=ctx.match(/((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml)(?:-?(?:Packung|Karton|Beutel|Schale|Dose|Flasche))?)/i);
  if(m) return clean(m[1]);
  m=ctx.match(/(\d+\s*(?:Stück|St\.?)(?:-?(?:Packung|Karton))?)/i);
  return m?clean(m[1]):'Packung';
}
function baseFrom(price,size,unitLabel){
  if(unitLabel==='€/kg'||unitLabel==='€/l') return price;
  let m=size.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);
  if(m){let q=num(m[1])*num(m[2]);const u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return q>0?price/q:price;}
  m=size.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);
  if(m){let q=num(m[1]);const u=m[2].toLowerCase();if(u==='g'||u==='ml')q/=1000;return q>0?price/q:price;}
  return price;
}
async function fetchPdf(){
  const wk=weekInfo(); const landing=`https://prospekte.metro.de/${wk.slug}/page/1`;
  const r=await fetch(landing,{headers:{'user-agent':'Mozilla/5.0 Chrome/149 Safari/537.36','accept':'text/html'}});
  if(!r.ok) throw new Error(`METRO Prospekt HTTP ${r.status}`);
  const html=await r.text();
  const m=html.match(/\\?"downloadPdfUrl\\?"\s*:\s*\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/);
  if(!m) throw new Error('METRO PDF-URL nicht gefunden');
  const pdfUrl=decodeJsString(m[1]);
  const pr=await fetch(pdfUrl,{headers:{'user-agent':'Mozilla/5.0 Chrome/149 Safari/537.36'}});
  if(!pr.ok) throw new Error(`METRO PDF HTTP ${pr.status}`);
  return {...wk,landing,pdfUrl,bytes:Buffer.from(await pr.arrayBuffer())};
}

const meta=await fetchPdf();
const tmp=path.join(os.tmpdir(),'metro-angebote.pdf');
await fs.writeFile(tmp,meta.bytes);
const {stdout}=await execFileAsync('pdftotext',['-bbox-layout',tmp,'-'],{maxBuffer:100*1024*1024});
const $=cheerio.load(stdout,{xmlMode:true});
const raw=[];

$('page').each((pi,pel)=>{
  const pageWidth=Number($(pel).attr('width')||425);
  const blocks=[]; const lines=[];
  $(pel).find('block').each((bi,bel)=>{
    const blockWords=[];
    $(bel).find('line').each((li,lel)=>{
      const words=[];
      $(lel).find('word').each((_,w)=>words.push({t:clean($(w).text()),x1:Number($(w).attr('xMin')),y1:Number($(w).attr('yMin')),x2:Number($(w).attr('xMax')),y2:Number($(w).attr('yMax'))}));
      if(words.length){ lines.push({blockIndex:bi,lineIndex:li,words}); blockWords.push(...words); }
    });
    if(!blockWords.length)return;
    blocks.push({i:bi,x1:Math.min(...blockWords.map(w=>w.x1)),y1:Math.min(...blockWords.map(w=>w.y1)),x2:Math.max(...blockWords.map(w=>w.x2)),y2:Math.max(...blockWords.map(w=>w.y2)),text:clean(blockWords.map(w=>w.t).join(' '))});
  });

  const pricePairs=[];
  for(const line of lines){
    const ws=line.words;
    for(let i=0;i<ws.length;i++){
      const netM=ws[i].t.match(/^(\d{1,3},\d{2})\*$/);
      if(!netM)continue;
      for(let n=1;n<=3 && i+n<ws.length;n++){
        const grossText=ws.slice(i+1,i+n+1).map(w=>w.t).join('');
        const grossM=grossText.match(/^\((\d{1,3},\d{2})\)$/);
        if(!grossM)continue;
        const net=num(netM[1]), gross=num(grossM[1]);
        if(!Number.isFinite(net)||!Number.isFinite(gross)||gross<=net||gross/net<1.04||gross/net>1.22) break;
        const gw=ws[i+n];
        pricePairs.push({x1:ws[i].x1,y1:Math.min(ws[i].y1,...ws.slice(i+1,i+n+1).map(w=>w.y1)),x2:gw.x2,y2:Math.max(ws[i].y2,...ws.slice(i+1,i+n+1).map(w=>w.y2)),net,gross,text:`${netM[1]}* (${grossM[1]})`,blockIndex:line.blockIndex});
        break;
      }
    }
  }

  for(const price of pricePairs){
    if(price.gross<=.05||price.gross>=500)continue;
    const candidates=blocks.map(b=>({...b,title:titleFromBlock(b.text)})).filter(b=>b.title&&b.i!==price.blockIndex&&b.y1>=Math.max(0,price.y1-225)&&b.y2<=price.y2+24&&b.x1>=Math.max(0,price.x1-230)&&b.x2<=Math.min(pageWidth,price.x2+25));
    if(!candidates.length)continue;
    candidates.sort((a,b)=>blockDistance(price,a)-blockDistance(price,b));
    const title=candidates[0], score=blockDistance(price,title);
    if(score>275)continue;
    const unitLabel=unitFor(price,blocks), condition=conditionFor(price,blocks), ctx=contextFor(title,price,blocks), size=sizeFrom(ctx,unitLabel), unit=baseFrom(price.gross,size,unitLabel);
    if(!Number.isFinite(unit)||unit<=0||unit>1000)continue;
    raw.push({name:title.title,price:price.gross,netPrice:price.net,unit:+unit.toFixed(3),unitLabel,size,condition,page:pi+1,context:ctx,titleScore:+score.toFixed(1)});
  }
});

const groups=new Map();
for(const r of raw){
  const groupingSize=(r.unitLabel==='€/kg'||r.unitLabel==='€/l')?'unit':r.size;
  const k=`${r.name.toLowerCase()}|${r.unitLabel}|${groupingSize}`;
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(r);
}
const offers=[];
for(const arr of groups.values()){
  arr.sort((a,b)=>b.price-a.price);
  const chosen=arr[0], bulk=Math.min(...arr.map(x=>x.price));
  const cat=category(`${chosen.name} ${chosen.context}`);
  offers.push({key:chosen.name.slice(0,55),name:chosen.name,store:'METRO',market:'München-Freimann',address:'Helene-Wessel-Bogen 39, 80939 München',cat,size:chosen.size,price:+chosen.price.toFixed(2),unit:chosen.unit,unitLabel:chosen.unitLabel,icon:ICONS[cat]||'🛒',bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(chosen.context),app:false,coupon:false,advertised:true,sourceUrl:meta.landing,sourceScope:'market',sourceTransport:'official-prospect-pdf',priceBasis:'gross',vatIncluded:true,netPrice:+chosen.netPrice.toFixed(2),bulkPriceGross:bulk<chosen.price?+bulk.toFixed(2):null,bulkDiscountAvailable:bulk<chosen.price,condition:chosen.condition,validFrom:meta.validFrom,validTo:meta.validTo,prospectPage:chosen.page,importedAt:now});
}
// Wenn dasselbe Produkt sowohl als Kilopreis als auch als rechnerischer Kartonpreis
// erkannt wurde, ist der Kilopreis für unseren Vergleich die eindeutigere Darstellung.
const namesWithUnit=new Set(offers.filter(o=>o.unitLabel==='€/kg'||o.unitLabel==='€/l').map(o=>o.name.toLowerCase()));
const cleanedOffers=offers.filter(o=>!((o.unitLabel==='€/Packung')&&namesWithUnit.has(o.name.toLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name,'de'));
const result={generatedAt:now,source:meta.landing,pdfBytes:meta.bytes.length,bboxChars:stdout.length,rawMatches:raw.length,offerCount:cleanedOffers.length,offers:cleanedOffers};
if(PREVIEW){await fs.writeFile(PREVIEW_FILE,JSON.stringify(result,null,2)+'\n');console.log(`METRO Word-BBox-Vorschau: ${raw.length} Preiszuordnungen -> ${cleanedOffers.length} Produkte.`);process.exit(0);}
const data=JSON.parse(await fs.readFile(LIVE_FILE,'utf8'));
data.offers=(data.offers||[]).filter(o=>o.store!=='METRO').concat(cleanedOffers);
data.offerCount=data.offers.length;data.metroProspectAt=now;
const s=(data.sources||[]).find(x=>x.store==='METRO');
if(s){s.status=cleanedOffers.length?'ok':'no_data';s.count=cleanedOffers.length;s.message=cleanedOffers.length?`${cleanedOffers.length} METRO-Angebote aus offiziellem Wochenprospekt (Bruttopreise)`:'METRO-Wochenprospekt erreichbar, aber keine validen Lebensmittelangebote erkannt.';s.transport='official-prospect-pdf';}
await fs.writeFile(LIVE_FILE,JSON.stringify(data,null,2)+'\n');
console.log(`METRO Prospekt: ${raw.length} Preiszuordnungen -> ${cleanedOffers.length} Produkte.`);
