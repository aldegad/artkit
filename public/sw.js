const CACHE_NAME = "artkit-v1";

const PRECACHE_ASSETS = ["/", "/manifest.json", "/logo.svg", "/icon-192x192.png", "/icon-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // POST requests (e.g. share target) - pass through
  if (request.method !== "GET") return;

  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) return;

  // Skip API calls and ML model files
  if (request.url.includes("/api/") || request.url.includes(".onnx")) return;

  // Network-first for HTML pages
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Handle share target
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname === "/") {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const files = formData.getAll("media");

        // Store shared files in a temporary cache for the client to pick up
        const cache = await caches.open("share-target");
        const filesData = [];
        for (const file of files) {
          if (file instanceof File) {
            filesData.push({
              name: file.name,
              type: file.type,
              size: file.size,
            });
            await cache.put(
              `/shared/${file.name}`,
              new Response(file, { headers: { "Content-Type": file.type } })
            );
          }
        }

        // Notify clients about shared files
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "share-target", files: filesData });
        }

        // Redirect to the app
        return Response.redirect("/", 303);
      })()
    );
  }
});
