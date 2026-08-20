import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const markets=JSON.parse(await fs.readFile(path.join(ROOT,'data','markets.json'),'utf8'));
const OUT=path.join(ROOT,'docs','rewe-staples-probe.json');
await fs.mkdir(path.dirname(OUT),{recursive:true});

const QUERIES=['Andechser','Adelholzener','Halloumi','Eier','Quark','Brot','Basmati Reis','Mehl','alkoholfreies Bier'];
const UA='Mozilla/5.0 (compatible; AngebotsRadar/5.3; +https://github.com/SebMut/Einkaufsliste)';
const norm=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const zipOf=s=>String(s??'').match(/\b(\d{5})\b/)?.[1]||null;
const streetKey=s=>norm(String(s??'').replace(/straße|str\.?/gi,'str'));

async function getJson(url,{headers={}}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept':'application/json','accept-language':'de-DE,de;q=0.9',...headers},signal:controller.signal,redirect:'follow'});
    const text=await r.text();let body=null;try{body=JSON.parse(text)}catch{}
    return {ok:r.ok,status:r.status,url:r.url,body,contentType:r.headers.get('content-type')||'',preview:body?null:text.slice(0,240)};
  }catch(e){return {ok:false,status:0,url,error:String(e?.message||e)}}finally{clearTimeout(timer)}
}

function matchesAllowed(local,remote){
  const localZip=zipOf(local.address),remoteZip=String(remote?.zipCode??'');
  if(localZip&&remoteZip&&localZip!==remoteZip)return false;
  const address=streetKey(local.address),street=streetKey(`${remote?.street||''} ${remote?.houseNumber||''}`);
  if(street&&address.includes(street))return true;
  const localStreet=streetKey(String(local.address).split(',')[0]);
  return !!localStreet&&!!street&&(localStreet.includes(street)||street.includes(localStreet));
}

function marketSummary(m){return {wwIdent:String(m?.wwIdent??''),displayName:m?.displayName||'',companyName:m?.companyName||'',street:m?.street||'',houseNumber:m?.houseNumber||'',zipCode:String(m?.zipCode??''),city:m?.city||'',distance:m?.distance??null};}

function priceEuro(cents){const n=Number(cents);return Number.isFinite(n)&&n>0?+(n/100).toFixed(2):null}
function productSummary(p){
  const article=p?._embedded?.articles?.[0]||{};
  const listing=article?._embedded?.listing||{};
  const pricing=listing?.pricing||{};
  const brand=typeof p?.brand==='object'?p.brand?.name:(p?.brand||'');
  return {
    productName:p?.productName||p?.name||'',
    brand:brand||'',
    productId:String(p?.id??''),
    nan:String(p?.nan??''),
    currentPrice:priceEuro(pricing?.currentRetailPrice??pricing?.price),
    regularPrice:priceEuro(pricing?.discount?.regularPrice??pricing?.regularPrice),
    listingId:String(listing?.id??''),
    articleId:String(article?.id??''),
    grammage:p?.grammage||article?.grammage||null
  };
}

function productsFrom(body){
  if(Array.isArray(body?._embedded?.products))return body._embedded.products;
  if(Array.isArray(body?.products))return body.products;
  if(Array.isArray(body?.offers))return body.offers;
  return [];
}

function marketCookie(wwIdent){return encodeURIComponent(JSON.stringify({stationary:{wwIdent:String(wwIdent),serviceTypes:['STATIONARY']}}));}

async function findRemoteMarkets(zip){
  const endpoints=[
    `https://shop.rewe.de/api/marketselection/zipcodes/${zip}/services/pickup`,
    `https://www.rewe.de/api/marketselection/zipcodes/${zip}/services/pickup`
  ];
  const attempts=[];
  for(const url of endpoints){const r=await getJson(url);attempts.push({url,status:r.status,ok:r.ok,count:Array.isArray(r.body)?r.body.length:0,error:r.error||null});if(r.ok&&Array.isArray(r.body))return {markets:r.body,attempts};}
  return {markets:[],attempts};
}

async function searchProducts(wwIdent,query){
  const params=new URLSearchParams({search:query,market:String(wwIdent),page:'1',objectsPerPage:'40',sorting:'RELEVANCE_DESC'});
  const endpoints=[
    `https://shop.rewe.de/api/products?${params}`,
    `https://www.rewe.de/shop/api/products?${params}`
  ];
  const cookie=`wksMarketsCookie=${marketCookie(wwIdent)}; websitebot-launch=human-mousemove`;
  const attempts=[];
  for(const url of endpoints){
    for(const withCookie of [false,true]){
      const r=await getJson(url,{headers:withCookie?{cookie}:{}});const products=productsFrom(r.body);
      attempts.push({url,status:r.status,ok:r.ok,withCookie,productCount:products.length,topLevelKeys:r.body&&typeof r.body==='object'?Object.keys(r.body).slice(0,12):[],error:r.error||null,preview:r.preview||null});
      if(r.ok&&products.length)return {products,attempts,endpoint:url,withCookie};
      await sleep(120);
    }
  }
  return {products:[],attempts,endpoint:null,withCookie:false};
}

const localRewe=(markets.markets||[]).filter(m=>m.store==='REWE'&&m.activeMarket!==false);
const zipCache=new Map();const results=[];
for(const local of localRewe){
  const zip=zipOf(local.address);if(!zip)continue;
  if(!zipCache.has(zip))zipCache.set(zip,await findRemoteMarkets(zip));
  const remoteSet=zipCache.get(zip);const matched=remoteSet.markets.filter(r=>matchesAllowed(local,r));
  const target=matched[0]||null;
  const row={local:{market:local.market,address:local.address,sourceUrl:local.sourceUrl},zip,marketLookupAttempts:remoteSet.attempts,remoteCandidates:remoteSet.markets.map(marketSummary),matchedMarket:target?marketSummary(target):null,queries:[]};
  if(target?.wwIdent){
    for(const query of QUERIES){const sr=await searchProducts(target.wwIdent,query);row.queries.push({query,endpoint:sr.endpoint,withCookie:sr.withCookie,attempts:sr.attempts,products:sr.products.slice(0,12).map(productSummary)});await sleep(180);}
  }
  results.push(row);
}

const successfulMarkets=results.filter(r=>r.matchedMarket).length;
const queriesWithProducts=results.reduce((n,r)=>n+r.queries.filter(q=>q.products.length).length,0);
const receipt={schema:1,generatedAt:new Date().toISOString(),purpose:'Probe für standortabhängige REWE-Regulärpreise der persönlichen Grundlebensmittel',localReweMarkets:localRewe.length,successfulMarkets,queriesWithProducts,status:successfulMarkets>0&&queriesWithProducts>0?'passed':'needs_followup',results};
await fs.writeFile(OUT,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,localReweMarkets:receipt.localReweMarkets,successfulMarkets,queriesWithProducts},null,2));
if(successfulMarkets===0)process.exitCode=2;
