/* Офлайн-кэш справочника. При изменении файлов увеличить номер CACHE. */
var CACHE = "lift-v8";
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
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Сначала из кэша (мгновенно и без сети), в фоне обновляем кэш с сервера. */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  var key = req.mode === "navigate" ? "index.html" : req;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(key, { ignoreSearch: true }).then(function (cached) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(function () { return cached; });
      if (cached) { e.waitUntil(net.catch(function () {})); return cached; }
      return net;
    });
  }));
});
