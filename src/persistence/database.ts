import type { ProjectMeta, ProjectRevision } from '../drawing/types'

const DATABASE_NAME = 'fingertip-drawing'
const DATABASE_VERSION = 1

export const STORES = {
  projects: 'projects',
  revisions: 'revisions',
} as const

let databasePromise: Promise<IDBDatabase> | null = null

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB 요청 실패')), {
      once: true,
    })
  })
}

export function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB 트랜잭션 중단')),
      { once: true },
    )
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB 트랜잭션 실패')),
      { once: true },
    )
  })
}

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORES.projects)) {
        database.createObjectStore(STORES.projects, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(STORES.revisions)) {
        const revisions = database.createObjectStore(STORES.revisions, { keyPath: 'key' })
        revisions.createIndex('projectId', 'projectId', { unique: false })
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => {
      databasePromise = null
      reject(request.error ?? new Error('기기 저장소를 열 수 없습니다.'))
    })
    request.addEventListener('blocked', () => {
      databasePromise = null
      reject(new Error('다른 탭이 저장소 업데이트를 막고 있습니다.'))
    })
  })
  return databasePromise
}

export async function readProjectMeta(projectId: string): Promise<ProjectMeta | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(STORES.projects, 'readonly')
  return requestResult<ProjectMeta | undefined>(transaction.objectStore(STORES.projects).get(projectId))
}

export async function readProjectRevisions(projectId: string): Promise<ProjectRevision[]> {
  const database = await openDatabase()
  const transaction = database.transaction(STORES.revisions, 'readonly')
  const index = transaction.objectStore(STORES.revisions).index('projectId')
  return requestResult<ProjectRevision[]>(index.getAll(projectId))
}

export async function readAllProjectMetas(): Promise<ProjectMeta[]> {
  const database = await openDatabase()
  const transaction = database.transaction(STORES.projects, 'readonly')
  return requestResult<ProjectMeta[]>(transaction.objectStore(STORES.projects).getAll())
}

export async function markProjectDeleted(projectId: string, deletedAt = Date.now()): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(STORES.projects, 'readwrite')
  const store = transaction.objectStore(STORES.projects)
  const meta = await requestResult<ProjectMeta | undefined>(store.get(projectId))
  if (meta) store.put({ ...meta, deletedAt })
  await transactionComplete(transaction)
}

export function resetDatabaseConnectionForTests(): void {
  if (!databasePromise) return
  void databasePromise.then((database) => database.close())
  databasePromise = null
}
