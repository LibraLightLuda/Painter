const DATABASE_NAME = 'fingertip-share-inbox'
const STORE_NAME = 'shared'

interface SharedImageRecord {
  id: 'pending-image'
  blob: Blob
  name: string
  createdAt: number
}

function openShareDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}

export async function takeSharedImage(): Promise<Blob | null> {
  const database = await openShareDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const record = await new Promise<SharedImageRecord | undefined>((resolve, reject) => {
      const request = store.get('pending-image')
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener('error', () => reject(request.error), { once: true })
    })
    if (record) store.delete(record.id)
    return record?.blob ?? null
  } finally {
    database.close()
  }
}
