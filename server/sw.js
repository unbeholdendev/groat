self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
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
  if (e.request.method !== "GET" || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (
    e.request.mode !== "navigate" &&
    !url.pathname.startsWith("/assets/") &&
    !["/", "/privacy.html", "/favicon.ico", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"].includes(url.pathname)
  ) return;
  const key = e.request.mode === "navigate" && url.pathname !== "/privacy.html" ? "/" : e.request;
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
