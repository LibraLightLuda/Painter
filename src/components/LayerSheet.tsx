import { useState } from 'react'
import type { DrawingLayer } from '../drawing/types'

interface LayerSheetProps {
  open: boolean
  layers: DrawingLayer[]
  activeLayerId: string
  onClose: () => void
  onAdd: () => void
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onOpacity: (id: string, opacity: number) => void
  onMove: (id: string, direction: -1 | 1) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

export function LayerSheet({
  open,
  layers,
  activeLayerId,
  onClose,
  onAdd,
  onSelect,
  onToggle,
  onOpacity,
  onMove,
  onDuplicate,
  onDelete,
}: LayerSheetProps) {
  const [deleteId, setDeleteId] = useState('')
  if (!open) return null
  const displayed = [...layers].reverse()

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="compact-sheet" role="dialog" aria-modal="true" aria-labelledby="layer-sheet-title">
        <header className="sheet-header">
          <div>
            <span className="eyebrow">최대 8개</span>
            <h2 id="layer-sheet-title">레이어</h2>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="레이어 닫기">×</button>
        </header>
        <button type="button" className="add-layer-button" onClick={onAdd} disabled={layers.length >= 8}>＋ 새 그리기 레이어</button>
        <div className="layer-list">
          {displayed.map((layer) => {
            const index = layers.findIndex((item) => item.id === layer.id)
            const active = layer.id === activeLayerId
            return (
              <article key={layer.id} className={`layer-card ${active ? 'is-active' : ''}`}>
                <button type="button" className="layer-visible" onClick={() => onToggle(layer.id)} aria-label={`${layer.name} ${layer.visible ? '숨기기' : '표시하기'}`} aria-pressed={layer.visible}>
                  {layer.visible ? '◉' : '○'}
                </button>
                <button type="button" className="layer-select" onClick={() => onSelect(layer.id)} aria-pressed={active}>
                  <span className="layer-thumb" aria-hidden="true" />
                  <span><strong>{layer.name}</strong><small>{Math.round(layer.opacity * 100)}%{active ? ' · 선택됨' : ''}</small></span>
                </button>
                <div className="layer-order">
                  <button type="button" onClick={() => onMove(layer.id, 1)} disabled={index === layers.length - 1} aria-label={`${layer.name} 위로`}>↑</button>
                  <button type="button" onClick={() => onMove(layer.id, -1)} disabled={index === 0} aria-label={`${layer.name} 아래로`}>↓</button>
                </div>
                {active && (
                  <div className="layer-details">
                    <label>불투명도 <input type="range" min="5" max="100" value={Math.round(layer.opacity * 100)} onChange={(event) => onOpacity(layer.id, Number(event.target.value) / 100)} /></label>
                    <button type="button" onClick={() => onDuplicate(layer.id)} disabled={layers.length >= 8}>복제</button>
                    {deleteId === layer.id ? (
                      <>
                        <button type="button" className="danger" onClick={() => { onDelete(layer.id); setDeleteId('') }} disabled={layers.length <= 1}>삭제 확인</button>
                        <button type="button" onClick={() => setDeleteId('')}>취소</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setDeleteId(layer.id)} disabled={layers.length <= 1}>삭제</button>
                    )}
                  </div>
                )}
              </article>
            )
          })}
          <article className="layer-card background-layer" aria-label="잠긴 배경 레이어">
            <span className="layer-visible">◉</span>
            <span className="layer-select"><span className="layer-thumb background" /><span><strong>사진·배경</strong><small>잠김 · 지우개로 지워지지 않음</small></span></span>
            <span aria-hidden="true">🔒</span>
          </article>
        </div>
        <p className="import-help">레이어 순서·표시·불투명도는 원본 파일과 자동 저장에 포함됩니다.</p>
      </section>
    </div>
  )
}
