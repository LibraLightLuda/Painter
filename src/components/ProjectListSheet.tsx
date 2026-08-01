import { useEffect, useState } from 'react'
import type { ProjectListEntry } from '../persistence/revisions'

interface ProjectListSheetProps {
  open: boolean
  entries: ProjectListEntry[]
  activeId: string
  busy: boolean
  onClose: () => void
  onNew: () => Promise<void>
  onOpen: (entry: ProjectListEntry) => Promise<void>
  onDuplicate: (entry: ProjectListEntry) => Promise<void>
  onDelete: (entry: ProjectListEntry) => Promise<void>
}

function timeLabel(value: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ProjectListSheet({
  open,
  entries,
  activeId,
  busy,
  onClose,
  onNew,
  onOpen,
  onDuplicate,
  onDelete,
}: ProjectListSheetProps) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [deleteId, setDeleteId] = useState('')

  useEffect(() => {
    if (!open) return
    const created = Object.fromEntries(
      entries.map((entry) => [entry.meta.id, URL.createObjectURL(entry.revision.checkpoint)]),
    )
    setUrls(created)
    return () => Object.values(created).forEach((url) => URL.revokeObjectURL(url))
  }, [entries, open])

  if (!open) return null

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="project-sheet" role="dialog" aria-modal="true" aria-labelledby="project-sheet-title">
        <header className="sheet-header">
          <div>
            <span className="eyebrow">기기에 자동 저장됨</span>
            <h2 id="project-sheet-title">내 작업</h2>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="작업 목록 닫기">×</button>
        </header>
        <button type="button" className="new-project-card" onClick={() => void onNew()} disabled={busy}>
          <span aria-hidden="true">＋</span>
          <span><strong>새 그림</strong><small>1080×1080 정사각형</small></span>
        </button>

        <div className="project-list">
          {entries.map((entry) => (
            <article key={entry.meta.id} className={`project-card ${entry.meta.id === activeId ? 'is-active' : ''}`}>
              <button type="button" className="project-open" onClick={() => void onOpen(entry)} disabled={busy}>
                {urls[entry.meta.id] && <img src={urls[entry.meta.id]} alt="" />}
                <span className="project-info">
                  <strong>{entry.meta.title || '제목 없는 그림'}</strong>
                  <small>{entry.meta.width}×{entry.meta.height} · {timeLabel(entry.meta.updatedAt)}</small>
                  {entry.meta.id === activeId && <em>편집 중</em>}
                </span>
              </button>
              <div className="project-actions">
                <button type="button" onClick={() => void onDuplicate(entry)} disabled={busy}>복제</button>
                {deleteId === entry.meta.id ? (
                  <>
                    <button type="button" className="danger" onClick={() => void onDelete(entry)} disabled={busy}>삭제 확인</button>
                    <button type="button" onClick={() => setDeleteId('')}>취소</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setDeleteId(entry.meta.id)} disabled={busy}>삭제</button>
                )}
              </div>
            </article>
          ))}
          {entries.length === 0 && <p className="empty-projects">저장된 작업이 없습니다. 새 그림부터 시작해 보세요.</p>}
        </div>
        <p className="import-help">삭제한 작업은 목록에서 숨겨지며 7일 복구 정책을 위한 메타데이터가 남습니다. 중요한 작업은 원본 파일로도 백업하세요.</p>
      </section>
    </div>
  )
}
