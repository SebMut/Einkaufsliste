import { slug, norm } from './product-normalizer.js';

export function normalizeGtin(value='') {
  const digits=String(value??'').replace(/\D/g,'');
  if(![8,12,13,14].includes(digits.length)) return null;
  let sum=0;
  for(let i=digits.length-2,pos=0;i>=0;i--,pos++) sum+=Number(digits[i])*(pos%2===0?3:1);
  const check=(10-(sum%10))%10;
  return check===Number(digits.at(-1))?digits:null;
}

export function applyProductIdentity(input={}) {
  const gtin=normalizeGtin(input.ean||input.gtin||input.EAN||input.GTIN);
  if(gtin) return {...input,ean:gtin,gtin,exactMatchKey:`gtin:${gtin}`,canonicalProductId:`gtin-${gtin}`,identitySource:'gtin'};

  // Ohne GTIN konservativ bleiben: gleiche Produktart ist vergleichbar, aber nicht
  // automatisch dasselbe konkrete Produkt. Das verhindert z.B. ja!, Milsani,
  // Milbona und Gut & Günstig als exact_match zu behandeln.
  const label=slug(norm(input.brand)||norm(input.name))||'unbekannt';
  const base=input.exactMatchKey||input.similarityKey||input.canonicalId||'produkt';
  return {...input,exactMatchKey:`${base}|label:${label}`,canonicalProductId:input.canonicalProductId||slug(`${input.store||''}|${label}|${input.size||''}`),identitySource:'label'};
}
