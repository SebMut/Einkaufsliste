import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const ROOT=path.resolve(process.cwd(),'..');
const DATA=path.join(ROOT,'data');
const DIR=path.join(DATA,'catalog');
const OUT=path.join(DIR,'aldi-sued.json');
const INDEX=path.join(DIR,'index.json');
const now=new Date().toISOString();
const UA='Mozilla/5.0 (compatible; AngebotsRadar/6.0; +https://github.com/SebMut/Einkaufsliste)';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const num=v=>{const s=String(v??'').replace(/\u00a0/g,' ').replace(/€/g,'').trim();if(!s)return null;const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
function abs(href){try{return new URL(href,'https://www.aldi-sued.de').toString().split(/[?#]/)[0]}catch{return''}}
function productId(url=''){return String(url).match(/-(\d{12,})\/?$/)?.[1]||url}
function sizeOf(t=''){return norm(t).match(/\b(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?|er-Pack|Packung)\b/i)?.[0]||'Packung'}
function isBio(t=''){return /\bbio\b|bioland|naturland|demeter|öko-/i.test(t)}
function categoryOf(t=''){const n=t.toLowerCase();if(/windel|baby|säugling|babynahrung|babyartikel/.test(n))return'Baby & Kleinkind';if(/waschmittel|reiniger|spülmittel|toilettenpapier|küchentücher|hygiene|shampoo|duschgel|zahnpflege|deo\b|rasur/.test(n))return'Haushalt & Drogerie';if(/hundefutter|katzenfutter|katzenstreu|tierbedarf/.test(n))return'Tierbedarf';if(/milch|joghurt|käse|quark|butter|eier/.test(n))return'Milchprodukte';if(/fleisch|fisch|wurst|schinken|salami|hack|hähn|rind|schwein|lachs/.test(n))return'Fleisch & Fisch';if(/wasser|saft|cola|limonade|bier|wein|sekt|kaffeegetränk/.test(n))return'Getränke';if(/brot|brötchen|baguette|toast|backware/.test(n))return'Backwaren';if(/nudel|pasta|reis|mehl|zucker|öl|sauce|konserve/.test(n))return'Vorrat';if(/schokolade|keks|chips|snack|bonbon|fruchtgummi/.test(n))return'Süßes & Snacks';if(/tiefkühl|pizza|pommes|speiseeis/.test(n))return'Tiefkühl';return'ALDI Sortiment'}
function cleanTileText(t=''){return norm(t).replace(/\s*Einkaufsliste\s*/gi,' ').trim()}
function currentPriceFromText(text=''){
  const t=cleanTileText(text);
  let m=t.match(/(?:Spare\s+\d+\s*%\s*)?(\d{1,3}[,.]\d{2})\s*€(?:²|\b)/i);if(m)return num(m[1]);
  // Grundpreise in Klammern vor der eigentlichen Preisermittlung entfernen.
  const noBase=t.replace(/\([^)]*?\d+[,.]\d{2}\s*€\s*\/\s*1\s*(?:kg|l|100\s*g|100\s*ml)[^)]*\)/gi,' ');
  const vals=[...noBase.matchAll(/(\d{1,3}[,.]\d{2})\s*€/g)].map(x=>num(x[1])).filter(x=>Number.isFinite(x)&&x>.05&&x<500);
  return vals[0]??null;
}
function regularPriceFromText(text='',current=null){const vals=[...cleanTileText(text).matchAll(/(\d{1,3}[,.]\d{2})\s*€/g)].map(x=>num(x[1])).filter(x=>Number.isFinite(x)&&x>.05&&x<500);const higher=vals.filter(x=>current!=null&&x>current+.001);return higher.at(-1)??current}
function nameFromNode($,node,url,text){
  const candidates=[
    node.find('h2,h3,h4,h5').last().text(),
    node.find('[class*="product-name" i],[class*="productName" i],[class*="title" i]').last().text(),
    node.find('img[alt]').first().attr('alt')
  ].map(norm).filter(x=>x.length>=3&&x.length<=180&&!/^Unsere Produkte|Mehr erfahren|Einkaufsliste$/i.test(x));
  if(candidates.length)return candidates[0];
  const slug=decodeURIComponent(url.split('/produkt/')[1]||'').replace(/-\d{12,}$/,'').replace(/-/g,' ');
  return norm(slug).replace(/^no brand /i,'').slice(0,180);
}
function imageFromNode(node){return node.find('img').first().attr('src')||node.find('img').first().attr('data-src')||''}
function parseDom(html,pageUrl){
  const $=cheerio.load(html),map=new Map();
  $('a[href*="/produkt/"]').each((_,a)=>{
    const href=abs($(a).attr('href'));if(!href)return;
    let node=$(a),best=node;
    for(let i=0;i<6&&node.length;i++,node=node.parent()){const t=cleanTileText(node.text());if(t.length>15&&t.length<2500){best=node;if(/\d+[,.]\d{2}\s*€/.test(t))break}}
    const text=cleanTileText(best.text()),price=currentPriceFromText(text);if(!Number.isFinite(price))return;
    const name=nameFromNode($,best,href,text);if(name.length<3)return;
    const regular=regularPriceFromText(text,price),category=categoryOf(`${name} ${text}`);
    map.set(productId(href),{name,originalName:name,brand:'',ean:null,gtin:null,size:sizeOf(text),currentPrice:+price.toFixed(2),regularPrice:+Number(regular??price).toFixed(2),offerPrice:regular>price+.001?+price.toFixed(2):null,isOffer:regular>price+.001,advertised:regular>price+.001,productUrl:href,image:imageFromNode(best),sourceUrl:pageUrl,sourceType:'official_catalog_full',sourceScope:'catalog',sourceCategory:category,category,department:category,bio:isBio(`${name} ${text}`),filialAvailabilityKnown:false,availability:null,importedAt:now,aldiProductId:productId(href)});
  });
  return [...map.values()];
}
async function fetchPage(page){const url=page===1?'https://www.aldi-sued.de/produkte':`https://www.aldi-sued.de/produkte?page=${page}`;const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'de-DE,de;q=0.9','accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(35000)});if(!r.ok)throw new Error(`ALDI Seite ${page}: HTTP ${r.status}`);const html=await r.text();return{url,html,products:parseDom(html,url)}}
function maxPage(html=''){const $=cheerio.load(html),pages=[];$('a[href*="?page="]').each((_,a)=>{const m=String($(a).attr('href')).match(/[?&]page=(\d+)/);if(m)pages.push(Number(m[1]))});return Math.max(1,...pages.filter(Number.isFinite))}

await fs.mkdir(DIR,{recursive:true});
const first=await fetchPage(1);const reportedMax=Math.min(250,maxPage(first.html)||1),map=new Map(),pages=[];
for(const p of first.products)map.set(p.aldiProductId,p);pages.push({page:1,url:first.url,count:first.products.length,newProducts:first.products.length});
let emptyStreak=first.products.length?0:1;
for(let page=2;page<=reportedMax;page++){
  try{const r=await fetchPage(page);let added=0;for(const p of r.products){if(!map.has(p.aldiProductId)){map.set(p.aldiProductId,p);added++}}pages.push({page,url:r.url,count:r.products.length,newProducts:added});emptyStreak=r.products.length?0:emptyStreak+1;console.log(`ALDI Seite ${page}/${reportedMax}: ${r.products.length}, ${added} neu`);if(emptyStreak>=3)break}catch(e){pages.push({page,status:'error',message:String(e?.message||e)});console.warn(String(e?.message||e))}
  await sleep(90);
}
const products=[...map.values()];
const catalog={schema:2,generatedAt:now,retailer:'ALDI SÜD',sourceType:'official_catalog_full',catalogStatus:'expanded_catalog',productCount:products.length,reportedPages:reportedMax,pagesLoaded:pages.filter(p=>!p.status).length,sources:pages,products};
await fs.writeFile(OUT,JSON.stringify(catalog,null,2)+'\n');
let idx={schema:4,generatedAt:now,sourceType:'official_catalog',retailers:[],files:[],productCount:0};try{idx=JSON.parse(await fs.readFile(INDEX,'utf8'))}catch{}
let row=(idx.retailers||[]).find(x=>x.retailer==='ALDI SÜD');if(!row){row={retailer:'ALDI SÜD'};idx.retailers=[...(idx.retailers||[]),row]}Object.assign(row,{catalogStatus:'expanded_catalog',productCount:products.length,sourceType:'official_catalog_full',reportedPages:reportedMax,pagesLoaded:catalog.pagesLoaded});if(!idx.files?.includes('aldi-sued.json'))idx.files=[...(idx.files||[]),'aldi-sued.json'];idx.generatedAt=now;idx.productCount=(idx.retailers||[]).reduce((n,x)=>n+Number(x.productCount||0),0);await fs.writeFile(INDEX,JSON.stringify(idx,null,2)+'\n');
console.log(`ALDI SÜD Vollsortiment: ${products.length} eindeutige Artikel aus ${catalog.pagesLoaded}/${reportedMax} Seiten.`);
