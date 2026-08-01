export interface PwaRegistration {
  supported: boolean
  dispose: () => void
}

export function registerPwa(onUpdateReady: (worker: ServiceWorker) => void): PwaRegistration {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
    return { supported: false, dispose: () => undefined }
  }

  let disposed = false
  let registration: ServiceWorkerRegistration | null = null

  const watchInstalling = () => {
    const worker = registration?.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller) {
        onUpdateReady(worker)
      }
    })
  }

  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href)
  const serviceWorkerUrl = new URL('sw.js', baseUrl)
  void navigator.serviceWorker.register(serviceWorkerUrl, { scope: baseUrl.pathname }).then((result) => {
    if (disposed) return
    registration = result
    if (result.waiting) onUpdateReady(result.waiting)
    result.addEventListener('updatefound', watchInstalling)
  })

  return {
    supported: true,
    dispose: () => {
      disposed = true
      registration?.removeEventListener('updatefound', watchInstalling)
    },
  }
}

export function applyWaitingUpdate(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const onChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange)
      resolve()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    worker.postMessage({ type: 'SKIP_WAITING' })
  })
}
