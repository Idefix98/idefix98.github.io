// Fa funzionare l'app anche senza connessione.
// Codice e liste vengono prima cercati in rete (così gli aggiornamenti arrivano subito),
// poi dalla copia salvata sul telefono.

const CACHE = 'saltaclip-v1';
const SHELL = [
  './',
  'index.html',
  'privacy.html',
  'css/app.css',
  'js/app.js',
  'js/render.js',
  'js/music.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'data/trends.json',
  'data/templates.json',
  'data/sounds.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('index.html');
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const fresh = request.mode === 'navigate' || /\.(html|js|css|json|webmanifest)$/.test(url.pathname);
  event.respondWith(fresh ? networkFirst(request) : cacheFirst(request));
});
