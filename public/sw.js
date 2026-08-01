const CACHE_NAME = 'fingertip-shell-v5'
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME)
  await cache.addAll(CORE_ASSETS)

  const page = await fetch('/index.html', { cache: 'no-store' })
  const html = await page.clone().text()
  const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
  if (urls.length) await cache.addAll([...new Set(urls)])
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
      self.clients.claim(),
    ]),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

async function storeSharedImage(file) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('fingertip-share-inbox', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('shared', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('shared', 'readwrite')
    transaction.objectStore('shared').put({
      id: 'pending-image',
      blob: file,
      name: file.name || 'shared-image',
      createdAt: Date.now(),
    })
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  database.close()
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData()
        const file = form.get('image')
        if (file instanceof File && file.type.startsWith('image/')) await storeSharedImage(file)
      } catch {
        // The app opens with an actionable import error if the shared payload is unavailable.
      }
      return Response.redirect('/?shared-image=1', 303)
    })())
    return
  }

  if (event.request.method !== 'GET') return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cachedPage = (await caches.match('/index.html')) || (await caches.match('/'))
        if (cachedPage) {
          event.waitUntil(
            fetch(event.request)
              .then(async (response) => {
                const cache = await caches.open(CACHE_NAME)
                await cache.put('/index.html', response)
              })
              .catch(() => undefined),
          )
          return cachedPage
        }
        try {
          const response = await fetch(event.request)
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)))
          return response
        } catch {
          return new Response('오프라인 앱 셸을 열 수 없습니다.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)))
      }
      return response
    })(),
  )
})
