self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname === "/share")
    return e.respondWith(
      e.request
        .formData()
        .then(async (form) => {
          const image = form.get("image");
          if (image instanceof File) await (await caches.open("share")).put("/shared-image", new Response(image));
        })
        .catch(() => {})
        .then(() => Response.redirect("/", 303)),
    );
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const key = e.request.mode === "navigate" ? "/" : e.request;
  e.respondWith(
    caches.open("shell").then(async (cache) => {
      const cached = await cache.match(key);
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
