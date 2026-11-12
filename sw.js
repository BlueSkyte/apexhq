const V = 'apexhq-20261112144417', FONTS = 'apexhq-fonts';
const SHELL = ['./', 'index.html', 'app.js', 'vendor/react.min.js', 'vendor/react-dom.min.js', 'vendor/htm.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('apexhq-') === 0 && k !== V && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const swr = (req, name) => caches.open(name).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.origin === location.origin) e.respondWith(swr(r, V).then(x => x || fetch(r)));
  else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) e.respondWith(swr(r, FONTS).then(x => x || fetch(r)));
});
