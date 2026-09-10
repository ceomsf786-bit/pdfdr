// v3.12 global image boards + live-view schema fix
// v3.11 shared library/categories/master backup
// v3.10 backup/import + teaching flow
// v3.9 gallery drag/pan/draw fix
// v3.8 freeform gallery board
// v3.7 global gallery + image annotations
// v3.6 realtime annotations + rich notes + student pan
// v3.5 student-control cache refresh
const CACHE = 'snt-pdf-static-v3-12';
const STATIC = ['./','./index.html','./teacher.html','./viewer.css','./viewer.js','./config.js','./v310-backup.css','./v310-backup.js','./v311-library.css','./v311-library.js','./v312-imageboards.css','./v312-imageboards.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Network-first for the tiny web app files so updates do not get trapped behind an old cache.
// The large Google Drive PDF is fetched from Supabase and is not handled by this service worker.
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(response => {
      if(response.ok){
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      }
      return response;
    }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
