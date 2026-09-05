// 離線快取：build 時以 BUILD_ID 換版，舊快取自動清除
const CACHE = 'pct-202609050609';
const ASSETS = ['./', './index.html', './bundle.js', './manifest.webmanifest', './icon.svg', './sprite-index.bin?v=299ebdb409'];

self.addEventListener('install', e => {
  // no-cache：安裝時向伺服器重新驗證，避免把 HTTP 快取裡的舊檔（尤其 sprite-index.bin）
  // 塞進新版快取造成「新名稱表×舊圖庫」錯位
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'no-cache' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  // PWA Share Target（M4）：分享的截圖先塞進快取，重導回首頁帶 ?shared=1
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const file = fd.get('screenshot');
        if (file && file.size) {
          const c = await caches.open('pct-shared');
          await c.put('./shared-screenshot',
            new Response(file, { headers: { 'Content-Type': file.type || 'image/png' } }));
        }
      } catch (err) { /* 拿不到檔案就開空的辨識頁 */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // 圖庫 bin：網址帶內容版本，比對不忽略 query（版本變了就必須走網路）；
  // 頁面端偵測到長度不符會用 cache:'reload' 重抓，這裡放行到網路
  const isBin = e.request.url.includes('sprite-index.bin');
  if (isBin && e.request.cache === 'reload') {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: !isBin }).then(hit =>
      hit || fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
