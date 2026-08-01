import { useState } from 'react'

export interface ExportOptions {
  format: 'png' | 'jpeg'
  scale: 1 | 0.75 | 0.5
  quality: number
}

interface ExportSheetProps {
  open: boolean
  busy: boolean
  onClose: () => void
  onExport: (options: ExportOptions) => Promise<void>
}

export function ExportSheet({ open, busy, onClose, onExport }: ExportSheetProps) {
  const [format, setFormat] = useState<ExportOptions['format']>('png')
  const [scale, setScale] = useState<ExportOptions['scale']>(1)
  const [quality, setQuality] = useState(0.9)
  if (!open) return null

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="compact-sheet" role="dialog" aria-modal="true" aria-labelledby="export-sheet-title">
        <header className="sheet-header">
          <div>
            <span className="eyebrow">전체 캔버스</span>
            <h2 id="export-sheet-title">이미지 내보내기</h2>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="내보내기 닫기">×</button>
        </header>

        <fieldset className="option-group">
          <legend>파일 형식</legend>
          <div className="option-cards">
            <label className={format === 'png' ? 'is-selected' : ''}>
              <input type="radio" name="format" value="png" checked={format === 'png'} onChange={() => setFormat('png')} />
              <strong>PNG</strong><span>무손실 · 선명한 그림</span>
            </label>
            <label className={format === 'jpeg' ? 'is-selected' : ''}>
              <input type="radio" name="format" value="jpeg" checked={format === 'jpeg'} onChange={() => setFormat('jpeg')} />
              <strong>JPEG</strong><span>작은 파일 · 사진 공유</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="option-group">
          <legend>출력 크기</legend>
          <div className="segmented wide">
            {([1, 0.75, 0.5] as const).map((value) => (
              <button key={value} type="button" className={scale === value ? 'is-selected' : ''} onClick={() => setScale(value)} aria-pressed={scale === value}>
                {Math.round(value * 100)}%
              </button>
            ))}
          </div>
        </fieldset>

        {format === 'jpeg' && (
          <label className="quality-control">
            <span>JPEG 품질 <strong>{Math.round(quality * 100)}%</strong></span>
            <input type="range" min="60" max="100" value={Math.round(quality * 100)} onChange={(event) => setQuality(Number(event.target.value) / 100)} />
          </label>
        )}

        <p className="import-help">현재 확대·이동 상태와 관계없이 전체 그림을 출력합니다. 공유가 지원되지 않으면 파일로 저장합니다.</p>
        <footer className="sheet-footer">
          <button type="button" onClick={onClose}>취소</button>
          <button type="button" className="confirm-button" disabled={busy} onClick={() => void onExport({ format, scale, quality })}>
            {busy ? '이미지 준비 중…' : `${format === 'jpeg' ? 'JPEG' : 'PNG'} 만들기`}
          </button>
        </footer>
      </section>
    </div>
  )
}
