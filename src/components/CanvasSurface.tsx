import { useEffect, useRef } from 'react'
import { DrawingController, type DrawingChange } from '../drawing/controller'
import { DEFAULT_CANVAS } from '../drawing/types'

interface CanvasSurfaceProps {
  onReady: (controller: DrawingController) => void
  onChange: (change: DrawingChange) => void
}

export function CanvasSurface({ onReady, onChange }: CanvasSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const controller = new DrawingController(canvas, {
      width: DEFAULT_CANVAS.width,
      height: DEFAULT_CANVAS.height,
      background: '#ffffff',
      onChange,
    })
    const resize = () => {
      const rect = host.getBoundingClientRect()
      controller.cancelActive()
      controller.resize(rect.width, rect.height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    onReady(controller)

    return () => {
      observer.disconnect()
      controller.dispose()
    }
  }, [onChange, onReady])

  return (
    <div className="canvas-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        aria-label="정사각형 그림판, 흰색 배경. 한 손가락으로 그리고 두 손가락으로 이동하거나 확대하세요."
        data-testid="drawing-canvas"
      />
      <div className="canvas-hint" aria-hidden="true">
        <span>한 손가락으로 그리기</span>
        <span className="hint-dot">·</span>
        <span>두 손가락 이동·확대</span>
      </div>
    </div>
  )
}
