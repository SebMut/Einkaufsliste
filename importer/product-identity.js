import { slug, norm } from './product-normalizer.js';
import { buildConcreteIdentityParts } from './semantic-products.js';

export function normalizeGtin(value = '') {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  let sum = 0;
  for (let i = digits.length - 2, pos = 0; i >= 0; i--, pos++) sum += Number(digits[i]) * (pos % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits.at(-1)) ? digits : null;
}

function productLabel(input = {}) {
  const brand = norm(input.brand);
  if (brand) return {label: brand, source: 'semantic_brand'};

  // Ohne explizite Marke konservativ bleiben: Der vollständige Produktname ist
  // sicherer als ein einzelnes Schlüsselwort wie "Windel" oder "Milch".
  const name = norm(input.name);
  return {label: name || 'unbekannt', source: 'semantic_name'};
}

export function applyProductIdentity(input = {}) {
  const gtin = normalizeGtin(input.ean || input.gtin || input.EAN || input.GTIN);
  if (gtin) {
    return {
      ...input,
      ean: gtin,
      gtin,
      exactMatchKey: `gtin:${gtin}`,
      canonicalProductId: `gtin-${gtin}`,
      identitySource: 'gtin'
    };
  }

  const {label, source} = productLabel(input);
  const labelSlug = slug(label) || 'unbekannt';
  const base = input.similarityKey || input.comparisonKey || input.canonicalId || slug(input.semanticType || input.canonicalProduct || input.canonicalGroup) || 'produkt';
  const sizePart = slug(norm(input.size)) || 'groesse-unbekannt';
  const concreteParts = buildConcreteIdentityParts({...input, brand: label});
  const concrete = slug(concreteParts.join('|')) || slug(`${label}|${input.name || ''}|${input.size || ''}`) || 'produkt';

  return {
    ...input,
    ean: null,
    gtin: null,
    exactMatchKey: `${base}|label:${labelSlug}|size:${sizePart}`,
    canonicalProductId: concrete,
    identitySource: source
  };
}
