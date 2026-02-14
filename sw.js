const CACHE_NAME = 'recouple-v1771077600';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/scoring.js',
  '/js/draft.js',
  '/js/storage.js',
  '/js/game.js',
  '/js/ui.js',
  '/data/contestants.json',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
