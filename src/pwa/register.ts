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

  void navigator.serviceWorker.register('/sw.js').then((result) => {
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
