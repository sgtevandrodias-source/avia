const CACHE_NAME = 'avia-shell-v1';
const CORE_ASSETS = ['/', '/favicon.ico', '/manifest.json'];
const PAGINAS_ESTATICAS = ['/privacidade', '/excluir-conta', '/termos'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Páginas estáticas (política de privacidade, exclusão de conta) não são o
  // app: sem isso, abrir uma delas sobrescreveria o cache de '/' abaixo.
  if (PAGINAS_ESTATICAS.some((p) => url.pathname.startsWith(p))) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Copia ANTES de devolver: depois que a página lê a resposta, ela
          // não pode mais ser copiada (dava "Response body is already used").
          const copia = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copia));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copia = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
