import {
  canvasToScreen,
  fitTransform,
  preserveCenterOnResize,
  screenToCanvas,
  viewAroundGesture,
} from '../src/drawing/coordinates'

describe('coordinate transforms', () => {
  it('round-trips screen and canvas coordinates', () => {
    const view = { scale: 2.5, offsetX: -120, offsetY: 35 }
    const canvasPoint = { x: 420, y: 817, time: 10 }
    const screenPoint = canvasToScreen(canvasPoint, view)
    expect(screenToCanvas(screenPoint, view)).toEqual(canvasPoint)
  })

  it('fits the entire canvas with padding', () => {
    const view = fitTransform(1080, 1920, 390, 700, 16)
    expect(view.scale).toBeCloseTo(358 / 1080)
    expect(view.offsetX).toBeCloseTo(16)
    expect(view.offsetY).toBeGreaterThanOrEqual(16)
  })

  it('fits a tall legacy canvas even in a short mobile viewport', () => {
    const view = fitTransform(1080, 1920, 390, 420, 16)
    expect(view.scale).toBeCloseTo(388 / 1920)
    expect(view.offsetY).toBeCloseTo(16)
  })

  it('keeps the gesture anchor fixed while zooming and panning', () => {
    const start = { scale: 1, offsetX: 10, offsetY: 20 }
    const next = viewAroundGesture(
      start,
      { x: 100, y: 100, time: 0 },
      { x: 130, y: 120, time: 10 },
      2,
    )
    expect(next).toEqual({ scale: 2, offsetX: -50, offsetY: -40 })
  })

  it('preserves the canvas center through viewport resize', () => {
    const before = { scale: 0.5, offsetX: 10, offsetY: 20 }
    const after = preserveCenterOnResize(before, 400, 600, 600, 400)
    const oldCenter = screenToCanvas({ x: 200, y: 300, time: 0 }, before)
    const newCenter = screenToCanvas({ x: 300, y: 200, time: 0 }, after)
    expect(newCenter.x).toBeCloseTo(oldCenter.x)
    expect(newCenter.y).toBeCloseTo(oldCenter.y)
  })
})
