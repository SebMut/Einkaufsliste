const clean = value => String(value ?? '')
  .toLocaleLowerCase('de-DE')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss')
  .replace(/[–—]/g, '-')
  .replace(/straße|strasse/g, 'str')
  .replace(/\s+/g, ' ')
  .trim();

export const ALLOWED_AREAS = Object.freeze([
  'Feldkirchen','Heimstetten','Aschheim','Kirchheim bei München','Riem Arcaden'
]);

const RIEM_ARCADEN_ADDRESS = /\bwilly-brandt-platz\s*5\b.*\b81829\s+m(?:ue|u)nchen\b/;
const LOCAL_ADDRESS_RULES = [
  { area: 'Feldkirchen', re: /\b85622\s+feldkirchen\b/ },
  { area: 'Aschheim', re: /\b85609\s+aschheim\b/ },
  { area: 'Heimstetten', re: /\b85551\s+(?:kirchheim[- ]?)?heimstetten\b/ },
  { area: 'Kirchheim bei München', re: /\b85551\s+kirchheim(?:\s+bei\s+m(?:ue|u)nchen)?\b/ }
];

export function isRiemArcaden(input = {}) {
  if (input.isRiemArcaden === true) return true;
  return RIEM_ARCADEN_ADDRESS.test(clean(input.address));
}

export function marketArea(input = {}) {
  if (isRiemArcaden(input)) return 'Riem Arcaden';
  const address = clean(input.address);
  for (const rule of LOCAL_ADDRESS_RULES) if (rule.re.test(address)) return rule.area;
  if (!address) {
    const market = clean(input.market);
    if (/\bfeldkirchen\b/.test(market)) return 'Feldkirchen';
    if (/\baschheim(?:-dornach)?\b/.test(market)) return 'Aschheim';
    if (/\bheimstetten\b/.test(market)) return 'Heimstetten';
    if (/\bkirchheim\b/.test(market)) return 'Kirchheim bei München';
    if (/riem arcaden/.test(market)) return 'Riem Arcaden';
  }
  return null;
}

export function isAllowedMarket(input = {}) {
  return input.active !== false && marketArea(input) !== null;
}

export function withMarketPolicy(input = {}) {
  const area = marketArea(input);
  return {...input,activeMarket:area!==null,allowedArea:area,isRiemArcaden:area==='Riem Arcaden'};
}

export function catalogStatusFor(input = {}) {
  if (['full_catalog','partial_catalog','offers_only','unavailable','login_required'].includes(input.catalogStatus)) return input.catalogStatus;
  if (input.importStatus === 'login_required') return 'login_required';
  if (['dm','rossmann'].includes(clean(input.store))) return 'partial_catalog';
  if (input.offerUrl || ['supported','partial'].includes(input.importStatus)) return 'offers_only';
  return 'unavailable';
}

export const activeOffer = offer => withMarketPolicy(offer).activeMarket;
export { clean as normalizeMarketText };
