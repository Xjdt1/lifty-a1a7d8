/* Офлайн-кэш справочника. При изменении файлов увеличить номер CACHE. */
var CACHE = "lift-v15";
var ASSETS = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "data.js",
  "details.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS.map(function (path) { return new Request(path, { cache: "reload" }); })); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    var old = (await caches.keys()).filter(function (key) {
      return /^lift-v\d+$/.test(key) && key !== CACHE;
    });
    await Promise.all(old.map(function (key) { return caches.delete(key); }));
    await self.clients.claim();
    if (old.length) {
      var pages = await self.clients.matchAll({ type: "window" });
      await Promise.all(pages.filter(function (page) {
        return page.url.startsWith(self.registration.scope);
      }).map(function (page) { return page.navigate(page.url).catch(function () {}); }));
    }
  })());
});

/* Сначала из кэша (мгновенно и без сети), в фоне обновляем кэш с сервера. */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  var key = req.mode === "navigate" ? "index.html" : req;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(key, { ignoreSearch: true }).then(function (cached) {
      var net = fetch(req, { cache: "no-cache" }).then(function (res) {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(function () { return cached; });
      if (cached) { e.waitUntil(net.catch(function () {})); return cached; }
      return net;
    });
  }));
});
