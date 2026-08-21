const CACHE='angebotsradar-v9-clean';
const ASSETS=['./','./index.html','./app.css','./app.js','./grundlebensmittel.html','./manifest.webmanifest','./icon.svg','./importer/product-normalizer.js','./importer/product-dedupe.js','./importer/staples-matcher.js','./data/staples.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=event.request.url;
  const dynamic=url.includes('/data/offers-live.json')||url.includes('/data/price-history.json')||url.includes('/data/staples.json');
  if(event.request.mode==='navigate'||dynamic){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
      if(response&&response.ok&&!dynamic){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));}
      return response;
    }).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response&&response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));}
    return response;
  })));
});
