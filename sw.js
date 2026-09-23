const CACHE="meilan-v0.3.1";
const ASSETS=[
  "./",
  "./index.html",
  "./styles.css?v=0.3.1",
  "./data.js?v=0.3.1",
  "./app.js?v=0.3.1",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;

  const url=new URL(event.request.url);
  const isAppAsset=url.origin===location.origin &&
    (url.pathname.endsWith(".html") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith("/Meilan/"));

  if(isAppAsset){
    event.respondWith(
      fetch(event.request,{cache:"no-store"})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request).then(r=>r||caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request))
  );
});