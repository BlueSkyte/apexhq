const V = 'apexhq-20261112194321', FONTS = 'apexhq-fonts';
const SHELL = ['./', 'index.html', 'app.js', 'vendor/react.min.js', 'vendor/react-dom.min.js', 'vendor/htm.js', 'manifest.webmanifest', 'version.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('apexhq-') === 0 && k !== V && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const nf = (req, name) => caches.open(name).then(c => {
  const net = fetch(req.url, { cache: 'no-cache' }).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; });
  const lim = new Promise((_, ko) => setTimeout(ko, 4000));
  return Promise.race([net, lim]).catch(() => c.match(req, { ignoreSearch: true }).then(h => h || net));
});
const swr = (req, name) => caches.open(name).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.origin === location.origin) e.respondWith(nf(r, V).then(x => x || fetch(r)));
  else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) e.respondWith(swr(r, FONTS).then(x => x || fetch(r)));
});
