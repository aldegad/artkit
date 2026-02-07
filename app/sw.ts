import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: defaultCache,
});

// Share Target: handle media files shared from other apps
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "POST" || url.pathname !== "/") return;

  event.respondWith(
    (async () => {
      const formData = await event.request.formData();
      const files = formData.getAll("media");

      const cache = await caches.open("share-target");
      const filesData: { name: string; type: string; size: number }[] = [];

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

      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "share-target", files: filesData });
      }

      return Response.redirect("/", 303);
    })()
  );
});

serwist.addEventListeners();
