import { PROJECT_SCHEMA_VERSION, type ProjectMeta, type ProjectRevision, type ProjectSnapshot } from '../drawing/types'
import {
  STORES,
  openDatabase,
  markProjectDeleted,
  readAllProjectMetas,
  readProjectMeta,
  readProjectRevisions,
  requestResult,
  transactionComplete,
} from './database'

export interface ProjectListEntry {
  meta: ProjectMeta
  revision: ProjectRevision
}

export function selectRecoverableRevision(
  meta: ProjectMeta | undefined,
  revisions: ProjectRevision[],
): ProjectRevision | null {
  const complete = revisions
    .filter(
      (revision) =>
        revision.status === 'complete' &&
        revision.payload.schemaVersion === PROJECT_SCHEMA_VERSION,
    )
    .sort((a, b) => b.createdAt - a.createdAt)

  if (meta?.activeRevisionKey) {
    const active = complete.find((revision) => revision.key === meta.activeRevisionKey)
    if (active) return active
  }
  if (meta?.previousRevisionKey) {
    const previous = complete.find((revision) => revision.key === meta.previousRevisionKey)
    if (previous) return previous
  }
  return complete[0] ?? null
}

export async function loadLatestProject(projectId: string): Promise<ProjectRevision | null> {
  const [meta, revisions] = await Promise.all([
    readProjectMeta(projectId),
    readProjectRevisions(projectId),
  ])
  return selectRecoverableRevision(meta, revisions)
}

export async function listRecentProjects(): Promise<ProjectListEntry[]> {
  const metas = (await readAllProjectMetas())
    .filter((meta) => !meta.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const entries = await Promise.all(
    metas.map(async (meta) => ({ meta, revision: await loadLatestProject(meta.id) })),
  )
  return entries.filter((entry): entry is ProjectListEntry => Boolean(entry.revision))
}

export { markProjectDeleted }

export async function saveProjectRevision(
  payload: ProjectSnapshot,
  checkpoint: Blob,
  backgroundAsset?: Blob,
): Promise<ProjectRevision> {
  const database = await openDatabase()
  const createdAt = Date.now()
  const key = `${payload.id}:${createdAt}:${crypto.randomUUID()}`
  const pending: ProjectRevision = {
    key,
    projectId: payload.id,
    status: 'pending',
    createdAt,
    payload,
    checkpoint,
    backgroundAsset,
  }

  const prepare = database.transaction(STORES.revisions, 'readwrite')
  prepare.objectStore(STORES.revisions).put(pending)
  await transactionComplete(prepare)

  const commit = database.transaction([STORES.projects, STORES.revisions], 'readwrite')
  const projects = commit.objectStore(STORES.projects)
  const revisions = commit.objectStore(STORES.revisions)
  const existing = await requestResult<ProjectMeta | undefined>(projects.get(payload.id))
  const complete: ProjectRevision = { ...pending, status: 'complete' }
  const meta: ProjectMeta = {
    id: payload.id,
    title: payload.title,
    width: payload.width,
    height: payload.height,
    background: payload.background,
    activeRevisionKey: key,
    previousRevisionKey: existing?.activeRevisionKey ?? null,
    updatedAt: payload.updatedAt,
    schemaVersion: payload.schemaVersion,
  }
  revisions.put(complete)
  projects.put(meta)

  const all = await requestResult<ProjectRevision[]>(revisions.index('projectId').getAll(payload.id))
  const keep = new Set([key, meta.previousRevisionKey].filter(Boolean))
  for (const revision of all) {
    if (!keep.has(revision.key)) revisions.delete(revision.key)
  }
  await transactionComplete(commit)
  return complete
}
