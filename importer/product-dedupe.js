const clean = value => String(value ?? '')
  .toLocaleLowerCase('de-DE')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss')
  .replace(/[^a-z0-9%]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const getPrice = o => {
  const value = Number(o?.currentPrice ?? o?.offerPrice ?? o?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const getRegular = o => {
  const value = Number(o?.regularPrice);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const boolBio = o => o?.bio === true || /(^|\s)bio(\s|$)/.test(clean(`${o?.name || ''} ${o?.brand || ''}`));

const explicitIds = o => [
  o?.ean, o?.gtin, o?.reweProductId, o?.aldiProductId, o?.productId,
  o?.articleId, o?.articleNumber, o?.sku, o?.retailerProductId
].filter(v => v !== null && v !== undefined && String(v).trim() !== '').map(v => clean(v));

const gtinOf = o => clean(o?.gtin || o?.ean || '');

function normalizedSize(o) {
  const raw = clean(o?.size || o?.packageSize || o?.content || '');
  if (raw) return raw.replace(/\b(gramm|grams?)\b/g, 'g').replace(/\b(kilogramm|kilograms?)\b/g, 'kg').replace(/\b(liter|litres?)\b/g, 'l');
  const n = Number(o?.amount ?? o?.quantity);
  const unit = clean(o?.amountUnit || o?.unitName || '');
  return Number.isFinite(n) && n > 0 ? `${n} ${unit}`.trim() : '';
}

function brandOf(o) {
  return clean(o?.brand || o?.manufacturer || '');
}

function stripNoise(name, brand = '') {
  let value = clean(name)
    .replace(/\bmarke\b/g, ' ')
    .replace(/\bproduktname\b/g, ' ')
    .replace(/\bangebot\b|\baktion\b|\bwochenangebot\b|\bdauerhaft gunstig\b/g, ' ')
    .replace(/\bverschiedene sorten\b|\bversch sorten\b/g, ' ')
    .replace(/\b\d+[,.]?\d*\s*(eur|euro)\b/g, ' ')
    .replace(/\b1\s*kg\s*=\s*\d+[,.]?\d*\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (brand) {
    const tokens = new Set(brand.split(' ').filter(Boolean));
    const rest = value.split(' ').filter(t => !tokens.has(t));
    if (rest.length) value = rest.join(' ');
  }
  return value;
}

function variantSignature(o) {
  const name = clean(o?.name || '');
  const fat = name.match(/\b(\d{1,2}(?:[,.]\d+)?)\s*%/i)?.[1]?.replace(',', '.') || '';
  const diaper = name.match(/\b(?:groesse|gr)\s*([0-9]{1,2})\b/i)?.[1] || '';
  const age = name.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\s*kg\b/i)?.[0] || '';
  return [fat, diaper, age].join('|');
}

function semanticFamily(o) {
  const candidate = o?.comparisonKey || o?.semanticGroupId || o?.semanticType || o?.canonicalGroup || o?.canonicalProduct || o?.bundleKey || o?.key || '';
  return clean(candidate).replace(/^semantic /, '');
}

function branchKey(o) {
  return [clean(o?.store), clean(o?.market), clean(o?.address)].join('|');
}

function storeKey(o) {
  return clean(o?.store);
}

function tokenSimilarity(a, b) {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const token of A) if (B.has(token)) common++;
  const union = new Set([...A, ...B]).size;
  const jaccard = common / union;
  const containment = common / Math.min(A.size, B.size);
  return Math.max(jaccard, containment * 0.94);
}

function identityAliases(o) {
  const aliases = [];
  const gtin = gtinOf(o);
  if (gtin) aliases.push(`gtin:${gtin}`);
  for (const id of explicitIds(o)) aliases.push(`source:${id}`);
  const size = normalizedSize(o);
  const brand = brandOf(o);
  const name = stripNoise(o?.name || '', brand);
  const variant = variantSignature(o);
  const family = semanticFamily(o);
  aliases.push(`sig:${brand}|${name}|${size}|bio:${boolBio(o)}|variant:${variant}`);
  if (o?.canonicalProductId && !String(o.canonicalProductId).startsWith('gtin-')) {
    aliases.push(`canonical:${clean(o.canonicalProductId)}|${size}|bio:${boolBio(o)}|variant:${variant}`);
  }
  if (family && brand && size) aliases.push(`family:${family}|${brand}|${size}|bio:${boolBio(o)}|variant:${variant}`);
  return [...new Set(aliases.filter(Boolean))];
}

export function likelySameProduct(a, b, {scope = 'branch'} = {}) {
  if (!a || !b) return false;
  if (storeKey(a) !== storeKey(b)) return false;
  if (scope === 'branch' && branchKey(a) !== branchKey(b)) return false;
  if (boolBio(a) !== boolBio(b)) return false;

  const sizeA = normalizedSize(a), sizeB = normalizedSize(b);
  if (sizeA && sizeB && sizeA !== sizeB) return false;

  const gtinA = gtinOf(a), gtinB = gtinOf(b);
  if (gtinA && gtinB) return gtinA === gtinB;

  const idsA = new Set(explicitIds(a));
  const idsB = new Set(explicitIds(b));
  if (idsA.size && idsB.size) {
    for (const id of idsA) if (idsB.has(id)) return true;
  }

  const variantA = variantSignature(a), variantB = variantSignature(b);
  if (variantA && variantB && variantA !== variantB) return false;

  const brandA = brandOf(a), brandB = brandOf(b);
  if (brandA && brandB && brandA !== brandB) return false;

  const familyA = semanticFamily(a), familyB = semanticFamily(b);
  if (familyA && familyB && familyA !== familyB) return false;

  const nameA = stripNoise(a?.name || '', brandA);
  const nameB = stripNoise(b?.name || '', brandB);
  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;

  const similarity = tokenSimilarity(nameA, nameB);
  const minTokens = Math.min(nameA.split(' ').length, nameB.split(' ').length);
  if (minTokens >= 2 && similarity >= 0.82) return true;

  if ((!gtinA || !gtinB) && familyA && familyA === familyB && sizeA && sizeA === sizeB && similarity >= 0.72) return true;
  return false;
}

function sourcePriority(o) {
  let score = 0;
  if (o?.isOffer) score += 40;
  if (gtinOf(o)) score += 12;
  if (brandOf(o)) score += 4;
  if (o?.image || o?.imageUrl) score += 3;
  if (o?.sourceType === 'official_offer') score += 8;
  if (o?.sourceType === 'official_catalog') score += 5;
  score += Math.min(8, clean(o?.name).split(' ').length / 2);
  return score;
}

function uniqueMarkets(...records) {
  const seen = new Map();
  for (const r of records) {
    const list = Array.isArray(r?.markets) && r.markets.length ? r.markets : [{market:r?.market,address:r?.address,price:getPrice(r),isOffer:!!r?.isOffer}];
    for (const m of list) {
      const key = [clean(m?.market), clean(m?.address)].join('|');
      if (!key.replaceAll('|','')) continue;
      const old = seen.get(key);
      if (!old || (Number(m?.price) || Infinity) < (Number(old?.price) || Infinity)) seen.set(key, m);
    }
  }
  return [...seen.values()];
}

export function mergeProductRecords(a, b) {
  const candidates = [a, b];
  const offerCandidates = candidates.filter(x => x?.isOffer && getPrice(x) !== null).sort((x,y)=>getPrice(x)-getPrice(y));
  const base = [...candidates].sort((x,y)=>sourcePriority(y)-sourcePriority(x))[0];
  const offer = offerCandidates[0] || null;
  const current = offer ? getPrice(offer) : Math.min(...candidates.map(getPrice).filter(v=>v!==null));
  const regularCandidates = [];
  for (const x of candidates) {
    const regular = getRegular(x);
    if (regular && (!current || regular >= current)) regularCandidates.push(regular);
    if (!x?.isOffer) {
      const p = getPrice(x);
      if (p && (!current || p >= current)) regularCandidates.push(p);
    }
  }
  const regular = regularCandidates.length ? Math.max(...regularCandidates) : (offer ? null : current);
  const markets = uniqueMarkets(a,b);
  const sourceTypes = [...new Set(candidates.flatMap(x=>x?.sourceTypes || [x?.sourceType]).filter(Boolean))];
  const sourceUrls = [...new Set(candidates.flatMap(x=>x?.sourceUrls || [x?.sourceUrl]).filter(Boolean))];
  const merged = {
    ...base,
    ...(offer || {}),
    ean: gtinOf(a) || gtinOf(b) || base?.ean || null,
    gtin: gtinOf(a) || gtinOf(b) || base?.gtin || null,
    currentPrice: current,
    price: current,
    regularPrice: regular,
    offerPrice: offer ? current : null,
    isOffer: !!offer,
    advertised: !!offer,
    sourceTypes,
    sourceUrls,
    markets,
    branchCount: markets.length || 1,
    mergedFromCount: Number(a?.mergedFromCount || 1) + Number(b?.mergedFromCount || 1)
  };
  if (offer?.market) {
    merged.market = offer.market;
    merged.address = offer.address;
  } else if (markets.length) {
    const cheapest = [...markets].sort((x,y)=>(Number(x.price)||Infinity)-(Number(y.price)||Infinity))[0];
    if (cheapest?.market) merged.market = cheapest.market;
    if (cheapest?.address) merged.address = cheapest.address;
  }
  return merged;
}

export function dedupeProducts(records, {scope = 'branch', report = false} = {}) {
  const products = [];
  const aliasMap = new Map();
  const bucketMap = new Map();
  const mergedPairs = [];

  const scopeKeyFor = o => scope === 'store' ? storeKey(o) : branchKey(o);
  const bucketKeyFor = o => [scopeKeyFor(o), semanticFamily(o), normalizedSize(o), boolBio(o), brandOf(o)].join('|');

  for (const raw of records || []) {
    if (!raw) continue;
    const scopeKey = scopeKeyFor(raw);
    const aliases = identityAliases(raw).map(alias => `${scopeKey}::${alias}`);
    const candidates = new Set();
    for (const alias of aliases) for (const idx of aliasMap.get(alias) || []) candidates.add(idx);
    for (const idx of bucketMap.get(bucketKeyFor(raw)) || []) candidates.add(idx);

    let match = -1;
    for (const idx of candidates) {
      if (likelySameProduct(products[idx], raw, {scope})) { match = idx; break; }
    }

    if (match >= 0) {
      const before = products[match];
      products[match] = mergeProductRecords(before, raw);
      mergedPairs.push({index:match,a:before,b:raw,result:products[match]});
      const allAliases = identityAliases(products[match]).map(alias => `${scopeKeyFor(products[match])}::${alias}`);
      for (const alias of allAliases) {
        if (!aliasMap.has(alias)) aliasMap.set(alias,new Set());
        aliasMap.get(alias).add(match);
      }
      continue;
    }

    const idx = products.length;
    products.push({...raw, mergedFromCount:Number(raw?.mergedFromCount || 1), markets:uniqueMarkets(raw), branchCount:1});
    for (const alias of aliases) {
      if (!aliasMap.has(alias)) aliasMap.set(alias,new Set());
      aliasMap.get(alias).add(idx);
    }
    const bucket = bucketKeyFor(raw);
    if (!bucketMap.has(bucket)) bucketMap.set(bucket,new Set());
    bucketMap.get(bucket).add(idx);
  }

  return report ? {products, mergedPairs, removedCount:(records?.length || 0)-products.length} : products;
}

export function collapseProductsForDisplay(records) {
  return dedupeProducts(records, {scope:'store'}).map(p=>({
    ...p,
    branchCount:Array.isArray(p.markets) && p.markets.length ? p.markets.length : Number(p.branchCount || 1)
  }));
}

export const _internals = {clean, normalizedSize, brandOf, stripNoise, variantSignature, semanticFamily, branchKey, tokenSimilarity};
