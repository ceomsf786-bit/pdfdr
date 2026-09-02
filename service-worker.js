const CACHE = 'snt-pdf-static-v3-1';
const STATIC = ['./','./index.html','./teacher.html','./viewer.css','./viewer.js','./config.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(r => { const copy=r.clone(); caches.open(CACHE).then(c=>c.put(req,copy)); return r; }).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then(cached => {
    const network = fetch(req).then(r => { if(r.ok){ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(req,copy)); } return r; }).catch(()=>cached);
    return cached || network;
  }));
});
