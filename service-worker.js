// v3.17.1 direct shape editor: working opacity + selected colour/width/fill
// guarded by stable v3.14 fallback so Library/core startup survives any upgrade mismatch
// v3.15 board links + notes/image-board PDF export
// v3.14 solid shape fills
// v3.13 image-board annotations + editable/fillable PDF shapes + PDF insertion
const CACHE = 'snt-pdf-static-v3-17-1';
const STATIC = ['./','./index.html','./teacher.html','./viewer.css','./viewer.js','./v313-viewer-loader.js','./v314-viewer-loader.js','./v315-viewer-loader.js','./v316-viewer-loader.js','./v317-viewer-loader.js','./v313-pdf-insert.js','./config.js','./v310-backup.css','./v310-backup.js','./v311-library.css','./v311-library.js','./v312-imageboards.css','./v312-imageboards.js','./v314-imageboards.js','./v315-imageboards-loader.js','./v316-imageboards-loader.js','./v315-ui.css','./v315-board-tools.js'];

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
  event.respondWith(
    fetch(req).then(response => {
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}
      return response;
    }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
