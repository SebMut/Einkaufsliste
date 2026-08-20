import fs from 'node:fs/promises';

const path = new URL('../index.html', import.meta.url);
let html = await fs.readFile(path, 'utf8');

function replaceOnce(from, to, label) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: erwartet 1 Treffer, gefunden ${count}`);
  html = html.replace(from, to);
}

replaceOnce(
  '<span>Produktgruppen</span>',
  '<span>konkrete Produkte</span>',
  'Hero-Produktzaehler'
);

replaceOnce(
  "const keyOf=o=>o.bundleKey||o.key||o.canonicalProduct||o.name,storeName=o=>o.market?`${o.store} · ${o.market}`:o.store,eligible=o=>(el.useApp.checked||!o.app)&&(el.useCoupon.checked||!o.coupon),isOffer=o=>o.isOffer===true||o.advertised===true;",
  "const keyOf=o=>o.bundleKey||o.key||o.canonicalGroup||o.canonicalProduct||o.name,concreteKeyOf=o=>o.canonicalProductId||o.exactMatchKey||`${o.canonicalProduct||o.name}|${o.size||''}`,storeName=o=>o.market?`${o.store} · ${o.market}`:o.store,eligible=o=>(el.useApp.checked||!o.app)&&(el.useCoupon.checked||!o.coupon),isOffer=o=>o.isOffer===true||o.advertised===true;",
  'Schluesseldefinition'
);

replaceOnce(
  "function rebuildIndex(){groupMap=new Map();for(const o of offers){const key=keyOf(o);let g=groupMap.get(key);if(!g){g={key,all:[],search:'',variants:new Set()};groupMap.set(key,g)}g.all.push(o);g.variants.add(o.canonicalProductId||o.canonicalProduct||o.name);g.search+=` ${key} ${o.name} ${o.store} ${o.market||''} ${o.brand||''} ${o.ean||''} ${o.canonicalProduct||''} ${o.canonicalGroup||''}`.toLocaleLowerCase('de-DE')}groups=[...groupMap.values()];el.productCount.textContent=groups.length;el.offerCount.textContent=offers.filter(isOffer).length;el.storeCount.textContent=new Set(offers.map(o=>o.store).filter(Boolean)).size}",
  "function rebuildIndex(){groupMap=new Map();for(const o of offers){const key=concreteKeyOf(o),bundleKey=keyOf(o);let g=groupMap.get(key);if(!g){g={key,bundleKey,all:[],search:''};groupMap.set(key,g)}g.all.push(o);g.search+=` ${bundleKey} ${key} ${o.name} ${o.store} ${o.market||''} ${o.brand||''} ${o.ean||''} ${o.canonicalProduct||''} ${o.canonicalGroup||''}`.toLocaleLowerCase('de-DE')}groups=[...groupMap.values()];el.productCount.textContent=groups.length;el.offerCount.textContent=offers.filter(isOffer).length;el.storeCount.textContent=new Set(offers.map(o=>o.store).filter(Boolean)).size}",
  'Konkrete Produktgruppierung'
);

replaceOnce(
  "function bundle(g){const all=g.all.filter(eligible),scoped=selectedStore==='Alle Händler'?all:all.filter(o=>o.store===selectedStore);const bio=cheapest(scoped.filter(o=>o.bio)),fallback=cheapest(scoped.filter(o=>!o.bio)),main=bio||fallback;if(!main)return null;const other=comparisonCandidates(main,all);let comparison=null,comparisonMode='';if(main.bio){comparison=cheapest(other.filter(o=>!o.bio));comparisonMode='conventional'}else{comparison=cheapest(other);if(comparison)comparisonMode=priceMetric(comparison)<priceMetric(main)?'cheaper':'next'}return{g,main,bio,all,comparison,comparisonMode,variantCount:g.variants.size}}",
  "function bundle(g){const all=g.all.filter(eligible),scoped=selectedStore==='Alle Händler'?all:all.filter(o=>o.store===selectedStore);const bio=cheapest(scoped.filter(o=>o.bio)),fallback=cheapest(scoped.filter(o=>!o.bio)),main=bio||fallback;if(!main)return null;const comparisonPool=offers.filter(eligible).filter(o=>keyOf(o)===g.bundleKey),other=comparisonCandidates(main,comparisonPool);let comparison=null,comparisonMode='';if(main.bio){comparison=cheapest(other.filter(o=>!o.bio));comparisonMode='conventional'}else{comparison=cheapest(other);if(comparison)comparisonMode=priceMetric(comparison)<priceMetric(main)?'cheaper':'next'}return{g,main,bio,all,comparison,comparisonMode,sellerCount:new Set(all.map(storeName)).size}}",
  'Bundle-Vergleichspool'
);

replaceOnce(
  "function card(p){const o=p.main,added=listSet.has(p.g.key),baby=(o.cat||o.category)==='Baby & Kleinkind';return`<article class=\"card ${isOffer(o)?'offer':''}\"><div class=\"ico\">${o.icon||'🛒'}</div><div><h3>${esc(o.name)}</h3><div class=\"meta\">${esc(storeName(o))} · ${esc(o.size||'Packung')}</div><div class=\"tags\">${o.bio?'<span class=\"tag bio\">🌱 BIO</span>':''}${baby?'<span class=\"tag baby\">👶 Baby & Kleinkind</span>':''}${p.variantCount>1?`<span class=\"tag variant\">${p.variantCount} Varianten</span>`:''}${o.app?'<span class=\"tag app\">App</span>':''}${o.coupon?'<span class=\"tag coupon\">Coupon</span>':''}${isOffer(o)?'<span class=\"tag ad\">ANGEBOT</span>':'<span class=\"tag reg\">Regulär</span>'}</div>${ratingButton(o)}${historyButton(o)}${comparisonHtml(p)}</div><div class=\"price\">${priceHtml(o)}<button class=\"add ${added?'added':''}\" data-add=\"${encodeURIComponent(p.g.key)}\">${added?'✓ Liste':'+ Liste'}</button></div></article>`}",
  "function card(p){const o=p.main,added=listSet.has(p.g.bundleKey),baby=(o.cat||o.category)==='Baby & Kleinkind';return`<article class=\"card ${isOffer(o)?'offer':''}\"><div class=\"ico\">${o.icon||'🛒'}</div><div><h3>${esc(o.name)}</h3><div class=\"meta\">${esc(storeName(o))} · ${esc(o.size||'Packung')}</div><div class=\"tags\">${o.bio?'<span class=\"tag bio\">🌱 BIO</span>':''}${baby?'<span class=\"tag baby\">👶 Baby & Kleinkind</span>':''}${p.sellerCount>1?`<span class=\"tag variant\">${p.sellerCount} Händler</span>`:''}${o.app?'<span class=\"tag app\">App</span>':''}${o.coupon?'<span class=\"tag coupon\">Coupon</span>':''}${isOffer(o)?'<span class=\"tag ad\">ANGEBOT</span>':'<span class=\"tag reg\">Regulär</span>'}</div>${ratingButton(o)}${historyButton(o)}${comparisonHtml(p)}</div><div class=\"price\">${priceHtml(o)}<button class=\"add ${added?'added':''}\" data-add=\"${encodeURIComponent(p.g.bundleKey)}\">${added?'✓ Liste':'+ Liste'}</button></div></article>`}",
  'Produktkarte'
);

replaceOnce(
  "el.status.textContent=`${lastResult.length} Produktgruppen · ${offers.filter(isOffer).length} Angebote · ${offers.filter(o=>!isOffer(o)).length} reguläre Produkte`",
  "el.status.textContent=`${lastResult.length} Produkte · ${offers.filter(isOffer).length} Angebote · ${offers.filter(o=>!isOffer(o)).length} reguläre Produkte`",
  'Statusbezeichnung'
);

replaceOnce(
  "function optimizeList(){const chosen=[];for(const k of list){const g=groupMap.get(k);if(!g)continue;const p=bundle(g);if(p?.main)chosen.push(p.main)}const by={};",
  "function optimizeList(){const chosen=[];for(const k of list){const matches=groups.filter(g=>g.bundleKey===k).map(bundle).filter(Boolean),mains=matches.map(p=>p.main);if(!mains.length)continue;const main=cheapest(mains.filter(o=>o.bio))||cheapest(mains.filter(o=>!o.bio));if(main)chosen.push(main)}const by={};",
  'Einkaufsoptimierung'
);

await fs.writeFile(path, html);
console.log('Produktdarstellung auf konkrete Produkte umgestellt; Bundle bleibt Vergleichs-/Einkaufsgruppe.');
