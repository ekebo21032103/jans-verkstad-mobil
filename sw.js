// Generated from the same build as the pages and their hashed assets.
const CACHE = "jans-verkstad-app-b40fafcee38d36d9",
  FILES = ["./assets/index-7sC2byDx.js","./assets/index-BO8ZtpBe.css","./assets/project-data-yFzO-Y3B.js","./assets/projekt-ritningar-C27al74s.js","./forvaringsplatser-bilder.html","./icon.svg","./index.html","./jans-hantverk-256.png","./manifest.webmanifest","./projekt-autosynk.js","./projekt-moln.html","./projekt-ritningar.html","./start.html","./synk-anslut.html","./synk-kontroll.html","./verkstadsoversikt.html"];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES);
      // First opening at the directory URL must work offline before a second visit.
      await cache.put(
        new URL("./", self.location.href).href,
        await cache.match("./index.html"),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Keep one previous app cache for modules used by an already-open page.
      const previous = (await caches.keys()).filter(
        (k) => k.startsWith("jans-verkstad-app-") && k !== CACHE,
      );
      const remove = previous.slice(0, -1);
      await Promise.all(remove.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (request.mode === "navigate") {
        try {
          const response = await fetch(request, { cache: "no-store" });
          if (response.ok) {
            event.waitUntil(
              cache.put(url.origin + url.pathname, response.clone()),
            );
            return response;
          }
          const saved = await cache.match(request, { ignoreSearch: true });
          return saved || response;
        } catch {
          const saved = await cache.match(request, { ignoreSearch: true });
          if (saved) return saved;
          const root = new URL("./", self.location.href);
          if (
            url.pathname === root.pathname ||
            url.pathname === new URL("index.html", root).pathname
          )
            return (await cache.match("./index.html")) || Response.error();
          return new Response(
            "Sidan finns inte sparad för offlinebruk. Öppna verkstadens startsida.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          );
        }
      }
      return (
        (await cache.match(request, { ignoreSearch: true })) ||
        (await caches.match(request)) ||
        fetch(request)
      );
    })(),
  );
});
