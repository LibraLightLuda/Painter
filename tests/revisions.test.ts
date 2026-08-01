import { createEmptySnapshot, type ProjectMeta, type ProjectRevision } from '../src/drawing/types'
import { selectRecoverableRevision } from '../src/persistence/revisions'

function revision(key: string, status: ProjectRevision['status'], createdAt: number, schemaVersion = 1): ProjectRevision {
  const payload = createEmptySnapshot(createdAt)
  payload.schemaVersion = schemaVersion
  return {
    key,
    projectId: payload.id,
    status,
    createdAt,
    payload,
    checkpoint: new Blob(),
  }
}

describe('revision recovery', () => {
  it('selects the active complete revision', () => {
    const meta = { activeRevisionKey: 'active', previousRevisionKey: 'previous' } as ProjectMeta
    expect(
      selectRecoverableRevision(meta, [revision('previous', 'complete', 1), revision('active', 'complete', 2)])?.key,
    ).toBe('active')
  })

  it('falls back from an incomplete active revision to the previous normal revision', () => {
    const meta = { activeRevisionKey: 'broken', previousRevisionKey: 'previous' } as ProjectMeta
    expect(
      selectRecoverableRevision(meta, [revision('previous', 'complete', 1), revision('broken', 'pending', 2)])?.key,
    ).toBe('previous')
  })

  it('rejects unknown schema versions and chooses the newest supported complete revision', () => {
    expect(
      selectRecoverableRevision(undefined, [revision('old', 'complete', 1), revision('future', 'complete', 2, 99)])?.key,
    ).toBe('old')
  })
})
