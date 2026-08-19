const CACHE='angebotsradar-v4.5-performance';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./importer/product-normalizer.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=event.request.url;
  if(url.includes('/data/offers-live.json')||url.includes('/data/price-history.json')){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request,{ignoreSearch:true})));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    if(response&&response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));}
    return response;
  }).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||caches.match('./index.html'))));
});
