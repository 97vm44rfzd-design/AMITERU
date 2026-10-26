const C="amiteru-v690-fixed";
const CORE=["./","./index.html","./app.js?v=690","./harvest.js?v=690","./dashboard.js?v=690","./sales_seed.js?v=690","./manifest.webmanifest?v=690","./icon-192.png?v=690","./icon-512.png?v=690","./apple-touch-icon.png?v=690"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)))});
self.addEventListener("activate",e=>{e.waitUntil(Promise.all([clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))]))});
self.addEventListener("fetch",e=>{if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).catch(()=>caches.match("./index.html")));return}e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)))});
