const CACHE_NAME = 'fingertip-shell-v12'
const APP_BASE_PATH = new URL('./', self.registration.scope).pathname
const appPath = (path = '') => `${APP_BASE_PATH}${path}`
const APP_INDEX_PATH = appPath('index.html')
const CORE_ASSETS = [
  APP_BASE_PATH,
  APP_INDEX_PATH,
  appPath('manifest.webmanifest'),
  appPath('icon-192.png'),
  appPath('icon-512.png'),
  appPath('icon-maskable-512.png'),
]

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME)
  await cache.addAll(CORE_ASSETS)

  const page = await fetch(APP_INDEX_PATH, { cache: 'no-store' })
  const html = await page.clone().text()
  const urls = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(
    (match) => new URL(match[1], self.registration.scope).pathname,
  )
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

  if (event.request.method === 'POST' && url.pathname === appPath('share-target')) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData()
        const file = form.get('image')
        if (file instanceof File && file.type.startsWith('image/')) await storeSharedImage(file)
      } catch {
        // The app opens with an actionable import error if the shared payload is unavailable.
      }
      return Response.redirect(`${APP_BASE_PATH}?shared-image=1`, 303)
    })())
    return
  }

  if (event.request.method !== 'GET') return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cachedPage = (await caches.match(APP_INDEX_PATH)) || (await caches.match(APP_BASE_PATH))
        if (cachedPage) {
          event.waitUntil(
            fetch(event.request)
              .then(async (response) => {
                const cache = await caches.open(CACHE_NAME)
                await cache.put(APP_INDEX_PATH, response)
              })
              .catch(() => undefined),
          )
          return cachedPage
        }
        try {
          const response = await fetch(event.request)
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(APP_INDEX_PATH, copy)))
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
