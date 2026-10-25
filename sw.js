const C="amiteru-v49";
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(["./?v=49","index.html","app.js?v=49","manifest.webmanifest"])))}); 
self.addEventListener("activate",e=>{e.waitUntil(Promise.all([clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))]))});
self.addEventListener("fetch",e=>{if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).catch(()=>caches.match("./?v=49")));return}e.respondWith(fetch(e.request).then(r=>{let cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)))});
