const clean = v => String(v ?? '').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const lc = v => clean(v).toLocaleLowerCase('de-DE');
const slug = v => lc(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,140);

const num = v => {
  const n = Number(String(v ?? '').replace(',','.'));
  return Number.isFinite(n) ? n : null;
};

export function semanticAttributes(name='', size='') {
  const text = `${clean(name)} ${clean(size)}`;
  const diaperSize = text.match(/(?:gr(?:öße|\.)?\s*|size\s*)([0-9]{1,2})\b/i)?.[1] ?? null;
  const weight = text.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*kg\b/i);
  const fat = text.match(/\b(0[,.]\d|1[,.]\d|3[,.]\d|3[,.]5|3[,.]8|3[,.]9)\s*%/i)?.[1] ?? null;
  const washLoads = text.match(/\b(\d{1,3})\s*(?:wl|waschladungen?)\b/i)?.[1] ?? null;
  const stage = text.match(/\bpre\b/i) ? 'PRE' : text.match(/(?:folgemilch|milchnahrung|anfangsmilch)\s*([123])\b/i)?.[1] ?? null;
  const animal = /\bkatze[n]?\b|katzenfutter|cat\b/i.test(text) ? 'Katze' : /\bhund(?:e)?\b|hundefutter|dog\b/i.test(text) ? 'Hund' : null;
  const feedForm = /nassfutter|\bmenü\b|\bpat[eé]\b/i.test(text) ? 'Nass' : /trockenfutter|kroketten/i.test(text) ? 'Trocken' : null;
  const diaperForm = /schwimmwindel/i.test(text) ? 'Schwimmwindel' : /\bpants\b|windelhose/i.test(text) ? 'Pants' : /\bwindeln?\b/i.test(text) ? 'Windeln' : null;
  const detergentForm = /caps|pods|tabs/i.test(text) ? 'Caps' : /pulver|waschpulver/i.test(text) ? 'Pulver' : /gel|flüssig|fluessig/i.test(text) ? 'Flüssig' : null;
  const processing = /\bh-?milch\b|haltbar/i.test(text) ? 'haltbar' : /frisch(?:e|er|es)?\s+(?:voll)?milch|frischmilch/i.test(text) ? 'frisch' : null;
  return {
    diaperSize,
    weightMinKg: weight ? Number(weight[1]) : null,
    weightMaxKg: weight ? Number(weight[2]) : null,
    fatContent: fat ? num(fat) : null,
    washLoads: washLoads ? Number(washLoads) : null,
    babyStage: stage,
    animal,
    feedForm,
    diaperForm,
    detergentForm,
    processing
  };
}

function profile(base, extras={}) {
  return {
    department:'Lebensmittel', category:'Lebensmittel', subcategory:'', marketSection:'',
    canonicalGroup:base, canonicalProduct:base, semanticType:base, useCase:'',
    bundleKey:base, comparisonKey:slug(base), semanticConfidence:0.99,
    ...extras
  };
}

function withKey(p, attrs, fields=[]) {
  const parts=[slug(p.semanticType)];
  for(const field of fields) parts.push(`${field}:${attrs[field] == null || attrs[field] === '' ? '?' : slug(attrs[field])}`);
  return {...p,comparisonKey:parts.join('|'),criticalAttributes:fields};
}

export function classifySemanticProduct(name='', size='', currentCat='') {
  const n=lc(name), attrs=semanticAttributes(name,size);
  let p=null;

  // Baby/Wickeln: zusammengesetzte Hauptwörter haben Vorrang vor "Windel".
  if (/windelbeutel/.test(n)) p=profile('Windelbeutel',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Wickeln',marketSection:'Baby & Kleinkind',useCase:'Entsorgung gebrauchter Windeln'});
  else if (/windelcreme|wundschutz(?:creme)?|schutzcreme.*windel/.test(n)) p=profile('Windelcreme',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Pflege',marketSection:'Baby & Kleinkind',useCase:'Hautschutz im Windelbereich'});
  else if (/windeleimer/.test(n)) p=profile('Windeleimer',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Wickeln',marketSection:'Baby & Kleinkind',useCase:'Aufbewahrung/Entsorgung gebrauchter Windeln'});
  else if (/windelvlies/.test(n)) p=profile('Windelvlies',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Wickeln',marketSection:'Baby & Kleinkind',useCase:'Einlage für Stoffwindeln'});
  else if (/schwimmwindel/.test(n)) p=withKey(profile('Schwimmwindeln',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Wickeln',marketSection:'Baby & Kleinkind',canonicalProduct:attrs.diaperSize?`Schwimmwindeln Gr. ${attrs.diaperSize}`:'Schwimmwindeln',bundleKey:attrs.diaperSize?`Schwimmwindeln Gr. ${attrs.diaperSize}`:'Schwimmwindeln',useCase:'Windelschutz beim Schwimmen'}),attrs,['diaperSize']);
  else if (/wickelunterlagen?/.test(n)) p=profile('Wickelunterlagen',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Wickeln',marketSection:'Baby & Kleinkind',useCase:'Unterlage beim Wickeln'});
  else if (/feuchttücher|baby\s*wipes|babytücher/.test(n)) p=profile('Feuchttücher',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Wickeln',marketSection:'Baby & Kleinkind',useCase:'Feuchtreinigung der Haut'});
  else if (/baby[- ]?waschlappen/.test(n)) p=profile('Baby-Waschlappen',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Pflege',marketSection:'Baby & Kleinkind',useCase:'Waschen/Reinigung von Babys'});
  else if (/\bwindeln?\b|windelhose|\bpants\b/.test(n)) {
    const form=attrs.diaperForm || 'Windeln';
    const variant=`${form}${attrs.diaperSize?` Gr. ${attrs.diaperSize}`:''}`;
    p=withKey(profile('Windeln',{department:'Drogerie',category:'Baby & Kleinkind',subcategory:'Wickeln',marketSection:'Baby & Kleinkind',canonicalProduct:variant,bundleKey:variant,useCase:'Aufnahme von Ausscheidungen bei Babys/Kleinkindern'}),attrs,['diaperForm','diaperSize']);
  }

  // Zahnpflege
  else if (/zahnpasta|zahncreme/.test(n)) p=profile('Zahnpasta',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Mundpflege',marketSection:'Drogerie / Pflege',useCase:'Zähneputzen'});
  else if (/zahnbürste/.test(n)) p=profile('Zahnbürste',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Mundpflege',marketSection:'Drogerie / Pflege',useCase:'Mechanische Zahnreinigung'});
  else if (/zahnseide/.test(n)) p=profile('Zahnseide',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Mundpflege',marketSection:'Drogerie / Pflege',useCase:'Reinigung der Zahnzwischenräume'});
  else if (/mundspül|mundwasser/.test(n)) p=profile('Mundspülung',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Mundpflege',marketSection:'Drogerie / Pflege',useCase:'Mundspülung'});
  else if (/zahnreinigungstabletten?|gebissreiniger|prothesenreiniger/.test(n)) p=profile('Zahnreinigungstabletten',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Mundpflege',marketSection:'Drogerie / Pflege',useCase:'Reinigung von Zahnersatz'});

  // Spülen / Haushalt
  else if (/spülmaschinen(?:tabs?|tabletten)|geschirrspül(?:tabs?|tabletten)|spülmaschinentabs?/.test(n)) p=profile('Spülmaschinentabs',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Geschirrspülen',marketSection:'Drogerie / Haushalt',useCase:'Maschinelles Geschirrspülen'});
  else if (/klarspüler/.test(n)) p=profile('Klarspüler',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Geschirrspülen',marketSection:'Drogerie / Haushalt',useCase:'Klarspülen in der Spülmaschine'});
  else if (/spülmaschinen(?:salz)|regeneriersalz/.test(n)) p=profile('Spülmaschinensalz',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Geschirrspülen',marketSection:'Drogerie / Haushalt',useCase:'Wasserenthärtung in der Spülmaschine'});
  else if (/\bspülmittel\b|handspülmittel/.test(n)) p=profile('Spülmittel',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Geschirrspülen',marketSection:'Drogerie / Haushalt',useCase:'Manuelles Geschirrspülen'});

  // Wäsche
  else if (/weichspüler/.test(n)) p=profile('Weichspüler',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Waschen',marketSection:'Drogerie / Haushalt',useCase:'Wäsche weich machen/parfümieren'});
  else if (/fleckentferner|fleckensalz|fleckenspray/.test(n)) p=profile('Fleckentferner',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Waschen',marketSection:'Drogerie / Haushalt',useCase:'Fleckenbehandlung'});
  else if (/waschmittel|vollwaschmittel|colorwaschmittel|feinwaschmittel|waschpulver|waschgel|waschcaps|waschpods/.test(n)) {
    const kind=/color/.test(n)?'Colorwaschmittel':/fein/.test(n)?'Feinwaschmittel':/voll/.test(n)?'Vollwaschmittel':'Waschmittel';
    const form=attrs.detergentForm;
    p=withKey(profile('Waschmittel',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Waschen',marketSection:'Drogerie / Haushalt',canonicalProduct:[kind,form].filter(Boolean).join(' ')||'Waschmittel',bundleKey:'Waschmittel',useCase:'Textilien waschen'}),attrs,['detergentForm']);
  }

  // Papierprodukte
  else if (/toilettenpapier/.test(n)) p=profile('Toilettenpapier',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Papier',marketSection:'Drogerie / Haushalt',useCase:'Toilettenhygiene'});
  else if (/küchenpapier|küchenrolle/.test(n)) p=profile('Küchenpapier',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Papier',marketSection:'Drogerie / Haushalt',useCase:'Aufwischen/Reinigen in der Küche'});
  else if (/taschentücher/.test(n)) p=profile('Taschentücher',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Papier',marketSection:'Drogerie / Haushalt',useCase:'Nasenhygiene'});
  else if (/kosmetiktücher|gesichtstücher/.test(n)) p=profile('Kosmetiktücher',{department:'Drogerie',category:'Haushalt & Drogerie',subcategory:'Papier',marketSection:'Drogerie / Haushalt',useCase:'Kosmetische Reinigung'});

  // Milch und ähnlich klingende, aber funktional andere Produkte.
  else if (/milchreis/.test(n)) {
    const ready=/dessert|becher|fertig|vanille|zimt|schoko|original|müller/.test(n);
    p=profile('Milchreis',{department:'Lebensmittel',category:ready?'Milchprodukte':'Vorrat',subcategory:ready?'Desserts':'Reis & Getreide',marketSection:ready?'Kühlregal':'Trockenwaren',canonicalProduct:ready?'Milchreis Dessert':'Milchreis (trocken)',bundleKey:'Milchreis',useCase:ready?'Verzehrfertiges Dessert':'Reis zur Zubereitung von Milchreis'});
  }
  else if (/milchschokolade|vollmilchschokolade/.test(n)) p=profile('Milchschokolade',{department:'Lebensmittel',category:'Süßes & Snacks',subcategory:'Schokolade',marketSection:'Süßes & Snacks',canonicalGroup:'Schokolade',canonicalProduct:'Milchschokolade',bundleKey:'Milchschokolade',semanticType:'Milchschokolade',useCase:'Süßware/Schokolade'});
  else if (/kokosmilch/.test(n)) p=profile('Kokosmilch',{department:'Lebensmittel',category:'Vorrat',subcategory:'Kochzutaten',marketSection:'Trockenwaren',useCase:'Kochzutat auf Kokosbasis'});
  else if (/kondensmilch|kaffeesahne/.test(n)) p=profile('Kondensmilch',{department:'Lebensmittel',category:'Milchprodukte',subcategory:'Milchprodukte',marketSection:'Kühlregal',useCase:'Konzentriertes Milchprodukt/Kaffeezutat'});
  else if (/milchpulver/.test(n) && !/säuglings|baby|pre\b/.test(n)) p=profile('Milchpulver',{department:'Lebensmittel',category:'Vorrat',subcategory:'Milchpulver',marketSection:'Trockenwaren',useCase:'Getrocknetes Milchprodukt'});
  else if (/anfangsmilch|folgemilch|kindermilch|säuglingsnahrung|milchnahrung|\bpre\s*(?:nahrung|milch)?\b/.test(n)) {
    const stage=attrs.babyStage || (/kindermilch/.test(n)?'Kind':/folgemilch/.test(n)?'Folge':'PRE');
    p=withKey(profile('Babymilch',{department:'Lebensmittel',category:'Baby & Kleinkind',subcategory:'Babynahrung',marketSection:'Baby & Kleinkind',canonicalProduct:`Babymilch ${stage}`,bundleKey:`Babymilch ${stage}`,useCase:'Säuglings-/Kleinkindernahrung'}),attrs,['babyStage']);
  }
  else if (/\bvollmilch\b|\bfrischmilch\b|\bh-?milch\b|\bhaltbare?\s+(?:voll)?milch\b|\bberg(?:bauern)?milch\b|\bweidemilch\b|\blandmilch\b|\bfrische?\s+milch\b|\balpenmilch\b/.test(n) || (/\bmilch\b/.test(n) && !/reis|schokolade|brötchen|pulver|brei|kaffee|shake|drink/.test(n))) {
    const product=/fettarm|1[,.]5\s*%/.test(n)?'Fettarme Milch':attrs.processing==='haltbar'?'H-Milch':'Vollmilch';
    p=withKey(profile('Milch',{department:'Lebensmittel',category:'Milchprodukte',subcategory:'Milchprodukte',marketSection:'Kühlregal',canonicalProduct:product,bundleKey:'Milch',useCase:'Trinkmilch/Grundnahrungsmittel'}),attrs,['processing','fatContent']);
  }

  // Butter und ähnlich klingende Produkte.
  else if (/butterkeks/.test(n)) p=profile('Butterkeks',{department:'Lebensmittel',category:'Süßes & Snacks',subcategory:'Kekse',marketSection:'Süßes & Snacks',canonicalGroup:'Kekse',canonicalProduct:'Butterkeks',bundleKey:'Butterkeks',semanticType:'Butterkeks',useCase:'Keks/Süßware'});
  else if (/erdnussbutter/.test(n)) p=profile('Erdnussbutter',{department:'Lebensmittel',category:'Kaffee & Frühstück',subcategory:'Aufstriche',marketSection:'Trockenwaren',useCase:'Erdnussaufstrich'});
  else if (/kakaobutter/.test(n)) p=profile('Kakaobutter',{department:'Lebensmittel',category:currentCat||'Lebensmittel',subcategory:'Fette',marketSection:'Lebensmittel',useCase:'Kakaofett/Zutat'});
  else if (/kräuterbutter/.test(n)) p=profile('Kräuterbutter',{department:'Lebensmittel',category:'Milchprodukte',subcategory:'Butter & Fette',marketSection:'Kühlregal',useCase:'Gewürzte Butterzubereitung'});
  else if (/butterschmalz/.test(n)) p=profile('Butterschmalz',{department:'Lebensmittel',category:'Vorrat',subcategory:'Fette & Öle',marketSection:'Trockenwaren',useCase:'Butterreinfett zum Braten/Kochen'});
  else if (/\bbutter\b|markenbutter|streichzart/.test(n)) {
    const variant=/süßrahm/.test(n)?'Süßrahmbutter':/sauerrahm/.test(n)?'Sauerrahmbutter':'Butter';
    p=profile('Butter',{department:'Lebensmittel',category:'Milchprodukte',subcategory:'Butter & Fette',marketSection:'Kühlregal',canonicalProduct:variant,bundleKey:'Butter',useCase:'Streich-/Speisefett aus Milch'});
  }

  // Tierfutter: Tierart und Futterform sind kritische Merkmale.
  else if (/katzenfutter|hundefutter|tierfutter|nassfutter|trockenfutter/.test(n) && attrs.animal) {
    p=withKey(profile('Tierfutter',{department:'Tierbedarf',category:'Tierbedarf',subcategory:'Tierfutter',marketSection:'Tierbedarf',canonicalProduct:[attrs.animal,attrs.feedForm,'Futter'].filter(Boolean).join(' '),bundleKey:[attrs.animal,attrs.feedForm,'Futter'].filter(Boolean).join(' '),useCase:`Futter für ${attrs.animal}`}),attrs,['animal','feedForm']);
  }

  if(!p) return null;
  return {...p,semanticAttributes:attrs,semanticGroupId:slug(p.bundleKey||p.canonicalGroup),comparisonKey:p.comparisonKey||slug(p.semanticType)};
}

const criticalValue=(o,key)=>o?.attributes?.[key] ?? o?.semanticAttributes?.[key] ?? null;

export function semanticCompatible(a,b) {
  if(!a||!b) return false;
  const at=a.semanticType||null, bt=b.semanticType||null;
  if(at||bt) {
    if(!at||!bt||at!==bt) return false;
    const fields=[...(a.criticalAttributes||[]),...(b.criticalAttributes||[])];
    for(const field of new Set(fields)) {
      const av=criticalValue(a,field), bv=criticalValue(b,field);
      // Kritisches Merkmal nur auf einer Seite bekannt => lieber trennen.
      if((av==null)!==(bv==null)) return false;
      if(av!=null && String(av).toLocaleLowerCase('de-DE')!==String(bv).toLocaleLowerCase('de-DE')) return false;
    }
    if(a.comparisonKey&&b.comparisonKey&&a.comparisonKey!==b.comparisonKey) return false;
    return true;
  }
  return true;
}

export function semanticRelation(a,b) {
  if(!a||!b) return 'none';
  if(!semanticCompatible(a,b)) {
    return a.canonicalGroup&&a.canonicalGroup===b.canonicalGroup?'same_group':'none';
  }
  if(a.comparisonKey&&a.comparisonKey===b.comparisonKey) return 'similar_product';
  return 'none';
}

export function buildConcreteIdentityParts(input={}) {
  const attrs=input.attributes||{};
  const critical=(input.criticalAttributes||[]).map(k=>`${k}:${attrs[k]??'?'}`);
  return [input.brand||'',input.semanticType||input.canonicalProduct||input.canonicalGroup||'',input.canonicalProduct||'',...critical,input.size||''].filter(Boolean);
}

export { clean as semanticClean, slug as semanticSlug };
