const CACHE = 'mis-mesas-v2';
const CORE = [
  '/',
  '/manifest.json',
  '/assets/imgs/icon-192.png',
  '/assets/imgs/icon-512.png',
  '/assets/css/styles.css',
  '/assets/js/data.js',
  '/assets/js/main.js',
  '/assets/js/firebase-config.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('identitytoolkit')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
