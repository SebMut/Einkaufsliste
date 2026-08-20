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

function priceEuro(v){
  if(v==null)return null;
  if(typeof v==='object'){
    for(const k of ['currentRetailPrice','price','value','amount','centAmount','regularPrice']){const x=priceEuro(v[k]);if(x!=null)return x}
    return null;
  }
  const n=Number(v);if(!Number.isFinite(n)||n<=0)return null;
  return n>50?+(n/100).toFixed(2):+n.toFixed(2);
}
function firstValue(obj,keys){for(const k of keys)if(obj?.[k]!=null&&obj[k]!=='')return obj[k];return null}
function productSummary(p){
  const article=p?._embedded?.articles?.[0]||p?.article||p?.articles?.[0]||{};
  const listing=article?._embedded?.listing||article?.listing||p?.listing||{};
  const pricing=listing?.pricing||p?.pricing||p?.priceData||{};
  const brand=typeof p?.brand==='object'?p.brand?.name:(p?.brand||p?.brandName||'');
  return {
    productName:firstValue(p,['productName','name','title','displayName'])||'',
    brand:brand||'',
    productId:String(firstValue(p,['productId','id','productID'])??''),
    nan:String(firstValue(p,['nan','articleNumber'])??''),
    currentPrice:priceEuro(firstValue(pricing,['currentRetailPrice','price','currentPrice','salesPrice'])??firstValue(p,['currentPrice','salesPrice','price'])),
    regularPrice:priceEuro(pricing?.discount?.regularPrice??firstValue(pricing,['regularPrice','originalPrice'])??p?.regularPrice??p?.originalPrice),
    listingId:String(firstValue(listing,['id','listingId'])??p?.listingId??''),
    articleId:String(firstValue(article,['id','articleId'])??p?.articleId??''),
    grammage:firstValue(p,['grammage','packaging','quantityText'])||firstValue(article,['grammage','packaging'])||null
  };
}

function looksProduct(x){
  if(!x||typeof x!=='object'||Array.isArray(x))return false;
  if(typeof x.productName==='string'&&x.productName.length>1)return true;
  if((x.productId||x.listingId||x.nan)&&(x.name||x.title||x.displayName))return true;
  if(x._embedded?.articles&&Array.isArray(x._embedded.articles))return true;
  return false;
}
function productsFrom(body){
  const found=[];const seen=new Set();
  function add(x){if(!looksProduct(x))return;const key=String(x.productId??x.id??x.listingId??x.nan??`${x.productName||x.name||x.title}`);if(seen.has(key))return;seen.add(key);found.push(x)}
  function walk(v,depth=0){if(v==null||depth>9)return;if(Array.isArray(v)){for(const x of v){add(x);walk(x,depth+1)}return}if(typeof v!=='object')return;add(v);for(const [k,x] of Object.entries(v)){if(['facets','quickFacets'].includes(k))continue;walk(x,depth+1)}}
  walk(body);return found;
}
function shape(v,depth=0){
  if(depth>3)return typeof v;
  if(Array.isArray(v))return {type:'array',length:v.length,sample:v.length?shape(v[0],depth+1):null};
  if(!v||typeof v!=='object')return typeof v;
  const out={};for(const [k,x] of Object.entries(v).slice(0,20))out[k]=shape(x,depth+1);return out;
}

function marketCookie(wwIdent){return encodeURIComponent(JSON.stringify({stationary:{wwIdent:String(wwIdent),serviceTypes:['STATIONARY']},pickup:{wwIdent:String(wwIdent),serviceTypes:['PICKUP']}}));}

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
  const variants=[
    {search:query,market:String(wwIdent),page:'1',objectsPerPage:'40',sorting:'RELEVANCE_DESC'},
    {search:query,market:String(wwIdent),page:'1',objectsPerPage:'40',sorting:'RELEVANCE_DESC',serviceTypes:'PICKUP'},
    {search:query,market:String(wwIdent),page:'1',objectsPerPage:'40',sorting:'RELEVANCE_DESC',serviceTypes:'STATIONARY'}
  ];
  const cookie=`wksMarketsCookie=${marketCookie(wwIdent)}; websitebot-launch=human-mousemove`;
  const attempts=[];
  for(const p of variants){
    const params=new URLSearchParams(p);
    const endpoints=[`https://shop.rewe.de/api/products?${params}`,`https://www.rewe.de/shop/api/products?${params}`];
    for(const url of endpoints){
      for(const withCookie of [false,true]){
        const r=await getJson(url,{headers:withCookie?{cookie}:{}});const products=productsFrom(r.body);
        const pagination=r.body?.pagination||null;
        attempts.push({url,status:r.status,ok:r.ok,withCookie,productCount:products.length,totalResultCount:pagination?.totalResultCount??null,page:pagination?.page??null,search:r.body?.search?{term:r.body.search.term??null,marketCode:r.body.search.marketCode??null,serviceTypes:r.body.search.serviceTypes??null}:null,topLevelKeys:r.body&&typeof r.body==='object'?Object.keys(r.body).slice(0,20):[],responseShape:attempts.length===0&&r.body?shape(r.body):null,error:r.error||null,preview:r.preview||null});
        if(r.ok&&products.length)return {products,attempts,endpoint:url,withCookie};
        await sleep(100);
      }
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
    for(const query of QUERIES){const sr=await searchProducts(target.wwIdent,query);row.queries.push({query,endpoint:sr.endpoint,withCookie:sr.withCookie,attempts:sr.attempts,products:sr.products.slice(0,12).map(productSummary)});await sleep(150);}
  }
  results.push(row);
}

const successfulMarkets=results.filter(r=>r.matchedMarket).length;
const queriesWithProducts=results.reduce((n,r)=>n+r.queries.filter(q=>q.products.length).length,0);
const receipt={schema:2,generatedAt:new Date().toISOString(),purpose:'Probe für standortabhängige REWE-Regulärpreise der persönlichen Grundlebensmittel',localReweMarkets:localRewe.length,successfulMarkets,queriesWithProducts,status:successfulMarkets>0&&queriesWithProducts>0?'passed':'needs_followup',results};
await fs.writeFile(OUT,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,localReweMarkets:receipt.localReweMarkets,successfulMarkets,queriesWithProducts},null,2));
if(successfulMarkets===0)process.exitCode=2;
