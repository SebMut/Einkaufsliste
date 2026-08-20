const fold=s=>String(s??'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const words=s=>new Set(fold(s).split(/\s+/).filter(Boolean));
const includesTerm=(text,term)=>{
  const t=fold(term); if(!t)return false;
  const hay=` ${fold(text)} `;
  return hay.includes(` ${t} `)||hay.includes(` ${t}-`)||hay.includes(`-${t} `);
};
const fieldText=o=>[
  o.name,o.brand,o.canonicalProduct,o.canonicalProductId,o.canonicalGroup,o.semanticType,
  o.bundleKey,o.key,o.cat,o.category,o.size,o.description
].filter(Boolean).join(' ');
const semanticText=o=>[o.semanticType,o.canonicalGroup,o.bundleKey,o.key,o.canonicalProduct].filter(Boolean).join(' ');
const categoryText=o=>[o.cat,o.category].filter(Boolean).join(' ');
const isBio=o=>Boolean(o.bio??o.organic)||/\bbio\b/.test(fold(fieldText(o)));
const isOffer=o=>o.isOffer===true||o.advertised===true;
const storeName=o=>o.market?`${o.store} · ${o.market}`:o.store;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};

export function matchStaple(staple,offer){
  if(!staple||!offer||staple.active===false)return {matches:false,score:-Infinity,reasons:['inactive']};
  const text=fieldText(offer),sem=semanticText(offer),cat=categoryText(offer),reasons=[];
  const excluded=(staple.excludedAny||[]).find(t=>includesTerm(text,t));
  if(excluded)return {matches:false,score:-Infinity,reasons:[`excluded:${excluded}`]};
  if(staple.bioRequired&&!isBio(offer))return {matches:false,score:-Infinity,reasons:['bio-required']};
  if(staple.brand){
    const brand=fold(staple.brand),offerBrand=fold(offer.brand||'');
    const brandInText=includesTerm(text,staple.brand);
    if(offerBrand!==brand&&!brandInText)return {matches:false,score:-Infinity,reasons:['brand-mismatch']};
    reasons.push('brand');
  }
  const all=(staple.requiredAll||[]);
  if(all.length&&!all.every(t=>includesTerm(text,t)))return {matches:false,score:-Infinity,reasons:['required-all-missing']};
  if(all.length)reasons.push('required-all');
  const any=(staple.requiredAny||[]);
  if(any.length&&!any.some(t=>includesTerm(text,t)))return {matches:false,score:-Infinity,reasons:['required-any-missing']};
  if(any.length)reasons.push('required-any');
  const groups=(staple.semanticGroups||[]);
  const groupMatch=groups.some(g=>includesTerm(sem,g)||fold(sem)===fold(g));
  const catTerms=(staple.categoryContains||[]);
  const catMatch=catTerms.some(t=>includesTerm(cat,t)||fold(cat).includes(fold(t)));
  if(groups.length&&!groupMatch&&staple.mode==='exact')return {matches:false,score:-Infinity,reasons:['semantic-group-mismatch']};
  if(groups.length&&groupMatch)reasons.push('semantic-group');
  if(catTerms.length&&!catMatch)return {matches:false,score:-Infinity,reasons:['category-mismatch']};
  if(catTerms.length&&catMatch)reasons.push('category');
  let score=0;
  if(staple.brand)score+=50;
  if(groupMatch)score+=30;
  if(catMatch)score+=15;
  score+=all.length*8;
  if(any.length)score+=12;
  for(const t of staple.preferredAny||[])if(includesTerm(text,t))score+=4;
  if(staple.bioRequired&&isBio(offer))score+=10;
  if(staple.bioPreferred&&isBio(offer))score+=6;
  if(isOffer(offer))score+=1;
  return {matches:true,score,reasons};
}

export function matchesForStaple(staple,offers){
  return (offers||[]).map(offer=>({offer,...matchStaple(staple,offer)})).filter(x=>x.matches);
}

function unitMetric(o){
  for(const k of ['unit','basePrice','unitPrice']){const n=num(o[k]);if(n!=null&&n>0)return n}
  return null;
}

export function chooseStapleResult(staple,offers){
  const matched=matchesForStaple(staple,offers);
  if(!matched.length)return {staple,matches:[],best:null,second:null,sellerCount:0,comparisonBasis:null,conventional:null};
  const grouped=new Map();
  for(const x of matched){
    const o=x.offer,key=String(o.id??`${o.store}|${o.market}|${o.name}|${o.size}|${o.price}`);
    if(!grouped.has(key)||x.score>grouped.get(key).score)grouped.set(key,x);
  }
  let rows=[...grouped.values()];
  const preferBio=staple.bioRequired||staple.bioPreferred;
  const pool=preferBio&&rows.some(x=>isBio(x.offer))?rows.filter(x=>isBio(x.offer)):rows;
  const units=pool.map(x=>unitMetric(x.offer)).filter(v=>v!=null);
  const useUnit=units.length>=2;
  const metric=x=>useUnit?(unitMetric(x.offer)??Infinity):(num(x.offer.price)??Infinity);
  rows=pool.slice().sort((a,b)=>metric(a)-metric(b)||(num(a.offer.price)??Infinity)-(num(b.offer.price)??Infinity)||b.score-a.score);
  const best=rows[0]?.offer||null;
  const bestStore=best?storeName(best):null;
  const otherStores=rows.filter(x=>storeName(x.offer)!==bestStore&&x.offer.store!==best?.store);
  const second=otherStores[0]?.offer||null;
  const sellerCount=new Set(pool.map(x=>storeName(x.offer)).filter(Boolean)).size;
  let conventional=null;
  if(staple.bioRequired||staple.bioPreferred){
    const conv=matched.filter(x=>!isBio(x.offer)).sort((a,b)=>{
      const au=unitMetric(a.offer),bu=unitMetric(b.offer);
      if(au!=null&&bu!=null)return au-bu;
      return (num(a.offer.price)??Infinity)-(num(b.offer.price)??Infinity);
    });
    conventional=conv[0]?.offer||null;
  }
  return {staple,matches:matched.map(x=>x.offer),best,second,sellerCount,comparisonBasis:useUnit?'unit':'pack',conventional};
}

export function evaluateStaples(staples,offers){
  return (staples||[]).map(s=>chooseStapleResult(s,offers));
}

export const helpers={fold,includesTerm,fieldText,semanticText,categoryText,isBio,isOffer,storeName,unitMetric};
