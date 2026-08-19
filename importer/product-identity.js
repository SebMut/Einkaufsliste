import { slug, norm } from './product-normalizer.js';
import { buildConcreteIdentityParts } from './semantic-products.js';
import { normalizeGtin } from './gtin.js';

export { normalizeGtin } from './gtin.js';

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
