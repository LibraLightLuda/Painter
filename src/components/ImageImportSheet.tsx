import { useEffect, useMemo, useRef, useState } from 'react'
import type { BackgroundImageState } from '../drawing/types'
import {
  fetchImageFromUrl,
  prepareImage,
  readClipboardImage,
  type PreparedImage,
} from '../images/importImage'
import { builtinImages, type BuiltinImage } from '../images/builtinImages'

interface ImageImportSheetProps {
  open: boolean
  incomingBlob: Blob | null
  onClose: () => void
  onImport: (
    image: PreparedImage,
    mode: BackgroundImageState['mode'],
    rotation: BackgroundImageState['rotation'],
  ) => Promise<void>
}

export function ImageImportSheet({
  open,
  incomingBlob,
  onClose,
  onImport,
}: ImageImportSheetProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<BackgroundImageState['mode']>('fit')
  const [rotation, setRotation] = useState<BackgroundImageState['rotation']>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const searchUrl = useMemo(
    () => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query || '참고 이미지')}`,
    [query],
  )

  const chooseBlob = async (blob: Blob) => {
    setBusy(true)
    setError('')
    try {
      const prepared = await prepareImage(blob)
      setImage(prepared)
      setRotation(0)
    } catch (reason) {
      setImage(null)
      setError(reason instanceof Error ? reason.message : '이미지를 열지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (open && incomingBlob) void chooseBlob(incomingBlob)
  }, [incomingBlob, open])

  useEffect(() => {
    if (!image) {
      setPreviewUrl('')
      return
    }
    const next = URL.createObjectURL(image.blob)
    setPreviewUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [image])

  if (!open) return null

  const importUrl = async () => {
    setBusy(true)
    setError('')
    try {
      const blob = await fetchImageFromUrl(url)
      await chooseBlob(blob)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '인터넷 이미지를 가져오지 못했습니다.')
      setBusy(false)
    }
  }

  const paste = async () => {
    setBusy(true)
    setError('')
    try {
      await chooseBlob(await readClipboardImage())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '클립보드 이미지를 읽지 못했습니다.')
      setBusy(false)
    }
  }

  const chooseBuiltin = async (item: BuiltinImage) => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(item.url)
      if (!response.ok) throw new Error(`내장 이미지를 받지 못했습니다 (${response.status}).`)
      const prepared = await prepareImage(await response.blob())
      await onImport(prepared, 'fit', 0)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '내장 이미지를 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!image || busy) return
    setBusy(true)
    setError('')
    try {
      await onImport(image, mode, rotation)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '이미지를 배경에 놓지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="image-sheet" role="dialog" aria-modal="true" aria-labelledby="image-sheet-title">
        <header className="sheet-header">
          <div>
            <span className="eyebrow">사진 배경</span>
            <h2 id="image-sheet-title">이미지 가져오기</h2>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="이미지 가져오기 닫기">×</button>
        </header>

        <section className="builtin-images" aria-labelledby="builtin-images-title">
          <div className="builtin-images-heading">
            <div>
              <span className="eyebrow">색칠공부</span>
              <h3 id="builtin-images-title">내장 이미지에서 선택</h3>
            </div>
            <small>선택하면 기존 그림을 지우고 캔버스에 바로 엽니다.</small>
          </div>
          {builtinImages.length ? (
            <div className="builtin-image-grid">
              {builtinImages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void chooseBuiltin(item)}
                  disabled={busy}
                  aria-label={`색칠공부 이미지 ${item.title} 불러오기`}
                  data-testid={`builtin-image-${item.id}`}
                >
                  <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="builtin-empty">sampleImg 폴더에 이미지를 추가하면 여기에 표시됩니다.</p>
          )}
        </section>

        <div className="import-divider"><span>또는 내 이미지 사용</span></div>

        <div className="import-actions">
          <button type="button" className="import-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <span aria-hidden="true">▣</span> 내 기기에서 선택
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void chooseBlob(file)
              event.target.value = ''
            }}
            hidden
          />
          <button type="button" onClick={() => void paste()} disabled={busy}>클립보드 붙여넣기</button>
        </div>

        <div className="internet-import">
          <label>
            <span>이미지 주소</span>
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/image.jpg"
              onPaste={(event) => {
                const file = event.clipboardData.files[0]
                if (file?.type.startsWith('image/')) {
                  event.preventDefault()
                  void chooseBlob(file)
                }
              }}
            />
          </label>
          <button type="button" onClick={() => void importUrl()} disabled={!url || busy}>주소에서 가져오기</button>
        </div>

        <div className="web-search-row">
          <label>
            <span>웹에서 찾기</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색어" />
          </label>
          <a href={searchUrl} target="_blank" rel="noreferrer">이미지 검색 열기</a>
        </div>
        <p className="import-help">새 이미지를 놓으면 기존에 그린 선과 실행 취소 기록은 지워집니다. 웹 이미지는 복사한 뒤 돌아와 붙여넣으세요.</p>

        <div
          className={`image-preview ${image ? 'has-image' : ''}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const file = event.dataTransfer.files[0]
            if (file) void chooseBlob(file)
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="가져올 이미지 미리보기"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          ) : (
            <p>{busy ? '이미지를 확인하는 중…' : 'PC에서는 이미지 파일을 여기에 놓을 수도 있어요.'}</p>
          )}
        </div>

        {image && (
          <div className="placement-controls">
            <div className="segmented" aria-label="이미지 배치 방식">
              <button type="button" className={mode === 'fit' ? 'is-selected' : ''} onClick={() => setMode('fit')} aria-pressed={mode === 'fit'}>맞춤</button>
              <button type="button" className={mode === 'fill' ? 'is-selected' : ''} onClick={() => setMode('fill')} aria-pressed={mode === 'fill'}>채우기</button>
            </div>
            <button
              type="button"
              onClick={() => setRotation(((rotation + 90) % 360) as BackgroundImageState['rotation'])}
            >90° 회전</button>
            <span>{image.width}×{image.height}px{image.optimized ? ' · 기기에 맞게 최적화됨' : ''}</span>
          </div>
        )}

        {error && <p className="sheet-error" role="alert">{error}</p>}

        <footer className="sheet-footer">
          <button type="button" onClick={onClose}>취소</button>
          <button type="button" className="confirm-button" onClick={() => void confirm()} disabled={!image || busy}>
            {busy ? '처리 중…' : '배경으로 놓기'}
          </button>
        </footer>
      </section>
    </div>
  )
}
