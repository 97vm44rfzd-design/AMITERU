const C="amiteru-v693-weekday";
const CORE=["./","./index.html","./app.js?v=693","./harvest.js?v=693","./dashboard.js?v=693","./sales_seed.js?v=693","./manifest.webmanifest?v=693","./icon-192.png?v=693","./icon-512.png?v=693","./apple-touch-icon.png?v=693"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)))});
self.addEventListener("activate",e=>{e.waitUntil(Promise.all([clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))]))});
self.addEventListener("fetch",e=>{if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).catch(()=>caches.match("./index.html")));return}e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)))});
