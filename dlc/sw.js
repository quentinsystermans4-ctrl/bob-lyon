const CACHE_NAME = 'bob-dlc-cache-v1.5.0';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  '../assets/logos/BOB EMBLEME B.png',
  '../assets/logos/BOB LOGO B.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Erreur mise en cache statique (non critique)', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network first with fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Optionnel : mettre à jour le cache
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
