import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const ROOT=path.resolve(process.cwd(),'..');
const LIVE_FILE=path.join(ROOT,'data','offers-live.json');
const PREVIEW_FILE=path.join(ROOT,'data','metro-prospekt-preview.json');
const PREVIEW=process.env.METRO_PREVIEW==='1';
const now=new Date().toISOString();

const FOOD=/rind|kalb|schwein|hähn|pute|lamm|ente|fleisch|steak|roastbeef|filet|schnitzel|wurst|salami|schinken|fisch|lachs|thunfisch|garnelen|forelle|dorade|milch|butter|joghurt|quark|käse|sahne|eier|zwetsch|pflaum|apfel|äpfel|banane|tomat|paprika|gurke|kartoff|zwiebel|möhre|beeren|trauben|avocado|pommes|fries|pizza|brot|brötchen|semmel|baguette|nudel|pasta|reis|mehl|zucker|öl|kaffee|espresso|tee|wasser|saft|cola|limonade|bier|wein|sekt|schokolade|keks|chips|snack|eis|hummus|frucht|gemüse|obst/i;
const REJECT=/weitere infos|metro\.de|gültigkeitszeitraum|gewerbetreib|wiederverkauf|verfügbarkeit|preise ohne|mehrwertsteuer|frische\s*&?\s*basics|getränke\s*&?\s*snacks|nonfood|hygiene|bild ki|klasse i|herkunft|vorgereift|vak\.?-?verp|zertifiziert|qualität|tiefpreis|angebot$/i;
const ICONS={'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};

function pad(n){return String(n).padStart(2,'0')}
function weekInfo(date=new Date()){
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  const saturday=new Date(monday);saturday.setUTCDate(monday.getUTCDate()+5);
  const f=x=>`${pad(x.getUTCDate())}${pad(x.getUTCMonth()+1)}${String(x.getUTCFullYear()).slice(-2)}`;
  return {slug:`wochen-angebote-${f(monday)}-${f(saturday)}`,validFrom:monday.toISOString().slice(0,10),validTo:saturday.toISOString().slice(0,10)};
}
function clean(s=''){return String(s).replace(/\u00ad/g,'').replace(/\s+/g,' ').replace(/^[-•·]+\s*/,'').trim()}
function num(s){return Number(String(s).replace('.','').replace(',','.').replace(/[^0-9.]/g,''))}
function decodeJsString(s){return s.replace(/\\u0026/g,'&').replace(/\\u0027/g,"'").replace(/\\\//g,'/').replace(/&amp;/g,'&')}
function category(t){if(/zwetsch|pflaum|apfel|äpfel|banane|tomat|paprika|gurke|kartoff|zwiebel|möhre|beeren|trauben|avocado|obst|gemüse/i.test(t))return'Obst & Gemüse';if(/milch|butter|joghurt|quark|käse|sahne/i.test(t))return'Milchprodukte';if(/rind|kalb|schwein|hähn|pute|lamm|ente|fleisch|steak|roastbeef|filet|schnitzel|wurst|salami|schinken|fisch|lachs|thunfisch|garnelen|forelle|dorade/i.test(t))return'Fleisch & Fisch';if(/kaffee|espresso|tee|müsli|eier/i.test(t))return'Kaffee & Frühstück';if(/nudel|pasta|reis|mehl|zucker|öl|hummus/i.test(t))return'Vorrat';if(/pommes|fries|tiefkühl|pizza|eiscreme|speiseeis/i.test(t))return'Tiefkühl';if(/wasser|saft|cola|limonade|bier|wein|sekt/i.test(t))return'Getränke';if(/schokolade|keks|chips|snack|bonbon/i.test(t))return'Süßes & Snacks';if(/brot|brötchen|semmel|baguette/i.test(t))return'Backwaren';return'Lebensmittel'}
function validTitle(s){const t=clean(s);if(t.length<3||t.length>105||!/[A-Za-zÄÖÜäöüß]{3}/.test(t))return false;if(REJECT.test(t))return false;if(/^\d|^(?:ab|ca\.?|je|pro|stück|stücke|packung|karton|beutel|schale)\b/i.test(t))return false;if(/\d+[,.]\d{2}\*?/.test(t))return false;if(/[•]/.test(t))return false;return true}
function localSegment(line,x){const left=Math.max(0,x-52),right=Math.min(line.length,x+18);return clean(line.slice(left,right))}
function titleFor(lines,row,x){const found=[];let firstRow=null;for(let d=1;d<=15;d++){
  const r=row-d;if(r<0)break;const raw=localSegment(lines[r]||'',x);if(!raw)continue;
  // Zeilen mit Beschreibungspunkten bzw. reinen Mengen-/Preisbedingungen auslassen.
  if(/[•]/.test((lines[r]||'').slice(Math.max(0,x-55),Math.min((lines[r]||'').length,x+20))))continue;
  if(/\b(?:ab|je|ca\.?|kg|g|ml|l|stück|stücke|karton|beutel|schale|packung)\b/i.test(raw)&&/\d/.test(raw))continue;
  if(!validTitle(raw))continue;
  // Lokale Spalte kann den Rest eines Nachbarprodukts enthalten. Bevorzugt wird
  // ein lebensmitteltypischer Titel.
  if(FOOD.test(raw)){found.unshift(raw);firstRow=r;if(found.length>=3)break;}
  else if(found.length&&firstRow!==null&&firstRow-r<=2){found.unshift(raw);firstRow=r;if(found.length>=3)break;}
 }
 if(!found.length)return'';
 let title=found.join(' ').replace(/-\s+/g,'-').replace(/\s+/g,' ').trim();
 // Falls mehrere Spaltenfragmente zusammengelaufen sind, am doppelten großen Abstand
 // wurde bereits abgeschnitten; zusätzlich sehr lange Titel auf sinnvolle Länge kürzen.
 if(title.length>100)title=title.slice(-100).trim();
 return title;
}
function nearbyContext(lines,row,x){const chunks=[];for(let r=Math.max(0,row-8);r<=Math.min(lines.length-1,row+2);r++){const s=localSegment(lines[r]||'',x);if(s)chunks.push(s)}return clean(chunks.join(' '))}
function sizeFrom(ctx,unitLabel){if(unitLabel==='€/kg'){
  const m=ctx.match(/(?:ca\.?\s*)?(\d+(?:[.,]\d+)?\s*-?kg(?:-?(?:Packung|Karton|Stück(?:e)?))?)/i);return m?clean(m[1]):'1 kg';
 }
 if(unitLabel==='€/l'){const m=ctx.match(/(\d+(?:[.,]\d+)?\s*(?:l|Liter)(?:-?(?:Flasche|Packung))?)/i);return m?clean(m[1]):'1 l'}
 let m=ctx.match(/((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml)(?:-?(?:Packung|Karton|Beutel|Schale|Dose|Flasche))?)/i);if(m)return clean(m[1]);
 m=ctx.match(/(\d+\s*(?:Stück|St\.?)(?:-?(?:Packung|Karton))?)/i);return m?clean(m[1]):'Packung'}
function baseFrom(price,size,unitLabel){if(unitLabel==='€/kg'||unitLabel==='€/l')return price;let m=size.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=num(m[1])*num(m[2]);const u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return q>0?price/q:price}m=size.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=num(m[1]);const u=m[2].toLowerCase();if(u==='g'||u==='ml')q/=1000;return q>0?price/q:price}return price}
function conditionFor(line,x,ctx){const before=clean(line.slice(Math.max(0,x-25),x));let m=before.match(/ab\s+(?:ca\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:kg|Karton|Kartons|Beutel|Packungen?|Stück))/i);if(m)return`ab ${m[1]}`;m=ctx.match(/ab\s+(?:ca\.?\s*)?(\d+(?:[.,]\d+)?\s*(?:kg|Karton|Kartons|Beutel|Packungen?|Stück))/i);return m?`ab ${m[1]}`:null}

async function fetchPdf(){const wk=weekInfo();const landing=`https://prospekte.metro.de/${wk.slug}/page/1`;const r=await fetch(landing,{headers:{'user-agent':'Mozilla/5.0 Chrome/149 Safari/537.36','accept':'text/html'}});if(!r.ok)throw new Error(`METRO Prospekt HTTP ${r.status}`);const html=await r.text();const m=html.match(/\\?"downloadPdfUrl\\?"\s*:\s*\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/);if(!m)throw new Error('METRO PDF-URL nicht gefunden');const pdfUrl=decodeJsString(m[1]);const pr=await fetch(pdfUrl,{headers:{'user-agent':'Mozilla/5.0 Chrome/149 Safari/537.36'}});if(!pr.ok)throw new Error(`METRO PDF HTTP ${pr.status}`);return{...wk,landing,pdfUrl,bytes:Buffer.from(await pr.arrayBuffer())}}

const meta=await fetchPdf();const tmp=path.join(os.tmpdir(),'metro-angebote.pdf');await fs.writeFile(tmp,meta.bytes);const {stdout}=await execFileAsync('pdftotext',['-layout',tmp,'-'],{maxBuffer:40*1024*1024});const pages=stdout.replace(/\r/g,'').split('\f');
const raw=[];const priceRe=/(\d{1,3},\d{2})\*\s*\((\d{1,3},\d{2})\)/g;
for(let p=0;p<pages.length;p++){
 const lines=pages[p].split('\n');for(let row=0;row<lines.length;row++){
  const line=lines[row];priceRe.lastIndex=0;let m;while((m=priceRe.exec(line))){const x=m.index;const net=num(m[1]),gross=num(m[2]);if(!Number.isFinite(gross)||gross<=.05||gross>=500)continue;const before=line.slice(Math.max(0,x-24),x);const unitLabel=/je\s*kg/i.test(before)?'€/kg':/je\s*(?:l|Liter)/i.test(before)?'€/l':'€/Packung';const ctx=nearbyContext(lines,row,x);const name=titleFor(lines,row,x);if(!name||!FOOD.test(`${name} ${ctx}`))continue;const size=sizeFrom(ctx,unitLabel);const unit=baseFrom(gross,size,unitLabel);if(!Number.isFinite(unit)||unit<=0||unit>1000)continue;raw.push({name,price:gross,netPrice:net,unit:+unit.toFixed(3),unitLabel,size,condition:conditionFor(line,x,ctx),page:p+1,context:ctx});}
 }
}
// Gruppiere gleiche Produkte. METRO hat häufig Mengenstaffeln. Für den normalen
// Vergleich nehmen wir den höchsten Bruttopreis der Staffel (kleinste Abnahmemenge),
// merken aber den günstigsten Staffelpreis separat.
const groups=new Map();for(const r of raw){const k=`${r.name.toLowerCase()}|${r.unitLabel}|${r.size}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
const offers=[];for(const arr of groups.values()){
 arr.sort((a,b)=>b.price-a.price);const chosen=arr[0],bulk=Math.min(...arr.map(x=>x.price));const cat=category(`${chosen.name} ${chosen.context}`);offers.push({key:chosen.name.slice(0,55),name:chosen.name,store:'METRO',market:'München-Freimann',address:'Helene-Wessel-Bogen 39, 80939 München',cat,size:chosen.size,price:+chosen.price.toFixed(2),unit:chosen.unit,unitLabel:chosen.unitLabel,icon:ICONS[cat]||'🛒',bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(chosen.context),app:false,coupon:false,advertised:true,sourceUrl:meta.landing,sourceScope:'market',sourceTransport:'official-prospect-pdf',priceBasis:'gross',vatIncluded:true,netPrice:+chosen.netPrice.toFixed(2),bulkPriceGross:bulk<chosen.price?+bulk.toFixed(2):null,bulkDiscountAvailable:bulk<chosen.price,condition:chosen.condition,validFrom:meta.validFrom,validTo:meta.validTo,prospectPage:chosen.page,importedAt:now})}
offers.sort((a,b)=>a.name.localeCompare(b.name,'de'));
const result={generatedAt:now,source:meta.landing,pdfBytes:meta.bytes.length,textChars:stdout.length,rawMatches:raw.length,offerCount:offers.length,offers};
if(PREVIEW){await fs.writeFile(PREVIEW_FILE,JSON.stringify(result,null,2)+'\n');console.log(`METRO Vorschau: ${raw.length} Preis-Treffer -> ${offers.length} Produkte.`);process.exit(0)}
const data=JSON.parse(await fs.readFile(LIVE_FILE,'utf8'));data.offers=(data.offers||[]).filter(o=>o.store!=='METRO').concat(offers);data.offerCount=data.offers.length;data.metroProspectAt=now;const s=(data.sources||[]).find(x=>x.store==='METRO');if(s){s.status=offers.length?'ok':'no_data';s.count=offers.length;s.message=offers.length?`${offers.length} METRO-Angebote aus offiziellem Wochenprospekt (Bruttopreise)`:'METRO-Wochenprospekt erreichbar, aber keine validen Lebensmittelangebote erkannt.';s.transport='official-prospect-pdf';}await fs.writeFile(LIVE_FILE,JSON.stringify(data,null,2)+'\n');console.log(`METRO Prospekt: ${raw.length} Preis-Treffer -> ${offers.length} Produkte.`);
