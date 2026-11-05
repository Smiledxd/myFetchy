// Service Worker para myFetchy (Sin Workbox)
const CACHE_NAME = "myfetchy-v1";

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/config.js",
  "./js/supabase.js",
  "./js/auth.js",
  "./js/data.js",
  "./js/app.js",
  "./js/ui/items.js",
  "./js/ui/modal.js",
  "./js/ui/management.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm",
];

// Instalación: Precaché de la interfaz
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }),
  );
});

// Activación: Limpieza de versiones viejas de caché
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      ),
    ),
  );
  self.clients.claim();
});

// Mensajes (actualización asistida vía skipWaiting)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: Manejo de solicitudes de red
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // REGLA CRÍTICA: Nunca cachear llamadas a Supabase (siempre a la red)
  if (url.hostname.includes("supabase.co")) {
    return;
  }

  // Caché en tiempo de ejecución para Google Fonts
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      }),
    );
    return;
  }

  // Estrategia Cache-First para recursos estáticos precacheados
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          // Solo cachear respuestas exitosas de nuestro mismo origen
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            request.method === "GET" &&
            url.origin === self.location.origin
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Si falla la red y es navegación, devolver index.html de respaldo
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    }),
  );
});
