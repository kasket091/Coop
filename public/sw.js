// Hilas Coop service worker. The app page is network-first (a deploy shows at once; the saved copy is only for
// offline), the built code files and icons are cache-first (their names change every build), and Firebase or
// anything off the site is never touched, so savings and loan figures are always live.
const CACHE = 'hilas-v1'

function route(url, origin, mode) {
  if (url.origin !== origin) return 'skip'
  if (mode === 'navigate') return 'page'
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.png')) return 'static'
  return 'skip'
}

/** The code files the app page loads (./assets/index-….js and .css). */
const assetsIn = (html) => [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1])
/** Files a code file or stylesheet loads from beside it: the split-off screens (./AdminApp-….js) and the fonts. */
const filesIn = (text) => [...text.matchAll(/\.\/([\w-]+\.(?:js|css|woff2?))/g)].map((m) => `./assets/${m[1]}`)

const OFFLINE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hilas Coop: offline</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1C1B57;color:#F2F0E2;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:22px">You're offline</h1><p>Hilas Coop needs internet to show live savings and loans.</p>
<button onclick="location.reload()" style="min-height:48px;padding:0 20px;border:0;border-radius:10px;background:#09C3E4;color:#1C1B57;font-weight:700;font-size:16px">Try again</button></div></body></html>`

/** Saves the app page and the code files it loads; drops code files from older deploys. */
async function saveShell(pageResponse) {
  const cache = await caches.open(CACHE)
  const html = await pageResponse.clone().text()
  await cache.put('./', pageResponse)
  const abs = (a) => new URL(a, self.registration.scope).href
  const keep = new Set(assetsIn(html).map(abs))
  await Promise.all([...keep].map((u) => cache.match(u).then((hit) => hit || cache.add(u))))
  // keep (don't delete) what those load: split-off screens and fonts are saved when first used
  for (const u of [...keep]) {
    const hit = await cache.match(u)
    if (hit) filesIn(await hit.text()).forEach((f) => keep.add(abs(f)))
  }
  for (const req of await cache.keys()) if (req.url.includes('/assets/') && !keep.has(req.url)) await cache.delete(req)
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(fetch('./', { cache: 'no-store' }).then((r) => (r.ok ? saveShell(r) : null)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const kind = route(new URL(req.url), self.location.origin, req.mode)
  if (kind === 'page') {
    event.respondWith(fetch(req).then((res) => {
      if (res.ok) event.waitUntil(saveShell(res.clone()).catch(() => {}))
      return res
    }).catch(async () => (await caches.match('./')) || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
  } else if (kind === 'static') {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })))
  }
})

// Push notifications from the loanRequestPush Cloud Function: data messages with a title and body.
self.addEventListener('push', (event) => {
  let p = {}
  try { p = event.data ? event.data.json() : {} } catch { /* not JSON: show the default */ }
  const d = p.data || p.notification || {}
  event.waitUntil(self.registration.showNotification(d.title || 'Hilas Coop', { body: d.body || '', icon: 'icon-192.png' }))
})

// tapping a notification brings the open app forward, or opens it
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => w.url.startsWith(self.registration.scope))
    return open ? open.focus() : self.clients.openWindow('./')
  }))
})
