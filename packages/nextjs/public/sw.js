/* OtterPot PWA — cache shell para instalación / offline básico */
const CACHE = "otterpot-v5";
const PRECACHE = ["/", "/manifest.webmanifest", "/mascot.svg", "/pwa-192.png", "/pwa-512.png", "/favicon.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (request.url.startsWith("chrome-extension:")) return;
  if (request.url.startsWith("ws:") || request.url.startsWith("wss:")) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // No cachear en localhost (dev / serve local)
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          try {
            await cache.put(request, response.clone());
          } catch {
            // ignore
          }
        }
        return response;
      } catch {
        return cached || Response.error();
      }
    }),
  );
});

/** Abrir la app al tocar una notificación */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});

/** Push remoto (payload JSON) — listo si más adelante se conecta FCM/VAPID */
self.addEventListener("push", event => {
  let title = "OtterPot";
  let body = "Tienes una actualización en tu reto";
  let url = "/";
  try {
    const data = event.data ? event.data.json() : null;
    if (data) {
      if (data.title) title = String(data.title);
      if (data.body) body = String(data.body);
      if (data.url) url = String(data.url);
    } else if (event.data) {
      body = event.data.text();
    }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      data: { url },
    }),
  );
});
