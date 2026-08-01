import type { BrushSettings, ShapeTool } from '../drawing/types'

interface BrushSettingsSheetProps {
  open: boolean
  brush: BrushSettings
  onChange: (settings: Partial<BrushSettings>) => void
  onClose: () => void
}

const shapes = new Set<ShapeTool>(['line', 'rectangle', 'ellipse', 'arrow'])

export function BrushSettingsSheet({ open, brush, onChange, onClose }: BrushSettingsSheetProps) {
  if (!open) return null
  const shape = shapes.has(brush.tool as ShapeTool)
  const fill = brush.tool === 'fill'

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="compact-sheet brush-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="brush-settings-title">
        <header className="sheet-header">
          <div><span className="eyebrow">도구별로 기억됨</span><h2 id="brush-settings-title">브러시 세부 설정</h2></div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="브러시 설정 닫기">×</button>
        </header>

        {fill ? (
          <label className="advanced-slider">채우기 허용 오차 <strong>{Math.round(brush.tolerance)}</strong><input data-testid="fill-tolerance" type="range" min="0" max="96" value={brush.tolerance} onChange={(event) => onChange({ tolerance: Number(event.target.value) })} /></label>
        ) : (
          <div className="advanced-controls">
            <label className="advanced-slider">손떨림 보정 <strong>{Math.round(brush.stabilization * 100)}%</strong><input data-testid="brush-stabilization" type="range" min="0" max="100" value={Math.round(brush.stabilization * 100)} onChange={(event) => onChange({ stabilization: Number(event.target.value) / 100 })} /></label>
            <label className="advanced-slider">흐름 <strong>{Math.round(brush.flow * 100)}%</strong><input data-testid="brush-flow" type="range" min="5" max="100" value={Math.round(brush.flow * 100)} onChange={(event) => onChange({ flow: Number(event.target.value) / 100 })} /></label>
            <label className="advanced-slider">경도 <strong>{Math.round(brush.hardness * 100)}%</strong><input data-testid="brush-hardness" type="range" min="2" max="100" value={Math.round(brush.hardness * 100)} onChange={(event) => onChange({ hardness: Number(event.target.value) / 100 })} /></label>
            <label className="advanced-slider">간격 <strong>{Math.round(brush.spacing * 100)}%</strong><input data-testid="brush-spacing" type="range" min="4" max="100" value={Math.round(brush.spacing * 100)} onChange={(event) => onChange({ spacing: Number(event.target.value) / 100 })} /></label>
            <label className="switch-row"><span>펜 압력으로 굵기 변경</span><input data-testid="brush-pressure" type="checkbox" checked={brush.pressure} onChange={(event) => onChange({ pressure: event.target.checked })} /></label>
            {shape && <label className="switch-row"><span>도형 내부 채우기</span><input data-testid="shape-fill" type="checkbox" checked={brush.shapeFill} onChange={(event) => onChange({ shapeFill: event.target.checked })} /></label>}
          </div>
        )}
        <p className="import-help">스타일러스가 없는 기기에서는 압력을 100%로 처리합니다. 설정은 현재 도구에 저장됩니다.</p>
        <footer className="sheet-footer"><button type="button" className="confirm-button" onClick={onClose}>완료</button></footer>
      </section>
    </div>
  )
}
