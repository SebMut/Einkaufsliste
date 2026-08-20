const norm=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();

const haystack=o=>norm([
  o.name,o.canonicalProduct,o.semanticType,o.canonicalGroup,o.bundleKey,o.key,
  o.brand,o.manufacturer,o.cat,o.category,o.size,o.packaging
].filter(Boolean).join(' '));

const sellerKey=o=>[o.store,o.market,o.address].filter(Boolean).join('|');
const priceMetric=o=>Number(o.basePrice??o.unit??o.effectiveBasePrice??o.price);
const finitePrice=o=>Number.isFinite(Number(o?.price))&&Number(o.price)>=0;
const isOffer=o=>o?.isOffer===true||o?.advertised===true;

export function matchesStaple(staple,offer){
  if(!staple||!offer||staple.active===false||!finitePrice(offer))return false;
  const m=staple.match||{},text=haystack(offer),brand=norm(offer.brand||offer.manufacturer||offer.name),semantic=norm(offer.semanticType||offer.canonicalGroup||offer.bundleKey||offer.key),category=norm(offer.cat||offer.category);
  if(staple.needsDefinition)return false;
  if(m.bioRequired===true&&!(offer.bio===true||offer.organic===true))return false;
  if(m.brand&& !brand.includes(norm(m.brand)))return false;
  if(Array.isArray(m.semanticTypes)&&m.semanticTypes.length&&!m.semanticTypes.some(x=>semantic===norm(x)))return false;
  if(Array.isArray(m.categoryAny)&&m.categoryAny.length&&!m.categoryAny.some(x=>category.includes(norm(x))||text.includes(norm(x))))return false;
  if(Array.isArray(m.includeAll)&&m.includeAll.some(x=>!text.includes(norm(x))))return false;
  if(Array.isArray(m.includeAny)&&m.includeAny.length&&!m.includeAny.some(x=>text.includes(norm(x))))return false;
  if(Array.isArray(m.packagingAny)&&m.packagingAny.length&&!m.packagingAny.some(x=>text.includes(norm(x))))return false;
  if(Array.isArray(m.excludeAny)&&m.excludeAny.some(x=>text.includes(norm(x))))return false;
  return true;
}

export function evaluateStaple(staple,offers,{allowApp=true,allowCoupon=true}={}){
  if(staple?.needsDefinition)return{staple,matches:[],best:null,sellerCount:0,status:'needs_definition',comparison:null};
  const eligible=(offers||[]).filter(o=>(allowApp||!o.app)&&(allowCoupon||!o.coupon)).filter(o=>matchesStaple(staple,o));
  const preferred=staple?.preferBio?eligible.filter(o=>o.bio===true||o.organic===true):eligible;
  const pool=preferred.length?preferred:eligible;
  const sorted=[...pool].sort((a,b)=>{
    const am=priceMetric(a),bm=priceMetric(b),af=Number.isFinite(am),bf=Number.isFinite(bm);
    if(af&&bf&&am!==bm)return am-bm;
    if(af!==bf)return af?-1:1;
    return Number(a.price)-Number(b.price);
  });
  const best=sorted[0]||null;
  const sellers=[...new Set(eligible.map(sellerKey).filter(Boolean))];
  const otherSeller=best?sorted.find(o=>sellerKey(o)!==sellerKey(best))||null:null;
  return{
    staple,
    matches:eligible,
    best,
    sellerCount:sellers.length,
    status:!best?'no_price':sellers.length<2?'single_price':'comparable',
    comparison:otherSeller,
    offerCount:eligible.filter(isOffer).length,
    regularCount:eligible.filter(o=>!isOffer(o)).length
  };
}

export const stapleUtils={norm,priceMetric,isOffer,sellerKey};
