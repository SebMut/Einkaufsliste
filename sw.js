const CACHE='angebotsradar-v4.4';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./importer/product-normalizer.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.url.includes('/data/offers-live.json')||event.request.url.includes('/data/price-history.json')){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request,{ignoreSearch:true})));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    const clone=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,clone));
    return response;
  }).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||caches.match('./index.html'))));
});
