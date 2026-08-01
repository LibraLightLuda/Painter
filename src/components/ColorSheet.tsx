import { useEffect, useState, type CSSProperties } from 'react'
import { hexToHsl, hslToHex, normalizeHex, type HslColor } from '../color/color'

interface ColorSheetProps {
  open: boolean
  color: string
  recent: string[]
  favorites: string[]
  onChoose: (color: string) => void
  onFavorites: (colors: string[]) => void
  onClose: () => void
}

export function ColorSheet({ open, color, recent, favorites, onChoose, onFavorites, onClose }: ColorSheetProps) {
  const [hsl, setHsl] = useState<HslColor>(() => hexToHsl(color))
  const [hex, setHex] = useState(color)

  useEffect(() => {
    if (!open) return
    setHsl(hexToHsl(color))
    setHex(color)
  }, [color, open])

  if (!open) return null

  const chooseHsl = (next: HslColor) => {
    const nextHex = hslToHex(next)
    setHsl(next)
    setHex(nextHex)
    onChoose(nextHex)
  }
  const favorite = favorites.includes(color)

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="compact-sheet color-sheet" role="dialog" aria-modal="true" aria-labelledby="color-sheet-title">
        <header className="sheet-header">
          <div><span className="eyebrow">색상 작업</span><h2 id="color-sheet-title">색상 휠·팔레트</h2></div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="색상 패널 닫기">×</button>
        </header>

        <div className="color-wheel-row">
          <label className="native-color-wheel" style={{ '--active-color': color } as CSSProperties}>
            <input type="color" value={color} aria-label="색상 휠" onChange={(event) => onChoose(event.target.value)} />
            <span>색상 휠</span>
          </label>
          <div className="color-value">
            <span className="color-preview" style={{ background: color }} />
            <label>HEX
              <input
                value={hex}
                maxLength={7}
                onChange={(event) => {
                  const next = event.target.value
                  setHex(next)
                  const normalized = normalizeHex(next)
                  if (normalized) {
                    setHsl(hexToHsl(normalized))
                    onChoose(normalized)
                  }
                }}
              />
            </label>
            <button
              type="button"
              className={favorite ? 'favorite-active' : ''}
              onClick={() => onFavorites(favorite ? favorites.filter((item) => item !== color) : [color, ...favorites].slice(0, 16))}
            >{favorite ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>
          </div>
        </div>

        <div className="hsl-controls">
          <label>색상 <strong>{hsl.h}°</strong><input className="hue-slider" type="range" min="0" max="359" value={hsl.h} onChange={(event) => chooseHsl({ ...hsl, h: Number(event.target.value) })} /></label>
          <label>채도 <strong>{hsl.s}%</strong><input type="range" min="0" max="100" value={hsl.s} onChange={(event) => chooseHsl({ ...hsl, s: Number(event.target.value) })} /></label>
          <label>밝기 <strong>{hsl.l}%</strong><input type="range" min="0" max="100" value={hsl.l} onChange={(event) => chooseHsl({ ...hsl, l: Number(event.target.value) })} /></label>
        </div>

        <div className="palette-group"><strong>즐겨찾기</strong><div className="palette-row">{favorites.length ? favorites.map((item) => <button key={item} type="button" style={{ background: item }} aria-label={`즐겨찾기 색상 ${item}`} onClick={() => onChoose(item)} />) : <small>별표로 자주 쓰는 색을 저장하세요.</small>}</div></div>
        <div className="palette-group"><strong>최근 색상</strong><div className="palette-row">{recent.slice(0, 12).map((item) => <button key={item} type="button" style={{ background: item }} aria-label={`최근 색상 ${item}`} onClick={() => onChoose(item)} />)}</div></div>
        <footer className="sheet-footer"><button type="button" className="confirm-button" onClick={onClose}>완료</button></footer>
      </section>
    </div>
  )
}
